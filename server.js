const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const WORKSPACE_ROOT = 'D:/NL/CHBN';
const REQ_ROOT = path.join(WORKSPACE_ROOT, 'UPC_TEST/Claude/需求文档');
const PORT = process.env.PORT || 3100;
const CLI_TIMEOUT = Number(process.env.CLI_TIMEOUT) || 300_000;

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => cb(null, req.rawDir),
    filename: (_req, file, cb) => cb(null, Buffer.from(file.originalname, 'latin1').toString('utf8')),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
});

// ── Util: spawn claude CLI ──────────────────────────────────
function spawnClaude(prompt, cwd = WORKSPACE_ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', prompt], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: CLI_TIMEOUT,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr.trim()}`));
      }
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('claude CLI 未找到。请确认已安装 Claude Code 且在 PATH 中。'));
      } else {
        reject(err);
      }
    });
  });
}

// ── POST /api/standardize ───────────────────────────────────
app.post('/api/standardize', (req, res, next) => {
  const taskId = 'REQ-WB-' + uuidv4().slice(0, 8);
  req.taskDir = path.join(REQ_ROOT, taskId);
  req.rawDir = path.join(req.taskDir, 'raw');
  req.taskId = taskId;

  fs.mkdirSync(req.rawDir, { recursive: true });
  next();
});

app.post('/api/standardize', upload.array('files', 20), async (req, res) => {
  const { taskDir, rawDir, taskId } = req;

  try {
    // Build index.md listing source files
    const files = fs.readdirSync(rawDir).filter((f) => f !== 'index.md');
    const indexContent = [
      `# ${taskId} 索引`,
      `状态：处理中`,
      '',
      '## 原始来源',
      ...files.map((f) => `- [${f}](raw/${encodeURIComponent(f)})`),
      '',
      '## 中间产出',
      '- 暂无',
      '',
      '## 最终文档',
      '- 待生成',
    ].join('\n');
    fs.writeFileSync(path.join(taskDir, 'index.md'), indexContent, 'utf-8');

    // Spawn claude CLI to run standardize-requirement
    const reqPath = `UPC_TEST/Claude/需求文档/${taskId}`;
    const output = await spawnClaude(`/standardize-requirement ${reqPath}`);

    // Read output
    const finalPath = path.join(taskDir, 'final.md');
    const draftPath = path.join(taskDir, 'working', '草稿-v1.md');
    let markdown = '';
    if (fs.existsSync(finalPath)) {
      markdown = fs.readFileSync(finalPath, 'utf-8');
    } else if (fs.existsSync(draftPath)) {
      markdown = fs.readFileSync(draftPath, 'utf-8');
    } else {
      markdown = output || '（标准化完成，但未生成 final.md 或草稿文件）';
    }

    res.json({ taskId, output: markdown, status: 'done' });
  } catch (err) {
    console.error(`[${taskId}] Error:`, err.message);
    res.status(500).json({ taskId, error: err.message, status: 'error' });
  }
});

// ── POST /api/prompt ────────────────────────────────────────
app.post('/api/prompt', async (req, res) => {
  const taskId = 'PMT-' + uuidv4().slice(0, 8);
  const { prompt } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ taskId, error: 'prompt 不能为空', status: 'error' });
  }

  try {
    const output = await spawnClaude(prompt.trim());
    // Strip ANSI escape codes
    const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
    res.json({ taskId, output: clean, status: 'done' });
  } catch (err) {
    console.error(`[${taskId}] Error:`, err.message);
    res.status(500).json({ taskId, error: err.message, status: 'error' });
  }
});

// ── GET /api/output/:taskId ─────────────────────────────────
app.get('/api/output/:taskId', (req, res) => {
  const { taskId } = req.params;
  // Only support looking up standardize tasks (REQ-WB-*)
  if (!taskId.startsWith('REQ-WB-')) {
    return res.status(404).json({ error: 'task not found', status: 'error' });
  }
  const taskDir = path.join(REQ_ROOT, taskId);
  const finalPath = path.join(taskDir, 'final.md');
  const draftPath = path.join(taskDir, 'working', '草稿-v1.md');

  if (fs.existsSync(finalPath)) {
    res.json({ taskId, output: fs.readFileSync(finalPath, 'utf-8'), status: 'done' });
  } else if (fs.existsSync(draftPath)) {
    res.json({ taskId, output: fs.readFileSync(draftPath, 'utf-8'), status: 'draft' });
  } else {
    res.json({ taskId, output: null, status: 'pending' });
  }
});

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`工作台已启动: http://localhost:${PORT}`);
});

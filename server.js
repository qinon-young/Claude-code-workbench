const express = require('express');
const multer = require('multer');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const { loadConfig, getMcpEnv } = require('./config');

// ── Config ──────────────────────────────────────────────────
const config = loadConfig();
const WORKSPACE_ROOT = config.workspaceRoot;
const REQ_ROOT = path.join(WORKSPACE_ROOT, config.reqOutputDir);
const PORT = config.server.port;
const CLI_TIMEOUT = config.server.cliTimeoutMs;

const mcpEnv = getMcpEnv(config);
logger.info(`启动工作台 — 工作区: ${WORKSPACE_ROOT}, 需求目录: ${REQ_ROOT}, MCP 服务器: ${Object.keys(mcpEnv.servers).join(', ') || '(无)'}`);

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

// ── Util: resolve claude CLI path ────────────────────────────
let claudePath = 'claude'; // default
try {
  claudePath = execSync('where claude 2>nul', { timeout: 5000, encoding: 'utf8' })
    .split(/\r?\n/)[0]
    .trim();
  if (claudePath) {
    logger.info(`claude CLI 路径: ${claudePath}`);
  }
} catch {
  logger.error('claude CLI 未在 PATH 中找到，将使用默认命令 "claude"');
}

// ── Util: spawn claude CLI ──────────────────────────────────
function spawnClaude(prompt, cwd = WORKSPACE_ROOT) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    // Quote command if path contains spaces (Windows shell compatibility)
    const cmd = claudePath.includes(' ') ? `"${claudePath}"` : claudePath;
    const child = spawn(cmd, ['-p', prompt], {
      cwd,
      shell: true,
      env: { ...process.env, ...mcpEnv.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: CLI_TIMEOUT,
    });

    let stdout = '';
    let stderr = '';

    logger.info(`spawnClaude PID=${child.pid} 开始 — prompt: ${prompt.slice(0, 80)}...`);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));

    child.on('close', (code) => {
      const elapsed = Date.now() - startTime;
      if (code === 0) {
        logger.info(`spawnClaude PID=${child.pid} 完成 — 耗时 ${elapsed}ms, stdout ${stdout.length} 字节`);
        resolve(stdout.trim());
      } else {
        logger.error(`spawnClaude PID=${child.pid} 失败 — 退出码 ${code}, 耗时 ${elapsed}ms, stderr: ${stderr.trim().slice(0, 200)}`);
        reject(new Error(`claude CLI exited with code ${code}: ${stderr.trim()}`));
      }
    });

    child.on('error', (err) => {
      const elapsed = Date.now() - startTime;
      logger.error(`spawnClaude PID=${child.pid} 异常 — ${err.message}, 耗时 ${elapsed}ms`);
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
  logger.info(`[${taskId}] 创建任务目录: ${req.taskDir}`);
  next();
});

app.post('/api/standardize', upload.array('files', 20), async (req, res) => {
  const { taskDir, rawDir, taskId } = req;
  const t0 = Date.now();

  const fileNames = (req.files || []).map((f) => Buffer.from(f.originalname, 'latin1').toString('utf8')).join(', ');
  logger.info(`[${taskId}] 收到 ${(req.files || []).length} 个文件: ${fileNames}`);

  try {
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

    const reqPath = `${config.reqOutputDir}/${taskId}`;
    const output = await spawnClaude(`/standardize-requirement ${reqPath}`);

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

    logger.info(`[${taskId}] 标准化完成 — 耗时 ${Date.now() - t0}ms, 输出 ${markdown.length} 字节`);
    res.json({ taskId, output: markdown, status: 'done' });
  } catch (err) {
    logger.error(`[${taskId}] 标准化失败 — ${err.message}`);
    res.status(500).json({ taskId, error: err.message, status: 'error' });
  }
});

// ── POST /api/prompt ────────────────────────────────────────
app.post('/api/prompt', async (req, res) => {
  const taskId = 'PMT-' + uuidv4().slice(0, 8);
  const { prompt } = req.body || {};
  const t0 = Date.now();

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    logger.error(`[${taskId}] prompt 为空`);
    return res.status(400).json({ taskId, error: 'prompt 不能为空', status: 'error' });
  }

  logger.info(`[${taskId}] 收到 prompt (${prompt.length} 字符) — IP: ${req.ip}`);

  try {
    const output = await spawnClaude(prompt.trim());
    const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
    logger.info(`[${taskId}] prompt 完成 — 耗时 ${Date.now() - t0}ms, 输出 ${clean.length} 字节`);
    res.json({ taskId, output: clean, status: 'done' });
  } catch (err) {
    logger.error(`[${taskId}] prompt 失败 — ${err.message}`);
    res.status(500).json({ taskId, error: err.message, status: 'error' });
  }
});

// ── GET /api/output/:taskId ─────────────────────────────────
app.get('/api/output/:taskId', (req, res) => {
  const { taskId } = req.params;
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
  const msg = `工作台已启动: http://localhost:${PORT}`;
  console.log(msg);
  logger.info(msg);
});

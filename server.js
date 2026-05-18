const express = require('express');
const multer = require('multer');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const { loadConfig, getMcpEnv } = require('./config');
const { runSkill } = require('./skill-runner');

// ── Config ──────────────────────────────────────────────────
const config = loadConfig();
const WORKSPACE_ROOT = config.workspaceRoot;
const REQ_ROOT = path.join(WORKSPACE_ROOT, config.reqOutputDir);
const TEMPLATE_PATH = path.join(REQ_ROOT, 'templates', 'requirement-template.md');
const PORT = config.server.port;
const CLI_TIMEOUT = config.server.cliTimeoutMs;

const mcpEnv = getMcpEnv(config);
logger.info(`启动工作台 — 工作区: ${WORKSPACE_ROOT}, 需求目录: ${REQ_ROOT}, MCP: ${Object.keys(mcpEnv.servers).join(', ') || '(无)'}`);

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
let claudePath = 'claude';
try {
  claudePath = execSync('where claude 2>nul', { timeout: 5000, encoding: 'utf8' })
    .split(/\r?\n/)[0].trim();
  if (claudePath) logger.info(`claude CLI 路径: ${claudePath}`);
} catch {
  logger.error('claude CLI 未在 PATH 中找到');
}

// ── Util: spawn claude CLI ──────────────────────────────────
function spawnClaude(prompt, cwd = WORKSPACE_ROOT) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    // cmd.exe /c: no shell:true arg mangling; --bare: skip CLAUDE.md for speed
    const child = spawn('cmd.exe', [
      '/c', 'claude', '--bare', '--permission-mode', 'bypassPermissions', '-p', prompt,
    ], {
      cwd,
      env: { ...process.env, ...mcpEnv.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '', stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      logger.error(`spawnClaude PID=${child.pid} 超时 — ${CLI_TIMEOUT}ms, 已 kill`);
      child.kill('SIGTERM');
    }, CLI_TIMEOUT);

    logger.info(`spawnClaude PID=${child.pid} — ${prompt.slice(0, 80)}...`);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));

    child.on('close', (code) => {
      clearTimeout(timer);
      const elapsed = Date.now() - startTime;
      if (timedOut) {
        reject(new Error(`claude CLI 执行超时（${CLI_TIMEOUT / 1000} 秒），已终止`));
      } else if (code === 0) {
        logger.info(`spawnClaude PID=${child.pid} 完成 — ${elapsed}ms, ${stdout.length}B`);
        resolve(stdout.trim());
      } else {
        logger.error(`spawnClaude PID=${child.pid} 失败 — 退出码 ${code}, stderr: ${stderr.trim().slice(0, 200)}`);
        reject(new Error(`claude CLI exited with code ${code}: ${stderr.trim()}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      logger.error(`spawnClaude PID=${child.pid} 异常 — ${err.message}`);
      reject(err.code === 'ENOENT'
        ? new Error('claude CLI 未找到。请确认已安装 Claude Code 且在 PATH 中。')
        : err);
    });
  });
}

// ── Load workflows ──────────────────────────────────────────
const wfPath = path.join(__dirname, 'workflows.json');
const workflows = JSON.parse(fs.readFileSync(wfPath, 'utf-8')).workflows || [];
logger.info(`${workflows.length} workflows: ${workflows.map((w) => w.id).join(', ')}`);

// ── GET /api/workflows ──────────────────────────────────────
app.get('/api/workflows', (_req, res) => {
  res.json(workflows.map((w) => ({
    id: w.id, name: w.name, icon: w.icon, type: w.type,
    accept: w.accept || '', stepCount: (w.steps || []).length,
  })));
});

// ── Shared: resolve step variables ──────────────────────────
function resolveArgs(stepArgs, taskDir) {
  const params = {};
  for (const [k, v] of Object.entries(stepArgs || {})) {
    params[k] = v.replace(/\$taskDir/g, taskDir).replace(/\$workspaceRoot/g, WORKSPACE_ROOT);
  }
  params.WORKSPACE_ROOT = WORKSPACE_ROOT;
  params.REQ_DIR = taskDir;
  params.TEMPLATE_PATH = TEMPLATE_PATH;
  return params;
}

// ── Shared: execute upload-type workflow ────────────────────
async function executeUploadWorkflow(wf, taskId, taskDir, rawDir, filesList) {
  const fileNames = filesList.map((f) => Buffer.from(f.originalname, 'latin1').toString('utf8')).join(', ');
  logger.info(`[${taskId}] 收到 ${filesList.length} 个文件: ${fileNames}`);

  const diskFiles = fs.readdirSync(rawDir).filter((f) => f !== 'index.md');
  const indexContent = [
    `# ${taskId} 索引`, `状态：处理中`, '',
    '## 原始来源',
    ...diskFiles.map((f) => `- [${f}](raw/${encodeURIComponent(f)})`),
    '', '## 中间产出', '- 暂无', '', '## 最终文档', '- 待生成',
  ].join('\n');
  fs.writeFileSync(path.join(taskDir, 'index.md'), indexContent, 'utf-8');

  for (let i = 0; i < (wf.steps || []).length; i++) {
    const step = wf.steps[i];
    logger.info(`[${taskId}] 步骤 ${i + 1}/${wf.steps.length}: skill="${step.skill}"`);
    const params = resolveArgs(step.args, taskDir);
    await runSkill(step.skill, params, spawnClaude);
  }

  const outputPath = (wf.outputPath || '$taskDir/final.md').replace(/\$taskDir/g, taskDir);
  const fallbackPath = (wf.fallbackOutputPath || '').replace(/\$taskDir/g, taskDir);

  if (fs.existsSync(outputPath)) return fs.readFileSync(outputPath, 'utf-8');
  if (fallbackPath && fs.existsSync(fallbackPath)) return fs.readFileSync(fallbackPath, 'utf-8');
  return '（标准化完成，但未生成输出文件）';
}

// ── Shared: execute text-type workflow ──────────────────────
async function executeTextWorkflow(taskId, prompt) {
  logger.info(`[${taskId}] prompt (${prompt.length} 字符) — IP: (text workflow)`);
  const output = await spawnClaude(prompt.trim());
  return output.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── POST /api/workflow/:id (unified endpoint) ───────────────
// Phase 1: validate + init
app.post('/api/workflow/:id', (req, res, next) => {
  const wf = workflows.find((w) => w.id === req.params.id);
  if (!wf) return res.status(404).json({ error: `未知 workflow: ${req.params.id}`, status: 'error' });

  req.workflow = wf;
  req.taskId = 'WF-' + uuidv4().slice(0, 8);

  if (wf.type === 'upload') {
    req.taskDir = path.join(REQ_ROOT, req.taskId);
    req.rawDir = path.join(req.taskDir, 'raw');
    fs.mkdirSync(req.rawDir, { recursive: true });
    logger.info(`[${req.taskId}] 创建任务目录: ${req.taskDir} (${wf.id})`);
  }
  next();
});

// Phase 2: multer + execute
app.post('/api/workflow/:id', upload.array('files', 20), async (req, res) => {
  const { workflow: wf, taskId, taskDir, rawDir } = req;
  const t0 = Date.now();

  try {
    let markdown = '';

    if (wf.type === 'upload') {
      markdown = await executeUploadWorkflow(wf, taskId, taskDir, rawDir, req.files || []);
    } else if (wf.type === 'text') {
      const { prompt } = req.body || {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ taskId, error: 'prompt 不能为空', status: 'error' });
      }
      markdown = await executeTextWorkflow(taskId, prompt);
    } else {
      return res.status(400).json({ taskId, error: `不支持的类型: ${wf.type}`, status: 'error' });
    }

    logger.info(`[${taskId}] "${wf.id}" 完成 — ${Date.now() - t0}ms, ${markdown.length}B`);
    res.json({ taskId, workflowId: wf.id, output: markdown, status: 'done' });
  } catch (err) {
    logger.error(`[${taskId}] "${wf.id}" 失败 — ${err.message}`);
    res.status(500).json({ taskId, workflowId: wf.id, error: err.message, status: 'error' });
  }
});

// ── Backward-compatible aliases ──────────────────────────────
const stdWf = workflows.find((w) => w.id === 'standardize') || { type: 'upload' };
const pmtWf = workflows.find((w) => w.id === 'prompt') || { type: 'text' };

app.post('/api/standardize', (req, res, next) => {
  req.params = { id: 'standardize' };
  req.workflow = stdWf;
  req.taskId = 'REQ-WB-' + uuidv4().slice(0, 8);
  req.taskDir = path.join(REQ_ROOT, req.taskId);
  req.rawDir = path.join(req.taskDir, 'raw');
  fs.mkdirSync(req.rawDir, { recursive: true });
  logger.info(`[${req.taskId}] 创建任务目录(legacy): ${req.taskDir}`);
  next();
});
app.post('/api/standardize', upload.array('files', 20), async (req, res) => {
  try {
    const markdown = await executeUploadWorkflow(stdWf, req.taskId, req.taskDir, req.rawDir, req.files || []);
    logger.info(`[${req.taskId}] legacy 完成 — ${Date.now() - t0}ms`);
    res.json({ taskId: req.taskId, output: markdown, status: 'done' });
  } catch (err) {
    logger.error(`[${req.taskId}] legacy 失败 — ${err.message}`);
    res.status(500).json({ taskId: req.taskId, error: err.message, status: 'error' });
  }
});

app.post('/api/prompt', async (req, res) => {
  const taskId = 'PMT-' + uuidv4().slice(0, 8);
  const { prompt } = req.body || {};
  if (!prompt || !prompt.trim()) return res.status(400).json({ taskId, error: 'prompt 不能为空', status: 'error' });
  const t0 = Date.now();
  try {
    const markdown = await executeTextWorkflow(pmtWf, taskId, prompt);
    res.json({ taskId, output: markdown, status: 'done' });
  } catch (err) {
    logger.error(`[${taskId}] legacy 失败 — ${err.message}`);
    res.status(500).json({ taskId, error: err.message, status: 'error' });
  }
});

// ── GET /api/output/:taskId ─────────────────────────────────
app.get('/api/output/:taskId', (req, res) => {
  const { taskId } = req.params;
  if (!taskId.startsWith('WF-') && !taskId.startsWith('REQ-WB-')) {
    return res.status(404).json({ error: 'task not found', status: 'error' });
  }
  const taskDir = path.join(REQ_ROOT, taskId);
  const finalMd = path.join(taskDir, 'final.md');
  const draftMd = path.join(taskDir, 'working', '草稿-v1.md');

  if (fs.existsSync(finalMd)) {
    res.json({ taskId, output: fs.readFileSync(finalMd, 'utf-8'), status: 'done' });
  } else if (fs.existsSync(draftMd)) {
    res.json({ taskId, output: fs.readFileSync(draftMd, 'utf-8'), status: 'draft' });
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

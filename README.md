# 融合前端工作台

本地 Web 工作台原型，通过 Web UI 驱动的 Workflow 引擎调用 Claude Code CLI 执行技能任务。

## 技术栈 

- **后端**: Node.js + Express
- **前端**: 原生 HTML/CSS/JS (SPA)，marked.js CDN 渲染 Markdown

## 快速开始 

```bash
npm install --registry=https://registry.npmmirror.com
npm start
```

浏览器打开 `http://localhost:3100`。

## 配置文件

### config.json — 主配置

| 字段 | 说明 |
|------|------|
| `workspaceRoot` | 工作区根目录（CLI 执行 cwd） |
| `projectPaths` | 子工程列表 |
| `reqOutputDir` | 需求标准化输出目录 |
| `server.port` | 服务端口 |
| `server.cliTimeoutMs` | CLI 超时（毫秒，默认 600s） |
| `log.dir` | 日志目录 |
| `mcpServers` | MCP 服务器配置 |
| `databases` | 数据库占位（原型预留） |

### .env — 敏感凭证

从 `.env.example` 复制填写，**不入 git**。

### workflows.json — Workflow 配置

定义页面上可用的 Workflow，每个 Workflow 包含：

| 字段 | 说明 |
|------|------|
| `id` | 唯一标识，对应前端 Tab |
| `name` | 显示名称 |
| `icon` | 图标（emoji） |
| `type` | `upload`（文件上传）或 `text`（文本输入） |
| `accept` | 上传类型时接受的文件扩展名 |
| `steps` | Skill 步骤数组，每步指定 `skill` 名称和参数 |
| `outputPath` | 输出文件路径模板（支持 `$taskDir`） |

### .claude/skills/ — Skill 文件

存放 skill 提示词文件（`.md`），由 `skill-runner.js` 加载并注入参数后传给 `claude -p` 执行。

## API

| 端点 | 说明 |
|------|------|
| `GET /api/workflows` | 获取所有 Workflow 列表（供前端渲染） |
| `POST /api/workflow/:id` | 执行指定 Workflow |
| `GET /api/output/:taskId` | 查询任务输出状态 |
| `POST /api/standardize` | 向后兼容别名 |
| `POST /api/prompt` | 向后兼容别名 |

## 日志

运行日志按天写入 `logs/YYYY-MM-DD.log`，记录请求、CLI spawn、Workflow 步骤、错误详情。

## 目录结构

```
workbench/
├── server.js              # Express 服务
├── skill-runner.js        # Skill 加载与执行引擎
├── config.json            # 主配置文件
├── config.js              # 配置加载模块
├── logger.js              # 日志模块
├── workflows.json         # Workflow 定义
├── .env.example           # 环境变量模板
├── .claude/skills/        # Skill 提示词文件
│   └── standardize-requirement.md
├── public/
│   ├── index.html         # SPA（动态 Tab + 拖拽/文本面板）
│   └── app.js             # 前端逻辑
└── logs/                  # 运行日志（gitignored）
```

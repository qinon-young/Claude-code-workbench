# 融合前端工作台

本地 Web 工作台原型，拖拽上传需求文档 → Claude Code CLI 执行 `/standardize-requirement` → 预览标准化后的 `final.md`。同时支持自由 Prompt 模式直接调用 CLI。

## 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 HTML/CSS/JS (SPA)，marked.js CDN 渲染 Markdown

## 快速开始

```bash
# 安装依赖（使用 npmmirror 源，避免公司内网源不可达）
npm install --registry=https://registry.npmmirror.com

# 启动服务
npm start
```

浏览器打开 `http://localhost:3100`。

## 配置文件

### config.json

工作台主配置文件，首次启动前请按需修改：

| 字段 | 说明 |
|------|------|
| `workspaceRoot` | 工作区根目录（CLI 执行 cwd） |
| `projectPaths` | 子工程列表（相对于 workspaceRoot） |
| `reqOutputDir` | 需求标准化输出目录 |
| `server.port` | 服务端口 |
| `server.cliTimeoutMs` | CLI 超时时间（毫秒） |
| `log.dir` | 日志目录 |
| `mcpServers` | MCP 服务器连接配置（非敏感部分） |
| `databases` | 数据库连接占位（原型阶段预留） |

### .env

敏感凭证文件（**不入 git**），从 `.env.example` 复制并填写：

```bash
cp .env.example .env
```

支持的变量：MCP API Key/Secret，MySQL/Redis/MinIO 连接密码。

## API

### POST /api/standardize

上传需求文件，触发 `/standardize-requirement` 标准化流程。

- Content-Type: `multipart/form-data`
- 字段: `files`（多文件）
- 返回: `{ taskId, output, status }`

### POST /api/prompt

自由文本 Prompt，直接调用 `claude -p` 并返回 stdout。

- Content-Type: `application/json`
- Body: `{ "prompt": "..." }`
- 返回: `{ taskId, output, status }`

### GET /api/output/:taskId

按 taskId 查询标准化任务的输出状态。

## 日志

运行日志按天写入 `logs/YYYY-MM-DD.log`，记录：
- 请求来源、taskId、文件列表/prompt 摘要
- CLI spawn PID、耗时、退出码
- 错误详情

## 目录结构

```
workbench/
├── server.js          # Express 服务
├── config.json        # 主配置文件
├── config.js          # 配置加载模块（JSON + .env 合并）
├── logger.js          # 日志模块（按天切割）
├── .env.example       # 环境变量模板
├── public/
│   ├── index.html     # SPA 页面
│   └── app.js         # 前端逻辑
├── logs/              # 运行日志（gitignored）
└── package.json
```

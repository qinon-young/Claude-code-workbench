# 融合前端工作台

本地 Web 工作台原型，拖拽上传需求文档 → Claude Code CLI 执行 `/standardize-requirement` → 预览标准化后的 `final.md`。同时支持自由 Prompt 模式直接调用 CLI。

## 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 HTML/CSS/JS (SPA)，marked.js CDN 渲染 Markdown

## 快速开始

```bash
npm install --registry=https://registry.npmmirror.com
npm start
```

浏览器打开 `http://localhost:3100`。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3100` | 服务端口 |
| `CLI_TIMEOUT` | `300000` | claude CLI 超时（毫秒） |

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

## 目录结构

```
workbench/
├── server.js          # Express 服务
├── public/
│   ├── index.html     # SPA 页面
│   └── app.js         # 前端逻辑
└── package.json
```

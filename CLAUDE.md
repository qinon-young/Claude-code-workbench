# CLAUDE.md

## 项目概述

融合前端本地 Web 工作台。一个轻量级 Express + 原生 JS SPA，通过 Web UI 驱动 Claude Code CLI 执行需求标准化和自由 Prompt 任务。

## 架构

```
浏览器 (public/index.html + app.js)
  │  fetch REST
  ▼
server.js (Express)
  │  child_process.spawn('claude', ['-p', ...])
  ▼
Claude Code CLI (cwd = D:/NL/CHBN)
  └── 执行 /standardize-requirement 或其他 prompt
```

## 常用命令

```bash
npm start              # 启动服务 (http://localhost:3100)
```

## 关键文件

- [server.js](server.js) — Express 服务，3 个 API：standardize、prompt、output/:taskId
- [public/index.html](public/index.html) — SPA 页面（Tab 切换 + 拖拽上传 + Markdown 预览）
- [public/app.js](public/app.js) — 原生 JS 前端逻辑

## API 端点

| 端点 | 说明 |
|------|------|
| `POST /api/standardize` | 上传文件 → 标准化需求 |
| `POST /api/prompt` | 自由 prompt → CLI 输出 |
| `GET /api/output/:taskId` | 查询标准化任务状态 |

## 配置

- 端口：`PORT` 环境变量，默认 `3100`
- CLI 超时：`CLI_TIMEOUT` 环境变量，默认 `300000`（5 分钟）
- 工作区根目录：`D:/NL/CHBN`（在 server.js 中硬编码）
- 需求输出目录：`UPC_TEST/Claude/需求文档/`

## 安全注意事项

- 使用 `spawn`（非 `exec`）调用 CLI，避免 shell 注入
- 文件上传限制 50MB / 20 个文件
- 无认证机制（原型阶段）

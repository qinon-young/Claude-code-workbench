# CLAUDE.md

## 项目概述

融合前端本地 Web 工作台。Express + 原生 JS SPA，通过 Web UI 驱动 Claude Code CLI 执行需求标准化和自由 Prompt 任务。

## 架构

```
浏览器 (public/index.html + app.js)
  │  fetch REST
  ▼
server.js (Express)
  ├── config.js       ← 加载 config.json + .env，合并 MCP/DB 配置
  ├── logger.js       ← 按天切割日志 → logs/YYYY-MM-DD.log
  │  │  child_process.spawn('claude', ['-p', ...], { shell: true })
  ▼
Claude Code CLI (cwd = config.workspaceRoot)
  └── 执行 /standardize-requirement 或其他 prompt
```

## 常用命令

```bash
npm start              # 启动服务 (http://localhost:3100)
```

## 配置文件

| 文件 | 用途 | git |
|------|------|-----|
| `config.json` | 主配置：工作区路径、子工程列表、MCP 服务器、数据库占位 | ✓ |
| `.env` | 敏感凭证：MCP API Key、数据库密码 | ✗ |
| `.env.example` | `.env` 模板（不含真实值） | ✓ |

## 关键文件

- [server.js](server.js) — Express 服务，3 个 API + CLI spawn 封装
- [config.js](config.js) — 配置加载：JSON + dotenv 解析 + MCP 凭证合并 + DB 凭证合并
- [config.json](config.json) — 主配置文件
- [logger.js](logger.js) — 日志模块：`info()`/`error()`，按天写入 `logs/`
- [public/index.html](public/index.html) — SPA（Tab 切换 + 拖拽上传 + Markdown 预览 + 错误展示）
- [public/app.js](public/app.js) — 前端逻辑，含 `showError()` 在预览区展示错误

## API 端点

| 端点 | 说明 |
|------|------|
| `POST /api/standardize` | 上传文件 → 标准化需求 |
| `POST /api/prompt` | 自由 prompt → CLI 输出 |
| `GET /api/output/:taskId` | 查询标准化任务状态 |

## 日志

- 路径：`logs/YYYY-MM-DD.log`
- 内容：请求 IP、taskId、文件数/prompt 长度、CLI PID、耗时、退出码、错误信息
- git ignored

## 配置说明

### MCP 服务器

1. 在 `config.json` 的 `mcpServers` 中配置服务器连接（transport、url）
2. 在 `.env` 中配置对应凭证（`MCP_*_API_KEY`、`MCP_*_SECRET`）
3. `config.js` 的 `getMcpEnv()` 自动合并两者，通过环境变量注入到 Claude Code 子进程

### 数据库

`config.json` 的 `databases` 字段预留了 MySQL / Redis / MinIO 配置占位，`.env` 中的同名变量会覆盖 JSON 中的值。原型阶段不做实际连接。

## 安全注意事项

- `spawn` + `shell: true`（Windows 兼容），prompt 通过参数数组传递避免注入
- 文件上传限制 50MB / 20 个文件
- `.env` 不入 git，凭证与代码分离
- 无认证机制（原型阶段）

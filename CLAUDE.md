# CLAUDE.md

## 项目概述

融合前端本地 Web 工作台。Express + 原生 JS SPA，通过 Web UI 驱动 Claude Code CLI 执行 Workflow（可包含多个 Skill 步骤）。

## 架构

```
浏览器 (public/index.html + app.js)
  │  GET /api/workflows → 动态渲染 Tab
  │  POST /api/workflow/:id → 执行 Workflow
  ▼
server.js (Express)
  ├── config.js            ← 加载 config.json + .env
  ├── logger.js            ← 按天切割 → logs/
  ├── workflows.json       ← Workflow 定义
  │  │  workflow 步骤循环
  ▼
skill-runner.js
  │  1. 读取 .claude/skills/<name>.md
  │  2. 替换 $$PLACEHOLDER$$ 占位符
  │  3. child_process.spawn('claude', ['-p', prompt])
  ▼
Claude Code CLI (cwd = config.workspaceRoot)
  └── 按 skill 指令执行文件操作
```

## 常用命令

```bash
npm start              # 启动服务 (http://localhost:3100)
```

## 关键文件

| 文件 | 用途 |
|------|------|
| [server.js](server.js) | Express 服务，Workflow 执行 + CLI spawn + 4 个 API |
| [skill-runner.js](skill-runner.js) | Skill 加载引擎：读 .md → 替换占位符 → 调用 spawnClaude |
| [workflows.json](workflows.json) | Workflow 定义：standardize（上传+标准化）、prompt（自由文本） |
| [config.json](config.json) | 主配置：工作区路径、子工程列表、MCP、数据库占位 |
| [config.js](config.js) | 配置加载 + dotenv + MCP 凭证合并 + DB 凭证合并 |
| [logger.js](logger.js) | 按天写入 `logs/YYYY-MM-DD.log` |
| [.claude/skills/](.claude/skills/) | Skill prompt 文件，`$$KEY$$` 占位符传参 |
| [public/index.html](public/index.html) | SPA 骨架（动态 Tab 容器） |
| [public/app.js](public/app.js) | 前端逻辑：fetch workflows → 动态渲染 → 统一提交 |

## API 端点

| 端点 | 说明 |
|------|------|
| `GET /api/workflows` | 返回 Workflow 列表（UI 渲染） |
| `POST /api/workflow/:id` | 统一 Workflow 执行入口 |
| `GET /api/output/:taskId` | 按 taskId 查询输出 |
| `POST /api/standardize` | 向后兼容别名 → workflow/standardize |
| `POST /api/prompt` | 向后兼容别名 → workflow/prompt |

## 添加新 Skill

1. 在 `.claude/skills/` 创建 `<name>.md`，使用 `$$KEY$$` 作为参数占位符
2. 在 `skill-runner.js` 的 `buildPrompt()` 中确认参数替换逻辑（默认已支持任意 KEY）
3. 在 `workflows.json` 中添加一个 Workflow，其 `steps` 中引用该 skill 并传入参数

## 添加新 Workflow

在 `workflows.json` 的 `workflows` 数组中新增条目：

```json
{
  "id": "my-workflow",
  "name": "我的工作流",
  "icon": "🔧",
  "type": "upload",
  "accept": ".txt,.md",
  "steps": [
    { "skill": "my-skill", "args": { "reqDir": "$taskDir" } }
  ],
  "outputPath": "$taskDir/output.md"
}
```

前端会自动生成对应 Tab。

## 配置说明

- 端口：`config.json` → `server.port`，环境变量 `PORT` 可覆盖
- CLI 超时：`config.json` → `server.cliTimeoutMs`（默认 600s）
- MCP：`config.json` 的 `mcpServers` + `.env` 的 `MCP_*` 凭证，通过 `getMcpEnv()` 合并后注入 CLI 进程
- 数据库：`config.json` 占位 + `.env` 凭证合并，原型阶段不实际连接

## 安全

- `spawn` 参数数组传递 + `shell: true`（Windows 兼容）
- prompt 占位符替换而非 shell 拼接
- `.env` gitignored，凭证不入仓库
- 文件上传限制 50MB / 20 个文件
- 无认证机制（原型阶段）

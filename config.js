const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const ENV_PATH = path.join(__dirname, '.env');

function loadDotEnv(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    result[key] = val;
  }
  return result;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`配置文件不存在: ${CONFIG_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  const env = loadDotEnv(ENV_PATH);

  // Merge MCP credentials from env
  const mcpCreds = {};
  if (env.MCP_OB_SSE_API_KEY) {
    mcpCreds['ob-sse'] = {
      apiKey: env.MCP_OB_SSE_API_KEY,
      secret: env.MCP_OB_SSE_SECRET || undefined,
    };
  }

  // Merge database credentials from env
  const dbCreds = {
    mysql: {
      host: env.MYSQL_HOST || raw.databases?.mysql?.host || '',
      port: Number(env.MYSQL_PORT) || raw.databases?.mysql?.port || 3306,
      user: env.MYSQL_USER || raw.databases?.mysql?.user || '',
      password: env.MYSQL_PASSWORD || raw.databases?.mysql?.password || '',
      database: env.MYSQL_DATABASE || raw.databases?.mysql?.database || '',
    },
    redis: {
      host: env.REDIS_HOST || raw.databases?.redis?.host || '',
      port: Number(env.REDIS_PORT) || raw.databases?.redis?.port || 6379,
      password: env.REDIS_PASSWORD || raw.databases?.redis?.password || '',
    },
    minio: {
      endpoint: env.MINIO_ENDPOINT || raw.databases?.minio?.endpoint || '',
      accessKey: env.MINIO_ACCESS_KEY || raw.databases?.minio?.accessKey || '',
      secretKey: env.MINIO_SECRET_KEY || raw.databases?.minio?.secretKey || '',
    },
  };

  // Validate required fields
  if (!raw.workspaceRoot) throw new Error('config.json 缺少必填字段: workspaceRoot');
  if (!raw.reqOutputDir) throw new Error('config.json 缺少必填字段: reqOutputDir');

  return {
    workspaceRoot: raw.workspaceRoot,
    projectPaths: raw.projectPaths || [],
    reqOutputDir: raw.reqOutputDir,
    server: {
      port: Number(process.env.PORT) || raw.server?.port || 3100,
      cliTimeoutMs: Number(process.env.CLI_TIMEOUT) || raw.server?.cliTimeoutMs || 300000,
    },
    log: {
      dir: raw.log?.dir || 'logs',
    },
    mcpServers: raw.mcpServers || {},
    mcpCredentials: mcpCreds,
    databases: dbCreds,
  };
}

/**
 * Build merged MCP server config (config.json + .env credentials).
 * Returns an object suitable for writing as .mcp.json or passing as env vars.
 */
function getMcpEnv(cfg) {
  const servers = {};
  for (const [name, server] of Object.entries(cfg.mcpServers || {})) {
    servers[name] = { ...server };
    const creds = cfg.mcpCredentials?.[name];
    if (creds?.apiKey) {
      servers[name].headers = servers[name].headers || {};
      servers[name].headers['Authorization'] = `Bearer ${creds.apiKey}`;
    }
    if (creds?.secret) {
      servers[name].headers = servers[name].headers || {};
      servers[name].headers['X-Secret'] = creds.secret;
    }
  }

  // Env vars that Claude Code may read for MCP configuration
  const env = {};
  if (Object.keys(servers).length > 0) {
    env.CLAUDE_MCP_CONFIG = JSON.stringify({ mcpServers: servers });
  }

  return { servers, env };
}

module.exports = { loadConfig, getMcpEnv };

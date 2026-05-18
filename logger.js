const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function todayFile() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return path.join(LOG_DIR, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`);
}

function format(level, msg) {
  const ts = new Date().toISOString();
  return `[${ts}] [${level}] ${msg}\n`;
}

function write(level, msg) {
  ensureDir();
  fs.appendFileSync(todayFile(), format(level, msg), 'utf-8');
}

function info(msg) {
  write('INFO', msg);
}

function error(msg) {
  write('ERROR', msg);
}

module.exports = { info, error };

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

function localISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const h = pad(Math.floor(Math.abs(off) / 60));
  const m = pad(Math.abs(off) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${h}:${m}`;
}

function format(level, msg) {
  return `[${localISO()}] [${level}] ${msg}\n`;
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

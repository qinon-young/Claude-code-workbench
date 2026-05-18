const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const SKILLS_DIR = path.join(__dirname, '.claude', 'skills');

/**
 * Load a skill markdown file and replace placeholders with values.
 * Returns the processed prompt string.
 */
function buildPrompt(skillName, params) {
  const skillPath = path.join(SKILLS_DIR, `${skillName}.md`);
  if (!fs.existsSync(skillPath)) {
    throw new Error(`Skill 文件不存在: ${skillPath}`);
  }

  const t0 = Date.now();
  let content = fs.readFileSync(skillPath, 'utf-8');

  // Replace placeholders
  for (const [key, val] of Object.entries(params)) {
    const placeholder = `$$${key}$$`;
    content = content.split(placeholder).join(val || '');
  }

  logger.info(`[skill-runner] 加载 skill "${skillName}" — 耗时 ${Date.now() - t0}ms, prompt 长度 ${content.length}`);
  return content;
}

/**
 * Execute a single skill step.
 * @param {string} skillName - name of skill file (without .md)
 * @param {object} params - key-value map for placeholder substitution
 * @param {function} spawnClaude - the CLI spawn function from server
 * @returns {Promise<string>} stdout from claude
 */
async function runSkill(skillName, params, spawnClaude) {
  const prompt = buildPrompt(skillName, params);
  const t0 = Date.now();
  const output = await spawnClaude(prompt);
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
  logger.info(`[skill-runner] skill "${skillName}" 完成 — 耗时 ${Date.now() - t0}ms, 输出 ${clean.length} 字节`);
  return clean;
}

module.exports = { runSkill, buildPrompt };

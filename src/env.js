const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');

function parseValue(raw) {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile() {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line || line.trim().length === 0) {
      continue;
    }
    const cleaned = line.trim();
    if (cleaned.startsWith('#')) {
      continue;
    }
    const separatorIndex = cleaned.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = cleaned.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }
    const value = parseValue(cleaned.slice(separatorIndex + 1));
    if (typeof process.env[key] === 'undefined') {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

module.exports = process.env;

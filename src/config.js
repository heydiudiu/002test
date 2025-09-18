require('./env');

const DEFAULT_SESSION_LIFETIME = 1000 * 60 * 60 * 24 * 7; // 7 days

function toBoolean(value, defaultValue = false) {
  if (typeof value === 'undefined') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toInteger(value, defaultValue) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return defaultValue;
  }
  return parsed;
}

const config = {
  port: toInteger(process.env.PORT, 3000),
  appSecret: process.env.APP_SECRET || null,
  sessionLifetimeMs: toInteger(process.env.SESSION_LIFETIME_MS, DEFAULT_SESSION_LIFETIME),
  setupToken: process.env.SETUP_TOKEN || null,
  secureCookies: toBoolean(process.env.COOKIE_SECURE, false),
  dataFileName: process.env.DATA_FILE || 'store.json'
};

module.exports = config;

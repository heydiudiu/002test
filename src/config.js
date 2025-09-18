require('./env');

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
  dataFileName: process.env.DATA_FILE || 'store.json'
};

module.exports = config;

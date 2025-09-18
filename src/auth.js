const crypto = require('crypto');

const HASH_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 8;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hashBuffer = crypto.scryptSync(password, salt, HASH_LENGTH);
  return {
    salt,
    hash: hashBuffer.toString('hex'),
    version: 1
  };
}

function verifyPassword(password, passwordRecord) {
  if (!passwordRecord) {
    return false;
  }
  const { salt, hash } = passwordRecord;
  if (!salt || !hash) {
    return false;
  }
  const hashBuffer = Buffer.from(hash, 'hex');
  const attempted = crypto.scryptSync(password, salt, hashBuffer.length);
  return crypto.timingSafeEqual(hashBuffer, attempted);
}

function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `密码至少需要${MIN_PASSWORD_LENGTH}个字符以保障安全。`
    };
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  if (!hasLetter || !hasNumber || !hasSymbol) {
    return {
      valid: false,
      message: '密码需要包含字母、数字和符号的组合。'
    };
  }
  return { valid: true };
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordStrength
};

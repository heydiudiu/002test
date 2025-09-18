const crypto = require('crypto');
const config = require('./config');

const sessions = new Map();

function createSession(userId) {
  const token = crypto.randomBytes(36).toString('base64url');
  const now = Date.now();
  const session = {
    id: token,
    userId,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: now + config.sessionLifetimeMs
  };
  sessions.set(token, session);
  return session;
}

function getSession(token) {
  if (!token) {
    return null;
  }
  const session = sessions.get(token);
  if (!session) {
    return null;
  }
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.updatedAt = new Date().toISOString();
  return { ...session };
}

function destroySession(token) {
  sessions.delete(token);
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(token);
    }
  }
}

setInterval(cleanupExpiredSessions, 60 * 60 * 1000).unref();

module.exports = {
  createSession,
  getSession,
  destroySession
};

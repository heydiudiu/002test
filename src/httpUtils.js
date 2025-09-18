const config = require('./config');

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'fullscreen=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  applySecurityHeaders(res);
  const json = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    ...extraHeaders
  };
  res.writeHead(statusCode, headers);
  res.end(json);
}

function sendText(res, statusCode, text, extraHeaders = {}) {
  applySecurityHeaders(res);
  const body = text ?? '';
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  };
  res.writeHead(statusCode, headers);
  res.end(body);
}

function parseCookies(req) {
  const cookieHeader = req.headers['cookie'];
  const cookies = {};
  if (!cookieHeader) {
    return cookies;
  }
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [name, ...rest] = pair.trim().split('=');
    if (!name) {
      continue;
    }
    cookies[name] = decodeURIComponent(rest.join('=') || '');
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge) {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) {
    parts.push('HttpOnly');
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  } else {
    parts.push('SameSite=Strict');
  }
  if (options.secure || config.secureCookies) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    req.on('data', (chunk) => {
      chunks.push(chunk);
      totalSize += chunk.length;
      if (totalSize > 1_000_000) {
        reject(new Error('请求体过大。'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve(null);
        return;
      }
      const buffer = Buffer.concat(chunks);
      try {
        const json = JSON.parse(buffer.toString('utf8'));
        resolve(json);
      } catch (error) {
        reject(new Error('JSON 解析失败。'));
      }
    });
    req.on('error', (error) => reject(error));
  });
}

module.exports = {
  sendJson,
  sendText,
  parseCookies,
  serializeCookie,
  parseJsonBody,
  applySecurityHeaders
};

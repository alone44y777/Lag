'use strict';
const crypto = require('node:crypto');

const MB = 1 << 20;
let POOL = null;
function pool() {
  if (!POOL) POOL = crypto.randomFillSync(Buffer.allocUnsafe(4 * MB));
  return POOL;
}

/* real CPU work so the function is not just a memcpy */
function burn(rounds) {
  let h = crypto.randomBytes(16);
  for (let i = 0; i < rounds; i++) h = crypto.createHash('sha256').update(h).digest();
  return h;
}

module.exports = (req, res) => {
  const kb     = Math.min(Math.max(parseInt(req.query.s, 10) || 64, 1), 4096);
  const rounds = Math.min(Math.max(parseInt(req.query.c, 10) || 2, 0), 64);

  const src   = pool();
  const bytes = kb * 1024;
  let body;

  if (bytes <= src.length) {
    body = src.subarray(0, bytes);
  } else {
    body = Buffer.allocUnsafe(bytes);
    for (let o = 0; o < bytes; o += src.length) {
      src.copy(body, o, 0, Math.min(src.length, bytes - o));
    }
  }

  const tag = burn(rounds);

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Junk', tag.toString('hex').slice(0, 16));
  res.setHeader('Content-Length', String(body.length));
  res.status(200).end(body);
};

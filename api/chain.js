'use strict';
const crypto = require('node:crypto');

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

module.exports = async (req, res) => {
  const depth = clamp(parseInt(req.query.d, 10) || 0, 0, 3);
  const fan   = clamp(parseInt(req.query.f, 10) || 3, 1, 6);
  const kb    = clamp(parseInt(req.query.s, 10) || 48, 1, 512);

  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const base  = proto + '://' + host;

  const jobs = [];
  for (let i = 0; i < fan; i++) {
    const u = new URL('/api/hammer', base);
    u.searchParams.set('s', kb);
    u.searchParams.set('c', 1);
    u.searchParams.set('r', Math.random().toString(36).slice(2));
    jobs.push(fetch(u, { cache: 'no-store' }).then((r) => r.arrayBuffer()).catch(() => null));
  }

  /* recursive hop: chain calls chain calls chain */
  if (depth < 2 && fan > 1) {
    const u = new URL('/api/chain', base);
    u.searchParams.set('d', depth + 1);
    u.searchParams.set('f', fan - 1);
    u.searchParams.set('s', kb);
    jobs.push(fetch(u, { cache: 'no-store' }).then((r) => r.arrayBuffer()).catch(() => null));
  }

  const parts = (await Promise.all(jobs)).filter(Boolean);
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = Buffer.allocUnsafe(total);
  let off = 0;
  for (const p of parts) { out.set(new Uint8Array(p), off); off += p.byteLength; }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Chain-Depth', String(depth));
  res.setHeader('X-Chain-Parts', String(parts.length));
  res.setHeader('X-Chain-Id', crypto.randomBytes(6).toString('hex'));
  res.status(200).end(out);
};

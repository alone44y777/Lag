'use strict';
const crypto = require('node:crypto');

const SIZE = 4 * 1024 * 1024;   // Vercel response ceiling
let BUF = null;

module.exports = (req, res) => {
  if (!BUF) BUF = crypto.randomFillSync(Buffer.allocUnsafe(SIZE));
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Length', String(BUF.length));
  res.status(200).end(BUF);
};

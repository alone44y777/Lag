'use strict';
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    ok: true,
    t: Date.now(),
    region: process.env.VERCEL_REGION || null,
    node: process.version,
    rss: process.memoryUsage().rss
  });
};

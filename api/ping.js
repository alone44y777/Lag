'use strict';
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).end('1');
};

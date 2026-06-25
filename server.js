// server.js — tiny zero-dependency static server for Neuroster.
// Configurable host/IP and port via environment variables so you can serve it
// on LAN or WAN from a specific address:
//   HOST=0.0.0.0  PORT=8080  node server.js      (all interfaces — LAN/WAN)
//   HOST=192.168.1.50 PORT=80 node server.js     (bind to a specific IP)
// Aliases NEUROSTER_HOST / NEUROSTER_PORT are also honoured.
const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = process.env.NEUROSTER_HOST || process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.NEUROSTER_PORT || process.env.PORT || '8080', 10);
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    if (urlPath === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }

    // Resolve safely within ROOT (block path traversal).
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🐹 Neuroster serving at http://${HOST}:${PORT}  (root: ${ROOT})`);
  console.log(`   Open from another device on your network via this machine's IP, e.g. http://<this-ip>:${PORT}`);
});

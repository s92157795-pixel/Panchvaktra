const http = require('http');
const fs = require('fs');
const path = require('path');
// Auto-load .env file if present (Node.js 20+ native feature)
if (typeof process.loadEnvFile === 'function') {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  } catch (e) {}
}

const { handleApiRequest } = require('./backend/api');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4'
};

// Standard HTTP Security Headers
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

const server = http.createServer(async (req, res) => {
  // 1. Dispatch API endpoints
  try {
    const handled = await handleApiRequest(req, res);
    if (handled) return;
  } catch (err) {
    console.error('[API DISPATCH ERROR]', err);
    res.writeHead(500, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
    res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
    return;
  }

  // 2. Route static files & aliases (with safe URI decoding)
  let reqPath;
  try {
    reqPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    res.end('400 Bad Request: Malformed URI');
    return;
  }

  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  } else if (reqPath === '/admin' || reqPath === '/admin/') {
    reqPath = '/admin.html';
  }

  // Security check: Block direct access to credentials, database, backend code, archives & dotfiles
  const cleanPath = reqPath.toLowerCase().replace(/\\/g, '/');
  const baseName = path.basename(cleanPath);

  const isForbidden =
    cleanPath.startsWith('/data') ||
    cleanPath.startsWith('/backend') ||
    cleanPath.startsWith('/api') ||
    cleanPath.startsWith('/.git') ||
    cleanPath.includes('.env') ||
    cleanPath.endsWith('.json') ||
    cleanPath.endsWith('.txt') ||
    cleanPath.endsWith('.zip') ||
    baseName === 'server.js' ||
    baseName === 'package.json' ||
    baseName === 'package-lock.json' ||
    baseName === 'vercel.json' ||
    baseName.includes('credential') ||
    baseName.includes('password') ||
    baseName.includes('secret') ||
    baseName.startsWith('.');

  if (isForbidden) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    res.end('403 Forbidden: Personal database, credentials, and internal files are strictly protected.');
    return;
  }

  // Path traversal guard: ensure resolved path is strictly within ROOT
  const safeRoot = path.resolve(ROOT);
  let filePath = path.resolve(safeRoot, '.' + path.sep + reqPath);
  if (!filePath.startsWith(safeRoot + path.sep) && filePath !== safeRoot) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    res.end('403 Forbidden');
    return;
  }

  // Legacy root fallback: if requested file was moved into an organized subfolder, locate it automatically
  if (!fs.existsSync(filePath)) {
    const fileName = path.basename(reqPath);
    const candidateFolders = ['logos', 'team', 'gallery', 'backgrounds', 'videos'];
    for (const folder of candidateFolders) {
      const candidatePath = path.join(safeRoot, folder, fileName);
      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        filePath = candidatePath;
        break;
      }
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const range = req.headers.range;

    if (range && ext === '.mp4') {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        ...SECURITY_HEADERS
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      req.on('close', () => stream.destroy());
      stream.pipe(res);
      return;
    }

    const headers = {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      ...SECURITY_HEADERS
    };

    // Aggressive caching for images to ensure buttery performance
    if (filePath.includes(path.sep + 'frames' + path.sep)) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else {
      headers['Cache-Control'] = 'no-cache';
    }

    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    req.on('close', () => stream.destroy());
    stream.pipe(res);
  });
});

// Export HTTP request listener function for Vercel/serverless environments
module.exports = (req, res) => {
  server.emit('request', req, res);
};


// Only bind to local port when running directly as a script (node server.js)
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running with backend API at http://localhost:${PORT}/`);
    console.log(`Admin portal available at http://localhost:${PORT}/admin`);
  });
}


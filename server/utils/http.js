const fs = require('fs');
const path = require('path');

const MAX_BODY_BYTES = 1024 * 1024; // 1MB — plenty for admin content edits, blocks abuse uploads
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB — images only, generous for site photos

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let received = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// Reads the raw request body into a single Buffer, same streaming/size-limit
// pattern as readJsonBody above, just without the JSON.parse at the end —
// multipart bodies are binary and get split into parts afterward.
function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let received = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Splits a full multipart body into its raw parts using the boundary reported
// in the Content-Type header. No streaming here — 8MB max means buffering the
// whole thing is fine, and it keeps this dependency-free.
function splitMultipartParts(buffer, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(boundaryBuf);
  if (start === -1) return parts;

  while (true) {
    const nextStart = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (nextStart === -1) break;

    let partBuf = buffer.slice(start + boundaryBuf.length, nextStart);
    // A part immediately followed by "--" is the closing boundary — nothing to parse.
    if (partBuf.slice(0, 2).toString('binary') === '--') break;
    if (partBuf.slice(0, 2).toString('binary') === '\r\n') partBuf = partBuf.slice(2);
    if (partBuf.slice(-2).toString('binary') === '\r\n') partBuf = partBuf.slice(0, -2);

    const headerEnd = partBuf.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headerText = partBuf.slice(0, headerEnd).toString('utf8');
      const content = partBuf.slice(headerEnd + 4);
      const headers = {};
      headerText.split('\r\n').forEach((line) => {
        const idx = line.indexOf(':');
        if (idx !== -1) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
      });
      parts.push({ headers, content });
    }
    start = nextStart;
  }
  return parts;
}

// Content-Disposition looks like: form-data; name="file"; filename="photo.jpg"
function parseContentDisposition(value) {
  const result = {};
  (value || '').split(';').forEach((segment) => {
    const eq = segment.indexOf('=');
    if (eq === -1) return;
    const key = segment.slice(0, eq).trim();
    const val = segment.slice(eq + 1).trim().replace(/^"|"$/g, '');
    result[key] = val;
  });
  return result;
}

// Reads a multipart/form-data request. Returns { fields, files } where fields is
// a plain string map and files is an array of { fieldName, filename, contentType, data }.
async function readMultipartBody(req, { maxBytes = MAX_UPLOAD_BYTES } = {}) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!contentType.startsWith('multipart/form-data') || !boundaryMatch) {
    throw Object.assign(new Error('Expected multipart/form-data with a boundary'), { statusCode: 400 });
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const buffer = await readRawBody(req, maxBytes);
  const rawParts = splitMultipartParts(buffer, boundary);

  const fields = {};
  const files = [];
  rawParts.forEach((part) => {
    const disposition = parseContentDisposition(part.headers['content-disposition']);
    if (!disposition.name) return;
    if (disposition.filename !== undefined) {
      files.push({
        fieldName: disposition.name,
        filename: disposition.filename,
        contentType: part.headers['content-type'] || 'application/octet-stream',
        data: part.content,
      });
    } else {
      fields[disposition.name] = part.content.toString('utf8');
    }
  });
  return { fields, files };
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

// Serves a file from rootDir only — refuses to serve anything that resolves outside it,
// which is what stops a request like `/../../etc/passwd` from working.
function serveStatic(req, res, rootDir, requestedPath) {
  const safeSuffix = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(rootDir, safeSuffix);
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

module.exports = { readJsonBody, readMultipartBody, sendJson, serveStatic, MIME_TYPES, MAX_UPLOAD_BYTES };
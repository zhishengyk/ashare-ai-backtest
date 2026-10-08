import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../dist/server/index.js';
import { openDatabase } from './database.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4317);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT must be 1–65535');
if (!['127.0.0.1', '::1'].includes(host) && process.env.ALLOW_CONTAINER_BIND !== '1') {
  throw Error('Non-loopback binding requires ALLOW_CONTAINER_BIND=1; use only behind a loopback container port mapping');
}
process.umask(0o077);
const DB = openDatabase(path.resolve(process.env.DATA_DIR || path.join(root, '.data')), path.join(root, 'drizzle'));
const env = { DB, STORAGE_KIND: 'SQLite', RUNTIME_KIND: 'standalone-node' };
for (const name of ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'DASHSCOPE_API_KEY', 'SILICONFLOW_API_KEY']) {
  if (process.env[name]) env[name] = process.env[name];
}
const allowedAuthorities = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
function reject(res, status, error) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify({ error }));
}
const server = http.createServer(async (req, res) => {
  try {
    // Reject DNS rebinding, cross-site browser reads and writes, and absolute-form URLs.
    if (!allowedAuthorities.has(req.headers.host) || !req.url.startsWith('/') || req.url.startsWith('//')) return reject(res, 403, 'Host rejected');
    const origin = `http://${req.headers.host}`;
    if ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return reject(res, 403, 'Cross-site request rejected');
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) return reject(res, 405, 'Method not allowed');
    if (req.url === '/healthz' && ['GET', 'HEAD'].includes(req.method)) {
      DB.prepare('SELECT 1').first();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, storage: 'SQLite', runtime: 'standalone-node' }));
    }
    if (req.method === 'POST' && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reject(res, 415, 'Use application/json');
    if (Number(req.headers['content-length']) > 1500000) return reject(res, 413, 'Request too large');
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1500000) { reject(res, 413, 'Request too large'); req.resume(); return; }
      chunks.push(chunk);
    }
    const request = new Request(origin + req.url, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
    const response = await worker.fetch(request, env);
    const headers = Object.fromEntries(response.headers);
    headers['X-Frame-Options'] = 'DENY';
    headers['Referrer-Policy'] = 'no-referrer';
    if (headers['content-security-policy']) headers['content-security-policy'] = headers['content-security-policy'].replace(/frame-ancestors[^;]*/, "frame-ancestors 'none'");
    res.writeHead(response.status, headers);
    res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
  } catch { if (!res.headersSent) reject(res, 500, 'Internal server error'); else res.end(); }
});
server.requestTimeout = 300000;
server.headersTimeout = 15000;
server.on('error', () => { console.error('Server could not start; check port availability and configuration'); DB.close(); process.exitCode = 1; });
const displayHost = host === '::1' ? '[::1]' : '127.0.0.1';
server.listen(port, host, () => console.log(`A-share lab ready: http://${displayHost}:${port} (SQLite; private local access only)`));
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => { DB.close(); process.exit(0); });
  setTimeout(() => { server.closeAllConnections(); DB.close(); process.exit(0); }, 10000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

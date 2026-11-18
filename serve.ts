// A tiny static server for game/ (Node 22, standard library only), so the entry can
// be played locally without a build step: `node serve.ts` serves game/ on
// http://localhost:8080. It sends the MIME types a browser game needs, refuses any
// path outside game/, and otherwise does nothing clever.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
let port = 8080;
if (portIndex !== -1) {
  const requested = Number(args[portIndex + 1]);
  if (Number.isInteger(requested) && requested > 0 && requested < 65536) port = requested;
}

const MIME: Record<string, string> = {};
MIME['.html'] = 'text/html; charset=utf-8';
MIME['.js'] = 'text/javascript; charset=utf-8';
MIME['.mjs'] = 'text/javascript; charset=utf-8';
MIME['.css'] = 'text/css; charset=utf-8';
MIME['.json'] = 'application/json; charset=utf-8';
MIME['.png'] = 'image/png';
MIME['.jpg'] = 'image/jpeg';
MIME['.jpeg'] = 'image/jpeg';
MIME['.gif'] = 'image/gif';
MIME['.webp'] = 'image/webp';
MIME['.svg'] = 'image/svg+xml';
MIME['.ico'] = 'image/x-icon';
MIME['.txt'] = 'text/plain; charset=utf-8';

// Resolve a request path to a file under game/, or null when it escapes.
function resolveFile(pathname: string): string | null {
  const file = resolve(join(root, normalize(pathname)));
  if (file === root) return file;
  if (file.startsWith(root + sep)) return file;
  return null;
}

function serveFile(file: string, request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) {
  let size: number;
  try {
    const stats = statSync(file);
    if (stats.isFile() === false) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  const known = MIME[extname(file).toLowerCase()];
  const type = known === undefined ? 'application/octet-stream' : known;
  response.writeHead(200, {
    'content-type': type,
    'content-length': size,
    'cache-control': 'no-store',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  // A file vanishing mid-read used to leave the response hanging; end it
  // with a 500 instead.
  createReadStream(file)
    .on('error', () => {
      if (response.headersSent === false) response.writeHead(500);
      response.end('read error');
    })
    .pipe(response);
}

function handle(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) {
  const method = request.method;
  const allowed = method === 'GET' || method === 'HEAD';
  if (allowed === false) {
    response.writeHead(405, { 'allow': 'GET, HEAD' }).end('method not allowed');
    return;
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolveFile(pathname);
  if (file === null) {
    response.writeHead(403).end('forbidden');
    return;
  }
  serveFile(file, request, response);
}

createServer(handle).listen(port, '127.0.0.1', () => {
  console.log('game/ is on http://localhost:' + port);
});

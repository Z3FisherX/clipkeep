import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { URL } from 'node:url';
const root = resolve('dist');
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    const isBridge = pathname === '/ui-preview-bridge.js';
    const path = isBridge ? resolve('scripts/ui-preview-bridge.mjs') : resolve(root, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
    if (!isBridge && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    let data = await readFile(path);
    if (path.endsWith('index.html')) data = Buffer.from(data.toString().replace('</head>', '<script src="/ui-preview-bridge.js"></script></head>'));
    res.setHeader('Content-Type', isBridge ? 'text/javascript' : ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(path)] ?? 'application/octet-stream'));
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1', () => console.log(`UI_PREVIEW=http://127.0.0.1:${server.address().port}`));

// Local-only preview: serves the saved LMS pages (html_pages/, never committed) with stock AdminLTE,
// a stand-in for the school's mystyle.css, and the extension's CSS/JS applied like the content script does.
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Names to blank out of served pages come from your own environment, never from this file:
//   PREVIEW_REDACT="FIRST LAST,OTHER NAME"
const redactList = (process.env.PREVIEW_REDACT || '').split(',').map(x => x.trim()).filter(Boolean);
const redact = new RegExp(redactList.length ? redactList.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') : '$^', 'g');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const pages = path.join(root, 'html_pages');
const types = { '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png' };
const mystyle = `body{font-family:'Source Sans Pro',sans-serif}.skin-yellow-light .main-header .navbar{background:#f39c12}.skin-yellow-light .main-header .logo{background:#f39c12;color:#fff}.box-header{background:#ffc857!important;padding:14px}.content-header>h1{text-transform:uppercase;box-shadow:0 4px 8px rgba(0,0,0,.2);padding:16px 24px!important;font-weight:700}.content-header>h1.bg-gray{background:#d2d6de!important}.sidebar-menu>li.active>a{background:linear-gradient(#ffb340,#f39c12)!important;color:#fff;text-shadow:1px 1px 3px #000}.sidebar-menu>li.active>a>span{color:#fff}`;
function harness(query) {
  const theme = query.get('theme') || 'navy', font = query.get('font') || 'jakarta';
  return `<script src="/ext/themes.js"></script><script>
(function(){const s=BahriaStudio.normalize({theme:${JSON.stringify(theme)},font:${JSON.stringify(font)},radius:${Number(query.get('radius') || 10)},density:${JSON.stringify(query.get('density') || 'comfortable')}});
const r=document.documentElement;BahriaStudio.apply(r,s,false);r.dataset.bahriaStudio='lms';r.dataset.bsClean='true';r.dataset.bsMotion=${JSON.stringify(query.get('motion') || 'false')};r.dataset.bsPage='portal';
Object.assign(BahriaLms=window.BahriaLms||{},{});window.__ready=0;})();</script>`;
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/') { const files = (await readdir(pages)).filter(f => /^lms/i.test(f)); res.setHeader('content-type', 'text/html'); return res.end(files.map(f => `<a href="/Student/${encodeURIComponent(f)}">${f}</a><br>`).join('')); }
    if (p === '/mystyle.css') { res.setHeader('content-type', 'text/css'); return res.end(mystyle); }
    if (p.startsWith('/ext/') || p.startsWith('/vendor/')) {
      const file = p.startsWith('/ext/') ? path.join(root, 'extension', p.slice(5)) : path.join(here, p.slice(1));
      res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); return res.end(await readFile(file));
    }
    if (p.startsWith('/Student/')) {
      const name = p.slice(9); let html = await readFile(path.join(pages, name), 'utf8');
      const route = (url.searchParams.get('as') || name).toLowerCase();
      html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<link[^>]*stylesheet[^>]*>/gi, '').replace(/\b\d{2}-\d{6}-\d{3}\b/g, '02-000000-000').replace(redact, 'AYESHA KHAN').replace(/Download\.php\?k=[^"']*/g, '#');
      const faces = ['jakarta', 'manrope', 'sora', 'inter'].map(f => `@font-face{font-family:'Bahria ${f[0].toUpperCase() + f.slice(1)}';src:url(/ext/fonts/${f}-latin.woff2) format('woff2');font-weight:100 900}`).join('');
      const head = `<base href="/Student/"><link rel="stylesheet" href="/vendor/bootstrap.min.css"><link rel="stylesheet" href="/vendor/AdminLTE.min.css"><link rel="stylesheet" href="/vendor/skin-yellow-light.min.css"><link rel="stylesheet" href="/vendor/font-awesome.min.css"><link rel="stylesheet" href="/mystyle.css"><style>${faces}@font-face{font-family:FontAwesome;src:url(/vendor/fonts/fontawesome-webfont.woff2) format('woff2')}</style>`;
      const tail = url.searchParams.get('original') ? '' : `${harness(url.searchParams)}<link rel="stylesheet" href="/ext/portal.css"><link rel="stylesheet" href="/ext/lms.css"><script src="/ext/lms.js"></script><script>history.replaceState(null,'','/Student/${route.replace(/^lms\s*_?\s*/, '').replace(/\.html$/, '.php')}');BahriaLms.mount();${url.searchParams.get('pop') ? "setTimeout(()=>document.querySelector('[data-bs-tip]')?.click(),200);" : ''}${url.searchParams.get('collapse') ? "document.body.classList.add('sidebar-collapse');" : ''}${url.searchParams.get('menu') ? "document.querySelector('.user-menu').classList.add('open');" : ''}</script>`;
      html = html.replace('</head>', head + '</head>').replace('</body>', tail + '</body>');
      res.setHeader('content-type', 'text/html'); return res.end(html);
    }
    res.statusCode = 404; res.end('not found');
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
});
server.listen(Number(process.env.PORT || 4180), '127.0.0.1', () => console.log('LMS preview on http://127.0.0.1:' + (process.env.PORT || 4180)));

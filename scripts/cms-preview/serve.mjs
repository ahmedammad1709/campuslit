// Local-only preview: serves saved CMS pages (html_pages/, never committed) with the portal's own public
// stylesheet and the extension's CSS/JS applied like the content script does. Page scripts are neutralised.
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
function harness(q, kind) {
  return `<script src="/ext/themes.js"></script><script>(function(){const s=BahriaStudio.normalize({custom:${JSON.stringify((() => { try { return JSON.parse(q.get('custom') || 'null'); } catch { return null; } })())},theme:${JSON.stringify(q.get('theme') || 'navy')},font:${JSON.stringify(q.get('font') || 'jakarta')},radius:${Number(q.get('radius') || 10)}});
const r=document.documentElement;BahriaStudio.apply(r,s,false);r.dataset.bahriaStudio='cms';r.dataset.bsClean='true';r.dataset.bsMotion=${JSON.stringify(q.get('motion') || 'false')};r.dataset.bsPage=${JSON.stringify(kind)};})();</script>`;
}
const ALERT = `document.querySelector('#pageAlerts_up').innerHTML = '<div class="alert alert-danger alert-dismissible"><button type="button" class="close" data-dismiss="alert">&times;</button><strong>Error!</strong> Course Registration has been closed or not yet opened.</div>';`;
const alertJs = q => (q.get('alert') ? ALERT : '');
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/') { const f = (await readdir(pages)).filter(x => /^cms_/i.test(x)); res.setHeader('content-type', 'text/html'); return res.end(f.map(x => `<a href="/Sys/Student/${encodeURIComponent(x)}">${x}</a><br>`).join('')); }
    if (p.startsWith('/ext/')) { const file = path.join(root, 'extension', p.slice(5)); res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); return res.end(await readFile(file)); }
    if (p.startsWith('/Content/Bundles/')) { res.setHeader('content-type', 'text/css'); return res.end(await readFile(path.join(here, 'vendor/Aspire.min.css'))); }
    if (p.startsWith('/Scripts/Plugins/')) { res.setHeader('content-type', 'font/woff2'); return res.end(await readFile(path.join(here, 'vendor', p.slice(1)))); }
    if (p.startsWith('/Images/apple-touch-icon')) { res.setHeader('content-type', 'image/png'); return res.end(await readFile(path.join(here, 'vendor/logo180.png'))); }
    if (p.startsWith('/images/')) { const file = path.join(here, 'vendor', p.slice(1)); res.setHeader('content-type', types[path.extname(file)] || 'image/jpeg'); return res.end(await readFile(file)); }
    if (p === '/landing' || p.startsWith('/Sys/Student/') || p.startsWith('/Logins/Student/')) {
      const kind = p === '/landing' ? 'entry' : p.startsWith('/Logins/') ? 'login' : 'portal';
      const name = p === '/landing' ? 'CMS_Bahria_University.html' : p.startsWith('/Logins/') ? 'cms_login.html' : p.slice('/Sys/Student/'.length); let html = await readFile(path.join(pages, name), 'utf8');
      html = html.replace(/<script/gi, '<script type="javascript/blocked"').replace(/\b\d{2}-\d{6}-\d{3}\b/g, '02-000000-000').replace(redact, 'AMMAD AHMED');
      const faces = ['jakarta', 'manrope', 'sora', 'inter'].map(f => `@font-face{font-family:'Bahria ${f[0].toUpperCase() + f.slice(1)}';src:url(/ext/fonts/${f}-latin.woff2) format('woff2');font-weight:100 900}`).join('');
      const tail = url.searchParams.get('original') ? '' : `${harness(url.searchParams, kind)}<link rel="stylesheet" href="/ext/portal.css"><link rel="stylesheet" href="/ext/login.css"><link rel="stylesheet" href="/ext/cms.css"><script src="/ext/login.js"></script><script src="/ext/cms.js"></script><script>${url.searchParams.get('path') ? `history.replaceState(null,'',${JSON.stringify(url.searchParams.get('path'))});` : ''}${alertJs(url.searchParams)}${url.searchParams.get('alumni') ? "document.querySelectorAll('.panel-body .form-group').forEach(function(g){if(g.querySelector('select'))g.remove();});document.querySelector('.panel-title').textContent='Alumni Sign in';document.querySelector('label[for=BodyPH_tbEnrollment]').textContent='BU Enrollment | Registration No:';var b=document.querySelector('.panel-body');var d=document.createElement('div');d.innerHTML='For queries, Please click on your respective campus.<br><a href=#>BU Islamabad</a> <a href=#>BU Lahore</a> <a href=#>BU Karachi</a> <a href=#>BU Karachi IPP</a> <a href=#>BU Karachi HS</a>';b.appendChild(d);document.querySelectorAll('h1').forEach(function(h){if(h.textContent.trim()==='Student')h.textContent='Alumni';});" : ''}BahriaCms.mount();BahriaLogin.mount();${url.searchParams.get('week') ? "document.querySelector('.bs-tt-segbtn').click();" : ''}${url.searchParams.get('hide') ? "document.getElementById('pageContainer').classList.add('HideSideBar');" : ''}${url.searchParams.get('dbg') ? "document.title=[...document.querySelectorAll('#header .navbar-header, #header .navbar-header > *, #header .container-fluid, #AccountsNavbar')].map(function(e){var r=e.getBoundingClientRect();return (e.id||e.className||e.tagName)+':'+Math.round(r.left)+'-'+Math.round(r.right)+' '+getComputedStyle(e).display}).join(' || ');" : ''}${url.searchParams.get('menu') ? "document.querySelector('#AccountsNavbar li.dropdown').classList.add('open');" : ''}${url.searchParams.get('modal') ? "var m=document.querySelector('.modal');m.classList.add('in');m.style.display='block';" : ''}</script>`;
      if (p === '/landing') html = html.replace('<head id="pageHead">', '<head id="pageHead"><base href="/">');
      html = html.replace('</head>', `<style>${faces}</style></head>`).replace('</body>', tail + '</body>');
      res.setHeader('content-type', 'text/html'); return res.end(html);
    }
    res.statusCode = 404; res.end('not found');
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
}).listen(Number(process.env.PORT || 4181), '127.0.0.1', () => console.log('CMS preview on :' + (process.env.PORT || 4181)));

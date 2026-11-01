// Makes the images for the store listings from the invented sample pages (never from a signed-in portal):
//   dist/release/store/screenshot-1..6.jpg   1280x800, no transparency (Chrome Web Store, Edge Add-ons, Firefox Add-ons)
//   dist/release/store/promo-small.png       440x280 (Chrome Web Store small promo tile)
//   npm run store-assets
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'extension'), out = path.join(root, 'dist', 'release', 'store');
const executable = process.env.STUDIO_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
await mkdir(out, { recursive: true });

// A tiny static server: the extension folder (sample pages and scripts) and the brand folder.
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const base = p.startsWith('/brand/') ? root : extension, file = path.resolve(base, '.' + p);
    if (!file.startsWith(base + path.sep)) { res.statusCode = 403; return res.end(); }
    res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;

const profile = path.join(root, 'artifacts', 'store-' + Date.now());
const chrome = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let port; for (let i = 0; i < 80 && !port; i++) { try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await new Promise(r => setTimeout(r, 100)); } }
const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let seq = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
await call('Runtime.enable'); await call('Page.enable');
// the greeting depends on the hour; the listing should always read "Good morning", whatever time this runs
await call('Page.addScriptToEvaluateOnNewDocument', { source: 'Date.prototype.getHours = function () { return 10; };' });
await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

async function open(url) { await call('Page.navigate', { url: origin + url }); await sleep(1800); }
async function theme(settings) { await evaluate(`postMessage({ type: 'campuslit-settings', settings: ${JSON.stringify(settings)} }, location.origin); 0`); await sleep(900); }
async function save(file, format = 'jpeg') {
  const params = format === 'jpeg' ? { format: 'jpeg', quality: 94 } : { format: 'png' };
  await writeFile(path.join(out, file), Buffer.from((await call('Page.captureScreenshot', params)).result.data, 'base64')); console.log('wrote', file);
}

// 1. LMS dashboard with the assignment reminder
await open('/preview/lms/dashboard.html'); await theme({ theme: 'navy' }); await save('screenshot-1.jpg');
// 2. LMS assignments: due-soon card and a status under each deadline
await open('/preview/lms/assignments.html'); await theme({ theme: 'classic' });
await evaluate("document.querySelector('.sidebar-toggle').click(); 0"); await sleep(700);   // menu folded away, so the whole table (up to the Deadline column) fits
await save('screenshot-2.jpg');
// 3. CMS dashboard with the attendance planner
await open('/preview/cms/dashboard.html'); await theme({ theme: 'midnight' }); await save('screenshot-3.jpg');
// 4. CMS time table as a week calendar, with the calendar export button
await open('/preview/cms/timetable.html'); await theme({ theme: 'pearl' });
await evaluate("(() => { const week = [...document.querySelectorAll('button')].find(b => /week/i.test(b.textContent)); if (week) week.click(); return 0; })()"); await sleep(600);
await save('screenshot-4.jpg');
// 5. quick search, open over the LMS dashboard
await open('/preview/lms/dashboard.html'); await theme({ theme: 'sage' }); await evaluate("BahriaQuickSearch.open(); 0"); await sleep(500);
await evaluate("(() => { const i = document.getElementById('bs-qs-input'); i.value = 'assign'; i.dispatchEvent(new Event('input', { bubbles: true })); return 0; })()"); await sleep(600);
await save('screenshot-5.jpg');
// 6. the settings page, with its live preview
await open('/options.html'); await sleep(1200); await save('screenshot-6.jpg');

// the small promo tile, drawn from the logo
await call('Emulation.setDeviceMetricsOverride', { width: 440, height: 280, deviceScaleFactor: 1, mobile: false });
await open('/brand/store/promo-small.html'); await sleep(500); await save('promo-small.png', 'png');

ws.close(); chrome.kill(); server.close(); process.exit(0);

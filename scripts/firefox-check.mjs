// Smoke test in real Firefox: installs the built Firefox extension (dist/firefox) as a temporary add-on through WebDriver BiDi,
// opens invented sample pages as if they were the portals, and checks the content scripts restyle them and the helpers work.
//   npm run build && node scripts/firefox-check.mjs        (EXT_DIR=<folder> tests an unzipped release package instead)
// The portals' hostnames point at this machine through Firefox's own network.dns.localDomains preference, so nothing real is contacted.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const previewRoot = path.join(root, 'extension');
const extDir = path.resolve(process.env.EXT_DIR || path.join(root, 'dist', 'firefox'));
const firefox = process.env.FIREFOX || ['C:/Program Files/Mozilla Firefox/firefox.exe', 'C:/Program Files (x86)/Mozilla Firefox/firefox.exe', '/usr/bin/firefox', '/Applications/Firefox.app/Contents/MacOS/firefox'].find(existsSync);
if (!firefox) { console.log('Firefox not found (set FIREFOX=<path>); skipping.'); process.exit(0); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- fake portals: the sample pages as the university would serve them (none of our own styles or scripts) ----
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function portalDate(hours) {
  const d = new Date(Date.now() + hours * 3600000 + 5 * 3600000), h = d.getUTCHours() % 12 || 12;
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ' - ' + h + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' ' + (d.getUTCHours() < 12 ? 'am' : 'pm');
}
const ROUTES = {
  'cms.bahria.edu.pk': { '/Sys/Student/Dashboard.aspx': 'preview/cms/dashboard.html', '/Sys/Student/CourseRegistration/TimeTable.aspx': 'preview/cms/timetable.html' },
  'lms.bahria.edu.pk': { '/Student/Dashboard.php': 'preview/lms/dashboard.html', '/Student/Assignments.php': 'preview/lms/assignments.html' }
};
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };
function original(html, site) {
  html = html.replace('collapse in list-group-subMenu', 'collapse list-group-subMenu').replace('href="timetable.html"', 'href="/Sys/Student/CourseRegistration/TimeTable.aspx"');
  if (site === 'lms') html = html.replace(/href="dashboard\.html"/g, 'href="/Student/Dashboard.php"').replace(/href="assignments\.html"/g, 'href="/Student/Assignments.php"');
  return html.replace(/<link rel="stylesheet" href="\.\.\/\.\.\/[a-z]+\.css">/g, '').replace(/<script src="\.\.\/[^"]*" defer[^>]*><\/script>/g, '').replace('<head>', '<head><base href="/preview/' + site + '/">');
}
const server = createServer(async (req, res) => {
  try {
    const host = (req.headers.host || '').split(':')[0], p = decodeURIComponent(new URL(req.url, 'http://x').pathname), route = ROUTES[host] && ROUTES[host][p];
    if (route) {
      let html = original(await readFile(path.join(previewRoot, route), 'utf8'), host.startsWith('cms') ? 'cms' : 'lms');
      if (host.startsWith('lms')) html = html.replace(/(<small [^>]*data-sample-due-hours='(-?\d+)'>)[^<]*/g, (m, open, hours) => open + portalDate(Number(hours)));
      res.setHeader('content-type', types['.html']); return res.end(html);
    }
    if (p.startsWith('/preview/') || p.startsWith('/fonts/')) {
      const file = path.resolve(previewRoot, '.' + p); if (!file.startsWith(previewRoot + path.sep)) { res.statusCode = 403; return res.end(); }
      res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); return res.end(await readFile(file));
    }
    res.statusCode = 404; res.end('not found');
  } catch { res.statusCode = 404; res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const sitePort = server.address().port;

// ---- Firefox ----
const profile = path.join(root, 'artifacts', 'firefox-profile-' + Date.now());
await mkdir(profile, { recursive: true });
const prefs = {
  'network.dns.localDomains': 'cms.bahria.edu.pk,lms.bahria.edu.pk', 'dom.security.https_first': false, 'dom.security.https_only_mode': false,
  'browser.shell.checkDefaultBrowser': false, 'browser.startup.homepage_override.mstone': 'ignore', 'startup.homepage_welcome_url': '', 'datareporting.policy.dataSubmissionEnabled': false,
  'toolkit.telemetry.reportingpolicy.firstRun': false, 'app.update.enabled': false, 'extensions.autoDisableScopes': 0, 'network.captive-portal-service.enabled': false, 'browser.aboutwelcome.enabled': false,
  'network.proxy.type': 0
};
await writeFile(path.join(profile, 'user.js'), Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n') + '\n');
const debugPort = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(firefox, ['-headless', '-no-remote', '-profile', profile, '--remote-debugging-port', String(debugPort), 'about:blank'], { stdio: 'ignore', windowsHide: true });
const stop = () => { try { proc.kill(); } catch {} server.close(); };
process.on('exit', stop);

let ws; for (let i = 0; i < 120 && !ws; i++) {
  try { const socket = new WebSocket(`ws://127.0.0.1:${debugPort}/session`); await new Promise((ok, no) => { socket.onopen = ok; socket.onerror = no; }); ws = socket; } catch { await sleep(250); }
}
if (!ws) { stop(); throw new Error('Could not connect to Firefox over WebDriver BiDi.'); }
let seq = 0; const pending = new Map(), logged = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.type === 'error' ? p.reject(Error(m.error + ': ' + m.message)) : p.resolve(m.result); }
  else if (m.method === 'log.entryAdded') logged.push(m.params);
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const t = setTimeout(() => { pending.delete(id); reject(Error('BiDi timeout: ' + method)); }, 30000); pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } }); ws.send(JSON.stringify({ id, method, params })); });

try {
  await send('session.new', { capabilities: {} });
  await send('session.subscribe', { events: ['log.entryAdded'] });
  const installed = await send('webExtension.install', { extensionData: { type: 'path', path: extDir } });
  console.log('Firefox', (await send('session.status')).ready ? 'ready' : '', '- extension installed:', installed.extension);
  const tree = await send('browsingContext.getTree', {});
  const context = tree.contexts[0].context;
  const go = async url => { await send('browsingContext.navigate', { context, url: `http://${url}`.replace(/^http:\/\/([^/]+)/, `http://$1:${sitePort}`), wait: 'complete' }); await sleep(900); };
  const evaluate = async expression => {
    const r = await send('script.evaluate', { expression, target: { context }, awaitPromise: true, resultOwnership: 'none', serializationOptions: { maxObjectDepth: 4 } });
    if (r.type === 'exception') throw Error(r.exceptionDetails.text);
    const unwrap = v => v.type === 'array' ? v.value.map(unwrap) : v.type === 'object' ? Object.fromEntries(v.value.map(([k, x]) => [k, unwrap(x)])) : v.value;
    return unwrap(r.result);
  };
  const waitFor = async (expression, label) => { for (let i = 0; i < 60; i++) { if (await evaluate(expression)) return; await sleep(250); } throw Error('Timed out waiting for: ' + label); };
  const ctrlK = async () => {
    const CTRL = String.fromCharCode(0xE009);
    await send('input.performActions', { context, actions: [{ type: 'key', id: 'keys', actions: [{ type: 'keyDown', value: CTRL }, { type: 'keyDown', value: 'k' }, { type: 'keyUp', value: 'k' }, { type: 'keyUp', value: CTRL }] }] });
  };

  // LMS dashboard
  await go('lms.bahria.edu.pk/Student/Dashboard.php');
  await waitFor("document.documentElement.dataset.bahriaStudio === 'lms' && !!document.querySelector('.bs-hero')", 'LMS dashboard restyled');
  assert.ok(await evaluate("getComputedStyle(document.body).getPropertyValue('--bs-accent').trim().length > 0"), 'theme colours are defined');
  assert.match(await evaluate("document.querySelector('.bs-hero').textContent"), /Good (morning|afternoon|evening)|Late night|Hello/, 'greeting drawn');
  assert.ok(await evaluate("document.querySelectorAll('.bs-qs-btn').length === 1"), 'the search button is in the header');
  console.log('LMS dashboard restyled in Firefox');

  // a first visit shows one hint, pointing at the search button, and "Got it" dismisses it
  await waitFor("document.querySelectorAll('.bs-tip').length === 1 && document.querySelector('.bs-tip').dataset.key === 'search'", 'the search hint');
  assert.ok(await evaluate("(() => { const t = document.querySelector('.bs-tip').getBoundingClientRect(), a = document.querySelector('.bs-qs-btn').getBoundingClientRect(); return t.top >= a.bottom && t.left >= 0 && t.right <= innerWidth; })()"), 'the hint sits under the button, inside the window');
  await evaluate("document.querySelector('.bs-tip-ok').click(); 0");
  await waitFor("!document.querySelector('.bs-tip') && !document.querySelector('.bs-tip-target')", 'Got it removes the hint');
  console.log('one-time hint shown and dismissed in Firefox');

  // quick search, with a real key press
  await ctrlK();
  await waitFor("!!document.querySelector('dialog.bs-qs') && document.querySelector('dialog.bs-qs').open", 'Ctrl+K opens quick search');
  assert.ok((await evaluate("[...document.querySelectorAll('.bs-qs-name')].map(n => n.textContent)")).includes('Assignments'), 'menu pages are listed');
  await send('input.performActions', { context, actions: [{ type: 'key', id: 'keys', actions: [{ type: 'keyDown', value: String.fromCharCode(0xE00C) }, { type: 'keyUp', value: String.fromCharCode(0xE00C) }]   /* WebDriver's code for Escape */ }] });
  await waitFor("!document.querySelector('dialog.bs-qs').open", 'Escape closes quick search');
  console.log('quick search: Ctrl+K opens, Escape closes');

  // LMS assignments
  await go('lms.bahria.edu.pk/Student/Assignments.php');
  await waitFor("!!document.querySelector('.bs-due-main') && document.querySelectorAll('.bs-due-chip').length === 4", 'due-soon card and four statuses');
  assert.match(await evaluate("document.querySelector('.bs-due-main').textContent"), /^Next: Assignment 2: Trees and Graphs due in 2 days/, 'countdown');
  assert.equal(await evaluate("[...document.querySelectorAll('tr[data-bs-due]')].map(r => r.dataset.bsDue).join(',')"), 'submitted,open,open,closed');
  const submit = await evaluate("(() => { const box = document.querySelector('td > a[data-toggle=modal] > div'), cs = getComputedStyle(box); return { padL: parseFloat(cs.paddingLeft), padR: parseFloat(cs.paddingRight), height: box.getBoundingClientRect().height }; })()");
  assert.ok(submit.padL === submit.padR && submit.padL >= 18 && submit.height >= 38 && submit.height <= 42, 'Submit button spacing: ' + JSON.stringify(submit));
  console.log('assignments: due-soon card, statuses and Submit button in Firefox');

  // CMS time table
  await go('cms.bahria.edu.pk/Sys/Student/CourseRegistration/TimeTable.aspx');
  await waitFor("document.documentElement.dataset.bahriaStudio === 'cms' && !!document.querySelector('.bs-tt') && !!document.querySelector('.bs-tt-export')", 'time table redrawn with the export button');
  assert.ok((await evaluate("document.querySelectorAll('.bs-tt [class*=\"bs-tt-\"]').length")) > 5, 'classes drawn');
  console.log('CMS time table redrawn in Firefox');

  // CMS dashboard: attendance planner
  await go('cms.bahria.edu.pk/Sys/Student/Dashboard.aspx');
  await waitFor("document.documentElement.dataset.bahriaStudio === 'cms' && document.body.textContent.includes('remaining')", 'CMS dashboard with the attendance planner');
  console.log('CMS dashboard and attendance planner in Firefox');

  // nothing the extension did should have logged an error
  const errors = logged.filter(e => e.level === 'error' && !/favicon|ERR_|NS_ERROR_NET|blocked/i.test(e.text || ''));
  assert.deepEqual(errors.map(e => e.text), [], 'no errors in the page console');
  console.log('\nFirefox smoke test passed: the built Firefox extension installs, restyles both portals, and its helpers work.');
} finally {
  try { ws.close(); } catch {}
  stop();
}
process.exit(0);

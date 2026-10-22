// Dev helper: screenshot a page of the settings UI served by `npm run preview`.
//   node scripts/shot-ui.mjs <out.png> <url> <width> <height> [js to run first] [--clip-body]
// Output goes wherever you point it (use the git-ignored artifacts/ folder).
import {spawn} from 'node:child_process';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
const args = process.argv.slice(2), clip = args.includes('--clip-body'), [out, url, w = '1440', h = '1000', js = ''] = args.filter(a => a !== '--clip-body');
await mkdir(path.dirname(path.resolve(out)), {recursive: true});
const profile = path.resolve('artifacts', 'shot-' + Date.now());
const chrome = spawn(process.env.STUDIO_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], {stdio: 'ignore'});
let port; for (let i = 0; i < 60 && !port; i++) { try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await new Promise(r => setTimeout(r, 100)); } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let seq = 0; const pending = new Map(), errors = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || '')); };
const call = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({id, method, params})); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await call('Runtime.enable'); await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride', {width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 500});
await call('Page.navigate', {url}); await sleep(2500);
if (js) { const r = await call('Runtime.evaluate', {expression: js, awaitPromise: true, returnByValue: true}); if (r.result?.exceptionDetails) console.log('JS ERR', JSON.stringify(r.result.exceptionDetails).slice(0, 300)); else if (r.result?.result?.value !== undefined) console.log('JS ->', JSON.stringify(r.result.result.value)); await sleep(1200); }
let params = {format: 'png'};
if (clip) { const height = (await call('Runtime.evaluate', {expression: 'document.body.scrollHeight', returnByValue: true})).result.result.value; params = {format: 'png', clip: {x: 0, y: 0, width: +w, height, scale: 2}}; console.log('body height', height); }
const shot = await call('Page.captureScreenshot', params); await writeFile(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out, errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no runtime errors');
ws.close(); chrome.kill(); process.exit(0);

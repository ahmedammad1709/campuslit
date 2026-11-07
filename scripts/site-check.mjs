// Browser check of the public website (site/): the before/after slider by mouse and keyboard, the theme gallery, the FAQ, the mobile menu,
// the header-logo animation (and its reduced-motion behaviour), no sideways scrolling at phone and tablet widths, the 404 page, and no
// console errors or security-policy violations. It starts the local site server itself.   npm run test:site
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const executable = process.env.STUDIO_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const server = spawn(process.execPath, ['scripts/site-tools.mjs', 'serve'], {stdio: 'ignore'});
for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:4190/')).ok) break; } catch { /* not up yet */ } await new Promise(r => setTimeout(r, 100)); }
const profile = path.resolve('artifacts', 'site-check-' + Date.now());
const chrome = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], {stdio: 'ignore'});
let port; for (let i = 0; i < 80 && !port; i++) { try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await new Promise(r => setTimeout(r, 100)); } }
const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let seq = 0; const pending = new Map(), problems = [];
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Log.entryAdded' && /error|warning/.test(m.params.entry.level)) problems.push(m.params.entry.text); else if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 200)); };
const call = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({id, method, params})); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async x => { const r = (await call('Runtime.evaluate', {expression: x, awaitPromise: true, returnByValue: true})).result; if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };
await call('Runtime.enable'); await call('Log.enable'); await call('Page.enable');
const open = async (url, w = 1280, h = 900) => { await call('Emulation.setDeviceMetricsOverride', {width: w, height: h, deviceScaleFactor: 1, mobile: false}); await call('Page.navigate', {url: 'http://127.0.0.1:4190' + url}); await sleep(1800); };

await open('/');
// the header logo draws itself when the page opens; with "reduce motion" it is simply there
assert.ok(await ev("document.querySelector('.site-header .logo .ring').getAnimations().length > 0 && document.querySelector('.site-header .logo .dot').getAnimations().length > 0"), 'logo animates');
assert.equal(parseFloat(await ev("getComputedStyle(document.querySelector('.site-header .logo .ring')).strokeDasharray")), 1);
await call('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});
await open('/');
assert.equal(await ev("document.querySelector('.site-header .logo .ring').getAnimations().length + document.querySelector('.site-header .logo .dot').getAnimations().length"), 0, 'no logo animation when the device asks for less motion');
assert.ok(await ev("[...document.querySelectorAll('.reveal')].every(n => getComputedStyle(n).opacity === '1')"), 'content is simply visible with reduced motion');
await call('Emulation.setEmulatedMedia', {features: []});
await open('/');
// before/after slider: the range value drives the split, and the sweep does not fight a user who has already moved it
await ev("document.querySelector('.compare-range').value = 20; document.querySelector('.compare-range').dispatchEvent(new Event('input', {bubbles: true})); 0");
assert.equal(await ev("getComputedStyle(document.querySelector('[data-compare]')).getPropertyValue('--pos').trim()"), '20%');
assert.equal(await ev("getComputedStyle(document.querySelector('.compare-before')).clipPath"), 'inset(0px 80% 0px 0px)');
assert.match(await ev("document.querySelector('.compare-range').getAttribute('aria-valuetext')"), /^20%/);
// real mouse drag across the picture
const rect = await ev("(() => { const r = document.querySelector('.compare-stage').getBoundingClientRect(); return {x: r.left, y: r.top + r.height / 2, w: r.width}; })()");
await ev("document.querySelector('.compare-stage').scrollIntoView({block: 'center'}); 0"); await sleep(400);
const r2 = await ev("(() => { const r = document.querySelector('.compare-stage').getBoundingClientRect(); return {x: r.left, y: r.top + r.height / 2, w: r.width}; })()");
await call('Input.dispatchMouseEvent', {type: 'mousePressed', x: r2.x + r2.w * 0.5, y: r2.y, button: 'left', clickCount: 1});
await call('Input.dispatchMouseEvent', {type: 'mouseMoved', x: r2.x + r2.w * 0.75, y: r2.y, button: 'left'});
await call('Input.dispatchMouseEvent', {type: 'mouseReleased', x: r2.x + r2.w * 0.75, y: r2.y, button: 'left'});
const pos = parseFloat(await ev("getComputedStyle(document.querySelector('[data-compare]')).getPropertyValue('--pos')"));
assert.ok(pos > 70 && pos < 80, 'dragging moved the split to about 75%: ' + pos);
// keyboard: arrow keys on the focused slider
await ev("document.querySelector('.compare-range').focus(); 0");
await call('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37}); await call('Input.dispatchKeyEvent', {type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37});
assert.ok(parseFloat(await ev("getComputedStyle(document.querySelector('[data-compare]')).getPropertyValue('--pos')")) < pos, 'the arrow key moves it');
// feature tabs: one panel at a time, by click and by arrow keys
assert.equal(await ev("[...document.querySelectorAll('.tabpanel')].filter(p => !p.hidden).length"), 1, 'one panel shows');
assert.equal(await ev("document.querySelector('.tabpanel:not([hidden])').id"), 'p-assignments');
await ev("document.getElementById('t-attendance').click(); 0");
assert.equal(await ev("document.querySelector('.tabpanel:not([hidden])').id + document.getElementById('t-attendance').getAttribute('aria-selected') + document.getElementById('t-assignments').getAttribute('aria-selected')"), 'p-attendancetruefalse');
await ev("document.getElementById('t-attendance').focus(); 0");
await call('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39}); await call('Input.dispatchKeyEvent', {type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39});
assert.equal(await ev("document.querySelector('.tabpanel:not([hidden])').id + ':' + document.activeElement.id"), 'p-timetable:t-timetable', 'the arrow key moves to the next tab and focuses it');
await call('Input.dispatchKeyEvent', {type: 'rawKeyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35}); await call('Input.dispatchKeyEvent', {type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35});
assert.equal(await ev("document.querySelector('.tabpanel:not([hidden])').id"), 'p-popup', 'End goes to the last tab');
await ev("document.getElementById('t-assignments').click(); 0");
// the home page is short
assert.ok(await ev("document.documentElement.scrollHeight") < 8200, 'desktop page height: ' + await ev("document.documentElement.scrollHeight"));
// themes gallery
await ev("document.querySelector('.chip[data-theme=midnight]').click(); 0");
assert.match(await ev("document.getElementById('theme-shot').getAttribute('src')"), /lms-midnight\.webp$/);
assert.equal(await ev("document.querySelector('.chip[data-theme=midnight]').getAttribute('aria-pressed') + document.querySelector('.chip[data-theme=bahria]').getAttribute('aria-pressed')"), 'truefalse');
assert.match(await ev("document.getElementById('theme-shot').alt"), /Midnight theme/);
await ev("document.querySelector('.chip[data-theme=custom]').click(); 0");
assert.match(await ev("document.getElementById('theme-shot').getAttribute('src')"), /lms-custom\.webp$/);
// every picture actually loaded
await ev("document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager'); 0"); await sleep(1500);
assert.deepEqual(await ev("[...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src)"), [], 'all pictures load');
// FAQ opens
await ev("document.querySelector('#faq summary').click(); 0");
assert.equal(await ev("document.querySelector('#faq details').open"), true);
// header turns light on scroll
await ev("scrollTo(0, 600); 0"); await sleep(400);
assert.equal(await ev("document.querySelector('.site-header').classList.contains('scrolled')"), true);

// mobile menu
await open('/', 390, 844);
assert.ok(await ev("document.documentElement.scrollHeight") < 10200, 'phone page height: ' + await ev("document.documentElement.scrollHeight"));
assert.equal(await ev("getComputedStyle(document.querySelector('.nav-links')).display"), 'none', 'menu hidden on a phone');
await ev("document.querySelector('.menu-btn').click(); 0");
assert.equal(await ev("getComputedStyle(document.querySelector('.nav-links')).display"), 'flex');
assert.equal(await ev("document.querySelector('.menu-btn').getAttribute('aria-expanded')"), 'true');
await ev("document.querySelector('.nav-links a[href=\"#features\"]').click(); 0"); await sleep(600);
assert.equal(await ev("getComputedStyle(document.querySelector('.nav-links')).display"), 'none', 'choosing a link closes the menu');
const wide = await ev("[...document.querySelectorAll('body *')].filter(n => n.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(n).position !== 'fixed' && !n.closest('.tablist')).slice(0, 6).map(n => n.tagName + '.' + n.className + ' ' + Math.round(n.getBoundingClientRect().right))");
assert.deepEqual(wide, [], 'nothing wider than a phone screen (the tab bar scrolls inside itself)');
assert.equal(await ev("document.documentElement.scrollWidth <= innerWidth"), true, 'no sideways scroll on a phone');
for (const url of ['/privacy', '/license']) { await open(url, 390, 844); assert.equal(await ev("document.documentElement.scrollWidth <= innerWidth"), true, url + ' no sideways scroll'); }
// tablet width
for (const url of ['/', '/privacy', '/license']) { await open(url, 820, 1000); assert.equal(await ev("document.documentElement.scrollWidth <= innerWidth"), true, url + ' fits a tablet'); }
// 404
await open('/does-not-exist'); assert.equal(await ev("document.querySelector('h1').textContent"), '404');
assert.deepEqual(problems.filter(p => !/404/.test(p)), [], 'no console errors or policy violations');
console.log('site interaction checks passed');
ws.close(); chrome.kill(); server.kill(); process.exit(0);

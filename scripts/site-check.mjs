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
await ev("document.querySelector('.compare-stage').scrollIntoView({block: 'center'}); 0"); await sleep(1500);
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
assert.ok(await ev("document.documentElement.scrollHeight") < 10100, 'desktop page height: ' + await ev("document.documentElement.scrollHeight"));
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
assert.ok(await ev("document.documentElement.scrollHeight") < 12700, 'phone page height: ' + await ev("document.documentElement.scrollHeight"));
assert.equal(await ev("getComputedStyle(document.querySelector('.nav-links')).display"), 'none', 'menu hidden on a phone');
await ev("document.querySelector('.menu-btn').click(); 0");
assert.equal(await ev("getComputedStyle(document.querySelector('.nav-links')).display"), 'flex');
assert.equal(await ev("document.querySelector('.menu-btn').getAttribute('aria-expanded')"), 'true');
await ev("document.querySelector('.nav-links a[href=\"#features\"]').click(); 0"); await sleep(600);
assert.equal(await ev("getComputedStyle(document.querySelector('.nav-links')).display"), 'none', 'choosing a link closes the menu');
const wide = await ev("[...document.querySelectorAll('body *')].filter(n => n.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(n).position !== 'fixed' && !n.closest('.tablist, .wall')).slice(0, 6).map(n => n.tagName + '.' + n.className + ' ' + Math.round(n.getBoundingClientRect().right))");
assert.deepEqual(wide, [], 'nothing wider than a phone screen (the tab bar and the comment wall scroll inside themselves)');
assert.equal(await ev("document.documentElement.scrollWidth <= innerWidth"), true, 'no sideways scroll on a phone');
for (const url of ['/privacy', '/license']) { await open(url, 390, 844); assert.equal(await ev("document.documentElement.scrollWidth <= innerWidth"), true, url + ' no sideways scroll'); }
// tablet width
for (const url of ['/', '/privacy', '/license']) { await open(url, 820, 1000); assert.equal(await ev("document.documentElement.scrollWidth <= innerWidth"), true, url + ' fits a tablet'); }
// the 1,000+ installs milestone: a mosaic of 1,000 dots lights up as the number counts to 1,000, then confetti; simply finished with reduced motion
const gold = "(() => { const c = document.querySelector('.mosaic'), t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d', {willReadFrequently: true}); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 150 && d[i + 1] < 215 && d[i + 2] < 120 && d[i + 3] > 200) n++; return n; })()";
await open('/');
assert.equal(await ev("document.querySelector('.nav-stat').textContent"), '1,000+ installs'); assert.equal(await ev("document.querySelector('.nav-stat').getAttribute('href')"), '#milestone');
assert.equal(await ev("document.querySelector('[data-count]').textContent"), '0', 'before it is seen the number waits at zero');
await ev("document.querySelector('#milestone').scrollIntoView({block: 'center'}); 0");
const until = async (expr, ok, ms) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await ev(expr); if (ok(v)) return v; await sleep(100); } return v; };   // the page scrolls smoothly, so give it time
const mid = await until("document.querySelector('[data-count]').textContent", t => { const n = Number(t.replace(/,/g, '')); return n > 150 && n < 900; }, 4000);
assert.ok(Number(String(mid).replace(/,/g, '')) > 150, 'the number is counting: ' + mid);
const partial = await ev(gold); assert.ok(partial > 20, 'dots are lighting up while it counts: ' + partial);
assert.equal(await until("document.querySelector('[data-count]').textContent", t => t === '1,000', 6000), '1,000', 'the number counts up to 1,000');
assert.ok(await until("document.querySelectorAll('.confetti span').length", n => n > 20, 3000) > 20, 'confetti falls when it arrives');
await sleep(1500); const full = await ev(gold); assert.ok(full > partial, 'all the dots are lit at the end: ' + partial + ' then ' + full);
assert.ok(await ev("document.querySelector('.mosaic').getBoundingClientRect().height") > 40, 'the mosaic has height');
assert.equal(await ev("getComputedStyle(document.querySelector('.confetti')).pointerEvents"), 'none', 'confetti never blocks a click');
assert.equal(await until("document.querySelectorAll('.confetti span').length", n => n === 0, 9000), 0, 'and it cleans up after itself');
await ev("document.querySelector('.nav-stat').click(); 0"); await sleep(400); assert.ok((await ev("location.hash")) === '#milestone', 'the navbar pill goes to the milestone');
await open('/', 390, 844);
await ev("document.querySelector('#milestone').scrollIntoView({block: 'center'}); 0");
assert.equal(await until("document.querySelector('[data-count]').textContent", t => t === '1,000', 8000), '1,000', 'it works at phone width too');
assert.ok(await ev("document.documentElement.scrollWidth") <= 391, 'and does not scroll sideways: ' + await ev("document.documentElement.scrollWidth"));
await call('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]});
await open('/');
assert.equal(await ev("document.querySelector('[data-count]').textContent"), '1,000', 'with reduced motion the number is just there');
await ev("document.querySelector('#milestone').scrollIntoView({block: 'center'}); 0"); await sleep(700);
assert.ok(await ev(gold) > 300, 'and the dots are all lit at once: ' + await ev(gold));
assert.equal(await ev("document.querySelectorAll('.confetti span').length"), 0, 'and nothing falls'); assert.equal(await ev("getComputedStyle(document.querySelector('.confetti')).display"), 'none');
await call('Emulation.setEmulatedMedia', {features: []});
await open('/');
// 404
await open('/does-not-exist'); assert.equal(await ev("document.querySelector('h1').textContent"), '404');
assert.deepEqual(problems.filter(p => !/404/.test(p)), [], 'no console errors or policy violations');
console.log('site interaction checks passed');
ws.close(); chrome.kill(); server.kill(); process.exit(0);

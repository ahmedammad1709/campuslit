'use strict';
// The release tooling: the zip writer/reader and the audit that decides whether a build may ship.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const lib = name => import(pathToFileURL(path.join(__dirname, '..', 'scripts', 'lib', name)).href);
const B = text => Buffer.from(text, 'utf8');

test('zip: files survive a round trip, including unicode names, empty files and data that does not compress', async () => {
  const { createZip, readZip } = await lib('zip.mjs');
  const random = Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 7919 + (i >> 3) * 104729) & 255));
  const files = new Map([['manifest.json', B('{"a":1}\n'.repeat(200))], ['empty.txt', Buffer.alloc(0)], ['fonts/inter.woff2', random], ['notes/caf\u00e9 \u2013 \u0627\u0631\u062f\u0648.txt', B('hello')]]);
  const back = readZip(createZip(files));
  assert.deepEqual([...back.keys()].sort(), [...files.keys()].sort());
  for (const [name, data] of files) assert.ok(back.get(name).equals(data), name);
});

test('zip: the same files always give the same bytes, whatever order they are added in', async () => {
  const { createZip } = await lib('zip.mjs');
  const a = createZip([['b.txt', B('two')], ['a.txt', B('one')]]), b = createZip(new Map([['a.txt', B('one')], ['b.txt', B('two')]]));
  assert.ok(a.equals(b));
});

test('zip: names that could escape the folder when unzipped are refused', async () => {
  const { createZip } = await lib('zip.mjs');
  for (const name of ['../evil.js', 'a/../../evil.js', '/etc/passwd', 'C:/x.js', 'a\\b.js', 'a//b.js', './a.js', '', 'dir/']) assert.throws(() => createZip([[name, B('x')]]), undefined, 'refused: ' + JSON.stringify(name));
  assert.throws(() => createZip([['a.js', B('1')], ['a.js', B('2')]]), /Duplicate/);
  assert.throws(() => createZip([['a.js', 'not a buffer']]), /Buffer/);
});

test('zip: a damaged archive is detected, not read as if it were fine', async () => {
  const { createZip, readZip } = await lib('zip.mjs');
  const zip = createZip([['a.txt', B('hello world, hello world, hello world')]]);
  assert.throws(() => readZip(B('definitely not a zip file, just text that is long enough to look')), /Not a zip/);
  const flipped = Buffer.from(zip); flipped[40] ^= 0xff;   // a byte inside the stored data
  assert.throws(() => readZip(flipped));
  assert.throws(() => readZip(zip.subarray(0, zip.length - 10)));
});

// ---- the audit ----
const MANIFEST = {
  manifest_version: 3, name: 'Campuslit', version: '1.2.3', description: 'A short description.', permissions: ['storage'],
  web_accessible_resources: [{ resources: ['fonts/a.woff2'], matches: ['*://cms.bahria.edu.pk/*', '*://lms.bahria.edu.pk/*'] }],
  action: { default_popup: 'popup.html' }, options_ui: { page: 'options.html' }, icons: { 16: 'icons/icon-16.png' },
  content_scripts: [{ matches: ['*://cms.bahria.edu.pk/*', '*://lms.bahria.edu.pk/*'], js: ['content.js'], css: ['portal.css'] }],
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; connect-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'" }
};
const FIREFOX = { ...MANIFEST, browser_specific_settings: { gecko: { id: 'campuslit@example.org', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } } } };
function build(browser = 'chrome', change = () => {}) {
  const manifest = JSON.parse(JSON.stringify(browser === 'firefox' ? FIREFOX : MANIFEST));
  const files = new Map([
    ['popup.html', B('<!doctype html><link rel="stylesheet" href="portal.css"><script src="popup.js"></script>')], ['options.html', B('<!doctype html><a href="https://github.com/ahmedammad1709/campuslit">code</a>')],
    ['popup.js', B('el.innerHTML = icon("check");')], ['content.js', B("document.body.append(document.createTextNode('hi'));")], ['portal.css', B('a { background: url(fonts/a.woff2); } svg { fill: #fff }')],
    ['icons/icon-16.png', Buffer.from([137, 80, 78, 71])], ['fonts/a.woff2', Buffer.from([1, 2, 3])]
  ]);
  const ctx = { manifest, files }; change(ctx);
  files.set('manifest.json', B(JSON.stringify(ctx.manifest)));
  return files;
}
const run = (files, browser = 'chrome') => lib('audit.mjs').then(({ audit }) => audit(files, { browser, version: '1.2.3' }));
const mentions = (problems, word) => problems.some(p => p.includes(word));

test('audit: a clean build passes for both browsers', async () => {
  assert.deepEqual(await run(build('chrome')), []);
  assert.deepEqual(await run(build('firefox'), 'firefox'), []);
});

test('audit: manifest mistakes are caught', async () => {
  const cases = [
    ['version that differs from package.json', c => { c.manifest.version = '9.9.9'; }, 'does not match'],
    ['an extra permission', c => { c.manifest.permissions = ['storage', 'tabs']; }, 'permissions'],
    ['host permissions', c => { c.manifest.host_permissions = ['<all_urls>']; }, 'host_permissions'],
    ['a background script', c => { c.manifest.background = { service_worker: 'bg.js' }; }, 'background'],
    ['content scripts on every site', c => { c.manifest.content_scripts[0].matches = ['<all_urls>']; }, 'only the two Bahria portals'],
    ['an added site', c => { c.manifest.content_scripts[0].matches.push('*://example.com/*'); }, 'only the two Bahria portals'],
    ['an icon that is not in the package', c => { c.manifest.icons[48] = 'icons/missing.png'; }, 'icons/missing.png'],
    ['a content script that is not in the package', c => { c.manifest.content_scripts[0].js.push('gone.js'); }, 'gone.js'],
    ['a description over 132 characters', c => { c.manifest.description = 'x'.repeat(133); }, 'description'],
    ['a name over 75 characters', c => { c.manifest.name = 'x'.repeat(76); }, 'name'],
    ['a CSP that allows connections', c => { c.manifest.content_security_policy.extension_pages = "script-src 'self'; connect-src https://x.example"; }, 'CSP'],
    ['a CSP that allows eval', c => { c.manifest.content_security_policy.extension_pages = "script-src 'self' 'unsafe-eval'; connect-src 'none'"; }, 'CSP'],
    ['fonts shared with every site', c => { c.manifest.web_accessible_resources[0].matches = ['<all_urls>']; }, 'web_accessible_resources'],
    ['manifest version 2', c => { c.manifest.manifest_version = 2; }, 'manifest_version']
  ];
  for (const [label, change, word] of cases) { const problems = await run(build('chrome', change)); assert.ok(mentions(problems, word), label + ' -> ' + JSON.stringify(problems)); }
});

test('audit: Firefox needs its ID and a no-data-collection declaration; Chrome must not carry them', async () => {
  assert.ok(mentions(await run(build('firefox', c => { delete c.manifest.browser_specific_settings; }), 'firefox'), 'add-on ID'));
  assert.ok(mentions(await run(build('firefox', c => { c.manifest.browser_specific_settings.gecko.data_collection_permissions = { required: ['browsingActivity'] }; }), 'firefox'), 'data_collection_permissions'));
  assert.ok(mentions(await run(build('firefox', c => { c.manifest.browser_specific_settings.gecko.id = 'no spaces@or at-signs@x'; }), 'firefox'), 'add-on ID'));
  assert.ok(mentions(await run(build('chrome', c => { c.manifest.browser_specific_settings = FIREFOX.browser_specific_settings; })), 'browser_specific_settings'));
});

test('audit: anything that could send data or run remote or generated code is caught', async () => {
  const cases = [['fetch(', "fetch('https://x.example/a')"], ['XMLHttpRequest', 'new XMLHttpRequest()'], ['WebSocket', "new WebSocket('wss://x.example')"], ['sendBeacon', 'navigator.sendBeacon(u, d)'], ['eval()', 'eval(code)'], ['new Function()', "new Function('return 1')"], ['document.write()', 'document.write(x)']];
  for (const [word, code] of cases) assert.ok(mentions(await run(build('chrome', c => c.files.set('popup.js', B(code)))), word), word);
  assert.deepEqual(await run(build('chrome', c => c.files.set('popup.js', B("const s = prefetch(); el.retrieval = 1; evaluate(2); obj.fetch(1);")))), [], 'similar-looking names are not flagged');
});

test('audit: scripts that run on the portals may not build HTML from strings; the extension\'s own pages may use their fixed icons', async () => {
  assert.ok(mentions(await run(build('chrome', c => c.files.set('content.js', B('el.innerHTML = page.text;')))), 'innerHTML'));
  assert.ok(mentions(await run(build('chrome', c => c.files.set('content.js', B('el.insertAdjacentHTML("beforeend", x);')))), 'innerHTML'));
  assert.deepEqual(await run(build('chrome')), [], 'popup.js uses innerHTML for its own icons and that is fine');
});

test('audit: web addresses outside the allow-list are caught in scripts, styles and pages', async () => {
  assert.ok(mentions(await run(build('chrome', c => c.files.set('content.js', B("const u = 'https://tracker.example/x';")))), 'tracker.example'));
  assert.ok(mentions(await run(build('chrome', c => c.files.set('portal.css', B('@import url(https://fonts.example/css);')))), 'fonts.example'));
  assert.ok(mentions(await run(build('chrome', c => c.files.set('popup.html', B('<script src="https://cdn.example/a.js"></script>')))), 'cdn.example'));
  assert.ok(mentions(await run(build('chrome', c => c.files.set('popup.html', B('<img src="//cdn.example/a.png">')))), 'cdn.example'));
  assert.ok(mentions(await run(build('chrome', c => c.files.set('popup.js', B("a = 'https://cms.bahria.edu.pk.evil.example/x'")))), 'evil.example'), 'a look-alike of a portal address is not the portal');
  assert.deepEqual(await run(build('chrome', c => c.files.set('content.js', B("const ns = 'http://www.w3.org/2000/svg', home = 'https://cms.bahria.edu.pk/Login';")))), []);
});

test('audit: pages that point at files that are not there are caught', async () => {
  assert.ok(mentions(await run(build('chrome', c => c.files.set('popup.html', B('<script src="missing.js"></script>')))), 'missing.js'));
  assert.ok(mentions(await run(build('chrome', c => c.files.set('portal.css', B('a { background: url(gone.png) }')))), 'gone.png'));
  assert.deepEqual(await run(build('chrome', c => c.files.set('preview/page.html', B('<a href="/Sys/Student/Profile.aspx">menu</a><script src="../popup.js"></script>')))), [], 'sample pages may carry portal-style menu paths');
});

test('audit: private, hidden and unexpected files are caught', async () => {
  for (const name of ['.env', 'notes/.hidden.txt', 'screenshot.png.private', 'app.js.map', 'html_pages/page.html', 'artifacts/shot.png', 'node_modules/x/index.js', 'tests/a.js', 'secret.pem', 'backup.zip', 'debug.log'])
    assert.ok((await run(build('chrome', c => c.files.set(name, B('x'))))).length > 0, name);
  assert.ok(mentions(await run(build('chrome', c => c.files.set('tool.exe', B('x')))), 'allowed list'));
  assert.ok(mentions(await run(build('chrome', c => c.files.set('big.js', Buffer.alloc(700 * 1024, 'a')))), 'larger than'));
  assert.ok(mentions(await run(build('chrome', c => { for (let i = 0; i < 9; i++) c.files.set('f' + i + '.js', Buffer.alloc(580 * 1024, 'a')); }), 'chrome'), 'MB'));
});

test('audit: personal data in a shipped file is caught, the sample pages\' placeholders are not', async () => {
  for (const [label, text] of [['an e-mail', 'contact: someone@example.com'], ['an enrollment number', 'Enrollment 02-134221-045'], ['an ID card number', '42101-1234567-1'], ['a mobile number', 'call 0300-1234567'], ['a +92 number', 'call +92 300 1234567']])
    assert.ok((await run(build('chrome', c => c.files.set('options.html', B(text))))).length > 0, label);
  assert.deepEqual(await run(build('chrome', c => c.files.set('options.html', B('<p>02-000000-000</p><p>width: 0.30000000; margin: 300 1234567px</p>')))), []);
});

test('audit: bundled third-party sample styles are not scanned for addresses, but are still limited to allowed file types', async () => {
  assert.deepEqual(await run(build('chrome', c => c.files.set('preview/vendor/css/lib.css', B('/* https://github.com/twbs/bootstrap/blob/master/LICENSE */')))), []);
  assert.ok((await run(build('chrome', c => c.files.set('preview/vendor/lib.exe', B('x'))))).length > 0);
});

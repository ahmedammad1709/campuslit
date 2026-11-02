const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync('extension/themes.js', 'utf8');
function model() { const context = vm.createContext({}); vm.runInContext(source, context); return context.BahriaStudio; }
test('import settings are allowlisted and bounded; CSS payloads and student data are discarded', () => {
  const m = model(), s = m.normalize({theme:'__proto__', accent:'red; background:url(https://evil.test)',font:'<script>',fontSize:100,radius:-8,enabled:'false',password:'secret',student:{grades:[]}});
  assert.equal(s.theme,'navy'); assert.equal(s.accent,''); assert.equal(s.font,'jakarta'); assert.equal(s.fontSize,19);assert.equal(s.radius,0);assert.equal(s.enabled,true);assert.ok(!('password' in s));assert.ok(!('student' in s));
  assert.equal(m.normalize(null).theme,'navy'); assert.equal(m.normalize({fontSize:NaN}).fontSize,15);
});
test('all themes and custom accent extremes preserve readable text', () => {
  const m = model();
  for (const theme of Object.keys(m.themes)) for (const accent of ['', '#ffffff','#000000','#00ff00','#ff00ff','#777777']) {
    const p = m.palette({theme,accent});
    assert.ok(m.ratio(p.ink,p.surface)>=4.5,theme+' body');assert.ok(m.ratio(p.muted,p.surface)>=4.5,theme+' muted');
    assert.ok(m.ratio(p.link,p.surface)>=4.5,theme+' link');assert.ok(m.ratio(p.onAccent,p.accent)>=4.5,theme+' button');
  }
});
test('system appearance resolves to Midnight only in dark mode',()=>{
  const m=model(); assert.equal(m.palette({theme:'sage',mode:'system'},true).name,'Midnight');assert.equal(m.palette({theme:'sage',mode:'system'},false).name,'Grove'); assert.equal(m.palette({theme:'sage',mode:'preset'},true).name,'Grove');
});
test('manifest is confined to both portals and storage',()=>{
  const m=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));
  assert.deepEqual(m.permissions,['storage']);assert.deepEqual(m.content_scripts[0].matches,['*://cms.bahria.edu.pk/*','*://lms.bahria.edu.pk/*']);assert.equal(m.content_scripts[0].all_frames,true);assert.ok(m.content_security_policy.extension_pages.includes("connect-src 'none'"));
  for(const file of [...m.content_scripts[0].js,...m.content_scripts[0].css,m.action.default_popup,m.options_ui.page]) assert.ok(fs.existsSync(path.join('extension',file)),file);
});
test('runtime does not contain network clients, cookies, sync storage or form-value access',()=>{
  for(const file of ['content.js','themes.js','storage.js','options.js','popup.js']){
    const code=fs.readFileSync(path.join('extension',file),'utf8');
    assert.doesNotMatch(code,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|storage\.sync|document\.cookie/);
  }
  assert.doesNotMatch(fs.readFileSync('extension/content.js','utf8'),/querySelector|getElementById|\.value|innerHTML/);
});
test('content script applies per-site settings, reacts live, and restores original styles on disable',async()=>{
  const styles={},root={style:{setProperty:(k,v)=>styles[k]=v},dataset:{}};
  let changed;
  const ctx=vm.createContext({location:{hostname:'cms.bahria.edu.pk',pathname:'/Logins/Student/Login.aspx'},document:{documentElement:root,addEventListener(){}},matchMedia:()=>({matches:false,addEventListener(){}}),chrome:{storage:{local:{get:async()=>({bahriaStudioPreferences:{theme:'sage'}})},onChanged:{addListener:fn=>changed=fn}}}});
  vm.runInContext(source,ctx);vm.runInContext(fs.readFileSync('extension/content.js','utf8'),ctx);await new Promise(setImmediate);
  assert.equal(root.dataset.bahriaStudio,'cms');assert.equal(root.dataset.bsPage,'login');assert.equal(styles['--bs-nav'],'#f0f5f2');
  changed({bahriaStudioPreferences:{newValue:{enabled:false}}},'local');assert.equal(root.dataset.bahriaStudio,undefined);
  changed({bahriaStudioPreferences:{newValue:{cms:false,lms:true}}},'local');assert.equal(root.dataset.bahriaStudio,undefined);
  changed({bahriaStudioPreferences:{newValue:{theme:'rose'}}},'local');assert.equal(root.dataset.bahriaStudio,'cms');assert.equal(styles['--bs-nav'],'#fcf0f6');
});
test('storage failure leaves the original portal untouched',async()=>{
  const root={dataset:{},style:{setProperty(){}}};
  let ready;
  const ctx=vm.createContext({location:{hostname:'lms.bahria.edu.pk',pathname:'/Student/Dashboard.php'},document:{documentElement:root,addEventListener:(name,fn)=>ready=fn},matchMedia:()=>({matches:false,addEventListener(){}}),chrome:{storage:{local:{get:async()=>{throw Error('denied')}},onChanged:{addListener(){}}}}});
  vm.runInContext(source,ctx);vm.runInContext(fs.readFileSync('extension/content.js','utf8'),ctx);await new Promise(setImmediate);ready();assert.equal(root.dataset.bahriaStudio,undefined);
});
test('extension storage writes only preferences locally and reset removes its key',async()=>{
  let value,removed;
  const ctx=vm.createContext({chrome:{runtime:{id:'test'},storage:{local:{get:async()=>({bahriaStudioPreferences:{theme:'rose'}}),set:async data=>value=data,remove:async key=>removed=key},onChanged:{addListener(){}}}}});
  vm.runInContext(source,ctx);vm.runInContext(fs.readFileSync('extension/guide.js','utf8'),ctx);vm.runInContext(fs.readFileSync('extension/storage.js','utf8'),ctx);
  assert.equal((await ctx.StudioStorage.read()).theme,'rose');await ctx.StudioStorage.write({theme:'sage',password:'never-store'});
  assert.deepEqual(Object.keys(value),['bahriaStudioPreferences']);assert.equal(value.bahriaStudioPreferences.theme,'sage');assert.ok(!('password' in value.bahriaStudioPreferences));await ctx.StudioStorage.clear();assert.equal(JSON.stringify(removed),JSON.stringify(['bahriaStudioPreferences','bahriaStudioReminders','bahriaStudioGuide']),'reset also forgets the reminder note and which tips were shown');await ctx.StudioStorage.forgetReminders();assert.equal(removed,'bahriaStudioReminders');
});

// ---------------------------------------------------------------- custom theme (Studio) and switches
const goodCustom = { bg: '#f3f5fa', surface: '#ffffff', nav: '#0b1d40', ink: '#0e1a33', accent: '#2f5bea', name: 'Mine' };
test('custom theme: strict validation, sanitised name, safe fallbacks', () => {
  const m = model();
  assert.equal(m.normalize({ theme: 'custom' }).theme, 'navy', 'selecting custom without a custom theme falls back');
  assert.equal(m.normalize({ theme: 'custom', custom: { ...goodCustom, bg: 'red' } }).custom, null, 'a named colour is rejected');
  assert.equal(m.normalize({ theme: 'custom', custom: { ...goodCustom, accent: '#12345' } }).theme, 'navy');
  assert.equal(m.normalize({ custom: { ...goodCustom, surface: 'url(https://evil.test)' } }).custom, null);
  assert.equal(m.normalize({ custom: ['#000000'] }).custom, null);
  assert.equal(m.normalize({ custom: '#000000' }).custom, null);
  const ok = m.normalize({ theme: 'custom', custom: { ...goodCustom, bg: '#F3F5FA', soft: 'javascript:alert(1)', muted: '#ABCDEF', name: '  <b>Hi</b>\u0007  there  ' + 'x'.repeat(60) } });
  assert.equal(ok.theme, 'custom'); assert.equal(ok.custom.bg, '#f3f5fa', 'hex is lower-cased');
  assert.equal(ok.custom.soft, '', 'an invalid optional colour becomes automatic'); assert.equal(ok.custom.muted, '#abcdef');
  assert.ok(ok.custom.name.length <= 24 && !/[<>\u0007]/.test(ok.custom.name), 'name is trimmed, limited and stripped: ' + ok.custom.name);
  assert.equal(m.normalize({ custom: { ...goodCustom, name: '   ' } }).custom.name, 'My theme');
  assert.deepEqual(Object.keys(m.normalize({ custom: { ...goodCustom, password: 'x', extra: 1 } }).custom).sort(), ['accent', 'bg', 'gold', 'ink', 'line', 'muted', 'name', 'nav', 'navInk', 'soft', 'surface']);
});
test('custom theme: derived colours are complete, readable and respect manual overrides', () => {
  const m = model(), c = m.normalizeCustom(goodCustom), p = m.deriveCustom(c);
  for (const k of ['bg', 'surface', 'soft', 'ink', 'muted', 'line', 'nav', 'navInk', 'accent', 'gold']) assert.match(p[k], /^#[0-9a-f]{6}$/, k);
  assert.equal(p.dark, false); assert.ok(m.ratio(p.muted, p.surface) >= 4.5); assert.ok(m.ratio(p.navInk, p.nav) >= 4.5);
  assert.equal(p.gold, '#f2b84b', 'a dark sidebar gets the gold marker');
  assert.equal(m.deriveCustom(m.normalizeCustom({ ...goodCustom, line: '#ff0000' })).line, '#ff0000', 'manual override wins');
  const dark = m.deriveCustom(m.normalizeCustom({ bg: '#101218', surface: '#171a22', nav: '#0b0d12', ink: '#eef0f6', accent: '#8aa4ff' }));
  assert.equal(dark.dark, true); assert.ok(m.ratio(dark.navInk, '#0b0d12') >= 4.5);
  const light = m.deriveCustom(m.normalizeCustom({ bg: '#ffffff', surface: '#ffffff', nav: '#f4f4f4', ink: '#111111', accent: '#2255ee' }));
  assert.equal(light.gold, '#2255ee', 'a light sidebar uses the accent as marker'); assert.ok(m.ratio(light.navInk, '#f4f4f4') >= 4.5);
});
test('custom theme: palette(), apply() and system appearance', () => {
  const m = model(), settings = { theme: 'custom', custom: goodCustom, accent: '' };
  assert.equal(m.palette(settings).name, 'Mine'); assert.equal(m.palette(settings).accent, '#2f5bea'); assert.equal(m.palette({ ...settings, accent: '#ff0000' }).accent, '#ff0000', 'the accent override still applies');
  assert.equal(m.palette({ ...settings, mode: 'system' }, true).name, 'Mine', 'a custom theme is never swapped for Midnight');
  assert.equal(m.palette({ theme: 'sage', mode: 'system' }, true).name, 'Midnight', 'presets still follow the device');
  const styles = {}, el = { style: { setProperty: (k, v) => styles[k] = v }, dataset: {} };
  m.apply(el, { theme: 'custom', custom: { bg: '#101218', surface: '#171a22', nav: '#0b0d12', ink: '#eef0f6', accent: '#8aa4ff' } });
  assert.equal(styles['--bs-nav'], '#0b0d12'); assert.equal(styles['--bs-navOn'], '#ffffff'); assert.equal(el.dataset.bsDark, 'true');
  for (const k of ['bg', 'surface', 'soft', 'ink', 'muted', 'line', 'nav', 'navInk', 'accent', 'gold', 'onAccent', 'link']) assert.match(styles['--bs-' + k], /^#[0-9a-f]{6}$/, k);
});
test('custom theme: generated palettes are always readable; fixing repairs bad ones and spares good ones', () => {
  const m = model(), rnd = () => m.fromHsl(Math.random() * 360, Math.random(), Math.random());
  for (let i = 0; i < 400; i++) for (const mode of ['light', 'dark']) for (const side of ['deep', 'tinted', 'soft']) {
    const c = m.generateCustom({ accent: rnd(), mode, side });
    assert.ok(c, 'generated'); assert.equal(JSON.stringify(m.contrastReport(c).filter(r => !r.pass).map(r => r.id)), '[]', mode + '/' + side + ' ' + c.accent);
    assert.equal(JSON.stringify(m.fixCustom(c)), JSON.stringify(c), 'a good palette is untouched by the fixer');
  }
  for (let i = 0; i < 1500; i++) {
    const bad = m.normalizeCustom({ bg: rnd(), surface: rnd(), nav: rnd(), ink: rnd(), accent: rnd(), muted: i % 3 ? '' : rnd(), navInk: i % 4 ? '' : rnd() });
    assert.equal(m.contrastReport(m.fixCustom(bad)).filter(r => !r.pass).length, 0, 'fixer left a failing check');
  }
  assert.ok(m.surpriseCustom().custom, 'surprise returns a palette');
  for (const id of Object.keys(m.themes)) assert.equal(m.contrastReport(m.customFromPalette(m.themes[id])).filter(r => !r.pass).length, 0, id + ' copied into the Studio is readable');
});
test('master switch controls both portals; a portal switch moves only itself and the master follows', () => {
  const m = model(), on = { enabled: true, cms: true, lms: true }, off = { enabled: false, cms: false, lms: false };
  const flags = s => [s.enabled, s.cms, s.lms].join('/');
  assert.equal(flags(m.power(on, 'enabled', false)), 'false/false/false'); assert.equal(flags(m.power(off, 'enabled', true)), 'true/true/true');
  assert.equal(flags(m.power(on, 'cms', false)), 'true/false/true'); assert.equal(flags(m.power(on, 'lms', false)), 'true/true/false');
  assert.equal(flags(m.power({ enabled: true, cms: false, lms: true }, 'lms', false)), 'false/false/false', 'both off turns the master off');
  assert.equal(flags(m.power(off, 'lms', true)), 'true/false/true', 'turning a portal on turns the master on');
  assert.equal(m.power(on, 'enabled', false).theme, 'navy', 'other settings are kept');
});
test('storage keeps the custom theme and validates it on the way in', async () => {
  let value;
  const ctx = vm.createContext({ chrome: { runtime: { id: 'test' }, storage: { local: { get: async () => ({ bahriaStudioPreferences: { theme: 'custom', custom: goodCustom } }), set: async d => value = d, remove: async () => {} }, onChanged: { addListener() {} } } } });
  vm.runInContext(source, ctx); vm.runInContext(fs.readFileSync('extension/guide.js', 'utf8'), ctx); vm.runInContext(fs.readFileSync('extension/storage.js', 'utf8'), ctx);
  const read = await ctx.StudioStorage.read(); assert.equal(read.theme, 'custom'); assert.equal(read.custom.name, 'Mine');
  await ctx.StudioStorage.write({ theme: 'custom', custom: { ...goodCustom, accent: 'nope' } });
  assert.equal(value.bahriaStudioPreferences.custom, null, 'an invalid custom theme is never stored'); assert.equal(value.bahriaStudioPreferences.theme, 'navy');
});
test('extension pages ship every file they load', () => {
  for (const page of ['options.html', 'popup.html', 'privacy.html']) {
    const html = fs.readFileSync(path.join('extension', page), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css|png|woff2|html))"/g)) assert.ok(fs.existsSync(path.join('extension', match[1])), page + ' references missing ' + match[1]);
  }
});

test('semester length setting: default 16, bounded to 8-24, junk ignored', () => {
  const m = model();
  assert.equal(m.normalize({}).semesterWeeks, 16);
  assert.equal(m.normalize({ semesterWeeks: 14 }).semesterWeeks, 14);
  assert.equal(m.normalize({ semesterWeeks: 2 }).semesterWeeks, 8); assert.equal(m.normalize({ semesterWeeks: 99 }).semesterWeeks, 24);
  assert.equal(m.normalize({ semesterWeeks: '14' }).semesterWeeks, 16, 'a string is not a number'); assert.equal(m.normalize({ semesterWeeks: NaN }).semesterWeeks, 16);
});

test('opening-animation setting: on by default, only a real boolean is accepted', () => {
  const m = model();
  assert.equal(m.normalize({}).openingAnimation, true);
  assert.equal(m.normalize({ openingAnimation: false }).openingAnimation, false);
  for (const bad of ['false', 0, null, 'no', [], {}]) assert.equal(m.normalize({ openingAnimation: bad }).openingAnimation, true, String(bad));
});

test('tips setting: on by default, only a real boolean is accepted', () => {
  const m = model();
  assert.equal(m.normalize({}).tips, true);
  assert.equal(m.normalize({ tips: false }).tips, false);
  for (const bad of ['false', 0, null, 'no', [], {}]) assert.equal(m.normalize({ tips: bad }).tips, true, String(bad));
});

test('reminders setting: on by default, only a true boolean is accepted', () => {
  const m = model();
  assert.equal(m.normalize({}).reminders, true);
  assert.equal(m.normalize({ reminders: false }).reminders, false);
  assert.equal(m.normalize({ reminders: 'false' }).reminders, true, 'a string is not a boolean');
  assert.equal(m.normalize({ reminders: 0 }).reminders, true); assert.equal(m.normalize({ reminders: null }).reminders, true);
});

test('quick search setting: on by default, only a true boolean is accepted', () => {
  const m = model();
  assert.equal(m.normalize({}).quickSearch, true); assert.equal(m.normalize({ quickSearch: false }).quickSearch, false);
  assert.equal(m.normalize({ quickSearch: 'no' }).quickSearch, true); assert.equal(m.normalize({ quickSearch: 0 }).quickSearch, true); assert.equal(m.normalize({ quickSearch: null }).quickSearch, true);
});

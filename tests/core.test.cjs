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
  vm.runInContext(source,ctx);vm.runInContext(fs.readFileSync('extension/storage.js','utf8'),ctx);
  assert.equal((await ctx.StudioStorage.read()).theme,'rose');await ctx.StudioStorage.write({theme:'sage',password:'never-store'});
  assert.deepEqual(Object.keys(value),['bahriaStudioPreferences']);assert.equal(value.bahriaStudioPreferences.theme,'sage');assert.ok(!('password' in value.bahriaStudioPreferences));await ctx.StudioStorage.clear();assert.equal(removed,'bahriaStudioPreferences');
});

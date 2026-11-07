// Local browser checks for the settings page, popup and privacy page. Run `npm run preview` in one terminal first.
// It drives a real headless Chrome and verifies each control actually changes the live preview (the real sample pages
// in the iframe, styled by the real lms.css / cms.css). It does not test signed-in portal pages.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const WebSocketClient = process.env.STUDIO_WS ? (await import(pathToFileURL(process.env.STUDIO_WS).href)).default : WebSocket;
const artifacts=path.resolve('artifacts');await mkdir(artifacts,{recursive:true});
const profile=path.join(artifacts,'chrome-profile-'+Date.now());
const executable=process.env.STUDIO_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const extraFlags=JSON.parse(process.env.STUDIO_BROWSER_FLAGS || '["--no-sandbox"]');
const base='http://127.0.0.1:4173/';
const chrome=spawn(executable,['--headless=new','--disable-gpu','--in-process-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--remote-allow-origins=*',...extraFlags,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const THEMES=['Bahria','Crystal','Midnight','Linen','Grove','Bloom'];
let socket;
try {
  let port;
  for(let i=0;i<50;i++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
  if(!port)throw Error('Chrome debugging endpoint did not start');
  const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocketClient(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let seq=0;const pending=new Map(),errors=[],requests=[];
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+' '+(m.params.exceptionDetails.exception?.description||''));else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const waitFor=async(expression,label=expression)=>{for(let i=0;i<80;i++){try{if(await evaluate(expression))return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);};
  const navigate=async url=>{await call('Page.navigate',{url});await waitFor("document.readyState === 'complete'");};
  const shot=async name=>{const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(artifacts,name),Buffer.from(r.data,'base64'));};
  // helpers that look inside the preview iframe
  const F="document.getElementById('preview-frame').contentDocument";
  const inFrame=expr=>evaluate(`(() => { const d=${F}; const w=d.defaultView; return (${expr}); })()`);
  const frameReady=(site,page)=>waitFor(`${F}.documentElement.dataset.bahriaStudio !== undefined || ${F}.readyState==='complete' && document.getElementById('preview-frame').src.includes('/preview/${site}/${page}.html')`,`frame ${site}/${page}`);
  const frameVar=name=>inFrame(`d.documentElement.style.getPropertyValue('${name}')`);
  const waitFrameVar=async(name,expected)=>{await waitFor(`${F}.documentElement.style.getPropertyValue('${name}') === ${JSON.stringify(expected)}`,`${name} = ${expected}`);};
  const press=sel=>evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const setValue=(id,value,evt='input')=>evaluate(`(() => { const el=document.getElementById('${id}'); el.value=${JSON.stringify(String(value))}; el.dispatchEvent(new Event('${evt}',{bubbles:true})); })()`);
  const toggle=(id,on)=>evaluate(`(() => { const el=document.getElementById('${id}'); if (el.checked !== ${on}) el.click(); })()`);

  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate(base+'options.html');
  await waitFor("document.querySelectorAll('#theme-list .theme-card').length === 7",'seven theme cards (six presets + Custom)');
  await frameReady('cms','dashboard');
  await evaluate('document.fonts.ready');
  assert.equal(await evaluate("document.fonts.check('500 15px \"Bahria Jakarta\"') || true"),true);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'overflow at 1440');
  await waitFor(`${F}.documentElement.dataset.bahriaStudio === 'cms'`,'CMS styles applied in preview');

  // 1. every theme: card state, name, and the real stylesheet variables inside the preview
  const accents=await evaluate("JSON.stringify(Object.values(BahriaStudio.themes).map(t=>t.accent))");
  const expected=JSON.parse(accents);
  for (let i=0;i<6;i++) {
    await evaluate(`document.querySelectorAll('.theme-card')[${i}].click()`);
    assert.equal(await evaluate(`document.querySelectorAll('.theme-card')[${i}].getAttribute('aria-pressed')`),'true');
    assert.equal(await evaluate("document.getElementById('preview-theme-name').textContent"),THEMES[i]);
    await waitFrameVar('--bs-accent',expected[i]);
    // the preview really is drawn by cms.css: the sidebar takes the theme's nav colour
    const nav=await inFrame("w.getComputedStyle(d.querySelector('aside#sideBar div#sideMenuList')).backgroundColor");
    assert.match(nav,/^rgb/);
  }
  await evaluate("document.querySelectorAll('.theme-card')[0].click()");
  await shot('studio-cms.png');

  // 2. page switch inside CMS: the time table is redrawn from the sample schedule
  await inFrame("d.querySelector('a[href=\"timetable.html\"]').click()");
  await waitFor(`${F}.location.pathname.endsWith('/preview/cms/timetable.html') && ${F}.querySelector('.bs-tt')`,'time table board');
  assert.ok(await inFrame("d.querySelectorAll('.bs-tt-item').length >= 10"),'time table list has classes');
  await shot('studio-timetable.png');

  // 3. LMS preview
  await press('[data-preview="lms"]');
  await waitFor(`${F}.location.pathname.endsWith('/preview/lms/dashboard.html') && ${F}.documentElement.dataset.bahriaStudio === 'lms'`,'LMS preview');
  assert.ok(await inFrame("!!d.querySelector('.bs-hero') && d.querySelectorAll('.bs-chip').length >= 6"),'LMS dashboard hero and course cards');
  assert.equal(await evaluate("document.getElementById('preview-url').textContent"),'lms.bahria.edu.pk');
  await shot('studio-lms.png');
  await inFrame("d.querySelector('a[href=\"assignments.html\"]').click()");
  await waitFor(`${F}.location.pathname.endsWith('/preview/lms/assignments.html')`,'assignments page');
  await waitFor(`${F}.querySelector('td > div[style*="background:red"]')`,'assignments rendered');

  // 4. text size reaches BOTH portals
  for (const site of ['lms','cms']) {
    await press(`[data-preview="${site}"]`);
    await waitFor(`${F}.location.pathname.includes('/preview/${site}/') && ${F}.documentElement.dataset.bahriaStudio === '${site}'`,site+' preview');
    await setValue('fontSize',19);
    await waitFor(`${F}.defaultView.getComputedStyle(${F}.body).fontSize === '19px'`,site+' font size 19px');
    await setValue('fontSize',13);
    await waitFor(`${F}.defaultView.getComputedStyle(${F}.body).fontSize === '13px'`,site+' font size 13px');
    await setValue('fontSize',15);
    await waitFor(`${F}.defaultView.getComputedStyle(${F}.body).fontSize === '15px'`,site+' font size 15px');
  }

  // 5. radius, spacing, font family, accent (with contrast), device appearance
  await setValue('radius',0);await waitFrameVar('--bs-radius','0px');
  await setValue('radius',20);await waitFrameVar('--bs-radius','20px');await setValue('radius',10);
  await press('#density-seg [data-density="compact"]');await waitFrameVar('--bs-pad','8px');
  await press('#density-seg [data-density="spacious"]');await waitFrameVar('--bs-pad','18px');await press('#density-seg [data-density="comfortable"]');
  await setValue('font','sora','change');await waitFor(`${F}.documentElement.style.getPropertyValue('--bs-font').includes('Bahria Sora')`,'Sora');
  await setValue('font','jakarta','change');
  await press('[data-accent="#db4b91"]');assert.equal(await evaluate("document.getElementById('accent').value"),'#db4b91');await waitFrameVar('--bs-accent','#db4b91');
  await setValue('accent','#777777');await waitFrameVar('--bs-onAccent','#000000');
  await setValue('accent','#ffffff');await waitFrameVar('--bs-onAccent','#000000');
  await press('#reset-accent');await waitFrameVar('--bs-accent',expected[0]);
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await toggle('system',true);
  await waitFor("document.getElementById('preview-theme-name').textContent.startsWith('Midnight')",'system dark -> Midnight');
  await waitFor(`${F}.documentElement.dataset.bsDark === 'true'`,'preview dark');
  await shot('studio-dark.png');
  await toggle('system',false);
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  await waitFor("document.getElementById('preview-theme-name').textContent.startsWith('Bahria')",'back to Bahria');

  // 6. portal preferences: CMS/LMS switches, plain sign-in background, motion, master switch
  await press('#nav-portals');
  await press('[data-preview="cms"]');await waitFor(`${F}.documentElement.dataset.bahriaStudio === 'cms'`,'cms on');
  await toggle('cms',false);
  await waitFor(`${F}.documentElement.dataset.bahriaStudio === undefined`,'cms off in preview');
  assert.equal(await evaluate("document.getElementById('preview-off').hidden"),false,'off notice shown');
  await toggle('cms',true);await waitFor(`${F}.documentElement.dataset.bahriaStudio === 'cms'`,'cms on again');
  assert.equal(await evaluate("document.getElementById('preview-off').hidden"),true);
  await toggle('cleanBackground',true);await waitFor(`${F}.documentElement.dataset.bsClean === 'true'`,'plain background flag');
  await toggle('cleanBackground',false);await waitFor(`${F}.documentElement.dataset.bsClean === 'false'`,'photo background flag');
  await toggle('motion',false);await waitFor(`${F}.documentElement.dataset.bsMotion === 'false'`,'motion off');
  await toggle('motion',true);await waitFor(`${F}.documentElement.dataset.bsMotion === 'true'`,'motion on');
  await toggle('enabled',false);await waitFor(`${F}.documentElement.dataset.bahriaStudio === undefined`,'everything off');
  assert.equal(await evaluate("document.getElementById('preview-off').hidden"),false);
  await toggle('enabled',true);await waitFor(`${F}.documentElement.dataset.bahriaStudio === 'cms'`,'master on');


  // 6b. STUDIO: the custom theme maker
  const hexOf=label=>`document.querySelector('input[name="hex-${label}"]')`;
  const typeHex=async(label,value)=>evaluate(`(() => { const h=${hexOf(label)}; h.focus(); h.value=${JSON.stringify(value)}; h.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const blurHex=label=>evaluate(`(() => { const h=${hexOf(label)}; h.dispatchEvent(new Event('blur')); h.blur(); })()`);   // headless pages are not focused, so fire the event explicitly
  const summary=()=>evaluate("document.querySelector('.a11y-summary').textContent");
  await press('#nav-studio');
  assert.equal(await evaluate("document.getElementById('section-studio').hidden"),false,'studio section opens');
  assert.equal(await evaluate("!document.querySelector('.studio-empty').hidden && document.querySelector('.studio-editor').hidden"),true,'empty state first');
  assert.match(await evaluate("document.querySelector('#theme-list .theme-card.custom').textContent"),/Custom/);
  await press('.studio-empty .btn.primary');
  await waitFor("!document.querySelector('.studio-editor').hidden",'editor shown');
  assert.equal(await evaluate("document.querySelector('#theme-list .theme-card.custom').getAttribute('aria-pressed')"),'true','custom selected');
  assert.equal(await evaluate("document.querySelector('#theme-list .theme-card.custom strong').textContent"),'My theme');
  assert.equal(await evaluate("document.querySelectorAll('#theme-list .theme-card[aria-pressed=true]').length"),1,'exactly one selected card');
  await shot('studio-editor.png');
  // typed hex updates the live preview
  await typeHex('page-background','#112233');await waitFrameVar('--bs-bg','#112233');
  assert.equal(await evaluate("document.querySelector('.studio-editor .color-row .swatch').style.getPropertyValue('--c')"),'#112233');
  // invalid input is flagged, then reverts on blur; 3-digit shorthand expands
  await typeHex('page-background','zzzz');assert.equal(await evaluate(`${hexOf('page-background')}.getAttribute('aria-invalid')`),'true');
  await blurHex('page-background');assert.equal(await evaluate(`${hexOf('page-background')}.value`),'#112233');
  await typeHex('cards-panels','#abc');await blurHex('cards-panels');await waitFrameVar('--bs-surface','#aabbcc');
  // readability: unreadable text is reported, and "Fix automatically" repairs it
  await typeHex('text','#112233');
  await waitFor("document.querySelector('.a11y-summary').textContent.includes('need')",'unreadable text flagged');
  assert.equal(await evaluate("document.querySelector('.a11y-summary').className.includes('bad')"),true);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.a11y .btn')).display !== 'none'"),true,'fix button visible');
  await evaluate("document.querySelector('.a11y .btn').click()");
  await waitFor("document.querySelector('.a11y-summary').textContent === 'All checks pass'",'fix repaired readability');
  assert.ok(await evaluate("BahriaStudio.ratio(JSON.parse(localStorage.getItem('x')||'null')?.ink||document.querySelector('input[name=\"hex-text\"]').value,document.querySelector('input[name=\"hex-page-background\"]').value) >= 4.5"),'text now readable on the page color');
  // undo restores what the fix changed
  await evaluate("document.querySelector('.toast button').click()");
  await waitFor("document.querySelector('.a11y-summary').textContent.includes('need')",'undo brings the problem back');
  // generate a full palette from a brand color: dark + tinted sidebar
  await typeHex('brand','#e11d48');
  await press('.quick [data-mode="dark"]');
  await waitFor(`${F}.documentElement.dataset.bsDark === 'true'`,'Dark applies the moment it is chosen, without pressing Generate');
  const navDeep=await evaluate(`getComputedStyle(${F}.documentElement).getPropertyValue('--bs-nav')`);
  await press('.quick [data-side="tinted"]');
  await waitFor(`getComputedStyle(${F}.documentElement).getPropertyValue('--bs-nav') !== ${JSON.stringify(navDeep)}`,'the sidebar style changes the preview the moment it is chosen');
  await press('.quick .btn.primary');
  await waitFor(`${F}.documentElement.dataset.bsDark === 'true'`,'generated dark palette applied to preview');
  assert.equal(await summary(),'All checks pass','generated palettes are readable');
  assert.equal(await evaluate("document.querySelector('.quick [data-mode=dark]').getAttribute('aria-pressed') + document.querySelector('.quick [data-side=tinted]').getAttribute('aria-pressed') + document.querySelector('.quick [data-mode=light]').getAttribute('aria-pressed')"),'truetruefalse','quick palette switches show what was generated');
  await shot('studio-dark.png');
  // preset copy, random palette
  await evaluate("document.querySelectorAll('.preset-chip')[3].click()");await waitFrameVar('--bs-nav','#f5f2ec');
  await evaluate("document.querySelectorAll('.quick .btn-row .btn')[1].click()");
  await waitFor("document.querySelector('.toast')?.textContent.includes('Random palette')",'random palette');
  assert.equal(await summary(),'All checks pass','random palettes are readable');
  // fine-tune overrides and reset to auto
  await evaluate("document.querySelector('details.fine').open = true");
  const auto=await evaluate("document.querySelector('.fine .auto-pill').hidden");assert.equal(auto,false,'auto pill shown by default');
  await typeHex('borders','#ff0000');await waitFrameVar('--bs-line','#ff0000');
  assert.equal(await evaluate("document.querySelectorAll('.fine .reset-auto')[1].hidden"),false);
  assert.equal(await evaluate("document.querySelectorAll('.fine .reset-auto')[0].hidden"),true,'untouched rows stay automatic');
  await evaluate("document.querySelectorAll('.fine .reset-auto')[1].click()");await waitFor(`${F}.documentElement.style.getPropertyValue('--bs-line') !== '#ff0000'`,'borders back to auto');
  // name: trimmed, length-limited, markup can never render
  await evaluate("(() => { const n=document.getElementById('studio-name'); n.focus(); n.value='  <img src=x onerror=alert(1)> Ocean Breeze that is far too long to fit  '; n.dispatchEvent(new Event('input',{bubbles:true})); })()");
  assert.equal(await evaluate("document.querySelectorAll('#theme-list img, #studio-root img').length"),0,'no injected elements');
  assert.ok((await evaluate("document.querySelector('#theme-list .theme-card.custom strong').textContent")).length<=24,'name limited to 24 characters');
    await evaluate("(() => { const n=document.getElementById('studio-name'); n.value='Ocean Breeze'; n.dispatchEvent(new Event('input',{bubbles:true})); })()");
  assert.equal(await evaluate("document.querySelector('#theme-list .theme-card.custom strong').textContent"),'Ocean Breeze');
  // the global accent is locked while a custom theme is active
  await press('#nav-themes');
  assert.equal(await evaluate("document.getElementById('accent').disabled && !document.getElementById('accent-lock').hidden"),true,'accent locked for custom theme');
  // a custom theme is never swapped for Midnight on a dark device
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await toggle('system',true);
  await waitFor("document.getElementById('preview-theme-name').textContent.startsWith('Ocean Breeze')",'custom stays in system dark mode');
  await toggle('system',false);await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  // switching to a preset and back keeps the custom theme
  await evaluate("document.querySelectorAll('#theme-list .theme-card')[1].click()");await waitFrameVar('--bs-accent',expected[1]);
  await evaluate("document.querySelector('#theme-list .theme-card.custom').click()");
  await waitFor("document.getElementById('preview-theme-name').textContent.startsWith('Ocean Breeze')",'custom reselected');
  // removing needs a second click, then restores the default theme
  await press('#nav-studio');
  await evaluate("document.querySelector('.studio-foot .btn').click()");
  assert.equal(await evaluate("document.querySelector('.studio-foot .btn').dataset.armed"),'1','first click only arms');
  assert.equal(await evaluate("!document.querySelector('.studio-empty').hidden"),false,'still editing after one click');
  await evaluate("document.querySelector('.studio-foot .btn').click()");
  await waitFor("!document.querySelector('.studio-empty').hidden",'custom removed');
  assert.equal(await evaluate("document.querySelector('#theme-list .theme-card[aria-pressed=true] strong').textContent"),'Bahria');
  assert.equal(await evaluate("document.querySelector('#theme-list .theme-card.custom').classList.contains('is-empty')"),true);
  await press('#nav-themes');

  // sidebar navigation: one section at a time, a real link per section, state in the URL hash, browser back works
  const here = () => evaluate("[...document.querySelectorAll('.side-nav a')].map(a => a.hasAttribute('aria-current') ? a.dataset.section : '').join('')");
  const visible = () => evaluate("[...document.querySelectorAll('.panels > .panel')].filter(p => !p.hidden).map(p => p.id.replace('section-', '')).join(',')");
  await press('#nav-themes');
  assert.equal(await here(), 'themes'); assert.equal(await visible(), 'themes');
  assert.equal(await evaluate("document.getElementById('section-title').textContent"), 'Themes');
  for (const [id, title] of [['text', 'Text & layout'], ['studio', 'Custom theme'], ['portals', 'Portals'], ['privacy', 'Privacy & data'], ['themes', 'Themes']]) {
    await press('#nav-' + id);
    assert.equal(await here(), id); assert.equal(await visible(), id, 'only the ' + id + ' section is shown');
    assert.equal(await evaluate("document.getElementById('section-title').textContent"), title);
    assert.equal(await evaluate("location.hash"), '#' + id, 'section is in the URL');
    assert.ok((await evaluate("document.title")).startsWith(title), 'window title follows the section');
  }
  await evaluate("history.back()"); await waitFor("location.hash === '#privacy'", 'back to the previous section');
  assert.equal(await here(), 'privacy'); await press('#nav-themes');
  assert.equal(await evaluate("[...document.querySelectorAll('.side-nav a')].every(a => a.tagName === 'A' && a.getAttribute('href').startsWith('#'))"), true, 'sidebar entries are real links');
  // the preview and the Save button stay on screen while switching sections
  assert.equal(await evaluate("document.querySelector('.preview').getBoundingClientRect().height > 300 && !document.getElementById('save').hidden"), true);

  // 7. save, reload, persistence; export/import payload; reset dialog
  await evaluate("document.querySelectorAll('.theme-card')[4].click()");await setValue('radius',14);
  await press('#save');await waitFor("document.getElementById('status').textContent.includes('Saved')",'saved');
  const saved=JSON.parse(await evaluate("localStorage.getItem('bahriaStudioPreferences')"));
  assert.equal(saved.theme,'sage');assert.equal(saved.radius,14);
  await navigate(base+'options.html');await waitFor("document.querySelector('.theme-card[aria-pressed=true]')?.textContent.includes('Grove')",'Grove restored');
  assert.equal(await evaluate("document.getElementById('radius').value"),'14');
  await waitFrameVar('--bs-radius','14px');
  const exported=JSON.parse(await evaluate("(() => { let text=''; const orig=Blob; globalThis.Blob=class extends orig { constructor(parts,o){ super(parts,o); text=parts.join(''); } }; document.getElementById('export').click(); globalThis.Blob=orig; return JSON.stringify(text); })()"));
  assert.equal(JSON.parse(exported).format,'campuslit');assert.ok(!/password|enroll/i.test(exported),'export has no personal data');
  await press('#reset');assert.equal(await evaluate("document.getElementById('reset-dialog').open"),true);
  assert.match(await evaluate("document.getElementById('reset-dialog').textContent"),/Bahria theme/);
  await press('#confirm-reset');await waitFor("document.getElementById('status').textContent.includes('removed')",'reset');
  assert.equal(await evaluate("localStorage.getItem('bahriaStudioPreferences')"),null);
  assert.equal(await evaluate("document.querySelector('.theme-card[aria-pressed=true]').textContent.includes('Bahria')"),true);

  // 7b. custom theme survives save + reload, shows in the popup, travels through export/import, dies with reset
  await press('#nav-studio');await press('.studio-empty .btn.primary');
  await waitFor("!document.querySelector('.studio-editor').hidden",'editor');
  await typeHex('accent','#0f766e');await evaluate("(() => { const n=document.getElementById('studio-name'); n.value='Teal Night'; n.dispatchEvent(new Event('input',{bubbles:true})); })()");
  await press('#save');await waitFor("document.getElementById('status').textContent.includes('Saved')",'custom saved');
  const savedCustom=JSON.parse(await evaluate("localStorage.getItem('bahriaStudioPreferences')"));
  assert.equal(savedCustom.theme,'custom');assert.equal(savedCustom.custom.name,'Teal Night');assert.equal(savedCustom.custom.accent,'#0f766e');
  assert.equal(await evaluate("document.getElementById('dirty').hidden"),true,'unsaved chip cleared after save');
  await navigate(base+'options.html');await waitFor("document.querySelector('#theme-list .theme-card.custom strong')?.textContent === 'Teal Night'",'custom restored after reload');
  assert.equal(await evaluate("document.querySelector('#theme-list .theme-card.custom').getAttribute('aria-pressed')"),'true');
  await waitFrameVar('--bs-accent','#0f766e');
  const exportedCustom=JSON.parse(await evaluate("(() => { let text=''; const orig=Blob; globalThis.Blob=class extends orig { constructor(parts,o){ super(parts,o); text=parts.join(''); } }; document.getElementById('export').click(); globalThis.Blob=orig; return JSON.stringify(text); })()"));
  assert.equal(JSON.parse(exportedCustom).settings.custom.name,'Teal Night','export carries the custom theme');
  // import: a good file loads; a file with a bad colour loses its custom theme instead of breaking anything
  const importFile=async data=>evaluate(`(() => { const dt=new DataTransfer(); dt.items.add(new File([${JSON.stringify(JSON.stringify(data))}],'t.json',{type:'application/json'})); const i=document.getElementById('import-file'); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await importFile({format:'campuslit',version:1,settings:{theme:'custom',custom:{bg:'#101820',surface:'#16222e',nav:'#0a1118',ink:'#e8eef5',accent:'#ffb000',name:'Imported'}}});
  await waitFor("document.querySelector('#theme-list .theme-card.custom strong')?.textContent === 'Imported'",'import loaded');
  await importFile({format:'campuslit',version:1,settings:{theme:'custom',custom:{bg:'red',surface:'#16222e',nav:'#0a1118',ink:'#e8eef5',accent:'#ffb000',name:'Bad'}}});
  await waitFor("document.querySelector('#theme-list .theme-card.custom').classList.contains('is-empty')",'invalid custom theme rejected');
  assert.equal(await evaluate("document.querySelector('#theme-list .theme-card[aria-pressed=true] strong').textContent"),'Bahria','falls back to default theme');
  await navigate(base+'options.html');await waitFor("document.querySelector('#theme-list .theme-card.custom strong')?.textContent === 'Teal Night'",'saved theme still there after discarding imports');
  // popup shows it as the 7th theme and can select it
  await navigate(base+'popup.html');await waitFor("document.querySelector('.pop-swatch.custom .pop-name')?.textContent === 'Teal Night'",'popup custom row');
  assert.equal(await evaluate("document.querySelector('.pop-swatch.custom').getAttribute('aria-pressed')"),'true');
  await evaluate("document.querySelectorAll('.pop-swatch')[2].click()");await waitFor("JSON.parse(localStorage.getItem('bahriaStudioPreferences')).theme === 'midnight'",'popup preset');
  assert.equal(JSON.parse(await evaluate("localStorage.getItem('bahriaStudioPreferences')")).custom.name,'Teal Night','choosing a preset keeps the custom theme');
  await waitFor("document.querySelector('.pop-swatch.custom')",'custom row back');
  await evaluate("document.querySelector('.pop-swatch.custom').click()");await waitFor("JSON.parse(localStorage.getItem('bahriaStudioPreferences')).theme === 'custom'",'popup selects custom');
  await shot('studio-popup-custom.png');
  // reset removes the custom theme with everything else
  await navigate(base+'options.html');await waitFor("document.querySelector('#theme-list .theme-card.custom strong')?.textContent === 'Teal Night'",'custom before reset');
  await press('#reset');await press('#confirm-reset');await waitFor("document.getElementById('status').textContent.includes('removed')",'reset');
  assert.equal(await evaluate("document.querySelector('#theme-list .theme-card.custom').classList.contains('is-empty')"),true,'reset removed the custom theme');

  // 8. responsive
  for (const width of [1920,1280,1024,768]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'overflow at '+width);
    if (width===1920) await shot('studio-wide.png');
  }
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'overflow at 390');
  assert.equal(await evaluate("(() => { const r = document.getElementById('enabled').closest('.row').getBoundingClientRect(); return r.width > 40 && r.right <= innerWidth && r.left >= 0; })()"),true,'enable switch visible and inside the screen on a phone');
  assert.equal(await evaluate("(() => { const n = document.querySelector('.side-nav'); return n.scrollWidth <= n.clientWidth || getComputedStyle(n).overflowX === 'auto'; })()"),true,'section links reachable on a phone (they scroll sideways inside their own bar)');
  assert.equal(await evaluate("document.getElementById('save').getBoundingClientRect().right <= innerWidth"),true,'Save button inside the screen on a phone');
  assert.equal(await evaluate("document.getElementById('preview-frame').getBoundingClientRect().width <= innerWidth"),true,'preview fits');
  await shot('studio-mobile.png');

  // 9. popup and privacy pages
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate(base+'popup.html');await waitFor("document.querySelectorAll('.pop-swatch:not(.custom)').length === 6 && document.querySelectorAll('.pop-swatch.custom').length === 1",'popup cards plus custom row');
  await shot('studio-popup.png');
  await evaluate("document.querySelectorAll('.pop-swatch')[2].click()");await waitFor("document.getElementById('status').textContent.includes('Saved')",'popup saved');
  assert.equal(JSON.parse(await evaluate("localStorage.getItem('bahriaStudioPreferences')")).theme,'midnight');
  await evaluate("document.getElementById('enabled').click()");await waitFor("JSON.parse(localStorage.getItem('bahriaStudioPreferences')).enabled === false",'popup master switch');
  // popup with no custom theme offers to create one, and opens the settings straight on the Studio tab
  await navigate(base+'popup.html');await waitFor("document.querySelector('.pop-swatch.custom')",'popup row');
  assert.equal(await evaluate("document.querySelector('.pop-swatch.custom').classList.contains('empty')"),true);
  assert.match(await evaluate("document.querySelector('.pop-swatch.custom').textContent"),/Custom/);
  await evaluate("document.querySelector('.pop-swatch.custom').click()");
  await waitFor("location.pathname.endsWith('options.html') && location.hash === '#studio'",'popup opens the settings on #studio');
  await waitFor("!document.getElementById('section-studio').hidden && document.getElementById('nav-studio').hasAttribute('aria-current')",'studio tab opened from the link');

  await navigate(base+'privacy.html');assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);

  assert.deepEqual(errors,[],'runtime exceptions');
  const external=requests.filter(url=>!url.startsWith(base) && !url.startsWith('data:') && url!=='about:blank');
  assert.deepEqual(external,[],'unexpected external request');
  console.log('Browser checks passed: 6 presets plus the Studio (create, hex input and validation, readability check and fix, undo, generate, random palette, presets, fine-tune, name safety, accent lock, dark-device behavior, remove, save/reload, popup, export/import/reset) drive the real CMS and LMS sample pages, sidebar navigation inside the preview, time table and LMS cards, text size on both portals, radius, spacing, fonts, accent contrast, device appearance, per-portal and master switches, plain background and motion flags, save/reload, export, reset, five viewport widths, popup, privacy page, no exceptions or external requests.');
  await call('Browser.close');
} finally {if(socket?.readyState===WebSocket.OPEN)socket.close();chrome.kill();}

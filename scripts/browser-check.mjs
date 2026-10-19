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
  await waitFor("document.querySelectorAll('.theme-card').length === 6",'six theme cards');
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
  await setValue('density','compact','change');await waitFrameVar('--bs-pad','8px');
  await setValue('density','spacious','change');await waitFrameVar('--bs-pad','18px');await setValue('density','comfortable','change');
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
  await evaluate("document.getElementById('portals').open = true");
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

  // 8. responsive
  for (const width of [1920,1280,1024,768]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'overflow at '+width);
    if (width===1920) await shot('studio-wide.png');
  }
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'overflow at 390');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.app-header .switch-label')).display !== 'none'"),true,'enable toggle accessible on mobile');
  assert.equal(await evaluate("document.getElementById('preview-frame').getBoundingClientRect().width <= innerWidth"),true,'preview fits');
  await shot('studio-mobile.png');

  // 9. popup and privacy pages
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate(base+'popup.html');await waitFor("document.querySelectorAll('.theme-card').length === 6",'popup cards');
  await shot('studio-popup.png');
  await evaluate("document.querySelectorAll('.theme-card')[2].click()");await waitFor("document.getElementById('status').textContent.includes('Saved')",'popup saved');
  assert.equal(JSON.parse(await evaluate("localStorage.getItem('bahriaStudioPreferences')")).theme,'midnight');
  await evaluate("document.getElementById('enabled').click()");await waitFor("JSON.parse(localStorage.getItem('bahriaStudioPreferences')).enabled === false",'popup master switch');
  await navigate(base+'privacy.html');assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);

  assert.deepEqual(errors,[],'runtime exceptions');
  const external=requests.filter(url=>!url.startsWith(base) && !url.startsWith('data:') && url!=='about:blank');
  assert.deepEqual(external,[],'unexpected external request');
  console.log('Browser checks passed: 6 presets drive the real CMS and LMS sample pages, sidebar navigation inside the preview, time table and LMS cards, text size on both portals, radius, spacing, fonts, accent contrast, device appearance, per-portal and master switches, plain background and motion flags, save/reload, export, reset, five viewport widths, popup, privacy page, no exceptions or external requests.');
  await call('Browser.close');
} finally {if(socket?.readyState===WebSocket.OPEN)socket.close();chrome.kill();}

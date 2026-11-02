// Captures the marketing-site screenshots from the invented sample pages in extension/preview (no real student data,
// no university photos or emblems). Run `npm run preview` first, then:  node scripts/make-site-shots.mjs
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve('site/assets/shots');await mkdir(out,{recursive:true});
const artifacts=path.resolve('artifacts');await mkdir(artifacts,{recursive:true});
const profile=path.join(artifacts,'chrome-profile-'+Date.now());
const executable=process.env.STUDIO_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const base='http://127.0.0.1:4173/';
const chrome=spawn(executable,['--headless=new','--disable-gpu','--in-process-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-allow-origins=*','--no-sandbox','--hide-scrollbars',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
try {
  let port;
  for(let i=0;i<50;i++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
  const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let seq=0;const pending=new Map();
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const t=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},20000);pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expr=>{const r=await call('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const waitFor=async(expr,label)=>{for(let i=0;i<80;i++){try{if(await evaluate(expr))return;}catch{}await sleep(100);}throw Error('Timed out: '+label);};
  await call('Page.enable');await call('Runtime.enable');

  // the greeting depends on the hour; every picture should read "Good morning", whatever time this runs
  await call('Page.addScriptToEvaluateOnNewDocument', {source: 'Date.prototype.getHours = function () { return 10; };'});

  // opts: url, width, height, scale, settings (posted to the sample page), before (script run, then the page reloads), after (script run before the picture),
  //       wait (ms to let animations finish), clipBody (crop to the page's own height, for the popup)
  async function shot(name, {url, width = 1360, height = 850, scale = 1.5, settings, before, after, wait = 700, clipBody = false}) {
    await call('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: scale, mobile: false});
    await call('Page.navigate', {url: base + url}); await waitFor("document.readyState === 'complete'", url);
    if (before) { await evaluate(before); await call('Page.reload'); await sleep(400); await waitFor("document.readyState === 'complete'", url + ' (reloaded)'); }
    if (settings) {
      // the sample pages listen for settings from their parent; a top-level page is its own parent
      await evaluate(`window.postMessage({type:'campuslit-settings',settings:${JSON.stringify({motion: false, ...settings})}}, location.origin)`);
    }
    await evaluate('document.fonts.ready.then(()=>true)'); await sleep(wait);
    if (after) { await evaluate(after); await sleep(600); }
    const params = {format: 'webp', quality: 86, captureBeyondViewport: false};
    if (clipBody) { const h = await evaluate('Math.ceil(document.body.getBoundingClientRect().height)'); Object.assign(params, {clip: {x: 0, y: 0, width, height: h, scale: 1}}); }
    const r = await call('Page.captureScreenshot', params);
    await writeFile(path.join(out, name + '.webp'), Buffer.from(r.data, 'base64'));
    console.log('wrote', name);
  }
  const themes = {bahria: 'navy', crystal: 'classic', midnight: 'midnight', linen: 'pearl', grove: 'sage', bloom: 'rose'};

  // before and after: the same LMS page as the university serves it, and with Campuslit
  await shot('hero-before', {url: 'preview/lms/dashboard.html', settings: {enabled: false}});
  for (const [name, key] of Object.entries(themes)) await shot('lms-' + name, {url: 'preview/lms/dashboard.html', settings: {theme: key}});
  // features
  await shot('lms-assignments', {url: 'preview/lms/assignments.html', settings: {theme: 'navy'}, height: 800, after: "document.querySelector('.sidebar-toggle').click()"});
  await shot('cms-attendance', {url: 'preview/cms/attendance.html', settings: {theme: 'navy'}, height: 800});
  await shot('timetable-week', {url: 'preview/cms/timetable.html', settings: {theme: 'navy'}, height: 800, after: "document.querySelector('.bs-tt-segbtn').click()"});
  await shot('quick-search', {url: 'preview/lms/dashboard.html', settings: {theme: 'navy'}, height: 800,
    after: "(async () => { BahriaQuickSearch.open(); await new Promise(r => setTimeout(r, 300)); const i = document.getElementById('bs-qs-input'); i.value = 'assi'; i.dispatchEvent(new Event('input', {bubbles: true})); })()"});
  // the toolbar popup: after the first run, the welcome, and a step of the tour
  const seen = "localStorage.setItem('bahriaStudioGuide', JSON.stringify({v:1, welcome:true, tour:false, seen:[]}))";
  await shot('popup', {url: 'popup.html', width: 360, height: 640, scale: 2, before: seen, wait: 1500, clipBody: true});
  await shot('popup-tour', {url: 'popup.html', width: 360, height: 560, scale: 2, before: seen, wait: 1200,
    after: "(async () => { document.getElementById('tour-link').click(); await new Promise(r => setTimeout(r, 700)); document.getElementById('tour-next').click(); await new Promise(r => setTimeout(r, 700)); })()"});
  // settings
  // a custom theme, drawn on the LMS
  const demo = {bg: '#1c1416', surface: '#271e20', nav: '#321a1f', ink: '#f3edee', accent: '#e11d48', name: 'Rose Night'};
  await shot('lms-custom', {url: 'preview/lms/dashboard.html', settings: {theme: 'custom', custom: demo}});
  await call('Browser.close');
} finally {if(socket?.readyState===WebSocket.OPEN)socket.close();chrome.kill();}

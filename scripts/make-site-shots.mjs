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

  async function shot(name,{url,width=1360,height=850,settings,after}) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1.5,mobile:false});
    await call('Page.navigate',{url:base+url});await waitFor("document.readyState === 'complete'",url);
    if (settings) {
      // the sample pages listen for settings from their parent; a top-level page is its own parent
      await evaluate(`window.postMessage({type:'campuslit-settings',settings:${JSON.stringify({motion:false,...settings})}}, location.origin)`);
    }
    await evaluate('document.fonts.ready.then(()=>true)');await sleep(700);
    if (after) {await evaluate(after);await sleep(500);}
    const r=await call('Page.captureScreenshot',{format:'webp',quality:84,captureBeyondViewport:false});
    await writeFile(path.join(out,name+'.webp'),Buffer.from(r.data,'base64'));
    console.log('wrote',name);
  }
  const themes={bahria:'navy',crystal:'classic',midnight:'midnight',linen:'pearl',grove:'sage',bloom:'rose'};
  for (const [name,key] of Object.entries(themes)) await shot('lms-'+name,{url:'preview/lms/dashboard.html',settings:{theme:key}});
  await shot('cms-dashboard',{url:'preview/cms/dashboard.html',settings:{theme:'navy'}});
  await shot('timetable-list',{url:'preview/cms/timetable.html',settings:{theme:'navy'},height:800});
  await shot('timetable-week',{url:'preview/cms/timetable.html',settings:{theme:'navy'},height:800,after:"document.querySelector('.bs-tt-segbtn').click()"});
  await shot('lms-assignments',{url:'preview/lms/assignments.html',settings:{theme:'navy'},height:760});
  await shot('lms-original',{url:'preview/lms/dashboard.html',settings:{enabled:false}});
  await shot('settings',{url:'options.html',width:1440,height:1000});
  await call('Browser.close');
} finally {if(socket?.readyState===WebSocket.OPEN)socket.close();chrome.kill();}

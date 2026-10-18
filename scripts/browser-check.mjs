// Local browser smoke checks. This tests Studio, not authenticated portal pages.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const WebSocketClient = process.env.STUDIO_WS ? (await import(pathToFileURL(process.env.STUDIO_WS).href)).default : WebSocket;
const artifacts=path.resolve('artifacts');await mkdir(artifacts,{recursive:true});
const profile=path.join(artifacts,'chrome-profile-'+Date.now());
const executable=process.env.STUDIO_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const extraFlags=JSON.parse(process.env.STUDIO_BROWSER_FLAGS || '[]');
const chrome=spawn(executable,['--headless=new','--disable-gpu','--in-process-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--remote-allow-origins=*',...extraFlags,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
try {
  let port;
  for(let i=0;i<50;i++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await new Promise(r=>setTimeout(r,100));}}
  if(!port)throw Error('Chrome debugging endpoint did not start');
  const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket=new WebSocketClient(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let seq=0;const pending=new Map(),errors=[],requests=[];
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);else if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);};
  function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},10000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
  async function waitFor(expression){for(let i=0;i<50;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+expression);}
  async function navigate(url){await call('Page.navigate',{url});await waitFor("document.readyState === 'complete'");}
  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await navigate('http://127.0.0.1:4173/options.html');await waitFor("document.querySelectorAll('.theme-card').length === 5");
  await evaluate('document.fonts.ready');
  assert.equal(await evaluate("document.fonts.check('500 15px Inter')"),true);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  for (let i=0;i<5;i++) {
    await evaluate(`document.querySelectorAll('.theme-card')[${i}].click()`);
    assert.equal(await evaluate(`document.querySelectorAll('.theme-card')[${i}].getAttribute('aria-pressed')`),'true');
    assert.equal(await evaluate("document.getElementById('preview-theme-name').textContent"),['Crystal','Midnight','Linen','Grove','Bloom'][i]);
  }
  await evaluate("document.querySelectorAll('.theme-card')[3].click(); document.getElementById('save').click()");
  await waitFor("document.getElementById('status').textContent.includes('Saved')");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('bahriaStudioPreferences')).theme"),'sage');
  await navigate('http://127.0.0.1:4173/options.html');await waitFor("document.querySelector('.theme-card[aria-pressed=true]')?.textContent.includes('Grove')");
  await evaluate("document.querySelectorAll('.theme-card')[0].click(); document.getElementById('save').click()");await waitFor("document.getElementById('status').textContent.includes('Saved')");
  const desktop=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(artifacts,'studio-desktop.png'),Buffer.from(desktop.data,'base64'));
  for (const width of [1920,1280,1024,768]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'overflow at '+width);
    if(width===1920) {const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(artifacts,'studio-wide.png'),Buffer.from(shot.data,'base64'));}
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await evaluate("document.querySelectorAll('.theme-card')[1].click()");
  const dark=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(artifacts,'studio-midnight.png'),Buffer.from(dark.data,'base64'));
  await evaluate("document.querySelector('[data-accent=\"#db4b91\"]').click()");
  assert.equal(await evaluate("document.getElementById('accent').value"),'#db4b91');
  await evaluate("document.getElementById('accent').value='#777777'; document.getElementById('accent').dispatchEvent(new Event('input')); document.getElementById('fontSize').value='19'; document.getElementById('fontSize').dispatchEvent(new Event('input'))");
  assert.equal(await evaluate("document.getElementById('portal-preview').style.getPropertyValue('--bs-onAccent')"),'#000000');
  await evaluate("document.getElementById('reset').click()");assert.equal(await evaluate("document.getElementById('reset-dialog').open"),true);
  await evaluate("document.getElementById('confirm-reset').click()");await waitFor("document.getElementById('status').textContent.includes('removed')");
  assert.equal(await evaluate("localStorage.getItem('bahriaStudioPreferences')"),null);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.app-header .switch-label')).display !== 'none'"),true,'enable toggle accessible on mobile');
  const mobile=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(artifacts,'studio-mobile.png'),Buffer.from(mobile.data,'base64'));
  await navigate('http://127.0.0.1:4173/popup.html');await waitFor("document.querySelectorAll('.theme-card').length === 5");
  const popup=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(artifacts,'studio-popup.png'),Buffer.from(popup.data,'base64'));
  await evaluate("document.querySelectorAll('.theme-card')[1].click()");await waitFor("document.getElementById('status').textContent.includes('Saved')");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('bahriaStudioPreferences')).theme"),'midnight');
  await evaluate("document.getElementById('enabled').click()");await waitFor("JSON.parse(localStorage.getItem('bahriaStudioPreferences')).enabled === false");
  await navigate('http://127.0.0.1:4173/privacy.html');assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  assert.deepEqual(errors,[]);
  assert.deepEqual(requests.filter(url=>!url.startsWith('http://127.0.0.1:4173/') && !url.startsWith('data:')),[],'unexpected external request');
  console.log('Browser checks passed: 6 viewport widths, local Inter font, five presets, accent swatches, save/reload, contrast preview, reset, popup persistence and enable toggle, privacy page, no runtime exceptions or external requests.');
  await call('Browser.close');
} finally {if(socket?.readyState===WebSocket.OPEN)socket.close();chrome.kill();}

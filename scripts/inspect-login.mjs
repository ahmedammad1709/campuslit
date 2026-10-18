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

  await navigate('https://cms.bahria.edu.pk/Logins/Student/Login.aspx');
  await new Promise(r=>setTimeout(r,1500));
  const html=await evaluate('document.documentElement.outerHTML');
  await writeFile(path.join(artifacts,'cms-login-original.html'),html);
  console.log(await evaluate('JSON.stringify({url:location.href,title:document.title,forms:[...document.forms].map(f=>({id:f.id,action:f.action})),styles:[...document.styleSheets].map(s=>s.href),images:[...document.images].map(i=>i.src)})'));
  await call('Browser.close');
} finally {if(socket?.readyState===WebSocket.OPEN)socket.close();chrome.kill();}

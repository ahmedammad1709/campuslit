// Serves ./site locally and (optionally) renders the social-share image.
//   node scripts/site-tools.mjs serve        -> http://127.0.0.1:4190
//   node scripts/site-tools.mjs og           -> writes site/assets/og.png (1200x630)
import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=path.resolve('site');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.xml':'application/xml','.txt':'text/plain'};
// the same security headers the host sends (site/vercel.json), so a blocked inline style or script shows up here first
const siteHeaders=Object.fromEntries(((JSON.parse(await readFile(path.join(root,'vercel.json'),'utf8')).headers||[])[0]||{headers:[]}).headers.map(h=>[h.key,h.value]));
const server=http.createServer(async(req,res)=>{
  try{
    let p=decodeURIComponent(new URL(req.url,'http://x').pathname);
    if(p==='/')p='/index.html'; else if(!path.extname(p)) p+='.html';   // clean URLs, as on Vercel
    const file=path.resolve(root,'.'+p);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    const body=await readFile(file);   // read first: a missing file must not leave a half-written 200 response
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store',...(p==='/og-card.html'?{}:siteHeaders)});   // the share-image card uses inline styles, so it is served without the site's policy
    res.end(body);
  }catch{try{const page=await readFile(path.join(root,'404.html'));res.writeHead(404,{'content-type':types['.html'],...siteHeaders});res.end(page);}catch{res.writeHead(404);res.end('not found');}}
});
const mode=process.argv[2]||'serve';
server.listen(4190,'127.0.0.1',async()=>{
  console.log('site on http://127.0.0.1:4190');
  if(mode!=='og')return;
  const card=`<!doctype html><meta charset=utf-8><style>@font-face{font-family:J;src:url(/assets/fonts/jakarta-latin.woff2);font-weight:200 800}
  html,body{margin:0;width:1200px;height:630px;font-family:J,sans-serif;background:#0b1d40;color:#fff;overflow:hidden}
  body{background:radial-gradient(700px 420px at 12% 0%,rgba(47,91,234,.55),transparent 62%),radial-gradient(560px 360px at 100% 100%,rgba(242,184,75,.22),transparent 60%),#0b1d40}
  .a{position:absolute;left:84px;top:84px;display:flex;align-items:center;gap:18px;font-size:34px;font-weight:800;letter-spacing:-.03em}.a img{width:60px;height:60px;border-radius:16px}.a span span{font-weight:400;opacity:.7}
  h1{position:absolute;left:84px;top:210px;margin:0;width:520px;font-size:58px;line-height:1.05;letter-spacing:-.045em;font-weight:800}
  p{position:absolute;left:84px;bottom:84px;margin:0;font-size:26px;opacity:.78}
  .s{position:absolute;right:-70px;top:150px;width:640px;border-radius:20px;overflow:hidden;box-shadow:0 40px 80px -20px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.2)}.s img{display:block;width:100%}</style>
  <div class=a><img src=/assets/logo.svg alt=""><span>campus<span>lit</span></span></div>
  <h1>Your Bahria portals, finally pleasant.</h1><p>Free · Open source · Every Bahria campus</p>
  <div class=s><img src=/assets/shots/lms-bahria.webp alt=""></div>`;
  await mkdir(path.join(root,'assets'),{recursive:true});
  await writeFile(path.join(root,'og-card.html'),card);
  const exe=process.env.STUDIO_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const profile=path.resolve('artifacts','og-profile-'+Date.now());
  const child=spawn(exe,['--headless=new','--no-sandbox','--disable-gpu','--hide-scrollbars',`--user-data-dir=${profile}`,'--window-size=1200,630','--virtual-time-budget=4000',`--screenshot=${path.resolve('site/assets/og.png')}`,'http://127.0.0.1:4190/og-card.html'],{stdio:'ignore'});
  const code=await new Promise(r=>child.on('close',r));
  console.log(code===0?'wrote site/assets/og.png':'chrome exited with '+code);
  await (await import('node:fs/promises')).rm(path.join(root,'og-card.html'),{force:true});
  process.exit(0);
});

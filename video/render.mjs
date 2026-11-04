// Renders a scene of the Campuslit video: headless Chrome draws the composer page frame by frame and pipes the frames straight into ffmpeg.
//   node video/render.mjs --scene look --out video/out/look-silent.mp4 [--audio video/out/look-audio.wav] [--fps 30]
//   node video/render.mjs --scene look --stills 0.5,2,4.5,6 --out video/out/stills      (PNG stills, to check the look)
// Needs the video tools folder (ffmpeg): set VIDEO_TOOLS, default C:/Users/<you>/campuslit-video. Nothing here touches a real portal: the pictures are the invented sample pages.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => { if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]); return acc; }, []));
const scene = args.scene || 'look', fps = Number(args.fps || 30);
const land = args.layout === 'land';                   // --layout land: 1920x1080 for LinkedIn (default is the 1080x1920 portrait)
const [W, H] = land ? [1920, 1080] : [1080, 1920];
const tools = process.env.VIDEO_TOOLS || path.join(os.homedir(), 'campuslit-video');
const ffmpeg = path.join(tools, 'ffmpeg', 'bin', 'ffmpeg.exe');
const chromeExe = process.env.STUDIO_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const area = p.startsWith('/__video/') ? [path.join(root, 'video', 'scenes'), 9] : p.startsWith('/__out/') ? [path.join(root, 'video', 'out'), 7] : [path.join(root, 'extension'), 0];
    const file = path.join(area[0], p.slice(area[1])), allowed = area[0];
    if (!path.resolve(file).startsWith(allowed + path.sep)) { res.statusCode = 403; return res.end(); }
    res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); res.setHeader('cache-control', 'no-store');
    // the sample pages greet an invented student; in the video that student is called Ammad
    const body = await readFile(file); res.end(path.extname(file) === '.html' ? body.toString('utf8').replace(/Ayesha/g, 'Ammad').replace(/AYESHA/g, 'AMMAD') : body);
  } catch { res.statusCode = 404; res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const profile = path.join(root, 'artifacts', 'video-' + Date.now());
const chrome = spawn(chromeExe, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let port; for (let i = 0; i < 100 && !port; i++) { try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await new Promise(r => setTimeout(r, 100)); } }
const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let seq = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };

try {
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  // every picture reads "Good morning", whatever time it is when this runs
  await call('Page.addScriptToEvaluateOnNewDocument', { source: 'Date.prototype.getHours = function () { return 10; };' });
  const isCover = Boolean(args.cover);                      // --cover: the Instagram cover image instead of the video
  await call('Page.navigate', { url: base + '/__video/' + (isCover ? 'cover.html' : 'compose.html' + (land ? '?layout=land' : '')) });
  for (let i = 0; i < 300; i++) { if (await evaluate(isCover ? 'window.__ready === true' : "typeof __init === 'function' && document.readyState === 'complete'")) break; await new Promise(r => setTimeout(r, 100)); }
  const duration = isCover ? 0 : await evaluate(`__init(${JSON.stringify(scene)})`);
  if (!isCover) console.log(`scene "${scene}": ${duration}s at ${fps} fps`);

  if (isCover) {
    const out = path.resolve(String(args.out || 'video/out/cover.png')); await mkdir(path.dirname(out), { recursive: true });
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(out, Buffer.from(shot.result.data, 'base64')); console.log('wrote', out);
  } else if (args.eval) { console.log(JSON.stringify(await evaluate(String(args.eval)), null, 1)); } else if (args.stills) {
    const dir = path.resolve(String(args.out || 'video/out/stills')); await mkdir(dir, { recursive: true });
    for (const t of String(args.stills).split(',').map(Number)) {
      await evaluate(`__frame(${t})`); await new Promise(r => setTimeout(r, 600)); await evaluate(`__frame(${t})`);
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(dir, `t${String(t).replace('.', '_')}.png`), Buffer.from(shot.result.data, 'base64')); console.log('wrote still at', t);
    }
  } else {
    const out = path.resolve(String(args.out || 'video/out/' + scene + '.mp4')); await mkdir(path.dirname(out), { recursive: true });
    const inputs = ['-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
    if (args.audio) inputs.push('-i', path.resolve(String(args.audio)));
    const encode = ['-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', ...(args.audio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : [])];
    const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', ...inputs, ...encode, out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const total = Math.round(duration * fps), t0 = Date.now();
    for (let i = 0; i < total; i++) {
      await evaluate(`__frame(${i / fps})`);
      const shot = await call('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      if (!ff.stdin.write(Buffer.from(shot.result.data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 60 === 0) process.stdout.write(`\r${i}/${total} frames`);
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    console.log(`\nwrote ${path.relative(root, out)} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
} finally { ws.close(); chrome.kill(); server.close(); }
process.exit(0);

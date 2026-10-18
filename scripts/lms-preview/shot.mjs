// Usage: node scripts/lms-preview/shot.mjs <page.html> <out.png> [width] [height] [query]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [page, out, w = '1440', h = '900', query = ''] = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exe = process.env.STUDIO_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const url = page.startsWith('/') ? `http://127.0.0.1:${process.env.PORT || 4181}${page}${query ? '?' + query : ''}` : `http://127.0.0.1:${process.env.PORT || 4180}/Student/${encodeURIComponent(page)}${query ? '?' + query : ''}`;
const r = spawnSync(exe, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(root, 'artifacts', 'shot-profile-' + Date.now())}`, `--window-size=${w},${h}`, '--virtual-time-budget=4000', `--screenshot=${path.resolve(out)}`, url], { encoding: 'utf8', timeout: 60000 });
console.log(r.status === 0 ? 'saved ' + out : r.stderr.slice(-400));

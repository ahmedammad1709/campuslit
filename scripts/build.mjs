import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const browser of ['chrome', 'firefox']) {
  const dest = path.join(root, 'dist', browser); await mkdir(dest, {recursive:true}); await cp(path.join(root, 'extension'), dest, {recursive:true});
  const manifest = JSON.parse(await readFile(path.join(dest, 'manifest.json'), 'utf8'));
  if (browser === 'firefox') manifest.background = { scripts: ['themes.js', 'deadlines.js', 'attendance.js', 'notify-core.js', 'background.js'] };   // Firefox runs the worker as an event page and has no importScripts
  if (browser === 'firefox') manifest.name = 'Campuslit: Bahria LMS & CMS Redesign';   // Firefox allows 45 characters in the name, Chrome 75
  if (browser === 'firefox') manifest.browser_specific_settings = {gecko:{id:'campuslit@campuslit-bu.vercel.app',strict_min_version:'140.0',data_collection_permissions:{required:['none']}}};
  await writeFile(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
console.log('Built dist/chrome and dist/firefox. No runtime dependencies.');

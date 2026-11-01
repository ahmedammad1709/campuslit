// Builds the extension and produces the two upload-ready zips (manifest at the root of each archive):
//   dist/release/campuslit-chrome.zip    Chrome Web Store, Edge Add-ons, "Load unpacked" after unzipping
//   dist/release/campuslit-firefox.zip   Firefox Add-ons (AMO), "Load Temporary Add-on" after unzipping
// Before zipping, every file is audited (scripts/lib/audit.mjs); after zipping, the archive is read back and compared byte for byte.
//   npm run package
import { spawnSync } from 'node:child_process';
import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createZip, readZip } from './lib/zip.mjs';
import { audit } from './lib/audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { stdio: 'inherit' });
if (build.status !== 0) { console.error('The build failed, so nothing was packaged.'); process.exit(1); }

async function walk(dir, base = dir, out = new Map()) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, base, out);
    else if (entry.isFile()) out.set(path.relative(base, full).split(path.sep).join('/'), await readFile(full));
  }
  return out;
}

const out = path.join(root, 'dist', 'release');
await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
const sums = [], failures = [];
for (const browser of ['chrome', 'firefox']) {
  const files = await walk(path.join(root, 'dist', browser));
  const problems = audit(files, { browser, version });
  if (problems.length) { failures.push(...problems.map(p => browser + ': ' + p)); continue; }
  const zip = createZip(files), name = 'campuslit-' + browser + '.zip';
  const back = readZip(zip);   // the archive must contain exactly what was audited
  if (back.size !== files.size || [...files].some(([file, data]) => !back.has(file) || !back.get(file).equals(data))) { failures.push(browser + ': the zip does not match the audited files.'); continue; }
  await writeFile(path.join(out, name), zip);
  sums.push(createHash('sha256').update(zip).digest('hex') + '  ' + name);
  console.log(name.padEnd(28) + String(files.size).padStart(4) + ' files' + (zip.length / 1024).toFixed(0).padStart(7) + ' KB   version ' + version);
}
if (failures.length) { console.error('\nRelease audit failed:\n - ' + failures.join('\n - ')); await rm(out, { recursive: true, force: true }); process.exit(1); }
await writeFile(path.join(out, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
console.log('\nAudit passed (permissions, portal-only matching, no network or eval, no private files, no personal data patterns).\nUpload the zips in ' + path.relative(root, out) + '. Checksums are in SHA256SUMS.txt.');

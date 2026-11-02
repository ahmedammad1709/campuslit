// Release audit: looks at the files that are about to be zipped and reports anything that should not ship.
// It is deliberately strict, and every rule has a test (tests/package.test.cjs) that feeds it a bad build.
import path from 'node:path';

export const LIMITS = { name: 75, description: 132, file: 600 * 1024, total: 5 * 1024 * 1024 };   // Chrome Web Store manifest limits, and sane size caps
const ALLOWED_TYPES = new Set(['.js', '.css', '.html', '.json', '.png', '.woff2', '.txt']);
const TEXT_TYPES = new Set(['.js', '.css', '.html', '.json', '.txt']);
const PORTALS = ['*://cms.bahria.edu.pk/*', '*://lms.bahria.edu.pk/*'];

// Things the extension must never do. The privacy promise is "no network", so these are checked in every script it ships.
const FORBIDDEN_CODE = [
  [/(?<![\w$.])fetch\s*\(/, 'fetch() (network request)'],
  [/XMLHttpRequest/, 'XMLHttpRequest (network request)'],
  [/new\s+WebSocket|new\s+EventSource/, 'WebSocket or EventSource (network connection)'],
  [/sendBeacon/, 'sendBeacon (network request)'],
  [/(?<![\w$.])eval\s*\(/, 'eval()'],
  [/new\s+Function\s*\(/, 'new Function()'],
  [/importScripts\s*\(/, 'importScripts()'],
  [/document\.write\s*\(/, 'document.write()']
];
const HTML_INJECTION = [[/innerHTML|outerHTML|insertAdjacentHTML/, 'innerHTML, outerHTML or insertAdjacentHTML']];   // fine in the extension's own pages (fixed icons); never in a script that runs on the portals
// Web addresses that may appear in shipped code (namespaces, the portal's own address, the project's page). Anything else is reported.
const ALLOWED_URLS = [/^http:\/\/www\.w3\.org\//, /^https:\/\/campuslit-bu\.vercel\.app(?:\/|$)/, /^https?:\/\/(?:cms|lms)\.bahria\.edu\.pk(?:\/|$)/, /^https:\/\/github\.com\/ahmedammad1709\/campuslit(?:\/|$)/];
const PERSONAL = [
  [/[A-Za-z0-9._%+-]@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, 'an e-mail address'],   // one character before the @: stays fast on very long unbroken lines
  [/(?<!\d)\d{2}-(?!0{5,6}-)\d{5,6}-\d{3}(?!\d)/, 'an enrollment-number pattern'],   // 02-000000-000 is the sample pages' placeholder
  [/(?<!\d)\d{5}-\d{7}-\d(?!\d)/, 'an ID-card-number pattern'],
  [/(?<!\d)(?:\+92|0092|0)[ -]?3\d{2}[ -]?\d{7}(?!\d)/, 'a mobile-number pattern']
];
const FIREFOX_ID = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/;

const ext = name => path.posix.extname(name).toLowerCase();
const text = buffer => buffer.toString('utf8');
const refs = (html) => [...html.matchAll(/(?:src|href)\s*=\s*["']([^"'#?][^"']*)["']/gi)].map(m => m[1]).filter(r => !/^[a-z][a-z0-9+.-]*:/i.test(r) || /^https?:|^\/\//i.test(r));
const cssRefs = (css) => [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map(m => m[1]).filter(r => !/^(?:data:|#)/i.test(r));

// files: Map<path, Buffer>; opts: { browser: 'chrome' | 'firefox', version: string }. Returns an array of problem strings.
export function audit(files, opts) {
  const problems = [], add = message => problems.push(message);
  const manifestFile = files.get('manifest.json');
  if (!manifestFile) { add('manifest.json is missing from the root of the package.'); return problems; }
  let manifest; try { manifest = JSON.parse(text(manifestFile)); } catch { add('manifest.json is not valid JSON.'); return problems; }

  // ---- manifest ----
  if (manifest.manifest_version !== 3) add('manifest_version must be 3.');
  if (!/^\d+(?:\.\d+){0,3}$/.test(String(manifest.version))) add('version "' + manifest.version + '" is not a valid extension version.');
  if (opts.version && manifest.version !== opts.version) add('manifest version ' + manifest.version + ' does not match package.json version ' + opts.version + '.');
  if (!manifest.name || manifest.name.length > LIMITS.name) add('name is missing or longer than ' + LIMITS.name + ' characters.');
  if (!manifest.description || manifest.description.length > LIMITS.description) add('description is missing or longer than ' + LIMITS.description + ' characters (it is ' + (manifest.description || '').length + ').');
  if (JSON.stringify(manifest.permissions || []) !== JSON.stringify(['storage'])) add('permissions must be exactly ["storage"], found ' + JSON.stringify(manifest.permissions || []) + '.');
  for (const key of ['host_permissions', 'optional_permissions', 'optional_host_permissions', 'background', 'externally_connectable', 'content_security_policy_sandbox', 'update_url', 'key']) if (key in manifest) add('manifest has "' + key + '", which this extension does not use.');
  const scripts = manifest.content_scripts || [];
  if (!scripts.length) add('no content scripts are declared.');
  for (const block of scripts) if (JSON.stringify([...(block.matches || [])].sort()) !== JSON.stringify(PORTALS)) add('content scripts must match only the two Bahria portals, found ' + JSON.stringify(block.matches) + '.');
  const csp = (manifest.content_security_policy || {}).extension_pages || '';
  if (!/script-src 'self'/.test(csp) || !/connect-src 'none'/.test(csp) || /unsafe-eval|https?:/.test(csp)) add('extension-page CSP must be script-src \'self\' with connect-src \'none\' and no remote sources.');
  for (const resource of manifest.web_accessible_resources || []) for (const match of resource.matches || []) if (!PORTALS.includes(match)) add('web_accessible_resources may only be shared with the two portals, found ' + match + '.');
  if (opts.browser === 'firefox') {
    const gecko = (manifest.browser_specific_settings || {}).gecko || {};
    if (!FIREFOX_ID.test(gecko.id || '')) add('Firefox build needs an add-on ID (name@domain).');
    if (!gecko.strict_min_version) add('Firefox build needs strict_min_version.');
    if (JSON.stringify((gecko.data_collection_permissions || {}).required) !== JSON.stringify(['none'])) add('Firefox build must declare data_collection_permissions required ["none"].');
  } else if (manifest.browser_specific_settings) add('Chrome build must not carry browser_specific_settings.');

  // ---- every file the manifest points at exists ----
  const need = new Set();
  const want = file => { if (file) need.add(String(file).replace(/^\.?\//, '')); };
  Object.values(manifest.icons || {}).forEach(want); want((manifest.action || {}).default_popup); want((manifest.options_ui || {}).page);
  for (const block of scripts) { (block.js || []).forEach(want); (block.css || []).forEach(want); }
  for (const resource of manifest.web_accessible_resources || []) (resource.resources || []).forEach(want);
  for (const file of need) if (!files.has(file)) add('manifest points at ' + file + ', which is not in the package.');

  // ---- every file ----
  let total = 0;
  for (const [name, data] of files) {
    total += data.length;
    const type = ext(name), parts = name.split('/');
    if (parts.some(part => part.startsWith('.'))) add(name + ': hidden files do not ship.');
    if (/\.private|\.map$|\.env|\.pem$|\.key$|\.zip$|\.log$/i.test(name) || /(?:^|\/)(?:html_pages|artifacts|node_modules|skills|tests?|scripts)\//i.test(name)) add(name + ': looks like a private or development file.');
    if (!ALLOWED_TYPES.has(type)) add(name + ': file type "' + type + '" is not on the allowed list.');
    if (data.length > LIMITS.file) add(name + ': ' + Math.round(data.length / 1024) + ' KB is larger than a single file should be.');
    if (!TEXT_TYPES.has(type)) continue;
    const body = text(data), vendor = name.startsWith('preview/vendor/');
    if (type === '.js') {
      const runsOnPortals = scripts.some(block => (block.js || []).includes(name));
      for (const [pattern, label] of FORBIDDEN_CODE) if (pattern.test(body)) add(name + ': uses ' + label + '.');
      if (runsOnPortals) for (const [pattern, label] of HTML_INJECTION) if (pattern.test(body)) add(name + ': a script that runs on the portals uses ' + label + '.');
    }
    if (type !== '.txt' && !vendor) for (const [url] of body.matchAll(/https?:\/\/[^\s"'()<>`\\]+/g)) if (!ALLOWED_URLS.some(rule => rule.test(url))) add(name + ': contains the web address ' + url + '.');
    if (type === '.html') for (const ref of refs(body)) {
      if (/^(?:https?:)?\/\//i.test(ref)) { if (!ALLOWED_URLS.some(rule => rule.test(ref.startsWith('//') ? 'https:' + ref : ref))) add(name + ': loads or links to ' + ref + '.'); continue; }
      if (ref.startsWith('/') && name.startsWith('preview/')) continue;   // the sample pages' menu links are portal paths; the preview never follows them
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), ref.split('?')[0].split('#')[0]));
      if (!files.has(target) && !ref.startsWith('mailto:')) add(name + ': refers to ' + ref + ', which is not in the package.');
    }
    if (type === '.css' && !vendor) for (const ref of cssRefs(body)) { if (/^https?:|^\/\//i.test(ref)) { if (!ALLOWED_URLS.some(rule => rule.test(ref.startsWith('//') ? 'https:' + ref : ref))) add(name + ': loads ' + ref + '.'); } else if (!files.has(path.posix.normalize(path.posix.join(path.posix.dirname(name), ref.split('?')[0].split('#')[0])))) add(name + ': refers to ' + ref + ', which is not in the package.'); }
    if (!vendor && type !== '.json') for (const [pattern, label] of PERSONAL) { const hit = body.match(pattern); if (hit) add(name + ': contains ' + label + ' (' + hit[0] + ').'); }
  }
  if (total > LIMITS.total) add('The package is ' + (total / 1048576).toFixed(1) + ' MB; keep it under ' + (LIMITS.total / 1048576) + ' MB.');
  return problems;
}

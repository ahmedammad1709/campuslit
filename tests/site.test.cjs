'use strict';
// The public website: every page is complete, every link and picture resolves, nothing breaks the site's own security policy,
// and the privacy and licence pages say what the extension and the repository actually do.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const site = path.resolve(__dirname, '..', 'site');
const ORIGIN = 'https://campuslit-bu.vercel.app';
const PAGES = { '': 'index.html', 'bahria-lms': 'bahria-lms.html', 'bahria-cms': 'bahria-cms.html', privacy: 'privacy.html', license: 'license.html' };   // clean URL -> file
const read = file => fs.readFileSync(path.join(site, file), 'utf8');
const pages = Object.entries(PAGES).map(([route, file]) => ({ route, file, html: read(file) }));
const ids = html => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const decode = text => text.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lsquo;|&rsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&#39;/g, "'");
const exists = rel => fs.existsSync(path.join(site, rel));
// where a link inside the site points: a file path, or a page and fragment
function resolve(from, href) {
  const [target, fragment] = href.split('#');
  if (target === '') return { page: from, fragment, file: null };                    // "#section": this page
  if (target === '.' || target === './') return { page: '', fragment, file: null };   // "./": the home page
  const clean = target.replace(/^\.\//, '').replace(/^\//, '');
  if (Object.prototype.hasOwnProperty.call(PAGES, clean)) return { page: clean, fragment, file: null };
  return { page: null, fragment, file: clean };
}

test('every page has what search engines and link previews need', () => {
  for (const { route, html } of pages) {
    const url = ORIGIN + '/' + route;
    assert.match(html, /<html lang="en">/, route);
    const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1]; assert.ok(title && title.length > 10 && title.length <= 80, route + ' title: ' + title);
    const description = (html.match(/<meta name="description" content="([^"]+)"/) || [])[1]; assert.ok(description && description.length >= 70 && description.length <= 300, route + ' description');
    assert.ok(html.includes('<link rel="canonical" href="' + url + '">'), route + ' canonical');
    assert.ok(html.includes('<meta property="og:url" content="' + url + '">'), route + ' og:url');
    assert.ok(html.includes('<meta property="og:image" content="' + ORIGIN + '/assets/og.png">'), route + ' absolute share image');
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, route + ' has exactly one h1');
    assert.ok(/<meta name="viewport"/.test(html) && /class="skip"/.test(html) && /<main id="main"/.test(html), route + ' viewport, skip link, main landmark');
  }
});

test('the header logo is drawn inline so it can animate, and the animation respects reduced motion', () => {
  for (const { route, html } of pages) {
    const header = (html.match(/<header class="site-header[^>]*>[\s\S]*?<\/header>/) || [''])[0];
    assert.match(header, /<svg class="logo"[^>]*aria-hidden="true"/, route + ' header logo');
    assert.match(header, /class="ring" pathLength="1"/); assert.match(header, /class="dot"/);
  }
  const css = read('styles.css'), motion = css.slice(css.indexOf('/* ---------- motion ---------- */'));
  assert.match(motion, /@media \(prefers-reduced-motion: no-preference\) \{[^}]*\.logo \.ring[^}]*animation: logo-draw/);
  assert.ok(!/\.logo[^{]*\{[^}]*animation/.test(css.slice(0, css.indexOf('/* ---------- motion ---------- */'))), 'the logo only animates inside the no-preference media query');
});

test('the share image is a real 1200x630 PNG', () => {
  const png = fs.readFileSync(path.join(site, 'assets', 'og.png'));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
});

test('every link, picture, script and style in the site points at something that exists', () => {
  for (const { route, file, html } of pages) {
    const own = ids(html);
    for (const [, attr, value] of html.matchAll(/\s(href|src)="([^"]+)"/g)) {
      if (/^(https:|mailto:)/.test(value)) continue;   // external links are checked separately
      assert.ok(!/^(http:|javascript:|data:)/.test(value), file + ': ' + value);
      if (value.startsWith('#')) { assert.ok(own.has(value.slice(1)), file + ': missing anchor ' + value); continue; }
      const r = resolve(route, value);
      if (r.page !== null) { assert.ok(r.fragment === undefined || ids(read(PAGES[r.page])).has(r.fragment), file + ': missing anchor ' + value); continue; }
      assert.ok(exists(r.file), file + ': ' + value + ' does not exist');
    }
  }
  const css = read('styles.css');
  for (const [, ref] of css.matchAll(/url\("?([^")]+)"?\)/g)) if (!ref.startsWith('data:')) assert.ok(exists(ref), 'styles.css: ' + ref);
  assert.ok(exists('404.html') && exists('robots.txt') && exists('sitemap.xml'));
});

test('the screenshots used by the script exist, and no screenshot sits unused', () => {
  const used = new Set();
  const sources = pages.map(p => p.html).join('') + read('script.js');
  for (const [, name] of sources.matchAll(/shots\/([a-z0-9-]+)\.webp/g)) used.add(name);
  for (const theme of ['bahria', 'crystal', 'midnight', 'linen', 'grove', 'bloom', 'custom']) used.add('lms-' + theme);   // the theme gallery picks these by name
  const files = fs.readdirSync(path.join(site, 'assets', 'shots')).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5));
  for (const name of used) assert.ok(files.includes(name), 'missing screenshot ' + name);
  for (const name of files) assert.ok(used.has(name), 'unused screenshot ' + name + ' (delete it)');
});

test('every picture has alt text, a size (so the page does not jump) and every screenshot is declared at its real size', () => {
  for (const { file, html } of pages) for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    assert.match(tag, /\salt="[^"]*"/, file + ': ' + tag.slice(0, 80));
    assert.match(tag, /\swidth="\d+"/, file + ': width ' + tag.slice(0, 80)); assert.match(tag, /\sheight="\d+"/, file + ': height ' + tag.slice(0, 80));
    const src = (tag.match(/\ssrc="([^"]+)"/) || [])[1];
    if (src && src.endsWith('.webp')) {   // WebP header: "RIFF....WEBPVP8 " (lossy) carries the size at fixed offsets
      const buf = fs.readFileSync(path.join(site, src)); assert.equal(buf.subarray(8, 12).toString(), 'WEBP');
      const kind = buf.subarray(12, 16).toString(); let w, h;
      if (kind === 'VP8 ') { w = buf.readUInt16LE(26) & 0x3fff; h = buf.readUInt16LE(28) & 0x3fff; }
      else if (kind === 'VP8X') { w = 1 + buf.readUIntLE(24, 3); h = 1 + buf.readUIntLE(27, 3); }
      else continue;
      assert.equal(+tag.match(/\swidth="(\d+)"/)[1], w, src + ' width'); assert.equal(+tag.match(/\sheight="(\d+)"/)[1], h, src + ' height');
    }
  }
});

test('nothing on the site would be blocked by its own security policy', () => {
  const config = JSON.parse(read('vercel.json'));
  const csp = config.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
  assert.ok(/default-src 'none'/.test(csp) && /script-src 'self'/.test(csp) && /style-src 'self'/.test(csp) && /connect-src 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp));
  assert.ok(!/unsafe-inline|unsafe-eval|\*|http:/.test(csp), 'no loosening in the policy');
  for (const { file, html } of pages) {
    assert.ok(!/\sstyle="/.test(html), file + ': inline style attribute');
    assert.ok(!/\son[a-z]+="/i.test(html), file + ': inline event handler');
    assert.ok(!/<script(?![^>]*\ssrc=)(?![^>]*type="application\/ld\+json")[^>]*>/.test(html), file + ': inline script');   // structured data (JSON-LD) is data, not code
    assert.ok(!/<style[\s>]/.test(html), file + ': inline style block');
  }
  const headers = Object.fromEntries(config.headers[0].headers.map(h => [h.key, h.value]));
  assert.equal(headers['X-Content-Type-Options'], 'nosniff'); assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(config.cleanUrls, true);
});

test('the site loads nothing from other websites and links out only to the project, its host and its legal sources', () => {
  const allowed = [/^https:\/\/campuslit-bu\.vercel\.app\//, /^https:\/\/github\.com\/ahmedammad1709\/campuslit(\/|$)/, /^https:\/\/vercel\.com\/legal\/privacy-policy$/, /^https:\/\/chromewebstore\.google\.com\/detail\/kldmhhiopdefjapkebnelablimikghio$/];
  for (const { file, html } of pages) {
    for (const [, url] of html.matchAll(/(?:href|src)="(https?:[^"]+)"/g)) assert.ok(allowed.some(rule => rule.test(url)), file + ': ' + url);
    assert.ok(!/<(?:script|link|img|iframe)\b[^>]*(?:src|href)="https?:(?!\/\/campuslit-bu\.vercel\.app\/)/.test(html.replace(/<a\b[^>]*>/g, '')), file + ': a resource from another site');
  }
  const css = read('styles.css'); assert.ok(!/@import|url\(["']?https?:/.test(css));
  for (const link of ['https://github.com/ahmedammad1709/campuslit/releases/latest', 'https://github.com/ahmedammad1709/campuslit/issues']) assert.ok(pages[0].html.includes(link), link);
});

test('the site map and robots file list every page and nothing else', () => {
  const map = read('sitemap.xml');
  const locs = [...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).sort();
  assert.deepEqual(locs, Object.keys(PAGES).map(r => ORIGIN + '/' + r).sort());
  assert.match(read('robots.txt'), /Sitemap: https:\/\/campuslit-bu\.vercel\.app\/sitemap\.xml/);
});

test('the home page says plainly what Campuslit is, who it is for, and that it is unofficial', () => {
  const text = decode(pages[0].html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  for (const phrase of ['free browser extension', 'every campus', 'Bahria University', 'Unofficial', 'cms.bahria.edu.pk', 'lms.bahria.edu.pk', 'Nothing is sent to us or anyone else', 'not made, endorsed or supported by Bahria University'])
    assert.ok(text.includes(phrase), 'home page mentions: ' + phrase);
  assert.ok(/<h1[^>]*>[^<]*Bahria University LMS and CMS/.test(pages[0].html), 'the headline names the portals');
  assert.ok(/estimate/i.test(text), 'the attendance numbers are described as an estimate');
  assert.ok(!/\b(?:undefined|NaN|null|TODO|lorem|placeholder)\b/i.test(text), 'no placeholder text');
});

test('the home page stays short: few words, one idea per section, no section repeated', () => {
  const html = pages[0].html, text = decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  assert.ok(text.split(' ').length < 1750, 'home page words: ' + text.split(' ').length);
  const sections = [...html.matchAll(/<(?:section|div)[^>]*\sid="(features|themes|install|faq|trust)"/g)].map(m => m[1]);
  assert.deepEqual(sections, ['features', 'themes', 'install', 'trust', 'faq'], 'sections, in order');
  assert.ok((html.match(/<h2[\s>]/g) || []).length <= 6, 'at most six headed sections');
  const questions = [...html.matchAll(/<summary>([^<]+)<\/summary>/g)].map(m => m[1]);
  assert.ok(questions.length <= 12 && new Set(questions).size === questions.length, 'distinct, few questions');
});

test('the feature tabs are wired for keyboard and screen-reader use, and work without JavaScript', () => {
  const html = pages[0].html;
  const tabs = [...html.matchAll(/<button class="tab" role="tab"[^>]*>/g)].map(m => m[0]);
  assert.ok(tabs.length >= 4 && tabs.length <= 7, tabs.length + ' tabs');
  assert.equal(tabs.filter(t => /aria-selected="true"/.test(t)).length, 1, 'exactly one tab starts selected');
  for (const tab of tabs) {
    const id = tab.match(/\sid="([^"]+)"/)[1], panel = tab.match(/aria-controls="([^"]+)"/)[1];
    assert.match(html, new RegExp('<div class="tabpanel" role="tabpanel" id="' + panel + '" aria-labelledby="' + id + '">'), 'panel for ' + id);
    assert.ok(/aria-selected="true"/.test(tab) || /tabindex="-1"/.test(tab), 'only the selected tab is in the tab order: ' + id);
  }
  assert.ok(!/<div class="tabpanel"[^>]*\shidden/.test(html), 'panels are only hidden by the script, so without it every panel shows');
  const css = read('styles.css');
  assert.match(css, /\.tabs:not\(\[data-ready\]\) \.tablist \{ display: none; \}/, 'the tab bar only appears when the script runs');
});

test('the licence page carries the exact text of the LICENSE file', () => {
  const licence = fs.readFileSync(path.resolve(__dirname, '..', 'LICENSE'), 'utf8').replace(/\r\n/g, '\n').trim();
  const paragraphs = licence.split(/\n\n/).map(p => p.replace(/\s+/g, ' ').trim());
  const page = decode(read('license.html').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  for (const paragraph of paragraphs) assert.ok(page.includes(paragraph), 'missing from the licence page: ' + paragraph.slice(0, 60));
  assert.ok(/Copyright \(c\) 2026 Campuslit contributors/.test(licence));
  const fonts = read('license.html');
  for (const name of ['Plus Jakarta Sans', 'Manrope', 'Sora', 'Inter', 'Bootstrap', 'AdminLTE', 'Font Awesome']) assert.ok(fonts.includes(name), 'third-party notice: ' + name);
});

test('the privacy policy numbers match the code: the reminder note expires after 150 days', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '..', 'extension', 'deadlines.js'), 'utf8');
  assert.match(code, /KEEP = 150 \* DAY/, 'the code keeps entries for 150 days');
  assert.match(code, /SNOOZE = 8 \* HOUR/, 'a closed reminder is hidden for 8 hours');
  const policy = read('privacy.html');
  assert.ok(policy.includes('150 days') && policy.includes('8 hours'));
  const headings = [...policy.matchAll(/<h2><small>(\d+)<\/small>/g)].map(m => +m[1]);
  assert.deepEqual(headings, headings.map((_, i) => i + 1), 'sections are numbered 1, 2, 3 without gaps');
  const ids = [...policy.matchAll(/<section id="([a-z]+)"/g)].map(m => m[1]), toc = [...policy.matchAll(/<li><a href="#([a-z]+)">/g)].map(m => m[1]);
  assert.deepEqual(toc, ids, 'the contents list matches the sections, in order');
});

test('the privacy policy matches what the extension really stores and requests', () => {
  const policy = decode(read('privacy.html').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.permissions, ['storage', 'alarms', 'notifications']);
  for (const word of ['Notifications', 'alarms', 'off by default', 'Forget what it remembers', 'never signs in for you']) assert.ok(policy.includes(word), 'policy says: ' + word);
  for (const match of manifest.content_scripts[0].matches) { const host = match.replace('*://', '').replace('/*', ''); assert.ok(policy.includes(host), 'policy names ' + host); }
  for (const phrase of ['Security', 'Children', 'Kept for', '150 days', 'Your choices and rights', 'public history on GitHub', 'content security policy', 'No accounts, no analytics, no tracking', 'never reads your password', 'reminder note', 'Tip flags', 'Reset all settings', 'Forget remembered assignments', 'not made, endorsed or supported', 'Effective 7 November 2026', 'Vercel', 'does not use browser cloud sync'])
    assert.ok(policy.toLowerCase().includes(phrase.toLowerCase()), 'policy says: ' + phrase);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src https:\/\/lms\.bahria\.edu\.pk https:\/\/cms\.bahria\.edu\.pk;/, 'the policy says requests go only to the two portals, and the extension enforces it');
  // every key the extension saves has to be disclosed
  const storage = fs.readFileSync(path.resolve(__dirname, '..', 'extension', 'storage.js'), 'utf8');
  assert.ok(/bahriaStudioPreferences/.test(storage) && /bahriaStudioReminders/.test(storage) && /BahriaGuide\.KEY/.test(storage), 'the extension saves exactly: settings, reminder note, tip flags');
  const keys = new Set([...fs.readdirSync(path.resolve(__dirname, '..', 'extension')).filter(f => f.endsWith('.js')).flatMap(f => [...fs.readFileSync(path.resolve(__dirname, '..', 'extension', f), 'utf8').matchAll(/storage\.local\.set\(\s*\{\s*\[?\s*([A-Za-z.']+)/g)].map(m => m[1]))]);
  for (const key of keys) assert.ok(['key', 'guideKey', 'G.KEY', 'REM_KEY', 'remindersKey', "'bahriaStudioTimetableView'", 'VIEW_KEY', 'SIDEBAR_KEY', "'bahriaStudioSidebarWidth'"].includes(key) || /(?:KEY|Key)$/.test(key), 'a saved key the policy may not cover: ' + key);
});

test('the pages are plain text and markup: no stray control characters', () => {
  const bad = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(8) + String.fromCharCode(11) + String.fromCharCode(12) + String.fromCharCode(14) + '-' + String.fromCharCode(31) + String.fromCharCode(0x2028) + String.fromCharCode(0x2029) + ']');
  for (const file of [...Object.values(PAGES), 'styles.css', 'script.js', '404.html']) assert.ok(!bad.test(read(file)), file + ' has a control character');
});

test('the site stays light: the whole site, pictures included, is under 3 MB', () => {
  let total = 0;
  (function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else total += fs.statSync(full).size; } })(site);
  assert.ok(total < 3 * 1024 * 1024, (total / 1048576).toFixed(2) + ' MB');
});

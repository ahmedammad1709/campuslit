'use strict';
// Settings page. Edits a draft copy of the settings, shows it live in the preview frame, and saves only when asked.
const $ = id => document.getElementById(id);
const B = BahriaStudio;
let settings = B.normalize({});
let baseline = JSON.stringify(settings);
let previewSite = 'cms';
let busy = false;
const system = matchMedia('(prefers-color-scheme: dark)');
const isDirty = () => JSON.stringify(settings) !== baseline;
let snackTimer = 0;
// The live region always gets the message; sighted users get a short snackbar, but only for real events
// (saved, imported, reset...), never for every slider tick.
function status(message, toast = true) {
  $('status').textContent = message;
  if (!toast) return;
  const snack = $('snack'); snack.textContent = message; snack.hidden = false;
  clearTimeout(snackTimer); snackTimer = setTimeout(() => { snack.hidden = true; }, 4200);
}
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }

// ---------- theme gallery ----------
function sample(p) {
  const s = el('span', 'theme-sample'); s.setAttribute('aria-hidden', 'true');
  for (const [k, v] of [['bg', p.bg], ['nav', p.nav], ['surface', p.surface], ['accent', p.accent], ['ink', p.ink], ['navink', p.navInk]]) s.style.setProperty('--sw-' + k, v);
  const nav = el('span', 'ts-nav'); nav.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  const main = el('span', 'ts-main'), cards = el('span', 'ts-cards'); cards.append(document.createElement('i'), document.createElement('i'));
  main.append(el('i', 'ts-bar'), cards, el('i', 'ts-btn'));
  s.append(nav, main);
  return s;
}
function checkMark() { const c = el('span', 'check'); c.setAttribute('aria-hidden', 'true'); c.innerHTML = StudioIcons.svg('check'); return c; }
function presetCard(id, theme) {
  const b = el('button', 'theme-card'); b.type = 'button'; b.dataset.theme = id; b.title = theme.name + ' · ' + theme.description;
  b.setAttribute('aria-pressed', String(settings.theme === id));
  b.append(sample(theme), el('strong', '', theme.name));
  if (settings.theme === id) b.append(checkMark());
  b.addEventListener('click', () => { selectTheme(id); $('theme-list').querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true }); });
  return b;
}
function customCard() {
  const c = settings.custom, b = el('button', 'theme-card custom'); b.type = 'button'; b.dataset.theme = 'custom';
  if (!c) {
    b.classList.add('is-empty'); b.title = 'Design your own theme'; b.setAttribute('aria-pressed', 'false');
    const s = el('span', 'theme-sample'); s.setAttribute('aria-hidden', 'true'); const plus = el('span'); plus.innerHTML = StudioIcons.svg('plus'); s.append(plus);
    b.append(s, el('strong', '', 'Custom'));
    b.addEventListener('click', () => showSection('studio', true, true));
    return b;
  }
  const p = B.deriveCustom(c);
  b.title = c.name + ' · your custom theme'; b.setAttribute('aria-pressed', String(settings.theme === 'custom'));
  b.append(sample(p), el('span', 'badge', 'YOURS'), el('strong', '', c.name));
  if (settings.theme === 'custom') b.append(checkMark());
  b.addEventListener('click', () => { if (settings.theme !== 'custom') selectTheme('custom'); showSection('studio', false, true); });
  return b;
}
function renderThemes() {
  const grid = $('theme-list'); grid.replaceChildren();
  for (const [id, theme] of Object.entries(B.themes)) grid.append(presetCard(id, theme));
  grid.append(customCard());
}
function renderCustomCard() { const old = $('theme-list').querySelector('.theme-card.custom'); const next = customCard(); if (old) old.replaceWith(next); else $('theme-list').append(next); }
function selectTheme(id) {
  settings.theme = id; settings.accent = '';
  if (id !== 'custom') settings.mode = 'preset';
  afterChange(true);
}

// ---------- sidebar sections ----------
const SECTIONS = {
  themes: ['Themes', 'Pick a look. Changes show in the preview first and reach your portals when you save.'],
  text: ['Text & layout', 'Typeface, text size, spacing and how rounded the corners are.'],
  studio: ['Custom theme', 'Design a seventh theme. Pick a few colors and the rest is worked out for you.'],
  portals: ['Portals', 'Choose where Campuslit runs, and a couple of small extras.'],
  privacy: ['Privacy & data', 'What Campuslit stores, and your controls.']
};
function showSection(name, focusFirst, push = false) {
  if (!SECTIONS[name]) name = 'themes';
  for (const key of Object.keys(SECTIONS)) {
    const on = key === name;
    if (on) $('nav-' + key).setAttribute('aria-current', 'page'); else $('nav-' + key).removeAttribute('aria-current');
    $('section-' + key).hidden = !on;
  }
  $('section-title').textContent = SECTIONS[name][0]; $('section-desc').textContent = SECTIONS[name][1];
  document.title = SECTIONS[name][0] + ' · Campuslit settings';
  if (name === 'studio') StudioUI.refresh();
  // Clicking a sidebar link adds a history entry (like any link), so Back returns to the previous section.
  if (location.hash !== '#' + name) history[push ? 'pushState' : 'replaceState'](null, '', '#' + name);
  if (focusFirst) $('section-' + name).querySelector('button:not([hidden]), input')?.focus({ preventScroll: true });
  scrollTo({ top: 0 });
}
document.querySelectorAll('.side-nav a').forEach(link => link.addEventListener('click', e => { e.preventDefault(); showSection(link.dataset.section, false, true); }));
addEventListener('hashchange', () => showSection(location.hash.slice(1), false));
$('goto-studio').addEventListener('click', () => showSection('studio', true, true));

// ---------- controls <-> settings ----------
const setPct = input => input.style.setProperty('--pct', ((input.value - input.min) / (input.max - input.min) * 100) + '%');
function syncControls() {
  for (const key of ['enabled', 'cms', 'lms', 'cleanBackground', 'motion']) $(key).checked = settings[key];
  $('font').value = settings.font; $('fontSize').value = settings.fontSize; $('radius').value = settings.radius; $('semesterWeeks').value = settings.semesterWeeks;
  setPct($('fontSize')); setPct($('radius')); setPct($('semesterWeeks')); $('weeks-output').textContent = settings.semesterWeeks + ' weeks';
  $('size-output').textContent = settings.fontSize + ' px'; $('radius-output').textContent = settings.radius + ' px';
  document.querySelector('.radius-demo').style.setProperty('--demo-r', settings.radius + 'px');
  document.querySelectorAll('#density-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.density === settings.density)));
  $('system').checked = settings.mode === 'system';
  const custom = settings.theme === 'custom', p = B.palette(settings, system.matches);
  $('accent').value = settings.accent || p.accent; $('accent-chip').style.setProperty('--c', $('accent').value);
  document.querySelectorAll('[data-accent]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.accent.toLowerCase() === p.accent.toLowerCase())));
  $('accent-group').classList.toggle('is-locked', custom); $('accent-lock').hidden = !custom; $('accent-hint').hidden = custom;
  $('reset-accent').hidden = custom; $('accent').disabled = custom;
  document.querySelectorAll('[data-accent]').forEach(b => { b.disabled = custom; });
  $('system-note').textContent = custom ? 'Your custom theme stays exactly as designed, even on a dark device.' : 'Switch to Midnight when your device goes dark.';
  $('type-specimen').style.fontFamily = B.fonts[settings.font];
}

// ---------- live preview (real sample pages in a frame, styled by the real portal stylesheets) ----------
const frame = () => $('preview-frame');
const PREVIEW_WIDTH = 860;   // the preview always lays out like an 860px-wide browser, scaled down when the column is narrower
function sendToPreview() { const target = frame().contentWindow; if (target) target.postMessage({ type: 'campuslit-settings', settings }, location.origin); }
function loadPreview() {
  const src = 'preview/' + previewSite + '/dashboard.html';
  $('preview-url').textContent = previewSite + '.bahria.edu.pk';
  let here = ''; try { here = frame().contentWindow.location.pathname; } catch { /* not loaded yet */ }
  if (!here.endsWith('/' + src)) frame().src = src; else sendToPreview();
}
function fitPreview() {
  const wrap = frame().parentElement, width = wrap.clientWidth;
  if (!width) return;
  const height = Math.round(Math.min(640, Math.max(400, innerHeight - 300)));
  const scale = Math.min(1, width / PREVIEW_WIDTH);
  wrap.style.height = height + 'px';
  frame().style.width = (scale < 1 ? PREVIEW_WIDTH : width) + 'px';
  frame().style.height = Math.round(height / scale) + 'px';
  frame().style.transform = scale < 1 ? 'scale(' + scale.toFixed(4) + ')' : '';
}
new ResizeObserver(fitPreview).observe(frame().parentElement);
addEventListener('resize', fitPreview);
fitPreview();
frame().addEventListener('load', () => {
  // The sample page can navigate itself (its sidebar links); keep the portal switch in step with where it ended up.
  try {
    const match = /\/preview\/(cms|lms)\/([a-z]+)\.html$/.exec(frame().contentWindow.location.pathname);
    if (match && match[1] !== previewSite) {
      previewSite = match[1];
      document.querySelectorAll('[data-preview]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.preview === previewSite)));
      $('preview-url').textContent = previewSite + '.bahria.edu.pk'; preview();
    }
  } catch { /* ignore */ }
  sendToPreview();
});
addEventListener('message', event => { if (event.origin === location.origin && event.source === frame().contentWindow && event.data && event.data.type === 'campuslit-ready') sendToPreview(); });
document.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', () => {
  previewSite = button.dataset.preview;
  document.querySelectorAll('[data-preview]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  loadPreview(); preview();
}));
function preview() {
  sendToPreview();
  const p = B.palette(settings, system.matches);
  $('preview-theme-name').textContent = p.name + (settings.accent ? ' · Personalized' : '');
  const off = !settings.enabled || !settings[previewSite];
  $('preview-off').hidden = !off;
  $('preview-off-text').textContent = !settings.enabled ? 'Campuslit is switched off. This is roughly how the original looks.' : 'Campuslit is switched off for the ' + previewSite.toUpperCase() + '. This is roughly how the original looks.';
}

// ---------- change plumbing ----------
function updateDirty() {
  const dirty = isDirty();
  $('dirty').hidden = !dirty;
  if (dirty) $('save-label').textContent = 'Save changes';
  status(dirty ? 'Preview updated. Save to apply to your portals.' : 'Your saved appearance.', false);
}
function afterChange(rebuildThemes) {
  if (rebuildThemes) renderThemes(); else renderCustomCard();
  syncControls(); preview(); StudioUI.refresh(); updateDirty();
}
function renderAll() { renderThemes(); syncControls(); preview(); StudioUI.refresh(); $('dirty').hidden = !isDirty(); }

StudioUI.init({
  get: () => settings,
  setCustom(next) { const c = B.normalizeCustom(next); if (!c) return; const wasCustom = settings.theme === 'custom'; settings.custom = c; settings.theme = 'custom'; settings.accent = ''; afterChange(!wasCustom); },
  restoreCustom(custom, theme) { settings.custom = custom; settings.theme = custom ? theme : (theme === 'custom' ? B.defaults.theme : theme); afterChange(true); },
  removeCustom() { settings.custom = null; if (settings.theme === 'custom') settings.theme = B.defaults.theme; afterChange(true); status('Custom theme removed. Save to apply.'); },
  selectCustom() { selectTheme('custom'); }
});

document.querySelectorAll('[data-accent]').forEach(button => button.addEventListener('click', () => { settings.accent = button.dataset.accent; syncControls(); preview(); updateDirty(); }));
$('accent').addEventListener('input', e => { settings.accent = e.target.value; syncControls(); preview(); updateDirty(); });
$('reset-accent').addEventListener('click', () => { settings.accent = ''; syncControls(); preview(); updateDirty(); });
$('font').addEventListener('change', e => { settings.font = e.target.value; syncControls(); preview(); updateDirty(); });
for (const key of ['fontSize', 'radius', 'semesterWeeks']) $(key).addEventListener('input', e => { settings[key] = Number(e.target.value); syncControls(); preview(); updateDirty(); });
document.querySelectorAll('#density-seg button').forEach(b => b.addEventListener('click', () => { settings.density = b.dataset.density; syncControls(); preview(); updateDirty(); }));
$('system').addEventListener('change', e => { settings.mode = e.target.checked ? 'system' : 'preset'; renderAll(); updateDirty(); });
system.addEventListener('change', () => { syncControls(); preview(); renderThemes(); });
for (const key of ['cleanBackground', 'motion']) $(key).addEventListener('change', e => { settings[key] = e.target.checked; preview(); updateDirty(); });
for (const key of ['enabled', 'cms', 'lms']) $(key).addEventListener('change', e => { Object.assign(settings, B.power(settings, key, e.target.checked)); syncControls(); preview(); updateDirty(); });

// ---------- save / export / import / reset ----------
$('save').addEventListener('click', async () => {
  if (busy) return; busy = true; $('save').disabled = true;
  $('save-label').textContent = 'Saving…';
  const snapshot = B.normalize(settings);
  try {
    await StudioStorage.write(snapshot); baseline = JSON.stringify(snapshot); $('save-label').textContent = 'Saved';
    status(JSON.stringify(settings) === baseline ? (StudioStorage.isExtension ? 'Saved. Your open portals update automatically.' : 'Saved to this browser preview.') : 'Saved. You have additional unsaved changes.');
    $('dirty').hidden = !isDirty();
  } catch { $('save-label').textContent = 'Try again'; status('Could not save. Your preview is intact; please try again.'); }
  finally { busy = false; $('save').disabled = false; }
});
$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ format: 'campuslit', version: 1, settings: B.normalize(settings) }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'campuslit-theme.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('Appearance exported, including your custom theme. No student data is included.');
});
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 16384) throw new Error('size');
    const data = JSON.parse(await file.text());
    if ((data.format !== 'campuslit' && data.format !== 'bahria-studio') || data.version !== 1 || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) throw new Error('format');
    settings = B.normalize(data.settings); renderAll(); updateDirty(); status('Theme imported into the preview. Save to apply.');
  } catch { status('Choose a valid Campuslit settings file under 16 KB.'); }
  e.target.value = '';
});
$('reset').addEventListener('click', () => $('reset-dialog').showModal());
$('cancel-reset').addEventListener('click', () => $('reset-dialog').close());
$('confirm-reset').addEventListener('click', async () => {
  try { await StudioStorage.clear(); settings = B.normalize({}); baseline = JSON.stringify(settings); renderAll(); $('reset-dialog').close(); status('Preferences removed. Bahria theme restored.'); }
  catch { $('reset-dialog').close(); status('Could not reset preferences. Please try again.'); }
});
StudioStorage.subscribe(value => {
  if (busy) return;
  if (isDirty()) { status('Settings changed in another window. Save here to keep your current preview.'); return; }
  settings = value; baseline = JSON.stringify(value); renderAll(); status('Updated from your other settings window.');
});
addEventListener('beforeunload', e => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

(async () => {
  $('demo-notice').hidden = StudioStorage.isExtension;
  try { settings = await StudioStorage.read(); baseline = JSON.stringify(settings); renderAll(); status('Your style stays on this browser.', false); }
  catch { renderAll(); status('Could not read saved preferences. Showing the default preview.', true); }
  showSection(location.hash.slice(1), false);
})();

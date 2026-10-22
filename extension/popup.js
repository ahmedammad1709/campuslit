'use strict';
const B = BahriaStudio;
let settings = B.normalize({});
let saving = false;
const status = document.getElementById('status');
const system = matchMedia('(prefers-color-scheme: dark)');

function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
// A theme is shown as a round swatch (sidebar colour on the left, page colour on the right, accent dot) and its name.
function swatch(p, name, pressed, title) {
  const b = el('button', 'pop-swatch'); b.type = 'button'; b.title = title; b.setAttribute('aria-pressed', String(pressed));
  const dot = el('span', 'pop-dot'); dot.setAttribute('aria-hidden', 'true');
  dot.style.setProperty('--d-nav', p.nav); dot.style.setProperty('--d-bg', p.bg); dot.style.setProperty('--d-accent', p.accent);
  dot.append(el('i'));
  if (pressed) { const c = el('span', 'pop-check'); c.innerHTML = StudioIcons.svg('check'); dot.append(c); }
  b.append(dot, el('span', 'pop-name', name));
  return b;
}
function render() {
  for (const k of ['enabled', 'cms', 'lms']) document.getElementById(k).checked = settings[k];
  document.getElementById('system-note').textContent = settings.theme === 'custom' ? 'Not used with your custom theme' : 'Midnight when your device is dark';
  document.getElementById('system').checked = settings.mode === 'system';
  const grid = document.getElementById('themes'); grid.replaceChildren();
  for (const [id, theme] of Object.entries(B.themes)) {
    const b = swatch(theme, theme.name, settings.theme === id, theme.name + ' · ' + theme.description);
    b.addEventListener('click', () => save({ theme: id, accent: '', mode: 'preset' }));
    grid.append(b);
  }
  // the seventh: the theme the user designs
  const c = settings.custom;
  let b;
  if (c) { b = swatch(B.deriveCustom(c), c.name, settings.theme === 'custom', c.name + ' · your custom theme'); b.addEventListener('click', () => save({ theme: 'custom', accent: '' })); }
  else {
    b = el('button', 'pop-swatch empty'); b.type = 'button'; b.title = 'Design your own theme'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Create your own custom theme');
    const dot = el('span', 'pop-dot'); dot.setAttribute('aria-hidden', 'true'); dot.innerHTML = StudioIcons.svg('plus');
    b.append(dot, el('span', 'pop-name', 'Custom')); b.addEventListener('click', openStudio);
  }
  b.classList.add('custom');
  grid.append(b);
}
function openStudio() {
  const api = globalThis.browser || globalThis.chrome;
  // Open the settings page straight on its Custom theme section.
  if (StudioStorage.isExtension && api.tabs && api.tabs.create) api.tabs.create({ url: api.runtime.getURL('options.html#studio') });
  else location.href = 'options.html#studio';
}
async function save(patch) {
  if (saving) return; saving = true;
  const focusedId = document.activeElement?.id;
  document.querySelectorAll('button,input').forEach(e => e.disabled = true);
  try {
    const next = patch.power ? B.power(settings, patch.power[0], patch.power[1]) : { ...settings, ...patch };
    settings = await StudioStorage.write(next);
    status.textContent = StudioStorage.isExtension ? 'Saved. Portals update automatically.' : 'Saved in browser preview only.';
  } catch { status.textContent = 'Could not save. Please try again.'; }
  finally { saving = false; render(); document.querySelectorAll('button,input').forEach(e => e.disabled = false); if (focusedId) document.getElementById(focusedId)?.focus(); else document.querySelector('.pop-swatch[aria-pressed="true"]')?.focus(); }
}
for (const k of ['enabled', 'cms', 'lms']) document.getElementById(k).addEventListener('change', e => save({ power: [k, e.target.checked] }));
document.getElementById('system').addEventListener('change', e => save({ mode: e.target.checked ? 'system' : 'preset' }));
document.getElementById('customize').addEventListener('click', () => StudioStorage.openOptions());
StudioStorage.subscribe(value => { if (!saving) { settings = value; render(); } });
StudioStorage.read().then(value => { settings = value; render(); }).catch(() => { render(); status.textContent = 'Could not load saved preferences.'; });

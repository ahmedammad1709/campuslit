'use strict';
const $ = id => document.getElementById(id);
let settings = BahriaStudio.normalize({});
let baseline = JSON.stringify(settings);
let previewSite = 'cms';
let busy = false;
const system = matchMedia('(prefers-color-scheme: dark)');
function status(message) { $('status').textContent = message; }
function renderThemes() {
  const grid = $('themes'); grid.replaceChildren();
  for (const [id, theme] of Object.entries(BahriaStudio.themes)) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'theme-card'; button.setAttribute('aria-pressed', String(settings.theme === id));
    button.title = theme.description;
    for (const key of ['bg', 'nav', 'surface', 'accent', 'ink']) button.style.setProperty('--sw-' + key, theme[key]);
    button.innerHTML = '<span class="theme-sample" aria-hidden="true"><span class="sample-sidebar"><i></i><i></i><i></i></span><span class="sample-content"><i class="sample-line"></i><span class="sample-panels"><i></i><i></i></span><i class="sample-bottom"></i></span></span>';
    const label = document.createElement('strong'); label.textContent = theme.name; button.append(label);
    const tone = document.createElement('span'); tone.className = 'theme-tone'; tone.textContent = theme.description; button.append(tone);
    if (settings.theme === id) { const check = document.createElement('span'); check.className = 'check'; check.textContent = '✓'; check.setAttribute('aria-hidden', 'true'); button.append(check); }
    button.addEventListener('click', () => { settings.theme = id; settings.accent = ''; settings.mode = 'preset'; render(); grid.querySelector('[aria-pressed="true"]').focus({preventScroll:true}); dirty(); }); grid.append(button);
  }
}
function render() {
  renderThemes();
  for (const key of ['enabled', 'cms', 'lms', 'cleanBackground', 'motion']) $(key).checked = settings[key];
  for (const key of ['font', 'fontSize', 'radius', 'density']) $(key).value = settings[key];
  $('system').checked = settings.mode === 'system';
  $('accent').value = settings.accent || BahriaStudio.palette(settings, system.matches).accent;
  preview();
}
function preview() {
  BahriaStudio.apply($('portal-preview'), settings, system.matches);
  $('size-output').textContent = settings.fontSize + ' px'; $('radius-output').textContent = settings.radius + ' px';
  $('preview-theme-name').textContent = BahriaStudio.palette(settings, system.matches).name + (settings.accent ? ' · Personalized' : '');
  document.querySelector('.preview-column').classList.toggle('is-paused', !settings.enabled || !settings[previewSite]);
  $('type-specimen').style.fontFamily = BahriaStudio.fonts[settings.font];
  const accent = BahriaStudio.palette(settings, system.matches).accent;
  document.querySelectorAll('[data-accent]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.accent.toLowerCase() === accent.toLowerCase())));
}
document.querySelectorAll('[data-accent]').forEach(button => button.addEventListener('click', () => { settings.accent = button.dataset.accent; $('accent').value = settings.accent; preview(); dirty(); }));
function dirty() { $('save-label').textContent = 'Save appearance'; status(JSON.stringify(settings) === baseline ? 'Your saved appearance.' : 'Preview updated. Save to apply to your portals.'); }
for (const key of ['enabled', 'cms', 'lms', 'cleanBackground', 'motion']) $(key).addEventListener('change', e => { settings[key] = e.target.checked; preview(); dirty(); });
for (const key of ['font', 'density']) $(key).addEventListener('change', e => { settings[key] = e.target.value; preview(); dirty(); });
for (const key of ['fontSize', 'radius']) $(key).addEventListener('input', e => { settings[key] = Number(e.target.value); preview(); dirty(); });
$('accent').addEventListener('input', e => { settings.accent = e.target.value; preview(); dirty(); });
$('reset-accent').addEventListener('click', () => { settings.accent = ''; render(); dirty(); });
$('system').addEventListener('change', e => { settings.mode = e.target.checked ? 'system' : 'preset'; render(); dirty(); });
system.addEventListener('change', render);
document.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', () => {
  previewSite = button.dataset.preview;
  document.querySelectorAll('[data-preview]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  $('preview-url').textContent = previewSite + '.bahria.edu.pk';
  $('stat-label').textContent = previewSite === 'cms' ? 'Overall attendance' : 'Course resources';
  $('stat-value').innerHTML = previewSite === 'cms' ? '94<span>%</span> <small>Looking good</small>' : '24 <small>Ready to explore</small>';
  $('preview-column-title').textContent = previewSite === 'cms' ? 'Attendance' : 'Resources';
  document.querySelectorAll('.mini-pill').forEach((pill, i) => { pill.textContent = (previewSite === 'cms' ? ['100%', '92%', '90%'] : ['8 files', '10 files', '6 files'])[i]; });
  preview();
}));
$('preview-action').addEventListener('click', () => { $('personalize').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}); $('accent').focus({preventScroll:true}); });
$('save').addEventListener('click', async () => {
  if (busy) return; busy = true; $('save').disabled = true;
  $('save-label').textContent = 'Saving…';
  const snapshot = BahriaStudio.normalize(settings);
  try { await StudioStorage.write(snapshot); baseline = JSON.stringify(snapshot); $('save-label').textContent = 'Saved'; status(JSON.stringify(settings) === baseline ? (StudioStorage.isExtension ? 'Saved. Your open portals update automatically.' : 'Saved to this browser preview.') : 'Saved. You have additional unsaved changes.'); }
  catch { $('save-label').textContent = 'Try again'; status('Could not save. Your preview is intact; please try again.'); }
  finally { busy = false; $('save').disabled = false; }
});
$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ format: 'campuslit', version: 1, settings: BahriaStudio.normalize(settings) }, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'campuslit-theme.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); status('Appearance exported. No student data is included.');
});
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 16384) throw new Error('size');
    const data = JSON.parse(await file.text());
    if ((data.format !== 'campuslit' && data.format !== 'bahria-studio') || data.version !== 1 || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) throw new Error('format');
    settings = BahriaStudio.normalize(data.settings); render(); status('Theme imported into preview. Save to apply.');
  } catch { status('Choose a valid Campuslit settings file under 16 KB.'); }
  e.target.value = '';
});
$('reset').addEventListener('click', () => $('reset-dialog').showModal());
$('cancel-reset').addEventListener('click', () => $('reset-dialog').close());
$('confirm-reset').addEventListener('click', async () => {
  try { await StudioStorage.clear(); settings = BahriaStudio.normalize({}); baseline = JSON.stringify(settings); render(); $('reset-dialog').close(); status('Preferences removed. Crystal restored.'); }
  catch { $('reset-dialog').close(); status('Could not reset preferences. Please try again.'); }
});
StudioStorage.subscribe(value => {
  if (busy) return;
  if (JSON.stringify(settings) !== baseline) { status('Settings changed in another window. Save here to keep your current preview.'); return; }
  settings = value; baseline = JSON.stringify(value); render(); status('Updated from your other Studio window.');
});
addEventListener('beforeunload', e => { if (JSON.stringify(settings) !== baseline) { e.preventDefault(); e.returnValue = ''; } });
(async () => {
  $('demo-notice').hidden = StudioStorage.isExtension;
  try { settings = await StudioStorage.read(); baseline = JSON.stringify(settings); render(); status('Your style stays on this browser.'); }
  catch { render(); status('Could not read saved preferences. Showing the default preview.'); }
})();

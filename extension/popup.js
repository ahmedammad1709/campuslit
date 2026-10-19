'use strict';
let settings = BahriaStudio.normalize({});
let saving = false;
const status = document.getElementById('status');
function render() {
  for (const k of ['enabled', 'cms', 'lms']) document.getElementById(k).checked = settings[k];
  document.getElementById('system').checked = settings.mode === 'system';
  const grid = document.getElementById('themes'); grid.replaceChildren();
  for (const [id, theme] of Object.entries(BahriaStudio.themes)) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'theme-card'; button.setAttribute('aria-pressed', String(settings.theme === id)); button.title = theme.description;
    for (const key of ['bg', 'nav', 'surface', 'accent', 'ink']) button.style.setProperty('--sw-' + key, theme[key]);
    button.innerHTML = '<span class="theme-sample" aria-hidden="true"><span class="sample-sidebar"><i></i><i></i></span><span class="sample-content"><i class="sample-line"></i><span class="sample-panels"><i></i><i></i></span><i class="sample-bottom"></i></span></span>';
    const label = document.createElement('strong'); label.textContent = theme.name; button.append(label);
    button.addEventListener('click', () => save({theme: id, accent: '', mode: 'preset'})); grid.append(button);
  }
}
async function save(patch) {
  if (saving) return; saving = true;
  const focusedId = document.activeElement?.id;
  document.querySelectorAll('button,input').forEach(el => el.disabled = true);
  try { settings = await StudioStorage.write(patch.power ? BahriaStudio.power(settings, patch.power[0], patch.power[1]) : {...settings, ...patch}); status.textContent = StudioStorage.isExtension ? 'Saved. Your portals update automatically.' : 'Saved in browser preview only.'; }
  catch { status.textContent = 'Could not save. Please try again.'; }
  finally { saving = false; render(); document.querySelectorAll('button,input').forEach(el => el.disabled = false); if (focusedId) document.getElementById(focusedId)?.focus(); else document.querySelector('.theme-card[aria-pressed="true"]')?.focus(); }
}
for (const k of ['enabled', 'cms', 'lms']) document.getElementById(k).addEventListener('change', e => save({power: [k, e.target.checked]}));
document.getElementById('system').addEventListener('change', e => save({mode:e.target.checked ? 'system' : 'preset'}));
document.getElementById('customize').addEventListener('click', () => StudioStorage.openOptions());
StudioStorage.subscribe(value => { if (!saving) { settings = value; render(); } });
StudioStorage.read().then(value => { settings = value; render(); }).catch(() => { render(); status.textContent = 'Could not load saved preferences.'; });

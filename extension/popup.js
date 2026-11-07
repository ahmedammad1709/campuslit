'use strict';
const B = BahriaStudio;
let settings = B.normalize({});
let saving = false;
let guide = null;            // which tips have been shown (null until read)
let welcomeClosed = false;   // closed in this popup already, whatever the write is doing
const status = document.getElementById('status');
const system = matchMedia('(prefers-color-scheme: dark)');

// The opening animation follows its setting; until the setting is known nothing is drawn (so it never flashes in and then jumps).
function setAnimation() { document.body.dataset.anim = settings.openingAnimation ? 'on' : 'off'; }
setTimeout(() => { if (!document.body.dataset.anim) document.body.dataset.anim = 'off'; }, 900);   // if the setting cannot be read, show the popup plainly
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
// A theme is a small picture of the portal in its own colours (the same drawing the settings page uses), with its name under it.
function sample(p) {
  const s = el('span', 'theme-sample'); s.setAttribute('aria-hidden', 'true');
  for (const [k, v] of [['bg', p.bg], ['nav', p.nav], ['surface', p.surface], ['accent', p.accent], ['ink', p.ink], ['navink', p.navInk]]) s.style.setProperty('--sw-' + k, v);
  const nav = el('span', 'ts-nav'); nav.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  const main = el('span', 'ts-main'), cards = el('span', 'ts-cards'); cards.append(document.createElement('i'), document.createElement('i'));
  main.append(el('i', 'ts-bar'), cards, el('i', 'ts-btn'));
  s.append(nav, main);
  return s;
}
function swatch(p, name, pressed, title) {
  const b = el('button', 'pop-swatch'); b.type = 'button'; b.title = title; b.setAttribute('aria-pressed', String(pressed));
  b.append(sample(p), el('span', 'pop-name', name));
  if (pressed) { const c = el('span', 'pop-check'); c.setAttribute('aria-hidden', 'true'); c.innerHTML = StudioIcons.svg('check'); b.append(c); }
  return b;
}
function render() {
  for (const k of ['enabled', 'cms', 'lms']) document.getElementById(k).checked = settings[k];
  document.getElementById('system-note').textContent = settings.theme === 'custom' ? 'Not used with your custom theme' : 'Midnight when your device is dark';
  document.getElementById('system').checked = settings.mode === 'system';
  const grid = document.getElementById('themes'); grid.replaceChildren();
  for (const [id, theme] of Object.entries(B.themes)) {
    const b = swatch(theme, theme.name, settings.theme === id, theme.name + ' \u00b7 ' + theme.description);
    b.addEventListener('click', () => save({ theme: id, accent: '', mode: 'preset' }));
    grid.append(b);
  }
  // the seventh, on a row of its own: the one theme the user designs (or the way to start it)
  const c = settings.custom;
  let b;
  if (c) {
    b = swatch(B.deriveCustom(c), c.name, settings.theme === 'custom', c.name + ' \u00b7 your custom theme');
    b.insertBefore(el('span', 'pop-note', 'Your theme'), b.querySelector('.pop-check'));   // the tick stays at the far end
    b.addEventListener('click', () => save({ theme: 'custom', accent: '' }));
  } else {
    b = el('button', 'pop-swatch empty'); b.type = 'button'; b.title = 'Design your own theme'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Create your own custom theme');
    const plus = el('span', 'theme-sample'); plus.setAttribute('aria-hidden', 'true'); plus.innerHTML = StudioIcons.svg('plus');
    b.append(plus, el('span', 'pop-name', 'Custom'), el('span', 'pop-note', 'Design your own')); b.addEventListener('click', openStudio);
  }
  b.classList.add('custom');
  grid.append(b);
  renderAsk();
}
// The one-time question about notifications. Yes turns them on (the background worker then makes a silent first look); either answer is remembered, so it never nags.
function renderAsk() {
  const box = document.getElementById('notify-ask');
  box.hidden = !(guide && BahriaGuide.wantsNotifyAsk(guide, settings.notify.enabled)) || !welcome.hidden || !tourBox.hidden;
  if (!box.hidden) StudioIcons.render(box);
}
async function answerAsk(turnOn, then) {
  try { guide = await StudioStorage.updateGuide(BahriaGuide.markNotifyAsked); } catch { /* it may ask once more */ }
  document.getElementById('notify-ask').hidden = true;
  if (turnOn) await save({ notify: { ...settings.notify, enabled: true } }).then(() => { status.textContent = 'Notifications are on. Choose what you get in Settings.'; });
  if (then) then();
}
function openNotifySettings() {
  const api = globalThis.browser || globalThis.chrome;
  if (StudioStorage.isExtension && api.tabs && api.tabs.create) api.tabs.create({ url: api.runtime.getURL('options.html#notifications') });
  else location.href = 'options.html#notifications';
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
document.getElementById('na-yes').addEventListener('click', () => answerAsk(true));
document.getElementById('na-no').addEventListener('click', () => answerAsk(false));
document.getElementById('na-choose').addEventListener('click', () => answerAsk(false, openNotifySettings));

// ---------- the first-run welcome and tour ----------
// The first time the popup opens it shows a short welcome, then (if you take it) a tour: a spotlight on one part of the popup at a time.
// Skip is always there. Once the welcome has been shown it is remembered (a yes/no flag on this device), so it never nags; "Tour" in the footer and
// "Take the tour again" in settings play it again whenever you like.
const welcome = document.getElementById('welcome'), tourBox = document.getElementById('tour');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const animated = () => document.body.dataset.anim === 'on' && !reducedMotion.matches;
const mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
const searchKey = mac ? 'Cmd+K' : 'Ctrl+K';
document.getElementById('w-key').textContent = 'Press ' + searchKey;
const STEPS = [
  { target: () => document.querySelector('.pop-list'), title: 'Switch it on or off', text: 'The top switch turns Campuslit on or off everywhere. CMS and LMS keep it on for just one portal.' },
  { target: () => document.getElementById('themes'), title: 'Pick a look', text: 'Six themes, plus one you design yourself. Your portals change as soon as you choose.' },
  { target: () => document.getElementById('system').closest('.pop-list'), title: 'Follow your device', text: 'Switch to Midnight automatically when your device goes dark.' },
  { target: () => document.getElementById('customize'), title: 'All settings', text: 'Fonts, text size, your own theme, attendance and reminders. The Guide there explains every feature.' },
  { final: true, title: 'You are all set', text: 'Open your CMS or LMS and press ' + searchKey + ' to jump to any page. A short hint shows once beside each new feature.' }
];
const TARGETS = STEPS.filter(step => !step.final).length;
let step = -1;
const whenSettled = () => Promise.allSettled(document.getAnimations().map(a => a.finished));   // let the popup finish fading in before measuring it
const mainParts = () => [...document.body.children].filter(n => !n.classList.contains('pop-welcome') && !n.classList.contains('pop-tour'));

function maybeWelcome() {
  if (!guide || welcomeClosed || !welcome.hidden || !tourBox.hidden || !BahriaGuide.wantsTour(guide, settings.tips)) return;   // not the first time, tips off, or the record could not be read
  welcomeClosed = true;
  document.body.classList.add('is-welcome'); welcome.hidden = false;
  document.getElementById('w-tour').focus({ preventScroll: true });
  rememberWelcome();   // shown means done: it will not nag, whether or not you finish
}
function hideWelcome() {
  if (welcome.hidden) return Promise.resolve();
  welcome.classList.add('leaving');
  return new Promise(done => setTimeout(() => { welcome.hidden = true; welcome.classList.remove('leaving'); document.body.classList.remove('is-welcome'); renderAsk(); done(); }, animated() ? 170 : 0));
}
async function rememberWelcome() { try { guide = await StudioStorage.updateGuide(BahriaGuide.markWelcome); } catch { /* it will simply show again next time */ } }
function openGuide() {
  const api = globalThis.browser || globalThis.chrome;
  if (StudioStorage.isExtension && api.tabs && api.tabs.create) api.tabs.create({ url: api.runtime.getURL('options.html#guide') });
  else location.href = 'options.html#guide';
}

function place() {
  const spot = tourBox.querySelector('.tour-spot'), card = tourBox.querySelector('.tour-card'), def = STEPS[step];
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, width = Math.min(336, vw - 24);
  card.style.width = width + 'px';
  const height = card.offsetHeight;
  if (def.final) { tourBox.dataset.mode = 'center'; card.style.left = (vw - width) / 2 + 'px'; card.style.top = Math.max(12, (vh - height) / 2) + 'px'; return; }
  const target = def.target(); if (!target) { endTour(); return; }
  tourBox.dataset.mode = 'spot';
  const r = target.getBoundingClientRect(), pad = 6;
  spot.style.left = r.left - pad + 'px'; spot.style.top = r.top - pad + 'px'; spot.style.width = r.width + pad * 2 + 'px'; spot.style.height = r.height + pad * 2 + 'px';
  const below = vh - (r.bottom + pad) - 12, above = r.top - pad - 12;
  const useBelow = height <= below || (height > above && below >= above);   // the side with room; the one with more room when neither fits
  card.style.left = (vw - width) / 2 + 'px';
  card.style.top = Math.max(12, Math.min(useBelow ? r.bottom + pad + 12 : r.top - pad - 12 - height, vh - height - 12)) + 'px';
}
function showStep(i) {
  step = Math.max(0, Math.min(STEPS.length - 1, i));
  const def = STEPS[step], last = !!def.final;
  document.getElementById('tour-title').textContent = def.title;
  document.getElementById('tour-text').textContent = def.text;
  document.getElementById('tour-count').textContent = last ? '' : 'Step ' + (step + 1) + ' of ' + TARGETS;
  document.getElementById('tour-count').hidden = last;
  document.getElementById('tour-skip').hidden = last;
  document.getElementById('tour-guide').hidden = !last;
  document.getElementById('tour-back').hidden = step === 0;
  const next = document.getElementById('tour-next'); next.textContent = last ? 'Done' : 'Next';
  place();
  next.focus({ preventScroll: true });
}
async function startTour() {
  await hideWelcome();
  mainParts().forEach(n => { n.inert = true; });
  tourBox.hidden = false; tourBox.dataset.mode = 'center';
  await whenSettled();
  showStep(0);
}
function endTour() {
  tourBox.hidden = true; step = -1; renderAsk();
  mainParts().forEach(n => { n.inert = false; });
  document.getElementById('tour-link').focus({ preventScroll: true });
}
document.getElementById('w-start').addEventListener('click', () => { hideWelcome(); });
document.getElementById('w-tour').addEventListener('click', startTour);
document.getElementById('tour-link').addEventListener('click', startTour);
document.getElementById('tour-skip').addEventListener('click', endTour);
document.getElementById('tour-guide').addEventListener('click', () => { openGuide(); endTour(); });
document.getElementById('tour-back').addEventListener('click', () => showStep(step - 1));
document.getElementById('tour-next').addEventListener('click', () => { if (STEPS[step].final) endTour(); else showStep(step + 1); });
document.addEventListener('keydown', e => {
  if (!welcome.hidden && e.key === 'Escape') { e.preventDefault(); hideWelcome(); }
  else if (!tourBox.hidden) {
    if (e.key === 'Escape') { e.preventDefault(); endTour(); }
    else if (e.key === 'ArrowRight' && !STEPS[step].final) { e.preventDefault(); showStep(step + 1); }
    else if (e.key === 'ArrowLeft' && step > 0) { e.preventDefault(); showStep(step - 1); }
  }
});
addEventListener('resize', () => { if (!tourBox.hidden && step >= 0) place(); });

StudioStorage.subscribe(value => { if (!saving) { settings = value; setAnimation(); render(); } });
StudioStorage.subscribeGuide(value => { guide = value; renderAsk(); });
StudioStorage.read().then(value => { settings = value; setAnimation(); render(); maybeWelcome(); }).catch(() => { setAnimation(); render(); status.textContent = 'Could not load saved preferences.'; });
StudioStorage.guide().then(value => { guide = value; maybeWelcome(); renderAsk(); }).catch(() => { /* no welcome if the record cannot be read */ });

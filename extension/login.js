(function () {
  'use strict';
  // A structural adapter for the student sign-in page. Never reads input values,
  // replaces controls, changes form actions, or installs submission handlers.
  const api = globalThis.browser || globalThis.chrome;
  let current = null;
  const owned = new Set();
  const tagged = new Map();
  const hints = new Map();   // input -> original autocomplete attribute (null when absent)
  let focused = false;
  function tag(node, name) {
    if (!node || node.hasAttribute(name)) return;
    node.setAttribute(name, '');
    if (!tagged.has(node)) tagged.set(node, new Set());
    tagged.get(node).add(name);
  }
  function make(tagName, className, text) {
    const node = document.createElement(tagName); node.className = className;
    if (text) node.textContent = text;
    owned.add(node); return node;
  }
  function disable() {
    if (current?.password) current.password.type = 'password';
    owned.forEach(node => node.remove()); owned.clear();
    tagged.forEach((names, node) => names.forEach(name => node.removeAttribute(name))); tagged.clear();
    hints.forEach((value, node) => { if (value === null) node.removeAttribute('autocomplete'); else node.setAttribute('autocomplete', value); }); hints.clear();
    document.documentElement.style.removeProperty('--bs-campus-background');
    delete document.documentElement.dataset.bsLogin;
    current = null;
  }
  function mount() {
    if (!document.body || !/^\/Logins\/[A-Za-z]+\/Login\.aspx\/?$/i.test(location.pathname)) return;
    if (current?.panel.isConnected && current.password.isConnected) return;
    if (current) disable();
    const password = document.querySelector('input[type="password"]');
    if (!password || !password.form) return;
    const panel = password.closest('.panel, .card, .login-box, .login-panel');
    if (!panel || !panel.querySelector('input[type="submit"],button[type="submit"],.btn-primary,a.btn')) return;
    const role = (/^\/Logins\/([A-Za-z]+)\//i.exec(location.pathname) || [])[1] || 'student';
    const oldTitle = panel.querySelector('.panel-title, .card-title, h3, h4');
    const title = (oldTitle && oldTitle.textContent.trim()) || (role.charAt(0).toUpperCase() + role.slice(1) + ' sign in');
    const root = document.documentElement;
    // Capture only public background styling before our theme overrides it.
    const active = root.getAttribute('data-bahria-studio');
    root.removeAttribute('data-bahria-studio');
    const ancestry = [];
    for (let node = panel.parentElement; node && node !== document.body; node = node.parentElement) ancestry.push(node);
    const backgrounds = [document.body, root, ...ancestry].map(node => getComputedStyle(node).backgroundImage);
    if (active !== null) root.setAttribute('data-bahria-studio', active);
    const background = backgrounds.find(value => value && value.includes('url('));
    if (background) root.style.setProperty('--bs-campus-background', background);
    current = { panel, password };
    tag(panel, 'data-bs-login-card');
    ancestry.forEach(node => tag(node, 'data-bs-login-wrap'));
    panel.querySelectorAll('.panel-heading,.card-header').forEach(node => tag(node, 'data-bs-login-old-heading'));
    // Hide only the superseded page title and its empty visual strip.
    document.querySelectorAll('h1,h2').forEach(heading => {
      if (panel.contains(heading) || heading.textContent.replace(/\s+/g, '').toLowerCase() !== role.toLowerCase()) return;
      const parent = heading.parentElement;
      tag(parent && parent.children.length === 1 && !parent.contains(panel) && parent !== document.body ? parent : heading, 'data-bs-login-old-heading');
    });
    document.querySelectorAll('.navbar,header').forEach(node => { if (!node.contains(panel) && !panel.contains(node)) tag(node, 'data-bs-login-old-heading'); });
    // Original IDs, names, labels, validation nodes, and event listeners stay put.
    panel.querySelectorAll('.form-group').forEach(node => tag(node, 'data-bs-login-field'));
    panel.querySelectorAll('.input-group').forEach(node => tag(node, 'data-bs-login-input-group'));
    panel.querySelectorAll('input[type="submit"],button[type="submit"],.btn-primary,a.btn').forEach(node => tag(node, 'data-bs-login-submit'));
    const header = make('header', 'bs-login-header');
    const brand = make('a', 'bs-login-brand'); brand.href = 'https://cms.bahria.edu.pk/';
    const monogram = make('span', 'bs-login-monogram', 'BU'); monogram.setAttribute('aria-hidden','true');
    const icon = document.querySelector('link[rel="apple-touch-icon"][sizes="180x180"]') || document.querySelector('link[rel="apple-touch-icon"]');
    if (icon && icon.href) { const img = make('img', 'bs-login-emblem'); img.src = icon.href; img.alt = ''; monogram.textContent = ''; monogram.append(img); }
    const name = make('span', 'bs-login-brand-name', 'Bahria University');
    name.append(make('small', '', role.toLowerCase() === 'student' ? 'Student portal' : 'Campus portal')); brand.append(monogram, name);
    const actions = make('div', 'bs-login-header-actions');
    header.append(brand,actions); document.body.prepend(header);
    const heading = make('div', 'bs-login-heading');
    heading.append(make('h1','', title.replace(/sign in/i, 'sign in')), make('p','', role.toLowerCase() === 'student' ? 'Use your enrollment number and CMS password.' : 'Enter your details to continue.'));
    panel.prepend(heading);
    const group = password.closest('.input-group') || password.parentElement;
    tag(group, 'data-bs-password-group');
    const toggle = make('button', 'bs-password-toggle', 'Show'); toggle.type = 'button';
    toggle.setAttribute('aria-label','Show password'); toggle.setAttribute('aria-pressed','false');
    toggle.addEventListener('click', () => {
      const show = password.type === 'password'; password.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show'; toggle.setAttribute('aria-label',show ? 'Hide password' : 'Show password'); toggle.setAttribute('aria-pressed',String(show));
    });
    group.append(toggle);

    // Help password managers (and users who cannot easily type) recognise the fields; never touches values.
    const enrollment = panel.querySelector('input[type="text"]');
    [[enrollment, 'username'], [password, 'current-password']].forEach(([node, value]) => {
      if (!node || hints.has(node)) return;
      hints.set(node, node.hasAttribute('autocomplete') ? node.getAttribute('autocomplete') : null);
      node.setAttribute('autocomplete', value);
    });
    // Caps Lock warning: state comes from the keyboard event, the typed text is never read.
    const caps = make('div', 'bs-caps', 'Caps Lock is on'); caps.hidden = true; caps.setAttribute('role', 'status');
    group.after(caps);
    const capsState = e => { caps.hidden = !(e.getModifierState && e.getModifierState('CapsLock')); };
    password.addEventListener('keydown', capsState); password.addEventListener('keyup', capsState); password.addEventListener('blur', () => { caps.hidden = true; });
    // Start on the first field for keyboard users on desktop, unless something already has focus.
    if (!focused && enrollment && matchMedia('(hover: hover)').matches && document.activeElement === document.body) { focused = true; enrollment.focus({ preventScroll: true }); }
    root.dataset.bsLogin = background ? 'campus' : 'plain';
  }
  globalThis.BahriaLogin = { mount, disable };
})();

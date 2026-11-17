// The live extension has real users. Chrome switches an extension OFF after an update that asks for anything new (a permission, a website,
// a new warning) until each user re-enables it. This test fails the build when the manifest asks for more than the published version.
// When a release that really does need more is wanted on purpose, update scripts/data/published-permissions.json in the same commit (and say so in the notes).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'data', 'published-permissions.json'), 'utf8'));

const asked = {
  permissions: manifest.permissions || [],
  optional_permissions: manifest.optional_permissions || [],
  host_permissions: manifest.host_permissions || [],
  optional_host_permissions: manifest.optional_host_permissions || [],
  content_script_matches: [...new Set((manifest.content_scripts || []).flatMap(c => c.matches || []))],
};
const extra = (now, before) => now.filter(x => !before.includes(x));

test('an update never asks for more than the published version (so Chrome does not switch the extension off for existing users)', () => {
  for (const key of Object.keys(asked)) {
    const added = extra(asked[key], baseline[key] || []);
    assert.deepEqual(added, [], key + ' gained ' + JSON.stringify(added) + ': Chrome would disable the extension for every existing user until they re-enable it. Use an optional permission, or update scripts/data/published-permissions.json on purpose.');
  }
});

test('nothing in the manifest that raises a new install warning has been added', () => {
  const risky = ['nativeMessaging', 'webRequest', 'webRequestBlocking', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'tabs', 'history', 'bookmarks', 'cookies', 'downloads', 'clipboardRead', 'geolocation', 'management', 'proxy', 'debugger', 'scripting', 'activeTab'];
  const all = [...asked.permissions, ...asked.optional_permissions].filter(p => risky.includes(p));
  const allowedBefore = [...(baseline.permissions || []), ...(baseline.optional_permissions || [])];
  assert.deepEqual(all.filter(p => !allowedBefore.includes(p)), [], 'a permission that shows a warning was added');
  for (const key of ['externally_connectable', 'devtools_page', 'chrome_url_overrides', 'commands', 'omnibox', 'side_panel', 'declarative_net_request']) assert.equal(manifest[key], undefined, key + ' is not in the published version');
});

# Release

## What a release contains

- `npm run package` builds Chrome and Firefox and writes `dist/release/campuslit-chrome.zip`, `campuslit-firefox.zip` and `SHA256SUMS.txt`. Each zip has `manifest.json` at its root.
- Before zipping, `scripts/lib/audit.mjs` checks every file and refuses to produce a package if anything is wrong. It checks that:
  - the manifest version equals the one in `package.json`, and the name (75 characters at most) and description (132 at most) fit the store limits;
  - permissions are exactly `storage`, and content scripts match only `cms.bahria.edu.pk` and `lms.bahria.edu.pk`;
  - the extension-page CSP is `script-src 'self'` with `connect-src 'none'`;
  - the Firefox build has an add-on ID and declares no data collection, and the Chrome build has neither;
  - every file the manifest names exists, and pages and styles refer only to files that are in the package;
  - no script uses `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `eval`, `new Function`, `importScripts` or `document.write`, and scripts that run on the portals never build HTML from strings;
  - the only web addresses in shipped code are XML namespaces, the two portals and the project's GitHub page;
  - no hidden, private, development, archive or log files, and only allowed file types;
  - no e-mail address, enrollment-number, ID-card or mobile-number pattern anywhere;
  - no file over 600 KB, and the package is under 5 MB.
- The audit is itself tested (`tests/package.test.cjs`): each rule has a test that feeds it a deliberately bad build.
- After zipping, the archive is read back and compared byte for byte with the audited files. Checksums (SHA-256) are in `SHA256SUMS.txt`.
- `npm run store-assets` writes six 1280x800 screenshots and the 440x280 promo tile to `dist/release/store/`, from the invented sample pages only.
- Store copy, permission justifications, data-use answers and reviewer notes: `docs/STORE_LISTING.md`.

## Cutting a release

1. Update the version in `package.json` and `extension/manifest.json` (the audit fails if they differ).
2. Run `npm test`; `npm run build` then `npm run test:extension` (real Chrome) and `npm run test:firefox` (real Firefox); and `npm run preview` with `npm run test:browser` in a second terminal.
3. Run `npm run package`. To test exactly what will be uploaded, unzip a zip into a new folder and run `EXT_DIR=<folder> npm run test:extension` (Chrome zip) or `EXT_DIR=<folder> npm run test:firefox` (Firefox zip).
4. Run `npm run store-assets` and look at the six screenshots.
5. Commit, tag (`git tag v<version>`), push, and create a GitHub release with `campuslit-chrome.zip`, `campuslit-firefox.zip` and `SHA256SUMS.txt` attached. The website's download buttons point at `releases/latest` and expect those two file names.
6. Submit the same zips to the stores (below).

## Submitting

- **Chrome Web Store / Edge Add-ons:** upload `campuslit-chrome.zip`; paste the text from `docs/STORE_LISTING.md`; upload the screenshots and promo tile; fill the privacy tab with the data-use answers there; add the reviewer notes (reviewers have no student login, so the notes explain how to see everything through the settings-page preview).
- **Firefox Add-ons (AMO):** upload `campuslit-firefox.zip`. Nothing is minified or bundled, so the uploaded zip is also the source; say so in the notes to the reviewer.
  Release Firefox builds cannot be installed permanently until Mozilla has signed them: loaded from the zip ("Load Temporary Add-on") they disappear when Firefox restarts. Submitting to AMO as *listed* or *unlisted* gets you a signed `.xpi` that installs normally, so do that before telling Firefox students to use it. The Firefox build has run in real Firefox 159 against the sample pages (`npm run test:firefox`); only a signed build has not been tried.

## Before the first submission

1. Choose the permanent Firefox add-on ID (currently the development placeholder `campuslit@local.invalid` in `scripts/build.mjs`). It cannot change after publishing.
2. The site is live at https://campuslit-bu.vercel.app/ (Vercel, root directory `site`); its `/privacy` page is the privacy-policy URL. Make the GitHub repository public and publish a release first, or the site's Download buttons and source links lead nowhere.
3. Decide the public contact address for the Chrome listing (see `docs/STORE_LISTING.md`, "Decisions only the publisher can make").
4. Let a few real students try a release build first: the live portals can differ from the saved pages the extension was built against. Ask them to look at the Assignments page with an open assignment, the Time Table page, the Attendance page, and Ctrl+K.
5. Refresh the `site/` screenshots (`node scripts/make-site-shots.mjs`) and the Chrome Web Store listing is live (link in the site's install card and hero); replace the Firefox "coming soon" badge once that listing is live.

## Honest wording

Do not claim university endorsement, security certification, or verified support for every page. Say it is unofficial. The privacy promise covers the extension's own behaviour; it cannot promise that the university portals themselves send no data. Page coverage: `docs/COVERAGE.md`.

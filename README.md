<p align="center"><img src="brand/logo-512.png" width="96" alt="Campuslit logo"></p>

# Campuslit

A cleaner, calmer look for the Bahria University student **CMS** and **LMS**, as a free Chrome and Firefox extension. Same pages, same data, same links; only the presentation changes.

> Independent student project. Not affiliated with, endorsed by, or supported by Bahria University.

## What it does

- **LMS** (`lms.bahria.edu.pk`): redesigned header, resizable sidebar that marks the page you are on, filter bars, tables, status pills and dropdowns; a dashboard with your courses as cards; tap-or-keyboard popovers instead of hover-only comments.
- **CMS** (`cms.bahria.edu.pk`): a unified header and sidebar with icons, tidier tables, forms and modals, clear error alerts, a role-card landing page and a one-screen student sign-in.
- **Dashboard attendance** drawn as readable per-course rows, and a **Time Table** as a compact day board or a one-page week calendar with a "next class" card.
- **Six themes** (Bahria, Crystal, Midnight, Linen, Grove, Bloom), custom accent, bundled fonts (Plus Jakarta Sans, Manrope, Sora, Inter), text size, spacing and corner radius. Everything can be switched off per portal, or with one click on "Original view".

## Install (development)

1. `npm run build` (Node.js 22 or later, no dependencies).
2. Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → `dist/chrome`.
   Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → `dist/firefox/manifest.json`.
3. After rebuilding, press the reload icon on the extension card, then refresh the portal tab.

Not yet on the Chrome Web Store or Firefox Add-ons; see `docs/RELEASE.md`.

## Privacy

No analytics, no accounts, no remote code or fonts, no network requests from the extension, no access to passwords or form values. Only appearance preferences are stored, in the browser's extension storage. To redraw a few screens it reads figures the page already shows (greeting name, LMS course list, CMS attendance percentages and time table) in memory only; nothing is saved or sent. Full text: `extension/privacy.html`.

## Repository layout

| Path | What is in it |
| --- | --- |
| `extension/` | The extension: `themes.js` (palettes), `content.js` (per-site switch), `lms.*`, `cms.*`, `login.*` (portal redesigns), `portal.css` (fallback styles), `options.*` and `popup.*` (settings UI), `fonts/`, `icons/` |
| `brand/` | Logo (`logo.svg`, `logo-512.png`); regenerate with `python scripts/make-logo.py` |
| `scripts/build.mjs` | Builds `dist/chrome` and `dist/firefox` |
| `tests/` | `npm test` (Node's built-in runner) |
| `docs/` | Design notes, coverage matrix, validation and release checklists |
| `scripts/lms-preview`, `scripts/cms-preview` | Optional local harnesses to screenshot the redesign against pages you saved yourself (see below) |

## Working on the redesign

The portals need a sign-in, so there are no saved pages in this repository. To iterate visually, save pages from your own session (Ctrl+S, "Webpage, HTML only") into a local `html_pages/` folder (git-ignored), then run `node scripts/cms-preview/serve.mjs` or `node scripts/lms-preview/serve.mjs`. The harnesses expect the portals' public front-end files in git-ignored `vendor/` folders (the CMS's `Aspire.min.css`, fonts and images; Bootstrap 3, AdminLTE 2 and Font Awesome for the LMS) and blank enrollment numbers; add your own name with `PREVIEW_REDACT="FIRST LAST"`. Never commit saved pages, screenshots of signed-in pages, or browser profiles.

`docs/COVERAGE.md` lists exactly which pages and states have been verified. Please read it before claiming a page works.

## Licence

MIT, see `LICENSE`. The bundled fonts keep their own SIL Open Font Licence. The portals' own pages, stylesheets and logos are not part of this project and are not included.

## Credits

Plus Jakarta Sans, Manrope, Sora and Inter are bundled under the SIL Open Font License (see `extension/fonts/`).

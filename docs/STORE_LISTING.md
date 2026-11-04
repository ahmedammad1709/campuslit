# Store listing copy

Everything to paste into the Chrome Web Store, Edge Add-ons and Firefox Add-ons (AMO) forms. Images come from `npm run store-assets`
(`dist/release/store/`), the zips from `npm run package` (`dist/release/`). Keep this file in step with the extension: if a feature
changes, change the text here in the same commit.

## Basics

| Field | Value |
| --- | --- |
| Name | Campuslit: Bahria University LMS & CMS Redesign |
| Summary (manifest description, 126 of 132 characters) | Redesign the Bahria University LMS and CMS: themes, attendance planner, due-date reminders, quick search. Unofficial; private. |
| Category | Education (Chrome, Edge) / Other (Firefox) |
| Language | English |
| Support URL | https://github.com/ahmedammad1709/campuslit/issues |
| Homepage URL | https://campuslit-bu.vercel.app/ |
| Source code | https://github.com/ahmedammad1709/campuslit (make the repository public before submitting: the listing, the privacy policy and the licence page all point to it) |
| Privacy policy URL | https://campuslit-bu.vercel.app/privacy |
| Licence | MIT |

## Detailed description

Use this as plain text (the stores do not render Markdown).

```
Campuslit (also written Campus Lit) redesigns the Bahria University student LMS and CMS: a calmer, cleaner look for the portals you already use, plus a few helpers that use what the pages already show. Same logins, same data, for every Bahria campus.

IT IS UNOFFICIAL. Campuslit is made by a student. It is not made, endorsed or supported by Bahria University. It only runs on cms.bahria.edu.pk and lms.bahria.edu.pk, and you can switch it off for either portal (or both) from the toolbar button.

WHAT YOU GET
• Six themes (Bahria, Crystal, Midnight, Linen, Grove, Bloom) and a custom-theme maker. Text size, spacing, corner roundness and fonts are yours to set, with a live preview of invented sample pages.
• Assignments: a "Due soon" card on the LMS Assignments page, and a status under every deadline (open, due in 3 hrs, submitted, closed). Deadlines are read in Pakistan time.
• Assignment reminder: a small popup on other LMS pages names the next assignment you have not submitted. Cross it away and it stays hidden for a few hours.
• Attendance planner: for each course, how many hours you can still miss and finish above 75%, worked out from your credit hours and the semester length you choose.
• Time table: a compact day board or a one-page week calendar, and an "Add to calendar" button that downloads your classes as a calendar file you can open in Google, Apple or Outlook calendar.
• Quick search: press Ctrl+K (Cmd+K on a Mac) or / to jump to any page in the portal's menu.
• A short welcome and tour the first time you open it (skip it any time), and one small hint beside each new feature the first time it appears. Tips, the tour and the opening animation can all be switched off in settings.
• A calmer sign-in page and portal chooser.

PRIVATE BY DESIGN
• Campuslit makes no network requests at all. There is no server, no account, no analytics and no remote code.
• It never reads your password or anything you type into the portal.
• To draw the extra screens it reads text the page already shows (course names, attendance hours, deadlines), in your browser's memory only.
• What it stores, on your device only: your appearance choices, and (only if you leave assignment reminders on) a short note of your open assignments (course, title, deadline), and a few yes/no flags for the tips you have seen. Settings has buttons to forget the note and to show the tips again, and turning reminders off deletes the note.
• The code is open source (MIT): https://github.com/ahmedammad1709/campuslit

GOOD TO KNOW
• Portal pages Campuslit has not been tested on keep working as before and just get the new colours.
• If the university changes its pages, some screens may look plain until Campuslit is updated. Please report anything odd on the issues page.
• Works on a computer, in Chrome, Edge, Brave and Firefox (Firefox 140 or newer).
```

## Single purpose (Chrome Web Store)

Restyle the Bahria University student CMS and LMS in the browser, with a few helpers built from information those pages already show
(attendance planner, assignment due dates and reminders, time-table export, page search).

## Permission justifications

| Permission | Why it is needed |
| --- | --- |
| `storage` | Remembers the chosen theme and layout options, the semester length for the attendance planner, the time-table view, and the optional assignment-reminder note. Everything stays in the browser's extension storage on this device. |
| Access to `cms.bahria.edu.pk` and `lms.bahria.edu.pk` (content scripts) | The extension restyles these two sites and adds the helpers to them. It runs on no other site. |

There are no other permissions, no host permissions beyond those two content-script matches, no background page, no remote code
(`script-src 'self'`, `connect-src 'none'`).

## Data-use answers

- Does the extension collect or transmit user data? **No.** Nothing leaves the browser: it has no network access (`connect-src 'none'`, no `fetch`, no remote scripts or fonts).
- Data types to tick (Chrome "Privacy practices"): **Website content** and **Personally identifiable information**. Chrome's user-data FAQ counts any handling of user data, including data that is only processed or stored on the device and never sent anywhere, so the form must say what the extension touches: it reads text the portal already shows (course names, attendance hours, assignment titles and deadlines, the class schedule, menu links: *website content*, with a short note of open assignments kept locally) and the student's first name for the greeting (*personally identifiable information*, held in memory only). Leave authentication, financial, health, location, web history, personal communications and user activity **unticked**: it never reads passwords or form entries, and it logs no keystrokes or clicks. The privacy policy (sections 2 and 3) describes exactly this.
- Certify: not sold to third parties, not used for purposes unrelated to the single purpose, not used for creditworthiness or lending.
- Firefox: `data_collection_permissions` is `required: ["none"]` (already in the Firefox build).
- Remote code: **No.**

## Notes for the store reviewer

Paste into the "test instructions" / "notes to reviewer" field:

```
The extension only does something on cms.bahria.edu.pk and lms.bahria.edu.pk, which need a university student login that I cannot hand to a reviewer.
You can still see everything it does without one:
1. Install it and click the toolbar button, then "Open settings".
2. The Themes page shows a live preview built from invented sample pages (sample page files are inside the package under preview/). Switch the Campus portal (CMS) / Learning portal (LMS) tabs, try the sidebar links, change themes, and for quick search click inside the preview and press Ctrl+K (or use the magnifier in the preview's header).
3. The code is plain, unminified JavaScript (nothing is built, bundled or obfuscated; the build only copies the folder and adds the Firefox add-on ID). Source: https://github.com/ahmedammad1709/campuslit
4. There is no network code. The manifest has connect-src 'none'; a release check (npm run package) fails if any script uses fetch, XMLHttpRequest, WebSocket, eval, or a web address outside the portals and the project page.
```

## Images

| File | Size | Used for |
| --- | --- | --- |
| `screenshot-1.jpg` … `screenshot-6.jpg` | 1280×800 | All stores (the first one is shown most prominently). Made from invented sample pages: LMS dashboard with reminder, Assignments, CMS attendance planner, time-table week view, quick search, settings page. |
| `promo-small.png` | 440×280 | Chrome Web Store small promo tile |
| `extension/icons/icon-128.png` | 128×128 | Store icon (already in the package) |

Suggested captions (the stores let you add one per screenshot): 1 "Reminders for what you have not submitted"; 2 "See what is due, at a glance"; 3 "How many hours you can still miss"; 4 "Your week on one page, or in your calendar"; 5 "Press Ctrl+K to jump anywhere"; 6 "Six themes, or make your own".

## Decisions only the publisher can make

1. **Firefox add-on ID.** The build currently uses `campuslit@local.invalid`, a development placeholder. The ID is permanent once published (it ties updates and saved settings together). Choose it once, in `scripts/build.mjs`, e.g. `campuslit@<a domain or name you control>`.
2. **Public contact.** Chrome shows the developer's contact e-mail on the listing and requires it to be verified. Decide which address to use. The support URL above can be the GitHub issues page.
3. **Version number.** The first public release was `1.0.0`; `1.0.1` renames the listing (title and summary) and refreshes the screenshots (set in `package.json` and `extension/manifest.json`; the release check refuses a mismatch). Every later store update must use a higher number.
4. **Developer accounts.** Chrome Web Store (one-time registration fee), Edge Add-ons (free), Firefox Add-ons (free). Chrome also asks whether you are a trader (a hobby project that is free and unmonetised is normally a non-trader).
5. **Trademark.** The name contains no university name or logo and the listing says "Unofficial". Keep it that way: do not add the university emblem to store images.

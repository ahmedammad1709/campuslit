# Campuslit: project context

Short, current notes for whoever picks this up next (human or AI assistant). For what is verified page by page, read `COVERAGE.md`.

## Goal
A free Chrome and Firefox extension that restyles the Bahria University student **CMS** (`cms.bahria.edu.pk`) and **LMS** (`lms.bahria.edu.pk`). Same data, links and form actions; only presentation changes (plus a few views redrawn from numbers the page already shows). Students first; other roles later, if ever. Sibling project: Footlit (a free GitHub-events extension, live at footlit-app.vercel.app).

## What the two portals are
- **LMS**: PHP, stock AdminLTE 2 / Bootstrap 3 markup, school stylesheet `mystyle.css`. Sidebar hard-codes Dashboard as active on every page (the extension marks the real one). Pages: dashboard, course outline/plan, lecture notes, assignments, quizzes, miscellaneous, papers, announcements, guidelines, library, FAQs, Understanding Quran.
- **CMS**: ASP.NET WebForms with the "Aspire" Bootstrap 3 theme (`Content/Bundles/Aspire.min.css`, public). Fixed 42px header, fixed 250px sidebar, `#pageContent` margin, sidebar toggled by `#pageContainer.HideSideBar`. Partial postbacks replace DOM, so enhancements re-run from a MutationObserver. Closed features (course registration, seating plan, convocation, thesis) redirect to the dashboard with an error alert.
- Dashboard attendance is a Chart.js canvas; its numbers are in an inline script (`renderAttendanceSummaryChart([...])`). The time table is a hidden JSON field (`#BodyPH_hfCalendarJson`) rendered by script.

## Decisions
- CSS-first, JS only where CSS cannot (regroup, redraw, popovers, resize handle). Original DOM and form actions untouched; everything the extension adds is removed when it is switched off.
- Design: one system for both portals. Default "Bahria" theme (deep navy, gold marker, royal-blue accent) plus five alternates; tokens are CSS variables set by `themes.js`. Restrained, no rainbow gradients or filler copy.
- Privacy promise is strict and is documented in `extension/privacy.html`; keep it true when adding features (anything that reads page content must say so there and in the README).
- Internal identifiers keep the old `bahria-studio` / `data-bahria-studio` names (storage key, root attribute) so existing saved settings survive the rename to Campuslit.

## Not done / next
1. Verify on the live site with the extension installed (everything so far is verified in local harnesses). Firefox is untested at runtime.
2. Remaining CMS pages: restyle checks for sortable grids, print/challan output, surveys, and the pages closed to the author (registration, seating plan, convocation, thesis).
3. LMS pages not yet screenshotted with data: papers, miscellaneous, announcements, course outline/plan, lecture notes.
4. Store release: permanent Firefox add-on ID, support URL, store screenshots, privacy page on a stable HTTPS URL, licence choice. See `RELEASE.md`.
5. Other roles (faculty, admin, alumni, candidate) and their logins.

## Working rules
- Never commit pages saved from a signed-in session, screenshots of them, browser profiles, or credentials. `.gitignore` covers the usual paths; the previews blank enrollment numbers and (via `PREVIEW_REDACT`) names, but addresses, emails and phone numbers are not blanked.
- Never put a password in a file or chat.

# Portal coverage and acceptance checks

Status: LMS and CMS student pages redesigned and verified in local harnesses against pages saved from a signed-in session. Nothing here has been verified on the live sites with the extension installed, or in Firefox at runtime. The sections below the route table are the newest and most accurate; the route table is the original plan and is kept for the pages not yet re-checked.

## Route inventory

| Area | Source | Implementation | Verification |
| --- | --- | --- | --- |
| CMS entry `/` | Screenshot + public page | Global theme and generic cards | Real DOM/visual check pending |
| Student login `/Logins/Student/Login.aspx` | Screenshot | Inputs, selects, panel and buttons | Login action and validation pending |
| CMS dashboard `/Sys/Student/Dashboard.aspx` | Screenshot | Navigation, panels and component surfaces | Charts and real navigation pending |
| CMS profile, registration, courses, exams | Screenshot navigation | Generic forms/tables/navigation | Exact routes and workflows pending |
| CMS surveys, challans, documents, scholarships | Screenshot navigation | Generic forms/tables/navigation | Exact routes, printing and downloads pending |
| CMS forms, undertakings, thesis, convocation | Screenshot navigation | Generic forms/tables/navigation | Exact routes and workflows pending |
| LMS dashboard `/Student/Dashboard.php` | Screenshot | Generic AdminLTE/Bootstrap adapter | Actual classes and layout pending |
| LMS outline, plan, notes, assignments, quizzes | Screenshot navigation | Generic forms/tables/navigation | Exact routes, uploads and submissions pending |
| LMS miscellaneous, papers, announcements, guidelines | Screenshot navigation | Generic content adapters | Exact routes and controls pending |
| LMS library, FAQs, Quran | Screenshot navigation | Generic content adapters | Embeds/external navigation pending |
| Other roles and unknown routes | Domain match | Generic styles only | Not tested; no role-specific support claim |

## Required signed-in validation

1. Inventory URLs and component classes for every reachable student page in both portals. Use sanitized HTML snapshots when possible; exclude credentials, session tokens, enrollment numbers and actual student records.
2. Test Crystal, Midnight, Linen, Grove and Bloom on each page, including extreme custom accent colors, 13/19 px text, compact/spacious spacing and 0/20 px corners.
3. Exercise menus, keyboard navigation, dropdowns, validation errors, pagination, date pickers, uploads, assignment submission, download links, dialogs and ASP.NET postbacks. Verify actions with and without the extension.
4. Check attendance charts and all success/error/warning text remains understandable. Chart canvas and semantic status colors are intentionally not recolored blindly.
5. Check original print/PDF/challan output, mobile widths and zoom. PDF viewer pages and external origins are outside styling scope.
6. Check live switching across CMS and LMS tabs, disabling one portal, global disable, system appearance, reload persistence and extension removal.
7. Check Chrome and Firefox separately, including permission prompts and Firefox signing requirements.

Do not list a page as verified until it has been tested in a real signed-in browser. No credentials should be committed or requested in chat.

## LMS redesign (v0.3, signed-in markup verified from saved pages)

The LMS is stock AdminLTE 2 / Bootstrap 3, confirmed from 11 saved student pages (dashboard, course outline/plan, lecture notes, assignments, quizzes, miscellaneous, announcements, guidelines, library, Understanding Quran). `extension/lms.css` + `lms.js` restyle header, sidebar, filter bars, tables, status pills, dropdowns, buttons and the dashboard (hero + course cards), and mark the real current sidebar item. Hover-only comments become tap/keyboard popovers.
Verified in a local harness (`scripts/lms-preview`, stock AdminLTE + saved pages, Chrome headless): dashboard, assignments, quizzes, guidelines; Bahria, Midnight, Linen, Grove themes; 520/1440 px widths; tooltip popover; user menu. NOT yet verified: real live site with the extension installed, file upload/submit flows, Firefox, the school's real `mystyle.css` (a stand-in was used), papers/miscellaneous/announcement variants with data, print.

## CMS redesign (v0.3)

`extension/cms.css` + `cms.js`, built against the portal's own public stylesheet (fixed 42px header, fixed 250px sidebar, `#pageContainer.HideSideBar` toggle) and 19 saved student pages. Covers header, sidebar (icons by destination, current-page marker, drag-to-resize), breadcrumb/title, alerts (including the "Registration has been closed" error), panels, tables (data and key-value), forms, buttons, modals, empty states, and the dashboard (notifications no longer auto-scroll with a 400px blank start; the attendance canvas is redrawn as per-course rows from the numbers in the page's own script, with the original chart left untouched if parsing fails). The attendance colour bands (85% / 75%) are an assumption, not a university rule.
Verified in `scripts/cms-preview` (real Aspire CSS + saved pages) for dashboard, profile, attendance, registered courses, fee challans, provisional result, forms (+modal), suggestion box; Bahria, Midnight, Linen, Grove, Bloom. NOT verified: live site with the extension installed, Time Table (grid is script-rendered; blank in preview), sortable-grid headers, file/print flows, Firefox, the six pages that were unavailable to the student (registration pages, seating plan, convocation, thesis).

## CMS landing and login polish

Landing (`/`): full-bleed campus photo under a dark navy tint, a "Campus Management System" heading, six solid role cards in theme colours (Student sign-in is the accent button). Login (`/Logins/Student/Login.aspx`): solid card, same photo treatment, no filler copy. Both use a fixed dark tint so white text stays readable in light themes. Verified in `scripts/cms-preview` for Bahria, Midnight and Linen at 1000-1440 px. Not verified: other role logins (faculty, admin, alumni, candidate), validation-error and wrong-password states, mobile widths, the live site.

## CMS Time Table (v0.3)

The portal's grid is built by script from a JSON blob in a hidden field on the page (`#BodyPH_hfCalendarJson`: day, 15-minute slot string, course, room, teacher). `cms.js` reads that JSON and draws a Week calendar (days as columns, positioned blocks, Lab blocks tinted gold) and a List view (day by day), with a Week/List switch (remembered), a "next class / in class now" card and weekly hours. The original grid stays in the page, hidden, and returns if parsing fails or the extension is off. Verified in the preview with the saved page (13 classes, Mon-Fri) in Bahria and Midnight. Not verified: overlapping classes in the same slot (they would stack), Saturday/Sunday classes, the live site.

## CMS remaining student pages (v0.3)

Reviewed in the preview, with real saved markup, and adjusted: Academic Documents (incl. the reject modal), Available Scholarships, EUndertakings, Undertakings, Community Services, Microsoft Email Account, Official Documents, Quality Assurance Surveys, Extra Teaching Sessions, and the Profile edit modals. Shared fixes: no stray gap under tables inside cards, link style in tables, empty-state messages, and plain-text statuses (Verified, Paid, Pending, Rejected...) drawn with a colour and dot (`data-bs-status`, text untouched). Not verified: pages with real data in the empty states (scholarships, surveys, extra teaching sessions), the survey form itself, file uploads on Academic Documents, and the six pages that redirect when closed.

## Other role sign-ins and dashboard notifications

`login.js` now redesigns every `/Logins/<Role>/Login.aspx` page (student, alumni, faculty, admin staff, executive, candidate), not just the student one: the heading comes from the page's own title, and extra copy such as the alumni campus links is styled as small print. Verified only by simulating an alumni page (the student page with its two dropdowns removed, the alumni title and the campus links added); the real faculty, admin, executive and candidate pages have not been seen. The CMS dashboard notifications scroll up on their own and pause on hover or click, as the portal's own script does (entering from a shorter offset); with reduced motion they become a normal scrollable list.

## Settings page, popup and custom themes (v0.3)

Redesigned settings page, popup and Studio (see `DESIGN.md`). Visual checks: settings at 1440, 1024, 820 and 390 px; popup at 372 px (483 px tall); Studio with a generated dark palette, a copied preset and a fine-tuned colour; two custom themes (dark rose, light mint) on the saved LMS dashboard and assignments, the CMS dashboard and the student sign-in. Not verified: custom themes on every portal page (they use the same variables as the presets, so they should hold, but only those four pages were looked at), installed-extension behaviour of the preview iframe in Chrome and Firefox, Firefox popup sizing.

## Attendance planner (v0.4)

`attendance.js` (pure maths, no page access) + `cms.js`. Rules: attendance must be MORE than 75% at the end of the semester (exactly 75.0% is not enough); a course's credit hours are its class hours per week; classes are whole hours (1 or 2 h); a lab is one continuous 3-hour session per credit hour. So the semester holds `weeks x weekly hours` (weekly = credit hours, or credit hours x 3 for a lab) and the hours left are that minus the hours held so far. With P attended, T held, S in the semester and R = S - T left: the fewest hours you must still attend is the smallest `a` with `100(P + a) > 75 S`, rounded up to whole classes (whole 3-hour sessions for a lab); "can miss" is the rest, rounded down to whole classes. Everything is in whole minutes. The semester length is a setting (Settings > Portals > Attendance planner, default 16 weeks, 10-20): it is an assumption to set to the real figure. Credit hours come from the Attendance page's table; the dashboard script has none, so there (and wherever they are missing) the planner falls back to counting from now. Labs are recognised by "Lab" in the title or a code like `CSL 220`. Shown on the CMS dashboard (data from the page's own script) and on the Attendance page (columns found by header text, present hours printed as "20.0 :90.91%").
Error handling: each course is built on its own (a bad record is skipped or shown as "Cannot work this out from the numbers on the page"); missing, negative, non-numeric or absurd values, attended > held, and a portal percentage that contradicts its own hours (more than 1 point off) all give that message instead of advice; the script data is extracted with a string-aware bracket walk; the planner waits for the page to finish loading so it never works from half a table; every CMS feature runs in its own try/catch; if the module or the data is missing, the original chart or table is left alone.
Verified: brute force over six credit/lab/length configurations against an independent reference (the promise holds and one more class breaks it), your worked examples (1-credit lab, 21 h held = 7 sessions; 2-credit, 14 h = week 7), messy-input and extraction tests, and in real Chrome on the sample dashboard and Attendance pages (all courses, one corrupted record, live change of semester length, removal when the CMS is switched off). Not verified: the real Attendance page with a different column layout or several semesters, the university's true semester length, and whether every lab is named as such (otherwise a lab is treated as ordinary hours).

## Assignments due-soon card (v0.3)

`deadlines.js` (pure maths, no page access) + `lms.js` + `lms.css`, on the LMS Assignments page only. The portal shows one course at a time (a course dropdown) and the dashboard has no assignment data, so the card covers the selected course; a cross-course strip would need extra requests or stored page data, which the extension does not do. The table is found by its header text (Deadline, Title, Added Submission, Action). Each row's deadline is the later of the "Extended" and "Actual" labels, parsed as Pakistan time (UTC+5) whatever the device's time zone is. A row is Submitted when its Added Submission cell has a download link; Closed when the portal's own Action cell says the deadline is exceeded (the portal wins over the device clock, so a wrong clock cannot show a closed assignment as open); otherwise it counts down. If the portal still offers an upload box but the clock says the deadline has passed, it says "Open. Check the deadline on the portal" instead of guessing. Only the presence of upload boxes is looked at, never their contents, file names or link addresses. Nothing is stored or sent. The card follows the table if the page changes it, refreshes every 30 s, and is removed when the LMS is switched off.
Verified: 9 unit tests (date formats incl. 12 am/pm, leap days, junk, non-breaking spaces; boundary at the exact deadline; clock-versus-portal disagreements; messy input), and in real Chrome against the sample page (four rows: submitted, two open, one closed; unreadable dates; table changed and emptied under the card; removal on switch-off), plus light, dark and phone-width screenshots. Not verified: the real page's Action cell for an assignment that is still open (only closed ones were available to inspect: the open-state upload control is assumed), a real submitted-after-deadline case, and other wordings the portal may use for "Deadline Exceeded".

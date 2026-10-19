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

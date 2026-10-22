# Campuslit design notes

## Two design surfaces

1. **The portal redesigns** (`lms.css`, `cms.css`, `login.css`): what students see on cms/lms.bahria.edu.pk. Every colour comes from CSS variables (`--bs-bg`, `--bs-surface`, `--bs-nav`, `--bs-accent`, ...) set by `themes.js`, so any theme, including a custom one, restyles every page with no extra work. Default look: deep navy sidebar, gold current-page marker, royal-blue accent, Plus Jakarta Sans. Restrained on purpose: no rainbow gradients, no filler copy.
2. **The settings UI** (`options.html`, `popup.html`, `privacy.html`, all styled by `studio.css`): its own fixed light "crystal" look so it never changes with the theme being edited. One cobalt accent, soft glass top bar, 14-20px radii, smallest text 12px, bundled Plus Jakarta Sans.

## Settings page layout

A left sidebar and a main area, in the style of ordinary settings screens: flat white surfaces, one border weight, one accent, almost no shadow, no decorative gradients or illustrations.

- **Sidebar** (252px): the brand, five links, and the master "Extension enabled" switch at the bottom. Links: **Themes** (the gallery, accent colour, match device appearance), **Text & layout** (typeface, text size, spacing, corner roundness), **Custom theme** (the maker), **Portals** (CMS and LMS switches, plain sign-in background, gentle motion) and **Privacy & data** (what is stored, link to the full policy, export, import, reset).
- **Main area**: a page title and one-line description that follow the section, an "Unsaved changes" chip and the Save button (always visible, never scrolls away), then two columns: the section on the left and the live preview on the right. Only one section shows at a time, so nothing is crowded.
- **Navigation**: sidebar entries are real links (`#themes`, `#text`, `#studio`, `#portals`, `#privacy`). The section is in the URL, clicking adds a history entry so Back works, and the toolbar popup deep-links to `options.html#studio`.
- **Feedback**: slider and colour changes update the preview and the "Unsaved changes" chip silently; real events (saved, imported, exported, reset, failures) show a short snackbar and are also announced through a polite live region.
- **Responsive**: under 1280px the section column narrows, under 1100px the preview drops below, under 900px the sidebar becomes a top bar whose links scroll sideways, and under 560px the gallery is two columns.
- Every control has a label, focus rings are always visible, and motion respects `prefers-reduced-motion`.

## The live preview

The preview is an iframe of real sample pages (`extension/preview/`, invented data) built to mirror the portals' markup. They load the real `lms.css`, `cms.css`, `lms.js` and `cms.js`, and the settings page sends them the draft settings with `postMessage`. So the preview is the extension's own output, not a mock-up. The frame always lays out like a 1000px-wide browser and is scaled down when the column is narrower.

## Custom theme (the maker, `studio.js`)

Goal: let anyone design a full theme without being able to make an unreadable one by accident.

**Model.** `settings.custom = { name, bg, surface, nav, ink, accent, soft, line, muted, navInk, gold }`. The first five are required hex colours; the other five are optional overrides (empty string means "automatic"). `normalizeCustom` is strict: six-digit hex only, lower-cased, name stripped of control characters and angle brackets and limited to 24 characters, anything else discards the whole custom theme and falls back to the default theme.

**Derivation** (`deriveCustom`). The page/card/sidebar/text/accent colours drive everything else: soft fill (card mixed with accent), borders (page mixed with text), secondary text (text mixed toward the card until it passes 4.5:1), sidebar text (white or the text colour tinted toward the sidebar until it passes 4.5:1) and the highlight marker (gold on a dark sidebar, otherwise the accent). Dark or light is detected from the page colour.

**Generation** (`generateCustom`). One brand colour plus Light or Dark plus a sidebar style (Deep, Tinted, Soft) yields a complete palette in the brand's hue, with the accent nudged only as far as needed to stay at least 3.3:1 on the cards. Verified on 24,000 random combinations: every generated palette passes every readability check.

**Readability** (`contrastReport`, `fixCustom`). Six checks: text on the page, text on cards, secondary text, sidebar text, button label (automatic), and the accent against cards (3:1). "Fix automatically" repairs only what fails, leaves everything passing untouched, and, if the page and cards pull in opposite directions (a dark page behind light cards), moves the page toward the cards. Verified on 20,000 random broken palettes.

**Behaviour rules.**
- A custom theme is selected like any other card (the seventh) and is never swapped for Midnight by "match device appearance".
- While it is active, the global accent control is locked (the Studio owns the accent).
- Bulk actions (generate, surprise, copy a preset, fix) show a toast with Undo (one level). Typing and dragging a colour are not bulk and update the preview continuously.
- Removing the theme needs two clicks. Reset removes it with everything else. Export and import carry it; an imported file with a bad colour loses its custom theme instead of breaking anything.

## Popup

Three labelled groups with space between them: the master switch with CMS and LMS under it (side by side), a THEME grid of six themes plus a seventh row for the custom theme (or "Create your own", which opens the settings on Custom theme), and follow-system. About 583px tall: browsers cap extension popups at roughly 600px, so that is the most room there is.

## Motion and interaction

Press feedback 140-160ms with `transform` only; panels fade in 220ms; nothing loops; reduced motion shortens everything to near zero. No animation on keyboard actions beyond focus rings.

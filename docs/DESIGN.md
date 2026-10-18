# Campuslit design direction

Audience: Bahria students navigating dense academic records and resources daily.
Job: make existing CMS and LMS pages readable, consistent and personal, preserving their behavior.

Version 0.2 direction: a clear, compact appearance editor with a large, readable sample workspace.
Crystal tokens: canvas #f8f9fc, white #ffffff, ink #292d3b, secondary #677083, line #e5e8f0, cobalt #4263eb.
Typography: locally bundled Inter, using a variable weight range. OFL license included. No remote font service. Portal users can also choose native, humanist, or serif families.
Layout: horizontal app header with persistent save, palette gallery above the large preview, and a right-hand inspector. Advanced portal controls use progressive disclosure. The three rising bars in the mark represent personal adjustment; they repeat in the header, popup, and browser icon.

    brand / navigation                         enable / save
    introduction
    theme gallery                  | appearance inspector
    CMS / LMS switch               | accent / typography
    large portal preview           | spacing / corners
    sample-content note            | advanced / import / export

## Design engineering review

| Before | After | Why |
| --- | --- | --- |
| Large navy sidebar and institutional colors | Compact white header and neutral surfaces | Give customization its own identity |
| System font and ornamental serif headline | Bundled Inter with a consistent weight hierarchy | Predictable rendering and cleaner typography |
| Tiny preview alongside a long settings page | Large preview, visible theme gallery, compact inspector | Make visual choices easy to compare |
| Save action obscuring the bottom of the page | Persistent action in the top app header | Keep saving reachable without covering controls |
| Unicode symbols of mixed visual weights | Consistent local SVG line icons | Coherent shape and stroke language |
| All settings exposed at once | Expandable portal preferences | Keep frequent decisions prominent |
| No successful screenshot review | Browser interaction tests and inspected screenshots | Validate actual output at desktop and mobile widths |

Interaction guidance: subtle 140–160 ms press feedback; reduced-motion support; no decorative loops; keyboard focus remains visible; no pressed scaling for focused keyboard controls.

Semantic status colors in the source portal are preserved. The theme changes component surfaces without rebuilding the DOM or guessing student data. The same palettes and bundled font are available to real portal content scripts.

The settings preview is illustrative, not a claim that authenticated university layouts have been reconstructed. Actual component adapters require signed-in visual verification.

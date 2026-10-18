# Release preparation

## Already included

- Separate Chromium and Firefox Manifest V3 builds.
- Local icons at 16/32/48/128 pixels, local assets, strict extension-page CSP.
- User-facing privacy policy, popup and full options page.
- Only storage permission; content-script access limited to the two Bahria portal domains.
- Firefox manifest declares no data collection.

## Still required before public distribution

1. Complete the authenticated page matrix in `COVERAGE.md` and fix real DOM discrepancies.
2. Choose the permanent product name and Firefox extension ID before first signed release. The current ID is a development identifier.
3. Supply a publisher-owned support/contact URL and publish the supplied privacy page at a stable HTTPS URL.
4. Create store screenshots from the real extension, listing copy and a support channel. Clearly disclose independence from Bahria University and actual verified coverage.
5. Zip the contents of each build directory (manifest at archive root), submit through the publisher's Chrome Web Store and Firefox Add-ons accounts, and complete their review/signing processes.
6. Test installed store builds and their update paths. Store acceptance and publication have not occurred.

Suggested summary: Personalize Bahria CMS and LMS with five curated themes and easy appearance controls. Preferences stay in your browser.

Avoid claiming university endorsement, security certification, or verified support for all pages until there is evidence. The privacy promise applies to extension behavior; it cannot promise that the university portals send no data.

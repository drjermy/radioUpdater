# Changelog

## 3.2.1

### Fixed
- Duplicate CiteItRight button when Radiopaedia renders its native link after the extension loads (race condition)
- Native CiteItRight links (leading to a 404) not removed on case edit pages
- Duplicate extension buttons if MutationObserver fires multiple times for the same textarea

## 3.2

### Changed
- CiteItRight API migrated from citeitright.co.uk to radiopaedia.work/cite
- Host permission updated from citeitright.co.uk to radiopaedia.work
- Renamed citeitright.js to cite.js

## 3.1

### Fixed
- setupNewReference now creates buttons for dynamically added references instead of crashing on null elements
- MutationObserver null check in case edit pages (matching existing fix in article edit)
- Duplicate event listeners no longer stack when MutationObserver fires repeatedly
- Dropped message ports from rapid hovering no longer crash the extension
- Stuck "Searching" state recovers after 35s if the service worker dies mid-request

### Improved
- Hover trigger debounced (300ms) so rapid mouse movement doesn't fire API calls
- API requests serialized — only one hover-triggered request at a time
- Extension context invalidation detected with a banner prompting the user to refresh
- Graceful error handling when extension is reloaded while a page is open

### Added
- README with installation, updating, and usage instructions for editors
- Privacy policy (PRIVACY.md) for Chrome Web Store submission
- Vitest test suite covering sanitizeHTML, decodeHTML, createButton, createHiddenDiv, and fetchWithTimeout

## 3.0

### Removed
- Q button on article view pages (quick link to question creation)
- AutoQuestion AI-powered question generation on question creation pages
- ai.radiopaedia.work API integration
- Error reporting to citeitright.co.uk/report (endpoint no longer exists)

### Fixed
- MutationObserver crash when mutations have no added nodes or no textarea
- copyCitation crash when accepting a citation that was an exact match (no diff div)
- JSON parse errors from bad API responses no longer crash the extension silently
- Buttons no longer get permanently stuck in disabled state if the API hangs (30s timeout)

### Improved
- Sanitize diff HTML from API responses to prevent XSS
- Button state logic uses data attributes instead of display text comparisons
- Content scripts only run in top frame, not iframes (all_frames: false)
- Error reporting replaced with POST (previously GET with query params)
- Removed unused helper functions (insertAfter, kebabCase, addIdByQuery)

## 2.5

- Fix CiteItRight buttons
- Correctly determine final part of path

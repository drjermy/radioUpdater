# Changelog

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

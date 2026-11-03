# Changelog

## 3.12

### Added
- Lint shows the linter's suggested fix for far more findings, not only a missing Oxford comma, and **Apply** makes the change. Links inside the words are kept, so a bracketed e.g. can become an inline one
- Lint says so when the editor has already removed a space it found in the published text, so saving the article is all that is left to do

### Fixed
- A Lint finding about a heading now marks the heading, not a bullet earlier in the article with the same words

## 3.11

### Added
- A reference that has been retracted, or has an expression of concern, shows a warning with a link to the notice, under the reference and in the citation picker before you add it

### Changed
- **CiteItRight** is now **Check reference**, a button you click to check a reference and to check it again. Hovering over it no longer checks anything
- **Lint** on an article page is now **Lint article** in the menu beside **Edit article**, beneath **Review article**

### Fixed
- A reference you have removed no longer appears in the citation picker or counts in renumbering

## 3.10

### Added
- Article linter, by Giorgio (from his Radiopaedia Lint userscript): a **Lint** button beside the article title and in the editor toolbar that marks the radiopaedia.work linter's findings on the text in the editor, with what each says on pointing at it and Ignore or, for a missing Oxford comma, Apply. It asks only when pressed. Uninstall the userscript, or each article gets two buttons.

## 3.9

### Added
- Hovering a citation in an article shows the references it cites, links included

## 3.8

### Added
- "Renumber references" button beside "Check all references": numbers the references in the order the text first cites them, as Zotero and EndNote do, and rewrites every citation to match. It shows every change first, with each citation that will change marked in the text in red and green, refuses a list with duplicate or missing numbers, and "Undo renumbering" puts the text and the references back. A superscript is renumbered only in a citation's position; one that could be a citation anywhere else (an isotope such as ¹⁸F, a number after a unit) is marked in amber and has to be decided first

### Fixed
- Every box in the References section counts as a reference, so the citation picker and renumbering no longer skip one with no year, DOI, PubMed link or ISBN in it

## 3.7

### Added
- Citation picker, by Giorgio (from his Radiopaedia Cite userscript): a button in the article editor's toolbar to cite the article's references at the caret, or look up a DOI, PMID, ISBN or URL and add it as the next reference, plus a special characters picker. Opened on an existing citation, it starts with that citation's references picked, to add to or remove from. Uninstall the userscript, or each editor gets two buttons.

## 3.6.3

### Changed
- A reference no source has shows an amber "Not found" instead of a red "Error"

## 3.6.2

### Fixed
- A reference link whose text is a long URL is labelled by its hostname

## 3.6.1

### Fixed
- Status button right-aligned on references with no links to show

## 3.6

### Added
- "Check all references" button that checks every reference on the page in batches, retrying when rate-limited

### Changed
- Cite requests use the versioned radiopaedia.work API (`/api/v1/citations`)

### Fixed
- Error when the page adds non-element nodes (e.g. text) while the extension watches for new reference boxes

## 3.3

### Fixed
- CiteItRight buttons not appearing on newly added article reference boxes (cloned template buttons had wrong data-textarea and no event listeners)
- CiteItRight buttons not appearing on newly added case reference boxes (observer condition prevented detection of in-place DOM updates)

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

# RadioUpdater

A Chrome extension for Radiopaedia editors that checks and formats references using [CiteItRight](https://citeitright.co.uk).

## What it does

When editing an article or case on Radiopaedia, RadioUpdater adds a **CiteItRight** button next to each reference. Hover over the button to check a reference, or click it to refresh.

- **Match** — the reference is already correctly formatted
- **Review** — hover the status button to see the suggested changes, then click to accept
- **Undo** — revert to the original reference if needed
- **Error** — the reference could not be parsed

## Installation

1. Download this repository as a ZIP file (click the green **Code** button on GitHub, then **Download ZIP**)
2. Unzip the downloaded file
3. Open Chrome and go to `chrome://extensions`
4. Turn on **Developer mode** using the toggle in the top-right corner
5. Click **Load unpacked**
6. Select the `radioUpdater` folder inside the unzipped download (the folder that contains `manifest.json`)
7. The extension icon should appear in your Chrome toolbar

## Updating

To update to a new version:

1. Download the latest ZIP and unzip it
2. Go to `chrome://extensions`
3. Find RadioUpdater and click the refresh icon, or remove it and repeat the installation steps

## Usage

1. Navigate to any article or case **edit page** on Radiopaedia
2. Each reference textarea will have a **CiteItRight (hover)** button beneath it
3. Hover over the button to automatically check the reference
4. If changes are suggested, the status button will show **Review** — hover it to preview the diff, click to apply
5. Click **Undo** on the status button if you want to revert

## Testing

Tests use [Vitest](https://vitest.dev/) with jsdom for DOM API support. The test suite covers the security-critical and utility functions — the parts where bugs are hardest to catch manually.

```
npm install
npm test
```

**What's tested:**
- `sanitizeHTML` — XSS prevention (script injection, event handler attributes, iframes, etc.)
- `decodeHTML` — HTML entity decoding edge cases
- `createButton` / `createHiddenDiv` — DOM helper output
- `fetchWithTimeout` — timeout abort, error handling, option passthrough

DOM manipulation and Chrome API integration (content scripts, message passing) are verified manually since they depend on the live Radiopaedia page and Chrome extension runtime.

## Credits

Jeremy Jones, Community Director

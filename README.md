# RadioUpdater

A Chrome extension for Radiopaedia editors that checks and formats references using [Cite](https://radiopaedia.work/cite).

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

## Renumbering references

**Renumber references**, next to **Check all references**, numbers the references in the order the text first cites them, as Zotero and EndNote do, and rewrites every citation to match. The first reference cited becomes 1, the next one not cited before becomes 2, and so on. References the text never cites move to the end, in their current order. Citations are rewritten sorted, with runs of three or more as a range (`2-4`).

1. Click **Renumber references**. A small preview opens in the bottom right corner of the window, so the text stays in view. In the article text, each citation that will change is struck through in red, with its new number in green beside it; **‹ ›** go through them one at a time, scrolling the text to each. **References in the new order** opens the list, one line per reference with the number it had. Nothing has changed yet: the colours are drawn over the text and are not part of it, and clicking in the text does not close the preview.
2. If the preview lists superscripts under **Could these be citations?**, decide each one with **Citation** or **Not a citation**. They are marked in amber in the text, and clicking one in the list scrolls to it. **Renumber** stays disabled until every one is decided.
3. Click **Renumber** to apply it, or **Cancel**.
4. Click **Undo renumbering** to put the text and the references back as they were. In the article text, one ctrl-Z also undoes all the citations at once.

Nothing is saved until you save the page.

- A citation is read by the number written in front of a reference, so the list must be consistent first. If two references have the same number, or the text cites a number no reference has, the preview says so and nothing is changed.

### How citations are recognised

The text only has `<sup>3</sup>`, and the same tag is used for units, exponents and isotopes. Each superscript with a digit in it is read with the text either side of it in its paragraph, and put in one of three groups:

| Group | What happens | When |
|---|---|---|
| Citation | renumbered | Only digits, commas and hyphens, citing numbers the reference list has. Before it, a space after a word, the start of the paragraph, or no space after a lower-case word of 3 or more letters, a full stop or a closing bracket (`cases<sup>23</sup>`). After a number, only a year or a number of 100 or more (`in 1890 <sup>10</sup>`). After it, punctuation, the end of the paragraph, or a space and a word in lower case. |
| Doubt | marked in amber, decided by you | Cites numbers the list has, in any other position: written against a capital, a digit, a comma or a short word (`mv<sup>2</sup>`, `10<sup>5</sup>`, `2,<sup>4,9</sup>`), after a number under 100, a 2 or 3 after a unit (`5 mm <sup>2</sup>`), or a letter, digit, sign, capital letter or element name after it. `<sup>18</sup>F-FDG`, `<sup>18</sup> FDG` and `<sup>18</sup> fluorine` are doubts. |
| Not a citation | left as it is, listed in the preview | A letter or `+` in it (`99m`, `2+`), a negative exponent (`-3`), `mm²`/`cm³` written against the unit, a power of ten (`× 10⁹`), or numbers no reference has (`<sup>18</sup>F` in an article with 10 references). |

A citation that is not recognised keeps its old number and points at the wrong reference after renumbering, so anything that could be a citation is a doubt, never skipped. Text after a superscript is read across bold and links, so `<sup>18</sup><strong>F</strong>` is a doubt too, and stops at a nested list or a line break. A space just inside the tag (`<sup>9 </sup>and`) counts as a space, and is kept when the number is rewritten. A superscript with a reference's number and stray punctuation in it (`3.`, `2:`, `2.3`, `,2`) stops renumbering until it is corrected by hand.

One case is not caught: an isotope written with a space before and after it, followed by a word in lower case that is not an element name, with a mass number no larger than the number of references. It still shows in red and green in the preview.

### Notes

- The reference boxes stay in place and their text is swapped, so a box's **CiteItRight** status may refer to its previous text. Hover the button again to check it.

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
- `renumberPlan` / `renumberReference` / `classifySuperscript` — the citation-order numbering, how citations are told from units, exponents and isotopes, and the **Renumber references** preview, apply and undo on a mock edit page

DOM manipulation and Chrome API integration (content scripts, message passing) are verified manually since they depend on the live Radiopaedia page and Chrome extension runtime.

## Credits

Jeremy Jones, Community Director

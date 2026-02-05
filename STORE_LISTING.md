# Chrome Web Store Listing

Copy these into the Chrome Web Store Developer Dashboard when submitting.

## Name

RadioUpdater

## Summary (132 chars max)

Check and format Radiopaedia article and case references using CiteItRight, directly from the edit page.

## Description

RadioUpdater adds citation checking to Radiopaedia article and case edit pages using the CiteItRight reference formatting service.

When editing an article or case, each reference field gets a CiteItRight button. Hover to check the reference, or click to refresh. The extension compares your reference against CiteItRight's database and shows one of the following:

- Match: the reference is already correctly formatted
- Review: hover to preview the suggested changes, click to apply them
- Undo: revert to the original reference if the suggestion isn't right
- Error: the reference could not be parsed

RadioUpdater is built for Radiopaedia editors and contributors who want to keep references consistent and correctly formatted without leaving the edit page.

No personal data is collected. Reference text is sent to citeitright.co.uk only when you interact with the button.

## Category

Productivity

## Permission justifications

These are entered per-permission in the Privacy tab of the developer dashboard.

**Host permission: `https://*.radiopaedia.org/*`**

This extension adds CiteItRight citation-checking buttons to reference fields on Radiopaedia article and case edit pages. Access to radiopaedia.org is required to inject these buttons into the page and read the reference text from form fields.

**Host permission: `https://citeitright.co.uk/*`**

Reference text from Radiopaedia edit page fields is sent to the CiteItRight API (citeitright.co.uk) for citation formatting and verification. This is the core functionality of the extension and requires access to this domain to make API requests from the background service worker.

## Single purpose

Format and verify Radiopaedia article and case references using the CiteItRight citation service.

## Screenshots needed

1. An article edit page showing CiteItRight buttons next to references (1280x800 or 640x400)
2. A reference with "Review" status showing the diff preview on hover
3. A reference showing "Match" status after successful verification

## Promotional tile needed

440x280px PNG or JPEG with the extension icon and name.

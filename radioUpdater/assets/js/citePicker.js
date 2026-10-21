// Radiopaedia Cite, by Giorgio (https://github.com/gmadevs/radiopaedia-citation-manager),
// MIT licensed, ported from userscript v1.5.7. It runs in the page itself ("world":
// "MAIN" in manifest.json) so that it can reach the page's TinyMCE editors; the
// changes for radioUpdater are marked "radioUpdater:".


/*
 * How this hangs together
 * -----------------------
 * Citing a paper on Radiopaedia is two things that live at opposite ends of
 * the edit page and have to agree with each other: a `<sup>` marker in the
 * prose, and a numbered line in the reference list at the bottom. The number
 * is the only thing joining them. Nothing on the page checks that it is the
 * right one, and by the twentieth reference nobody remembers which paper is
 * eleven — so the marker gets typed from memory, or by scrolling down, losing
 * the caret, scrolling back up and hoping.
 *
 * This is the other way round: the caret stays where it is, and the list comes
 * to it. One button in the editor's own toolbar, beside H3; one panel; you
 * type; you press return.
 *
 * Three things can be asked of it, and they are the three things a person
 * actually wants:
 *
 *   - cite one of the references already down there. Type any word of it —
 *     author, journal, year, the number itself — and the list narrows the way
 *     Zotero's does. Return puts the marker in.
 *   - cite the last one you added, which is the commonest of all: you have
 *     just written a paragraph out of the paper you added a minute ago. It is
 *     the row the panel opens on, so that press is open-and-return and nothing
 *     else.
 *   - cite a paper that is NOT down there yet. Paste anything the citation
 *     tool can resolve — a DOI, a PMID, a PMCID, a PII, an ISBN, a Google
 *     Books volume id, or a URL to the paper, to a Wikipedia page, to any
 *     website — and it is looked up on radiopaedia.work/cite, shown to you in
 *     full, and on your say-so added as the next numbered reference AND cited
 *     in the text, in one press.
 *
 *     Which of those it is decides where the offer stands in the list, and
 *     that is not a cosmetic decision: an identifier is unambiguous, so it
 *     goes first and return looks it up. Words are not — "ependymoma" is
 *     overwhelmingly "cite the ependymoma paper I already have" — so a plain
 *     search goes last, under the references it might have meant.
 *
 * Where the number goes, and in what shape
 * ----------------------------------------
 * A marker is `<sup>1</sup>` with a space in front of it — `haemangioblastoma)
 * <sup>1</sup>.` — and it sits INSIDE the sentence, before the full stop. Both
 * of those are house style and both are easy to get wrong by hand, so neither
 * is left to the hand: the space is added when the character before is not one
 * already, and a caret parked immediately after a sentence's full stop hops
 * back over it rather than dropping the marker outside the sentence.
 *
 * When the caret is already beside a marker, the number joins it instead of
 * standing a second `<sup>` next to the first: `<sup>2</sup>` and 3 becomes
 * `<sup>2,3</sup>`, and three or more in a row close up into a range —
 * `<sup>2-4</sup>`. Written back out from the numbers, so the list also comes
 * back sorted and deduplicated, which is the other thing hand-typed markers
 * get wrong.
 *
 * What it writes, and what it does not
 * ------------------------------------
 * The marker is asked for the way a person would ask for it — the editor's own
 * insert where there is one, otherwise the number typed and then ⌘. (ctrl-.
 * away from a Mac) pressed on it. Not for tidiness: an editor that keeps its
 * own model of the document renders the page from that model, and a `<sup>`
 * that never went through it is gone at the next render, leaving the number in
 * the running text at full size. Typing survives; markup written behind the
 * editor's back does not. `raiseHere` has the order and the reasons.
 *
 * Two places, both of them yours to undo: the `<sup>` in the editor, and a new
 * box in the reference list with `N. …` in it. Nothing is saved — the form is
 * still sitting there unsubmitted, and every marker can be selected and
 * deleted like any other text. The fetched citation also goes to the clipboard
 * on its way past, so a lookup is never lost even if the box could not be
 * created.
 *
 * The reference itself is never rewritten. If what is already down there
 * differs from what the databases say, that is a job for the citation linter
 * (radiopaedia-lint's `Lint citation` chip) and not for a tool whose business
 * is the number.
 *
 * What it costs
 * -------------
 * One request, to radiopaedia.work/cite, per lookup you confirm — and a lookup
 * only ever happens because you typed an identifier and pressed return.
 * Reading the references costs nothing: they are in the form. The answer is
 * kept for the tab, so pasting the same PMID twice asks once.
 */

(function () {
  'use strict';

  // radioUpdater: GM_addStyle, for a script that is not in a userscript manager.
  function addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* Two or more consecutive numbers can be written as a range, and how many
   * it takes is a house rule rather than a law: Radiopaedia writes 2,3 for a
   * pair and 2-4 from three up. Set this to 2 and a pair closes up as well. */
  const RANGE_FROM = 3;

  /* A caret sitting immediately after a full stop is a caret that meant to be
   * just inside the sentence — that is where the marker belongs. Set to false
   * to put the marker exactly where the caret is and nowhere else. */
  const HOP_PUNCTUATION = true;

  /* The citation worker: give it a PMID, a DOI, an ISBN, a URL or a reference,
   * and it works out for itself what to look up and which of Crossref, PubMed,
   * Google Books or Elsevier to ask. radioUpdater: asked through the extension
   * (citePickerBridge.js, then background.js), at radiopaedia.work's citation
   * API, as the reference checker is. */
  const CITE_TIMEOUT = 60_000;      // somebody else's database is at the far end of it
  const CITE_KEY = 'rcx-cite:';     // one answer, for this tab's session

  const BOX_TIMEOUT = 6_000;        // how long a new reference box gets to appear
  const CONTEXT_CHARS = 46;         // how much of the sentence the panel shows back

  // ————————————————————————————————————————————————————————————— text

  /* One line of it, whatever came in. */
  function tidy(v) {
    return String(v ?? '').replace(/\s+/g, ' ').trim();
  }

  /* Typography folded onto its plain forms, and the invisible characters taken
   * out altogether. `\s` in JavaScript does not cover the zero-width space and
   * Radiopaedia's text is full of them; one of those inside a `<sup>` is
   * enough for a perfectly good marker to read as something that is not a
   * marker at all. */
  function fold(s) {
    return String(s ?? '')
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—−]/g, '-')
      .replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* The text of something that arrived as markup. A reference is stored with
   * its `<a>` tags spelled out, and what a person reads in a list of them is
   * the words. `DOMParser` rather than an `innerHTML` on a detached node: the
   * document it builds is inert, so nothing in there runs, loads or fetches.
   * Strings with no `<` in them skip it, which is most of them. */
  function plain(html) {
    const raw = String(html ?? '');
    if (!raw.includes('<')) return fold(raw);
    return fold(new DOMParser().parseFromString(raw, 'text/html').body.textContent);
  }

  // Not a checksum: a short, stable key for a long string.
  function shortHash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }

  const ordinal = (n) => {
    const tens = n % 100, ones = n % 10;
    const suffix = tens >= 11 && tens <= 13 ? 'th'
      : ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th';
    return `${n}${suffix}`;
  };

  /* Is this the edit form?
   *
   * The path says so on every edit page there is — but the path is a
   * convention and the form is a fact, so when it does not match, the
   * reference boxes are asked instead. "Format citation" appears under every
   * one of them and nowhere else on the site. */
  function inEditor() {
    if (/\/edit(?:\/|$)/.test(location.pathname)) return true;
    for (const el of document.querySelectorAll('a, button')) {
      if (tidy(el.textContent).toLowerCase() === FORMAT_LINK) return true;
    }
    return false;
  }

  // ——————————————————————————————————————————————————————— the numbers

  /* What a marker says, as numbers.
   *
   * `<sup>2,4,6</sup>`, `<sup>2-4</sup>`, `<sup>1</sup>` — and `null` for
   * anything else, which is the answer that matters. A `<sup>` is not
   * necessarily a citation: articles use it for units and for exponents, and
   * merging a new reference number into `cm<sup>3</sup>` would be a strange
   * way to lose an article. Only a superscript made of digits, commas and
   * hyphens is one of ours, and even then a backwards or absurd range
   * ("3-1", "1-400") is read as arithmetic rather than as a citation. */
  function markerNumbers(text) {
    const s = fold(text).replace(/\s+/g, '');
    if (!s || !/^[\d,-]+$/.test(s)) return null;
    const out = [];
    for (const part of s.split(',')) {
      const span = /^(\d{1,3})-(\d{1,3})$/.exec(part);
      if (span) {
        const from = +span[1], to = +span[2];
        if (to <= from || to - from > 60) return null;
        for (let n = from; n <= to; n++) out.push(n);
        continue;
      }
      if (!/^\d{1,3}$/.test(part)) return null;
      out.push(+part);
    }
    return out.length ? out : null;
  }

  /* And back the other way: the numbers, sorted, deduplicated, with runs of
   * consecutive ones closed up into ranges. This is the only place a marker's
   * text is ever written, which is why a marker this script has touched is
   * always in order even when what it merged into was not. */
  function markerText(numbers) {
    const nums = [...new Set(numbers)].filter((n) => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b);
    const parts = [];
    for (let i = 0; i < nums.length;) {
      let j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      if (j - i + 1 >= RANGE_FROM) { parts.push(`${nums[i]}-${nums[j]}`); i = j + 1; }
      else { parts.push(String(nums[i])); i++; }
    }
    return parts.join(',');
  }

  // —————————————————————————————————————————————————— the reference list

  /* A reference, on the edit page, is a `<textarea>`: one per reference,
   * holding the citation as source — the number, the text, and the `<a>` tags
   * spelled out rather than rendered — with Radiopaedia's own "Format
   * citation" link underneath it.
   *
   * That link is what says a box is a reference box. Behind it, for the day it
   * is renamed, the shape of the value answers instead: a box whose text opens
   * with its own number and carries a DOI, a PMID, an ISBN or a year. The
   * article body is a textarea too — a big one, with no number at the front of
   * it — and this is what keeps it out of the list.
   *
   * Walked in document order, because the order IS the numbering: a
   * reference's number is right when it is the number of its place in the
   * list, and its place in the list is where its box sits on the page. */
  const REF_NUM = /^(\d{1,3})\s*[.)]\s+(?=\S)/;
  const REF_SIGNS =
    /(?:\bdoi[:.]|10\.\d{4,9}\/|pubmed|ncbi\.nlm\.nih\.gov|\bisbn\b|books\.google|\b(?:19|20)\d{2}[;:(]|\((?:19|20)\d{2}\))/i;
  const FORMAT_LINK = 'format citation';
  const ADD_LINK = 'add another reference';

  function referenceBoxes() {
    const anchors = new Set();
    for (const link of document.querySelectorAll('a, button')) {
      if (tidy(link.textContent).toLowerCase() !== FORMAT_LINK) continue;
      const box = boxFor(link);
      if (box) anchors.add(box);
    }

    const rows = [];
    for (const input of document.querySelectorAll('textarea')) {
      const raw = fold(input.value);
      const numbered = REF_NUM.exec(raw);
      const known = anchors.has(input);
      if (!known) {
        if (raw.length < 24 || !numbered || !REF_SIGNS.test(raw)) continue;
      } else if (raw.length < 8) {
        // A box somebody has opened and not filled in yet. It is a reference
        // in waiting, not one you can cite.
        continue;
      }
      rows.push(readRow(input, rows.length + 1));
    }
    return rows;
  }

  /* The box a link belongs to: the nearest ancestor holding a textarea, within
   * a few steps. Not `previousElementSibling` — the link sits under the box on
   * screen, and whatever markup lies between them is Radiopaedia's business. */
  function boxFor(link) {
    let node = link;
    for (let up = 0; up < 4 && node; up++) {
      node = node.parentElement;
      const input = node?.querySelector('textarea');
      if (input) return input;
    }
    return null;
  }

  /* One reference, as it stands NOW. Typing in a textarea changes no DOM and
   * fires no mutation, so a row read when the page settled would be describing
   * what the reference said then — everything here is read afresh each time
   * the panel opens, and that is cheap enough not to think about. */
  function readRow(input, pos) {
    const raw = fold(input.value);
    const numbered = REF_NUM.exec(raw);
    const body = numbered ? raw.slice(numbered[0].length) : raw;
    const text = plain(body);
    const row = {
      input, pos, raw, text,
      typed: !!numbered,
      n: numbered ? +numbered[1] : null,
      pmid: identifier(raw, 'pmid'),
      pmcid: identifier(raw, 'pmcid'),
      doi: identifier(raw, 'doi'),
      isbn: identifier(raw, 'isbn'),
    };
    // What gets searched: the words, the identifiers, and the number itself —
    // so that typing "12" finds reference 12 and not only the papers with 12
    // in the page range.
    row.hay = [row.n, row.text, row.pmid, row.pmcid, row.doi, row.isbn]
      .filter(Boolean).join(' ').toLowerCase();
    return row;
  }

  /* The identifiers a reference carries, read off the source rather than off
   * the words: the PMID is in the href of the Pubmed link, the DOI is in the
   * href of the doi.org one. Both also appear as text, and both regexes are
   * happy either way — which matters for a reference somebody pasted flat. */
  const ID_PATTERNS = {
    pmid: /(?:pubmed\/|pubmed\.ncbi\.nlm\.nih\.gov\/|\bpmid[:\s]*)(\d{4,9})/i,
    pmcid: /\b(pmc\d{4,9})\b/i,
    doi: /\b(10\.\d{4,9}\/[^\s"'<>)]+)/i,
    isbn: /\bisbn(?:-1[03])?[:\s]*((?:97[89][- ]?)?[\d][\d- ]{7,15}[\dxX])/i,
  };

  function identifier(raw, kind) {
    const hit = ID_PATTERNS[kind].exec(String(raw ?? ''));
    if (!hit) return null;
    // A DOI keeps its punctuation and loses only what a sentence put after it;
    // a PMID and an ISBN are digits, and the spaces and hyphens people write
    // them with are not part of them.
    if (kind === 'doi') return hit[1].replace(/[.,;)]+$/, '').toLowerCase();
    return hit[1].replace(/[\s-]/g, '').toLowerCase();
  }

  /* The number the next reference will have.
   *
   * Two answers, and the bigger one wins. Counting the boxes is right when the
   * list is numbered 1..n, which is the normal state of an article; taking the
   * highest number in it is right when a box has been left unnumbered or the
   * list skips one, where counting would hand out a number that is already
   * taken. Handing out a duplicate is the one failure that quietly sends a
   * marker to the wrong paper, so this errs the other way. */
  function nextNumber(rows) {
    const highest = rows.reduce((max, r) => (r.n && r.n > max ? r.n : max), 0);
    return Math.max(rows.length, highest) + 1;
  }

  /* Is the list numbered the way it stands? Said in the panel rather than
   * fixed here: renumbering an article's references means renumbering every
   * marker in the prose too, and that is a different tool with a different
   * appetite for risk. */
  const misnumbered = (rows) => rows.filter((r) => r.typed && r.n !== r.pos);

  // ————————————————————————————————————————————————————— the lookup

  /* One request, one identifier, one press of return.
   *
   * radioUpdater: a page script cannot make the request itself, so it is handed
   * to citePickerBridge.js, the extension's half in this tab, by `postMessage`,
   * and the API's answer comes back the same way. */
  function askCite(search) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        removeEventListener('message', onAnswer);
        reject(new Error('The citation tool took too long to answer.'));
      }, CITE_TIMEOUT);

      function onAnswer(e) {
        if (e.source !== window || e.data?.type !== 'rcx-cite-answer' || e.data.id !== id) return;
        removeEventListener('message', onAnswer);
        clearTimeout(timer);
        if (!e.data.data) return reject(new Error('The citation tool could not be reached.'));
        resolve(citeState(e.data.data));
      }

      addEventListener('message', onAnswer);
      window.postMessage({ type: 'rcx-cite-ask', id, search }, location.origin);
    });
  }

  /* The API's answer, in the shape the panel reads.
   *
   * `citation` is the canonical form, links and all, and it is what goes in
   * the box. `meta` is what the database said about the paper, and it is what
   * the panel shows you before you agree to it: a title and a year read at a
   * glance, where eighty words of citation have to be read. */
  function citeState(data) {
    const meta = data.meta && typeof data.meta === 'object' ? data.meta : {};
    return {
      citation: typeof data.citation === 'string' && data.citation ? tidy(data.citation) : null,
      error: typeof data.error === 'string' ? tidy(data.error) : null,
      title: typeof meta.title === 'string' ? tidy(meta.title) : null,
      journal: typeof meta.journal === 'string' ? tidy(meta.journal) : null,
      year: meta.year == null ? null : String(meta.year),
      pmid: meta.pmid == null ? null : String(meta.pmid),
      doi: typeof meta.doi === 'string' ? meta.doi.toLowerCase() : null,
    };
  }

  /* Kept for the tab. The worker caches behind the same URL anyway, but this
   * saves the round trip when the same PMID is pasted twice — which is what
   * happens when you cite the same paper in two paragraphs and have forgotten
   * that the first one added it. */
  function citeCached(search) {
    try {
      const raw = sessionStorage.getItem(CITE_KEY + shortHash(search));
      const said = raw ? JSON.parse(raw) : null;
      return said && typeof said === 'object' ? said : null;
    } catch { return null; }
  }

  function rememberCite(search, said) {
    try { sessionStorage.setItem(CITE_KEY + shortHash(search), JSON.stringify(said)); }
    catch { /* quota: never mind, it is one more request */ }
  }

  /* What kind of thing has been typed, if it is a thing at all.
   *
   * The tool works this out for itself and would take the string either way;
   * the point of doing it here as well is the WORDING of the row you are about
   * to press return on. "Look up PMID 23079405" and "Search for peritoneal
   * carcinomatosis" promise different amounts, and the second one is a promise
   * this cannot always keep — the tool resolves identifiers, and a title it
   * has no identifier for comes back with nothing found. Saying which of the
   * two is being asked is the difference between a tool that failed and a tool
   * that told you what it was going to try. */
  const KINDS = [
    ['PMID', /^\d{6,9}$/],
    ['PMID', /^pmid[:\s]*\d{4,9}$/i],
    ['PMCID', /^(?:pmcid[:\s]*)?pmc\d{4,9}$/i],
    ['DOI', /^(?:doi[:\s]*|https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+$/i],
    // Elsevier's item identifier, punctuated or not: S0140-6736(20)30183-5,
    // S0140673620301835, and the book form B978-0-12-374984-0.00001-1.
    ['PII', /^[SB]\d[\d\-().Xx]{8,30}$/],
    ['ISBN', /^isbn[:\s-]*[\dxX -]{9,20}$/i],
    ['ISBN', /^(?:97[89][- ]?)?[\d][\d -]{7,15}[\dxX]$/],
    /* A Google Books volume id is twelve characters of base64-ish noise —
     * `zyTCAlFPjgYC` — and nothing about its shape says "identifier". The
     * lookaheads are what keep a twelve-letter English word ("conservative",
     * "haemorrhagic") out of it: a volume id carries a capital or a digit as
     * well as small letters, and a word does not. */
    ['Google Books', /^(?=.*[a-z])(?=.*[A-Z0-9])[A-Za-z0-9_-]{12}$/],
    ['URL', /^(?:https?:\/\/|www\.)\S+$/i],
  ];

  function lookupKind(query) {
    const q = tidy(query);
    if (!q) return null;
    for (const [kind, test] of KINDS) if (test.test(q)) return kind;
    return q.length >= 6 ? 'search' : null;
  }

  /* Is this thing already down there? Pasting a PMID you have cited before is
   * not a mistake to be told off for — it is the commonest way of asking
   * "which number was that paper again?", and it deserves the answer rather
   * than a second copy of the reference. */
  function alreadyCited(rows, query) {
    const q = tidy(query).toLowerCase();
    if (!q) return null;
    const doi = /(10\.\d{4,9}\/\S+)/.exec(q)?.[1]?.replace(/[.,;)]+$/, '');
    const pmid = /^(?:pmid[:\s]*)?(\d{4,9})$/.exec(q)?.[1];
    const pmcid = /^(?:pmcid[:\s]*)?(pmc\d{4,9})$/.exec(q)?.[1];
    /* A URL is compared as a substring of the reference, without its scheme
     * and its trailing slash: the reference carries it inside an `<a href>`,
     * where an exact comparison would be comparing a link to a citation. */
    const url = /^(?:https?:\/\/|www\.)\S+$/.test(q)
      ? q.replace(/^https?:\/\//, '').replace(/\/+$/, '') : null;
    if (!doi && !pmid && !pmcid && !url) return null;
    return rows.find((r) =>
      (doi && r.doi === doi) ||
      (pmid && r.pmid === pmid) ||
      (pmcid && r.pmcid === pmcid) ||
      (url && url.length > 12 && r.raw.toLowerCase().includes(url))) || null;
  }

  // ————————————————————————————————————————— writing the new reference

  function addButton() {
    for (const el of document.querySelectorAll('a, button')) {
      if (tidy(el.textContent).toLowerCase() === ADD_LINK) return el;
    }
    return null;
  }

  /* Press Radiopaedia's own "Add another reference", wait for the box it makes,
   * and put the citation in it.
   *
   * Their button rather than markup of our own: the form is a Rails nested
   * field set and the names of the inputs carry indices that have to line up
   * with what the server expects. Clicking the thing that knows how to do that
   * is the only way to get a box that will actually save.
   *
   * The value is set through the prototype's own setter and followed by
   * `input` and `change`. A plain `el.value = …` is enough for a plain form,
   * and is silently not enough for anything watching the field — this costs
   * three lines and covers both. */
  async function addReference(text) {
    const add = addButton();
    if (!add) {
      throw new Error('Cannot find Radiopaedia’s "Add another reference" button. ' +
                      'The citation is on the clipboard — add the box yourself and paste it.');
    }
    const before = new Set([...document.querySelectorAll('textarea')]);
    add.click();

    const box = await new Promise((resolve) => {
      const deadline = Date.now() + BOX_TIMEOUT;
      (function poll() {
        for (const el of document.querySelectorAll('textarea')) {
          if (!before.has(el) && !el.value.trim()) return resolve(el);
        }
        if (Date.now() > deadline) return resolve(null);
        setTimeout(poll, 120);
      })();
    });
    if (!box) {
      throw new Error('The new reference box did not appear. The citation is on the ' +
                      'clipboard — paste it into a box yourself.');
    }

    setValue(box, text);
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    box.classList.add('rcx-fresh');
    setTimeout(() => box.classList.remove('rcx-fresh'), 2400);
    return box;
  }

  function setValue(el, value) {
    const own = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (own?.set) own.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ————————————————————————————————————————————————————— the editor

  /* Radiopaedia edits in a WYSIWYG: the text may live in an iframe or in a
   * contenteditable, and an edit page has more than one of them — the article
   * body, and whatever else the form is asking for. Each one gets its own
   * button, its own caret and its own panel, because a citation belongs in the
   * field it was asked for from. */
  const EDITOR_SELECTORS = [
    'iframe.tox-edit-area__iframe',
    'iframe[id$="_ifr"]',
    'div.tox-edit-area [contenteditable="true"]',
    'div.mce-content-body[contenteditable="true"]',
    'trix-editor',
    'div.ql-editor',
    '[contenteditable="true"]',
  ];

  function editableWithin(scope) {
    const found = [];
    const seen = new Set();
    for (const sel of EDITOR_SELECTORS) {
      for (const el of scope.querySelectorAll(sel)) {
        if (el.closest('.rcx-panel') || seen.has(el)) continue;
        seen.add(el);
        if (el.tagName === 'IFRAME') {
          let doc = null;
          try { doc = el.contentDocument; } catch { /* never on someone else's iframe */ }
          if (!doc?.body) continue;
          found.push({ root: doc.body, doc, frame: el, host: el });
          continue;
        }
        found.push({ root: el, doc: el.ownerDocument, frame: null, host: el });
      }
    }
    // A contenteditable nested inside one already taken is the same text twice.
    return found.filter((a, i) =>
      !found.some((b, j) => j < i && !b.frame && b.root !== a.root && b.root.contains(a.root)));
  }

  /* Where the button goes.
   *
   * Beside H3, in the editor's own toolbar — and the search runs from the TEXT
   * outwards rather than from the toolbar inwards. Which way round it goes is
   * the difference between a button that appears and a button that does not.
   *
   * The first version looked for a control whose text was "H3" and worked back
   * from there. That is one assumption too many: it takes the toolbar to be
   * made of `<button>`s, and the heading control to carry its name as text
   * rather than as an icon with a label on it. Get either wrong and there is
   * no button anywhere on the page and nothing to say why.
   *
   * A contenteditable, on the other hand, is not a matter of opinion. So: find
   * the text, walk up from it until an ancestor holds a row of controls
   * standing BEFORE that text, and take the biggest such row — that is the
   * toolbar, whatever it is built out of. Then, inside it, stand beside H3 if
   * H3 is there to be found (by its text, or by the label a screen reader
   * would read out), beside H2 or H1 if it is not, and at the end of the row
   * if none of them can be recognised. The end of the row is where the
   * headings are anyway.
   *
   * And if there is no row of controls at all, the button still appears —
   * pinned to the corner of the window. Ugly, and always visible, which is
   * what counts when the alternative is nothing. */
  const CONTROL = 'button, a, [role="button"], input[type="button"], input[type="submit"]';
  const HEADINGS = ['h3', 'h2', 'h1'];

  function toolbarFor(host) {
    let scope = host;
    for (let up = 0; up < 6 && scope?.parentElement; up++) {
      scope = scope.parentElement;

      /* Controls that stand before the text and are not inside it. "Before"
       * is what keeps the form's own Save and Cancel — which come after —
       * from being mistaken for a toolbar. */
      const rows = new Map();
      for (const el of scope.querySelectorAll(CONTROL)) {
        if (el.closest('.rcx-panel') || host.contains(el) || el.contains(host)) continue;
        if (!(host.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)) continue;
        const bar = el.parentElement;
        if (!bar) continue;
        if (!rows.has(bar)) rows.set(bar, []);
        rows.get(bar).push(el);
      }

      /* The row with a HEADING in it wins — not the row with the most in it.
       *
       * A toolbar in groups ("B I x₁ x¹ T̶" | "1. •" | "🔗 ⛓" | "P H1 H2 H3")
       * is four rows, and the first of them is the biggest. Going by size put
       * the button at the end of the formatting group, beside the strike-out,
       * which is both the wrong place and a place where it is easy not to
       * notice it is the wrong place. What we are looking for is not the
       * longest row; it is the row the headings are in. */
      for (const want of HEADINGS) {
        for (const [bar, members] of rows) {
          if (members.length >= 2 && members.some((el) => named(el, want))) return { bar, members };
        }
      }

      // No heading anywhere in this scope: the biggest row, as a last resort.
      let best = null;
      for (const [bar, members] of rows) {
        if (!best || members.length >= best.members.length) best = { bar, members };
      }
      if (best && best.members.length >= 3) return best;
    }
    return null;
  }

  /* Which control to stand beside, and what to call the way we found it —
   * that name goes in the console line, so "why is the button not next to H3"
   * is a question the page can answer by itself. */
  function anchorIn(members) {
    for (const want of HEADINGS) {
      const hit = [...members].reverse().find((el) => named(el, want));
      if (hit) return { el: hit, how: want.toUpperCase() };
    }
    return { el: members[members.length - 1], how: 'end of the toolbar' };
  }

  function named(el, want) {
    if (tidy(el.textContent).toLowerCase() === want) return true;
    const label = tidy(el.getAttribute('aria-label') || el.getAttribute('title') ||
                       el.getAttribute('data-mce-name') || '').toLowerCase();
    return label === want || label === `heading ${want.slice(1)}`;
  }

  // ————————————————————————————————————————————————————— the caret

  /* Where the marker will land, and why it is remembered rather than read.
   *
   * The moment the panel's search box takes the focus, the editor's selection
   * is gone — that is what focus means. So the caret is followed while you
   * type, in the editor's own document, and the last position that was inside
   * the text is the one the panel opens on. It survives clicking away to read
   * a reference, tabbing to another field, and the panel itself.
   *
   * A Range is a pair of live pointers into the DOM. The editor rewrites its
   * own nodes as you type, so one kept from five minutes ago may be pointing
   * at a node that no longer belongs to the document — which is what
   * `liveCaret` is for. */
  const watched = new WeakSet();

  function watchCaret(target) {
    const doc = target.doc;
    if (watched.has(doc)) return;
    watched.add(doc);
    doc.addEventListener('selectionchange', () => {
      const sel = doc.getSelection?.();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      for (const t of editors) {
        if (t.doc === doc && t.root.contains(range.startContainer)) {
          t.caret = range.cloneRange();
        }
      }
    });
  }

  function liveCaret(target) {
    const caret = target.caret;
    if (!caret) return null;
    const node = caret.startContainer;
    if (!node || !node.isConnected || !target.root.contains(node)) return null;
    const range = caret.cloneRange();
    range.collapse(false);
    return range;
  }

  /* The words the caret is sitting after, for the panel to show back. The
   * whole anxiety of a floating picker is "where is this going to end up",
   * and forty characters of the sentence answers it for nothing. */
  function caretContext(target) {
    const range = liveCaret(target);
    if (!range) return null;
    const before = target.doc.createRange();
    const block = blockOf(range.startContainer, target.root);
    before.setStart(block, 0);
    try { before.setEnd(range.startContainer, range.startOffset); } catch { return null; }
    const text = fold(before.toString());
    if (!text) return null;
    return (text.length > CONTEXT_CHARS ? '…' + text.slice(-CONTEXT_CHARS) : text);
  }

  const BLOCKS = 'P,LI,H1,H2,H3,H4,H5,H6,TD,TH,BLOCKQUOTE,DD,DT,DIV';

  function blockOf(node, root) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el && el !== root) {
      if (BLOCKS.includes(el.tagName)) return el;
      el = el.parentElement;
    }
    return root;
  }

  // ——————————————————————————————————————————————— putting the marker in

  /* The one function that writes into the article.
   *
   * Four things happen here and they are worth naming separately, because
   * three of them are house style and the fourth is arithmetic:
   *
   *   1. a marker already beside the caret is JOINED rather than doubled;
   *   2. a caret parked just after a sentence's full stop hops back inside;
   *   3. a space is put in front, when there is not one there already;
   *   4. the numbers are written back out sorted, deduplicated and ranged.
   *
   * Everything is done on Ranges over the editor's own nodes rather than by
   * `execCommand` or by writing HTML: `insertHTML` on a caret that sits inside
   * a `<sup>` produces a nested one, and a nested `<sup>` is a marker that
   * reads right and saves wrong. */
  function insertCitation(target, numbers, replace = false) {
    const range = liveCaret(target);
    if (!range) return { ok: false, why: 'caret' };

    const near = adjacentMarker(target, range);
    if (near) {
      const have = markerNumbers(near.textContent) || [];
      const merged = markerText(replace ? numbers : [...have, ...numbers]);
      if (merged === fold(near.textContent)) {
        settle(target, near);
        return { ok: true, marker: merged, merged: true, already: true };
      }
      const wrote = rewrite(target, near, merged);
      noted(target, merged, { node: wrote, wrote: true, raised: !!wrote, how: 'merge' });
      settle(target, wrote || near);
      return { ok: true, marker: merged, merged: true };
    }

    const at = (HOP_PUNCTUATION && hopPunctuation(range)) || range;
    const text = markerText(numbers);
    const put = raiseHere(target, at, text, wantsSpace(at));
    noted(target, text, put);
    if (!put?.node && !put?.wrote) return { ok: false, why: 'insert' };
    if (put.node) settle(target, put.node); else stirred(target);
    return { ok: true, marker: text, merged: false, raised: put.raised };
  }

  /* What the last marker did on its way in.
   *
   * Nothing reads this to decide anything; it is written down for
   * `radiopaediaCite.look()`, because "the number went in at full size" is a
   * sentence about an editor on somebody else's machine, and the only way to
   * answer it from here is to have the script say which door it went through
   * and what the paragraph looked like afterwards. */
  let lastPut = null;

  function noted(target, text, put) {
    try {
      const block = put?.node ? blockOf(put.node, target.root) : null;
      lastPut = {
        marker: text,
        through: put?.how || 'nothing',
        raised: put?.raised ?? null,
        tinymce: !!editorFor(target),
        superscript: canRaise(target.doc),
        markup: block ? tidy(block.innerHTML).slice(0, 300) : null,
      };
      lookAgain(target, put?.node, block);
    } catch { lastPut = { marker: text, through: put?.how || 'nothing', broke: true }; }
  }

  /* And again a moment later.
   *
   * What the markup says at the instant the marker goes in is not the whole
   * story, and on some editors it is not even the interesting half: an editor
   * that reads its document after every change can take back out what it did
   * not put in, which leaves a `<sup>` that was there when it was checked and
   * a number at full size by the time anybody looks. Those two failures are
   * indistinguishable on screen and want opposite fixes, so the second look is
   * written down beside the first: `raised` is what went in, `after` is what
   * survived — raised, flat, or gone from the document altogether.
   *
   * Nothing is repaired here. This reads, and says what it saw. */
  function lookAgain(target, el, block) {
    const view = target.doc.defaultView;
    if (!el || typeof view?.setTimeout !== 'function') return;
    view.setTimeout(() => {
      try {
        if (!lastPut) return;
        lastPut.after = !target.root.contains(el) ? 'gone'
          : raisedFrom(target, el) ? 'raised'
          : 'flat';
        if (block) lastPut.markupAfter = tidy(block.innerHTML).slice(0, 300);

        /* And said out loud, because this is the failure nobody sees happen.
         * The panel has closed by now and the marker is on screen at full
         * size, looking like something you typed wrong rather than something
         * the editor undid. */
        if (lastPut.after !== 'raised') {
          console.warn('[Radiopaedia Cite] the marker went in and this editor took the ' +
                       `superscript back out — ${lastPut.marker} is in the article at full ` +
                       'size. radiopaediaCite.look() has the detail.');
        }
      } catch { /* the page has moved on, and so has the question */ }
    }, 500);
  }

  function canRaise(doc) {
    const ask = (what) => {
      try { return !!doc[what]?.('superscript'); } catch { return null; }
    };
    return { supported: ask('queryCommandSupported'), enabled: ask('queryCommandEnabled') };
  }

  /* Rewriting a marker that is already there — `<sup>2</sup>` and 3 becoming
   * `<sup>2,3</sup>`.
   *
   * `textContent = merged` is the obvious way and it is the wrong way for the
   * same reason the tag was: an editor with its own model of the document does
   * not see an assignment, and the next thing it renders puts the old number
   * back. Typing it is what a person would do — select what is in the marker,
   * type the new list — and typing is the one thing every editor is listening
   * for. The mark comes along with it, because the selection is inside it.
   *
   * The assignment is still here behind that, for a plain contenteditable with
   * nothing watching it, and for the tests. */
  function rewrite(target, sup, text) {
    const viaTiptap = tiptapReplace(target, sup, text);
    if (viaTiptap) return viaTiptap;

    const doc = target.doc;
    const sel = doc.getSelection?.();
    try {
      if (sel && typeof doc.execCommand === 'function') {
        const over = doc.createRange();
        over.selectNodeContents(sup);
        target.root.focus?.();
        sel.removeAllRanges();
        sel.addRange(over);
        if (doc.execCommand('insertText', false, text)) {
          /* Read back which marker now holds it: the editor may have rebuilt
           * the paragraph around the typing, in which case the `<sup>` that
           * was passed in is a node nobody is looking at any more. */
          const up = raisedNear(target, sel);
          if (up && fold(up.textContent) === text) return up;
          if (target.root.contains(sup) && fold(sup.textContent) === text) return sup;
        }
      }
    } catch { /* fall through to the assignment */ }

    if (!target.root.contains(sup)) return null;
    sup.textContent = text;
    return sup;
  }

  /* Writing a NEW marker, in the editor's own words where it has any.
   *
   * `execCommand` is what the toolbar's own x¹ button runs, so what comes out
   * is exactly the markup THIS editor makes for a superscript — and, more to
   * the point, markup it will not turn round and undo. An editor that keeps a
   * whitelist and runs it over its document whenever something changes it will
   * quietly unwrap a `<sup>` that was put there behind its back, leaving the
   * number in the text at full size: the one failure that looks like it
   * worked, because the number is right there and only the size is wrong.
   *
   * The DOM is the fallback, for a plain contenteditable with no editor around
   * it — and for the tests, where there is no `execCommand` to call. */
  function raiseHere(target, at, text, spaced) {
    return byTiptap(target, at, text, spaced)
        || byEditor(target, at, text, spaced)
        || byCommand(target, at, text, spaced)
        || byNode(target, at, text, spaced);
  }

  /* First choice, where the editor has a front door: TinyMCE's own insert.
   *
   * This is the one that answers the failure this script kept hitting. TinyMCE
   * keeps a schema and runs it over its document, and it has opinions about
   * changes it did not make: a `<sup>` put in through the DOM can be tidied
   * straight back out, and `execCommand('superscript')` — a browser command,
   * issued behind the editor's back — can be declined outright, which leaves
   * the number sitting in the running text at full size.
   *
   * `mceInsertContent` is the same marker put in through the front door. It is
   * what the editor's own buttons call, so the markup goes through the
   * sanitiser as something the editor itself asked for, and lands on the undo
   * stack where ctrl-Z can find it.
   *
   * The id is how the `<sup>` is found again afterwards — TinyMCE decides
   * where the caret ends up, and reading the answer back beats assuming it —
   * and it is taken off again the moment it has been used, so nothing of this
   * script's is left in the article. */
  const PUT_ID = 'rcx-just-put';

  function byEditor(target, at, text, spaced) {
    const ed = editorFor(target);
    if (!ed?.selection?.setRng || typeof ed.execCommand !== 'function') return null;

    const doc = target.doc;
    let gap = null;
    try {
      /* The space by hand here too: a leading space inside the inserted HTML
       * comes back as an `&nbsp;`, and an `&nbsp;` in a saved article is a
       * thing somebody has to come and take out again. */
      let from = at;
      if (spaced) {
        gap = doc.createTextNode(' ');
        at.insertNode(gap);
        from = doc.createRange();
        from.setStartAfter(gap);
        from.collapse(true);
      }

      target.root.focus?.();
      ed.selection.setRng(from);
      /* Only an outright no is taken for a no: TinyMCE answers true when it
       * has handled a command, and a version that answers nothing at all has
       * still handled it. Reading `undefined` as a refusal would send the
       * number down the next path and put it in the article twice. */
      const said = ed.execCommand('mceInsertContent', false, `<sup id="${PUT_ID}">${text}</sup>`);
      if (said === false) {
        unwrite(gap);
        return null;
      }

      const rng = ed.selection.getRng?.();
      const put = doc.getElementById(PUT_ID)
        || (rng && (raisedFrom(target, rng.startContainer) || sideNode(rng, -1)));
      if (put?.id === PUT_ID) put.removeAttribute('id');

      /* The content is in either way — asking for it again down the other
       * paths would put the number in twice — so `wrote` is the answer even
       * when the node cannot be pointed at, and `raised` is read from what is
       * actually there rather than from what was asked for. */
      const node = put?.tagName === 'SUP' && fold(put.textContent) === text ? put : null;
      return { node, wrote: true, raised: !!node, how: 'editor' };
    } catch {
      unwrite(gap);
      return null;
    }
  }

  /* radioUpdater: Radiopaedia's editor is Tiptap, which keeps its editor on the
   * `.ProseMirror` element. Typing over a marker there leaves part of the new
   * numbers outside the superscript ("5,<sup>10</sup>"), so where it is
   * available the marker goes in through Tiptap's own commands instead, as
   * text with the superscript mark on all of it. */
  function tiptapFor(target) {
    const ed = target.root?.editor || target.root?.closest?.('.ProseMirror')?.editor;
    return ed?.view && typeof ed.commands?.insertContentAt === 'function' && ed.schema?.marks?.superscript
      ? ed : null;
  }

  function tiptapSup(target, ed, text, at) {
    const up = raisedFrom(target, ed.view.domAtPos(at).node);
    return up && fold(up.textContent) === text ? up : null;
  }

  function byTiptap(target, at, text, spaced) {
    const ed = tiptapFor(target);
    if (!ed) return null;
    try {
      const pos = ed.view.posAtDOM(at.startContainer, at.startOffset);
      const content = [{ type: 'text', text, marks: [{ type: 'superscript' }] }];
      if (spaced) content.unshift({ type: 'text', text: ' ' });
      if (!ed.chain().focus().insertContentAt(pos, content).run()) return null;
      const node = tiptapSup(target, ed, text, pos + (spaced ? 2 : 1));
      return { node, wrote: true, raised: !!node, how: 'tiptap' };
    } catch {
      return null;
    }
  }

  function tiptapReplace(target, sup, text) {
    const ed = tiptapFor(target);
    if (!ed) return null;
    try {
      const from = ed.view.posAtDOM(sup, 0);
      const to = ed.view.posAtDOM(sup, sup.childNodes.length);
      const content = { type: 'text', text, marks: [{ type: 'superscript' }] };
      if (!ed.chain().focus().insertContentAt({ from, to }, content).run()) return null;
      return tiptapSup(target, ed, text, from + 1);
    } catch {
      return null;
    }
  }

  /* The TinyMCE editor this field belongs to, if the page has one at all. */
  function editorFor(target) {
    try {
      const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      for (const ed of page.tinymce?.editors || []) {
        const body = ed.getBody?.();
        if (body === target.root || body?.contains?.(target.root)) return ed;
      }
    } catch { /* no TinyMCE, or a version that keeps its editors elsewhere */ }
    return null;
  }

  function byCommand(target, at, text, spaced) {
    const doc = target.doc;
    const sel = doc.getSelection?.();
    if (!sel || typeof doc.execCommand !== 'function') return null;

    let wrote = false;
    let gap = null;
    try {
      /* The space goes in by hand even here. `insertText` with a space at the
       * end of a run gives a non-breaking one in most engines, and an `&nbsp;`
       * in the saved article is a thing somebody has to come and take out
       * again. A bare space is beneath the notice of any sanitiser. */
      let from = at;
      if (spaced) {
        gap = doc.createTextNode(' ');
        at.insertNode(gap);
        from = doc.createRange();
        from.setStartAfter(gap);
        from.collapse(true);
      }

      // execCommand works on whatever is focused, so the editor takes the
      // focus back off the panel's search box before a word is written.
      target.root.focus?.();
      sel.removeAllRanges();
      sel.addRange(from);
      if (!doc.execCommand('insertText', false, text)) {
        // Nothing was typed, so the space that was made ready for it comes
        // out again: the DOM is about to put in its own.
        unwrite(gap);
        return null;
      }
      wrote = true;

      /* Select what was just typed — the caret is sitting at the end of it —
       * and raise it the way the toolbar would. */
      const caret = sel.rangeCount ? sel.getRangeAt(0) : null;
      const node = caret?.startContainer;
      const over = writtenRange(doc, caret, text);
      if (!over) return { node: node || null, wrote: true, raised: false, how: 'command' };
      sel.removeAllRanges();
      sel.addRange(over);

      /* The number is written and selected. Now raise it, in three tries, and
       * in this order for a reason worth writing down.
       *
       * The shortcut goes first — ⌘. on a Mac, ctrl-. everywhere else, the
       * same keys a person would press. On an editor that keeps its own model
       * of the document, that is not merely the tidiest way, it is the only
       * one that lasts: the other two change the DOM, and a change to the DOM
       * that the editor did not make is not in its model, so the next time it
       * renders, the tag is gone and the number is left in the running text at
       * full size.
       *
       * That failure cannot be caught by looking straight afterwards — the tag
       * is genuinely there for a moment — which is why the order matters more
       * than the checking does. Ask the editor first; fall back only where
       * there is no editor to ask, and where nothing will be undoing us. */
      let how = null;
      let up = null;

      if (pressRaise(target)) {
        up = raisedNear(target, sel) || raisedFrom(target, over.startContainer);
        if (up) how = 'shortcut';
      }

      if (!up) {
        doc.execCommand('superscript');
        up = raisedNear(target, sel);
        if (up) how = 'command';
      }

      if (!up) {
        up = raiseRange(target, over, text);
        if (up) how = 'hand';
      }
      return { node: up || node, wrote: true, raised: !!up, how: how || 'flat' };
    } catch {
      // Half-written is still written: falling through to the DOM here would
      // put the number in twice.
      if (wrote) return { node: null, wrote: true, raised: false, how: 'command' };
      unwrite(gap);
      return null;
    }
  }

  function unwrite(node) {
    try { node?.parentNode?.removeChild(node); } catch { /* already gone */ }
  }

  /* The range over what `insertText` has just written.
   *
   * The caret is at the end of it, so the marker is the last `text.length`
   * characters in front of the caret — but WHERE the caret is reported is the
   * engine's business. Chrome leaves it inside the text node it typed into;
   * an editor that tidies the document on `input` can leave it on the element,
   * at the boundary between two children. Both are answered here, and the
   * characters are read back before they are used, so that nothing else is
   * ever the thing that gets raised. */
  function writtenRange(doc, caret, text) {
    let node = caret?.startContainer;
    let at = caret?.startOffset ?? 0;
    if (node?.nodeType === Node.ELEMENT_NODE) {
      const before = node.childNodes[at - 1];
      if (before?.nodeType !== Node.TEXT_NODE) return null;
      node = before;
      at = node.data.length;
    }
    if (node?.nodeType !== Node.TEXT_NODE) return null;
    if (at < text.length || node.data.slice(at - text.length, at) !== text) return null;
    const over = doc.createRange();
    over.setStart(node, at - text.length);
    over.setEnd(node, at);
    return over;
  }

  /* The superscript shortcut, pressed as a person would press it.
   *
   * ⌘. on a Mac and ctrl-. elsewhere: the same key, and the same handler
   * behind it, on every editor that carries the shortcut at all. It goes to
   * whatever inside the field has the focus, because that is where a real key
   * press would land. */
  function pressRaise(target) {
    const doc = target.doc;
    const view = doc.defaultView || window;
    if (typeof view.KeyboardEvent !== 'function') return false;

    const nav = view.navigator || {};
    const mac = /Mac|iPhone|iPad|iPod/.test(nav.platform || nav.userAgent || '');
    const press = {
      key: '.', code: 'Period', keyCode: 190, which: 190,
      bubbles: true, cancelable: true, composed: true,
      ...(mac ? { metaKey: true } : { ctrlKey: true }),
    };

    const focused = doc.activeElement;
    const el = focused && target.root.contains(focused) ? focused : target.root;
    try {
      for (const kind of ['keydown', 'keypress', 'keyup']) {
        el.dispatchEvent(new view.KeyboardEvent(kind, press));
      }
      return true;
    } catch {
      return false;
    }
  }

  /* Raising a range by hand, when neither would.
   *
   * Two things are checked before the tag goes in. That the range still holds
   * the marker and nothing else, because wrapping the wrong characters is
   * worse than leaving them flat. And that nothing has raised them already:
   * an editor that did the work in markup this script cannot recognise has
   * still done it, and a second `<sup>` around the first is markup that reads
   * right and saves wrong. */
  function raiseRange(target, over, text) {
    try {
      if (!target.root.contains(over.startContainer)) return null;
      const inside = raisedFrom(target, over.startContainer);
      if (inside) return inside;
      if (over.toString() !== text) return null;
      const sup = target.doc.createElement('sup');
      over.surroundContents(sup);
      return sup;
    } catch {
      return null;
    }
  }

  /* Is what the selection is sitting in raised? `<sup>` is the answer we want
   * and the one Radiopaedia's own markup uses, but an editor that does
   * superscript with a style rather than a tag has still done what was asked,
   * and there is nothing to be gained by calling that a failure. */
  function raisedNear(target, sel) {
    if (!sel.rangeCount) return null;
    return raisedFrom(target, sel.getRangeAt(0).startContainer);
  }

  function raisedFrom(target, start) {
    if (!start || !target.root.contains(start)) return null;
    let el = start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement;
    const view = target.doc.defaultView;
    while (el && el !== target.root) {
      if (el.tagName === 'SUP') return el;
      try {
        if (view?.getComputedStyle(el).verticalAlign === 'super') return el;
      } catch { /* detached mid-flight */ }
      el = el.parentElement;
    }
    return null;
  }

  function byNode(target, at, text, spaced) {
    const doc = target.doc;
    const sup = doc.createElement('sup');
    sup.textContent = text;
    at.insertNode(sup);
    if (spaced) sup.parentNode.insertBefore(doc.createTextNode(' '), sup);
    return { node: sup, wrote: true, raised: true, how: 'dom' };
  }

  /* A `<sup>` the caret is in, or immediately beside, with nothing but space
   * between. Both directions: a caret typed to the left of an existing marker
   * means the same thing as one typed to its right. */
  function adjacentMarker(target, range) {
    const el = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer : range.startContainer.parentElement;
    const inside = el?.closest?.('sup');
    if (inside && target.root.contains(inside) && isMarker(inside, target.root)) return inside;
    for (const dir of [-1, 1]) {
      const side = sideNode(range, dir);
      if (side?.tagName === 'SUP' && isMarker(side, target.root)) return side;
    }
    return null;
  }

  /* Is this superscript a citation, or is it arithmetic?
   *
   * `cm<sup>3</sup>` reads as a marker to anything that only looks at the
   * digits, and merging a reference number into it — `cm<sup>3,5</sup>` — is
   * a quiet, permanent, hard-to-spot way of ruining a sentence. What tells
   * them apart is the space in front, the same space this script puts there:
   * a marker has one (or starts the paragraph), and a unit never does.
   *
   * The exception is a superscript that says 1,2 or 2-4. Nothing is raised to
   * the power of "1,2", so a list is a citation wherever it is standing. */
  function isMarker(sup, root) {
    if (!markerNumbers(sup.textContent)) return false;
    if (/[,-]/.test(fold(sup.textContent))) return true;
    const before = sup.ownerDocument.createRange();
    try {
      before.setStart(blockOf(sup, root), 0);
      before.setEndBefore(sup);
    } catch { return true; }
    const text = before.toString();
    return text === '' || /\s$/.test(text);
  }

  /* The element on one side of a boundary point, with whitespace stepped over
   * and real text taken as a wall: `word |<sup>` is beside it, `word x|<sup>`
   * is not. */
  function sideNode(range, dir) {
    const node = range.startContainer;
    const at = range.startOffset;
    if (node.nodeType === Node.TEXT_NODE) {
      const rest = dir < 0 ? node.data.slice(0, at) : node.data.slice(at);
      if (rest.trim() !== '') return null;
      return skipBlank(dir < 0 ? node.previousSibling : node.nextSibling, dir);
    }
    return skipBlank(dir < 0 ? node.childNodes[at - 1] : node.childNodes[at], dir);
  }

  function skipBlank(node, dir) {
    while (node && node.nodeType === Node.TEXT_NODE && node.data.trim() === '') {
      node = dir < 0 ? node.previousSibling : node.nextSibling;
    }
    return node?.nodeType === Node.ELEMENT_NODE ? node : null;
  }

  /* Back over the punctuation, so the marker lands inside the sentence.
   *
   * `metastases.|` becomes `metastases <sup>1</sup>.`, which is how every
   * reference on the site is written. A comma and a semicolon are hopped
   * without asking — a marker belongs before them for the same reason.
   * A full stop is only hopped when it ENDS something: the end of the block,
   * or whitespace and then a capital. That test is the whole reason "e.g." and
   * "i.e." and "Fig." survive: what follows them is a small letter, so the
   * caret stays where you put it.
   *
   * A colon is the other way round. Mid-sentence — `Findings: a mass` — it is
   * punctuation like any other and the marker goes in front of it. At the end
   * of the line it is not punctuation the sentence closed on, it is a colon
   * introducing the list underneath, and the source belongs to the whole list:
   * `the following types: <sup>1</sup>`, with the marker AFTER the colon,
   * which is where the caret already is. So nothing is hopped there. */
  const SENTENCE_END = /^\s+["'“‘(]?[A-Z0-9]|^\s*$/;

  function hopPunctuation(range) {
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || range.startOffset < 1) return null;
    const at = range.startOffset;
    const mark = node.data[at - 1];
    if (!'.,;:'.includes(mark)) return null;
    if (mark === '.' || mark === ':') {
      const after = node.data.slice(at);
      const tail = after.trim() === '' ? restOfBlockAfter(node, range) : after;
      if (mark === ':' ? tail.trim() === '' : !SENTENCE_END.test(tail)) return null;
    }
    const hop = node.ownerDocument.createRange();
    hop.setStart(node, at - 1);
    hop.collapse(true);
    return hop;
  }

  /* What comes after this text node inside the same block, for the full-stop
   * test: a period at the end of its own node is still mid-sentence when the
   * next node picks the sentence up again — `<em>Fig.</em> 3` is exactly that
   * shape. */
  function restOfBlockAfter(node, range) {
    const block = blockOf(node, node.ownerDocument.body);
    const rest = node.ownerDocument.createRange();
    try {
      rest.setStart(node, range.startOffset);
      rest.setEnd(block, block.childNodes.length);
    } catch { return ''; }
    return rest.toString();
  }

  /* House style has a space before the marker. It is not put there twice, and
   * it is not put at the start of a paragraph. */
  function wantsSpace(range) {
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const before = node.data.slice(0, range.startOffset);
      if (before === '') return !!sideNode(range, -1);
      return before.slice(-1).trim() !== '';
    }
    const side = sideNode(range, -1);
    return !!side;
  }

  /* Afterwards: the caret goes back to just after the marker — so you can keep
   * typing the sentence — and the editor is told that its content changed.
   *
   * Told twice, because the two ways of listening are not the same. `input`
   * covers anything watching the field the ordinary way. TinyMCE keeps its own
   * undo stack and its own "is this dirty" flag, and a DOM change made behind
   * its back is in neither: without `undoManager.add()` the marker cannot be
   * undone with ctrl-Z, and without `setDirty(true)` leaving the page may not
   * warn you that there is something unsaved. Every line of it is optional and
   * guarded — this works on a plain contenteditable with no editor at all. */
  function settle(target, el) {
    const doc = target.doc;
    try {
      const sel = doc.getSelection();
      const after = doc.createRange();
      after.setStartAfter(el);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
      target.caret = after.cloneRange();
    } catch { /* the marker is in; the caret is a courtesy */ }

    stirred(target);
  }

  /* Told twice, because the two ways of listening are not the same. `input`
   * covers anything watching the field the ordinary way. TinyMCE keeps its own
   * undo stack and its own "is this dirty" flag, and a change made behind its
   * back is in neither: without `undoManager.add()` what we wrote cannot be
   * undone with ctrl-Z, and without `setDirty(true)` leaving the page may not
   * warn that there is something unsaved. Every line is optional and guarded —
   * this works on a plain contenteditable with no editor at all. */
  function stirred(target) {
    const doc = target.doc;
    try {
      const view = doc.defaultView || window;
      target.root.dispatchEvent(new view.Event('input', { bubbles: true }));
    } catch { /* older engines: the editor will read the DOM at save time */ }

    try {
      const ed = editorFor(target);
      ed?.undoManager?.add?.();
      ed?.setDirty?.(true);
      ed?.nodeChanged?.();
    } catch { /* an editor mid-teardown */ }
  }

  /* Typing something at the caret, and nothing more: no marker, no space, no
   * hop. The characters picker is the only thing that wants this, and it wants
   * it to go in exactly where the caret is. */
  function typeText(target, text) {
    const range = liveCaret(target);
    if (!range || !text) return false;
    const doc = target.doc;

    try {
      const sel = doc.getSelection?.();
      if (sel && typeof doc.execCommand === 'function') {
        target.root.focus?.();
        sel.removeAllRanges();
        sel.addRange(range);
        if (doc.execCommand('insertText', false, text)) {
          if (sel.rangeCount) target.caret = sel.getRangeAt(0).cloneRange();
          stirred(target);
          return true;
        }
      }
    } catch { /* fall through to the DOM */ }

    const node = doc.createTextNode(text);
    range.insertNode(node);
    settle(target, node);
    return true;
  }

  // ————————————————————————————————————————————————————— the panel

  /* One panel at a time, for one editor at a time. Everything it shows is read
   * when it opens: the references as they stand in the form, the caret as it
   * stands in the text, the next free number. Nothing is cached between
   * openings, because everything here is something you may have changed in
   * between — and rereading eleven textareas is not work worth saving. */
  const editors = [];
  const panel = {
    el: null, target: null, button: null,
    rows: [], view: [], at: 0, batch: [], query: '', marker: null,
    mode: 'pick',      // pick · asking · found · adding · trouble
    found: null, trouble: null, next: 1,
  };

  function openPanel(target, button) {
    closePanel();
    closeChars();
    panel.target = target;
    panel.button = button;
    // radioUpdater: opened on a citation marker, the panel starts with the
    // marker's references picked, and return writes the picked set over it.
    const caret = liveCaret(target);
    panel.marker = caret ? adjacentMarker(target, caret) : null;
    panel.batch = panel.marker ? markerNumbers(panel.marker.textContent) || [] : [];
    panel.query = '';
    panel.mode = 'pick';
    panel.found = null;
    panel.trouble = null;

    const el = document.createElement('div');
    el.className = 'rcx-panel';
    el.innerHTML =
      '<div class="rcx-head">' +
        '<span class="rcx-lede">Cite</span>' +
        '<span class="rcx-where"></span>' +
        '<button type="button" class="rcx-x" title="Close (esc)">×</button>' +
      '</div>' +
      '<div class="rcx-batch" hidden></div>' +
      '<input type="text" class="rcx-q" spellcheck="false" autocomplete="off">' +
      '<div class="rcx-list" role="listbox"></div>' +
      '<div class="rcx-foot"></div>';

    document.body.appendChild(el);
    panel.el = el;

    el.querySelector('.rcx-x').addEventListener('click', closePanel);
    const q = el.querySelector('.rcx-q');
    q.addEventListener('input', () => { panel.query = q.value; recount(); render(); });
    q.addEventListener('keydown', onKey);
    el.addEventListener('mousedown', (e) => {
      // Keep the editor's selection alive: a click anywhere in here must not
      // move the focus out of the search box.
      if (e.target !== q) e.preventDefault();
    });

    recount();
    render();
    place();
    q.focus();

    addEventListener('scroll', place, true);
    addEventListener('resize', place);
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onEscape, true);
  }

  function closePanel() {
    if (!panel.el) return;
    removeEventListener('scroll', place, true);
    removeEventListener('resize', place);
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', onEscape, true);
    panel.el.remove();
    panel.el = null;
    panel.button?.classList.remove('rcx-open');
    panel.button = null;
  }

  const outside = (e) => {
    if (!panel.el) return;
    if (panel.el.contains(e.target) || panel.button?.contains(e.target)) return;
    closePanel();
  };

  const onEscape = (e) => {
    if (e.key === 'Escape' && panel.el) { e.stopPropagation(); closePanel(); }
  };

  /* Under the button, and inside the window. `position:fixed` and placed from
   * here rather than in CSS, because what it hangs off is a toolbar that
   * scrolls with the form — and because the form is long enough that a panel
   * opened near the bottom of the screen has to open upwards instead. */
  function place() {
    if (!panel.el || !panel.button?.isConnected) return closePanel();
    placeUnder(panel.el, panel.button);
  }

  function placeUnder(el, button) {
    const box = button.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const room = innerHeight - box.bottom - 12;
    const up = room < h && box.top > room;
    el.style.left = `${Math.max(8, Math.min(box.left, innerWidth - w - 8))}px`;
    el.style.top = up ? `${Math.max(8, box.top - h - 6)}px` : `${box.bottom + 6}px`;
    el.style.maxHeight = `${Math.max(220, up ? box.top - 16 : room)}px`;
  }

  // ————————————————————————————————————————————— what the panel offers

  /* The rows, rebuilt from the form and the query.
   *
   * Order is the point. The reference you added last is the one you are most
   * likely to be citing — you are writing the paragraph you added it for — so
   * it stands first and the panel opens with it already chosen. Open, return,
   * done: the commonest citation in the world costs two keys. Everything else
   * is the list in its own order, which is the order the article prints. */
  function recount() {
    panel.rows = referenceBoxes();
    panel.next = nextNumber(panel.rows);
    const terms = tidy(panel.query).toLowerCase().split(' ').filter(Boolean);
    const view = [];

    const already = alreadyCited(panel.rows, panel.query);
    if (already) {
      view.push({ kind: 'ref', row: already, badge: numberOf(already),
                  lede: 'Already reference ' + numberOf(already) });
    }

    /* The lookup row, and where in the list it stands — which is a decision
     * about what return means.
     *
     * A PMID is not ambiguous: nobody types nine digits into a search box
     * hoping to find a reference whose page range happens to contain them. So
     * an identifier goes first and return looks it up.
     *
     * Words are the other way round. "ependymoma" is overwhelmingly "cite the
     * ependymoma paper I already have", and a lookup row standing above it
     * would turn the commonest press in the panel into a web request for
     * something you were not asking for. It goes last, where it is a way out
     * rather than the way. */
    const kind = lookupKind(panel.query);
    const lookup = kind && !already
      ? { kind: 'lookup', badge: String(panel.next),
          lede: kind === 'search'
            ? `Search radiopaedia.work for “${short(panel.query)}”`
            : `Look up ${kind} ${short(panel.query)}`,
          sub: `Adds it as reference ${panel.next} and cites it here` }
      : null;
    if (lookup && kind !== 'search') view.push(lookup);

    // radioUpdater: only a reference added since the page loaded, by the picker
    // or by hand, is the one you are most likely citing next.
    const last = panel.rows.length > (refsAtLoad ?? Infinity) ? panel.rows[panel.rows.length - 1] : null;
    if (!terms.length && last) {
      view.push({ kind: 'ref', row: last, badge: numberOf(last), lede: 'Just added' });
    }

    for (const row of panel.rows) {
      if (already === row) continue;
      if (!terms.length && row === last) continue;
      if (terms.length && !terms.every((t) => row.hay.includes(t))) continue;
      view.push({ kind: 'ref', row, badge: numberOf(row) });
    }

    if (lookup && kind === 'search') view.push(lookup);

    panel.view = view;
    // A new query is a new list, and the row you were on is not in it. The
    // arrow keys move `at` afterwards; nothing that rebuilds preserves it.
    panel.at = 0;
  }

  /* A URL is two hundred characters long and this row is one line high. */
  const short = (text, max = 46) => {
    const one = tidy(text);
    return one.length > max ? one.slice(0, max - 1) + '…' : one;
  };

  // What number this reference will be cited by: the one written in front of
  // it, and where there is none, its place in the list.
  const numberOf = (row) => (row.typed ? row.n : row.pos);

  function render() {
    const el = panel.el;
    if (!el) return;
    const list = el.querySelector('.rcx-list');
    const foot = el.querySelector('.rcx-foot');
    const where = el.querySelector('.rcx-where');
    const q = el.querySelector('.rcx-q');
    list.textContent = '';

    const caret = caretContext(panel.target);
    where.textContent = caret ? `after ${caret}` : 'click in the text first';
    where.classList.toggle('rcx-nowhere', !caret);

    if (panel.mode === 'asking' || panel.mode === 'adding') {
      list.appendChild(note(panel.mode === 'asking'
        ? 'Asking radiopaedia.work…' : 'Adding the reference…',
        panel.mode === 'asking'
          ? 'It is looking the identifier up in Crossref, PubMed or Google Books.'
          : 'A new box at the bottom of the reference list, and the marker in the text.'));
      foot.textContent = 'esc  cancel';
      return;
    }

    if (panel.mode === 'trouble') {
      list.appendChild(note('Nothing came back', panel.trouble, 'rcx-trouble'));
      foot.textContent = '⏎  try again    esc  close';
      return;
    }

    if (panel.mode === 'found') {
      const said = panel.found;
      list.appendChild(preview(said));
      foot.textContent = `⏎  add as reference ${panel.next} and cite it    esc  cancel`;
      return;
    }

    q.placeholder = panel.rows.length
      ? `Search ${panel.rows.length} reference${panel.rows.length > 1 ? 's' : ''}, ` +
        'or paste a DOI, PMID, URL…'
      : 'Paste a DOI, PMID, PMCID, PII, ISBN, Google Books id or URL…';

    const terms = tidy(panel.query).toLowerCase().split(' ').filter(Boolean);
    if (!panel.view.length) {
      list.appendChild(note('Nothing matches',
        'No reference here has those words in it, and what you typed is too short to look up.'));
    }
    panel.view.forEach((item, i) => list.appendChild(rowEl(item, i, terms)));

    const odd = misnumbered(panel.rows);
    const batch = el.querySelector('.rcx-batch');
    batch.textContent = '';
    batch.hidden = !panel.batch.length;
    for (const n of panel.batch) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'rcx-chip';
      chip.textContent = `${n} ×`;
      chip.addEventListener('click', () => {
        panel.batch = panel.batch.filter((x) => x !== n);
        render();
      });
      batch.appendChild(chip);
    }

    foot.textContent = panel.batch.length
      ? `⏎  ${panel.marker ? 'change to' : 'cite'} ${markerText(panel.batch)}    ⌘⏎  add another    esc  close`
      : '↑↓  choose    ⏎  cite    ⌘⏎  cite several    esc  close';
    if (odd.length) {
      const warn = document.createElement('span');
      warn.className = 'rcx-odd';
      warn.textContent = ` · ${odd.length} reference${odd.length > 1 ? 's are' : ' is'} ` +
        'numbered out of place';
      warn.title = odd.map((r) => `numbered ${r.n}, and it is the ${ordinal(r.pos)}`).join('\n') +
        '\n\nThe number in front of the reference is what gets cited.';
      foot.appendChild(warn);
    }

    if (panel.view.length) {
      const chosen = list.children[panel.at];
      chosen?.classList.add('rcx-on');
      chosen?.scrollIntoView({ block: 'nearest' });
    }
  }

  function note(head, body, extra) {
    const el = document.createElement('div');
    el.className = `rcx-note ${extra || ''}`;
    const h = document.createElement('div');
    h.className = 'rcx-note-head';
    h.textContent = head;
    const p = document.createElement('div');
    p.className = 'rcx-note-body';
    p.textContent = body;
    el.append(h, p);
    return el;
  }

  /* What came back, before you agree to it. The title and the year are what a
   * person checks — "yes, that is the paper" — and the citation underneath is
   * what will actually be written, word for word, so there is nothing to find
   * out afterwards. */
  function preview(said) {
    const el = document.createElement('div');
    el.className = 'rcx-found';
    const head = document.createElement('div');
    head.className = 'rcx-found-head';
    head.textContent = said.title || 'Found';
    const meta = document.createElement('div');
    meta.className = 'rcx-found-meta';
    meta.textContent = [said.journal, said.year, said.pmid && `PMID ${said.pmid}`]
      .filter(Boolean).join(' · ');
    const body = document.createElement('div');
    body.className = 'rcx-found-body';
    body.textContent = `${panel.next}. ${plain(said.citation)}`;
    el.append(head, meta, body);
    return el;
  }

  function rowEl(item, i, terms) {
    const el = document.createElement('div');
    el.className = `rcx-row rcx-row-${item.kind}`;
    el.setAttribute('role', 'option');

    const badge = document.createElement('span');
    badge.className = 'rcx-n';
    badge.textContent = item.badge;
    if (panel.batch.includes(+item.badge)) badge.classList.add('rcx-n-picked');

    const body = document.createElement('span');
    body.className = 'rcx-body';
    if (item.lede) {
      const lede = document.createElement('span');
      lede.className = 'rcx-lede-row';
      lede.textContent = item.lede;
      body.appendChild(lede);
    }
    const text = document.createElement('span');
    text.className = 'rcx-text';
    paintTerms(text, item.row ? item.row.text : (item.sub || ''), terms);
    body.appendChild(text);

    el.append(badge, body);
    el.addEventListener('click', (e) => {
      panel.at = i;
      if (e.metaKey || e.ctrlKey) return void addToBatch();
      activate();
    });
    el.addEventListener('mousemove', () => {
      if (panel.at === i) return;
      panel.at = i;
      render();
    });
    return el;
  }

  /* The words you typed, lit up in the line they matched. Text nodes and
   * `<span>`s, never `innerHTML`: what is being shown here is somebody's
   * reference, and a reference contains markup. */
  function paintTerms(into, text, terms) {
    if (!terms.length) { into.textContent = text; return; }
    const low = text.toLowerCase();
    const spans = [];
    for (const term of terms) {
      for (let at = low.indexOf(term); at >= 0; at = low.indexOf(term, at + term.length)) {
        spans.push([at, at + term.length]);
        if (spans.length > 60) break;
      }
    }
    spans.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [from, to] of spans) {
      if (from < cursor) continue;
      if (from > cursor) into.appendChild(document.createTextNode(text.slice(cursor, from)));
      const hit = document.createElement('b');
      hit.className = 'rcx-hit';
      hit.textContent = text.slice(from, to);
      into.appendChild(hit);
      cursor = to;
    }
    if (cursor < text.length) into.appendChild(document.createTextNode(text.slice(cursor)));
  }

  // ————————————————————————————————————————— the characters picker

  /* The other half of writing radiology in a browser: the characters that are
   * not on the keyboard.
   *
   * A report says "≤5 mm", "±2 SD", "40 cm³", "β-hCG", "T1 → T2". Every one of
   * those costs a detour — a search, a system palette, or a key combination
   * that is somewhere else on every keyboard layout. So: the same panel, the
   * same search, the same return key, and a grid instead of a list.
   *
   * The names are what gets searched, and each carries the words somebody
   * might actually type looking for it: "lt" and "smaller" for `<`, "cm2" for
   * `²`, "leads to" for `→`. A character is also its own search term, so
   * pasting one finds it.
   */
  const CHARS = [
    ['Maths and comparison', [
      ['<', 'less than', 'lt smaller under below'],
      ['>', 'greater than', 'gt bigger over above'],
      ['≤', 'less than or equal to', 'lte at most no more than'],
      ['≥', 'greater than or equal to', 'gte at least no less than'],
      ['±', 'plus minus', 'tolerance range error sd'],
      ['×', 'multiplied by', 'times dimensions size by'],
      ['÷', 'divided by', 'over ratio'],
      ['≈', 'approximately equal to', 'about roughly around'],
      ['~', 'tilde', 'about approximately roughly'],
      ['≠', 'not equal to', 'different unequal'],
      ['°', 'degree', 'angle temperature celsius'],
      ['∞', 'infinity', 'endless unbounded'],
      ['√', 'square root', 'radical'],
      ['‰', 'per mille', 'per thousand permille'],
      ['Δ', 'delta, change in', 'difference change interval'],
      ['∅', 'empty set', 'none absent null'],
    ]],
    ['Units and fractions', [
      ['µ', 'micro', 'micron mu um microns'],
      ['²', 'squared', 'superscript two cm2 mm2 area'],
      ['³', 'cubed', 'superscript three cm3 mm3 volume'],
      ['¹', 'superscript one', 'first raised'],
      ['Ω', 'ohm', 'omega resistance impedance'],
      ['′', 'prime, minutes', 'feet arcminute'],
      ['″', 'double prime, seconds', 'inches arcsecond'],
      ['½', 'one half', 'fraction half'],
      ['⅓', 'one third', 'fraction third'],
      ['⅔', 'two thirds', 'fraction thirds'],
      ['¼', 'one quarter', 'fraction quarter'],
      ['¾', 'three quarters', 'fraction quarters'],
    ]],
    ['Arrows', [
      ['→', 'rightwards arrow', 'right leads to becomes progresses'],
      ['←', 'leftwards arrow', 'left back from'],
      ['↑', 'upwards arrow', 'up raised increased elevated high'],
      ['↓', 'downwards arrow', 'down reduced decreased low'],
      ['↔', 'left right arrow', 'both bidirectional either way'],
      ['⇒', 'implies', 'therefore hence double arrow'],
    ]],
    ['Typography', [
      ['–', 'en dash, ranges', 'range between 5-10 hyphen'],
      ['—', 'em dash', 'long dash aside'],
      ['…', 'ellipsis', 'dots omission'],
      ['•', 'bullet', 'dot list point'],
      ['§', 'section', 'paragraph clause'],
      ['†', 'dagger', 'footnote obelisk deceased'],
      ['‡', 'double dagger', 'footnote diesis'],
      ['®', 'registered', 'trademark'],
      ['™', 'trademark', 'brand'],
      ['©', 'copyright', 'rights'],
      ['“', 'left double quote', 'open quotes curly'],
      ['”', 'right double quote', 'close quotes curly'],
      ['‘', 'left single quote', 'open quote curly'],
      ['’', 'apostrophe', 'right single quote curly'],
    ]],
    ['Greek', [
      ['α', 'alpha', 'fetoprotein afp'],
      ['β', 'beta', 'hcg blocker'],
      ['γ', 'gamma', 'camera knife ray'],
      ['δ', 'delta small', 'small change'],
      ['ε', 'epsilon', ''],
      ['θ', 'theta', 'angle'],
      ['κ', 'kappa', 'light chain agreement'],
      ['λ', 'lambda', 'wavelength light chain'],
      ['μ', 'mu', 'micro mean'],
      ['π', 'pi', ''],
      ['ρ', 'rho', 'density spearman'],
      ['σ', 'sigma', 'deviation sd standard'],
      ['τ', 'tau', 'protein tangles'],
      ['φ', 'phi', ''],
      ['χ', 'chi', 'squared test'],
      ['ψ', 'psi', ''],
      ['ω', 'omega', 'fatty acid'],
      ['Σ', 'sigma capital, sum', 'total summation'],
      ['Φ', 'phi capital', ''],
      ['Λ', 'lambda capital', ''],
    ]],
    ['Signs', [
      ['♀', 'female', 'woman women sex'],
      ['♂', 'male', 'man men sex'],
      ['✓', 'check', 'tick yes present positive'],
      ['✗', 'cross', 'no absent negative'],
      ['Ø', 'diameter', 'width across'],
      ['↗', 'increasing', 'rising trend up'],
    ]],
  ];

  const CHAR_COLS = 9;               // the grid, and what the arrow keys step by
  const RECENT_KEY = 'rcx-recent';   // the ones you actually use, kept
  const RECENT_MAX = 9;

  const chars = { el: null, target: null, button: null, view: [], at: 0, query: '' };

  function recent() {
    try {
      const kept = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(kept) ? kept.filter((c) => typeof c === 'string').slice(0, RECENT_MAX) : [];
    } catch { return []; }
  }

  function remember(ch) {
    try {
      const kept = [ch, ...recent().filter((c) => c !== ch)].slice(0, RECENT_MAX);
      localStorage.setItem(RECENT_KEY, JSON.stringify(kept));
    } catch { /* this session only, then */ }
  }

  const charFor = (ch) => {
    for (const [, list] of CHARS) {
      const hit = list.find((row) => row[0] === ch);
      if (hit) return hit;
    }
    return null;
  };

  function openChars(target, button) {
    closePanel();
    closeChars();
    chars.target = target;
    chars.button = button;
    chars.query = '';
    chars.at = 0;

    const el = document.createElement('div');
    el.className = 'rcx-panel rcx-chars';
    el.innerHTML =
      '<div class="rcx-head">' +
        '<span class="rcx-lede">Characters</span>' +
        '<span class="rcx-where"></span>' +
        '<button type="button" class="rcx-x" title="Close (esc)">×</button>' +
      '</div>' +
      '<input type="text" class="rcx-q" spellcheck="false" autocomplete="off" ' +
        'placeholder="greater, tilde, micro, beta, arrow…">' +
      '<div class="rcx-grid"></div>' +
      '<div class="rcx-foot"></div>';

    document.body.appendChild(el);
    chars.el = el;

    el.querySelector('.rcx-x').addEventListener('click', closeChars);
    const q = el.querySelector('.rcx-q');
    q.addEventListener('input', () => { chars.query = q.value; chars.at = 0; renderChars(); });
    q.addEventListener('keydown', onCharKey);
    el.addEventListener('mousedown', (e) => { if (e.target !== q) e.preventDefault(); });

    renderChars();
    placeUnder(el, button);
    q.focus();

    addEventListener('scroll', placeChars, true);
    addEventListener('resize', placeChars);
    document.addEventListener('mousedown', outsideChars, true);
    document.addEventListener('keydown', escapeChars, true);
  }

  function closeChars() {
    if (!chars.el) return;
    removeEventListener('scroll', placeChars, true);
    removeEventListener('resize', placeChars);
    document.removeEventListener('mousedown', outsideChars, true);
    document.removeEventListener('keydown', escapeChars, true);
    chars.el.remove();
    chars.el = null;
    chars.button?.classList.remove('rcx-open');
    chars.button = null;
  }

  const placeChars = () => {
    if (!chars.el || !chars.button?.isConnected) return closeChars();
    placeUnder(chars.el, chars.button);
  };

  const outsideChars = (e) => {
    if (!chars.el) return;
    if (chars.el.contains(e.target) || chars.button?.contains(e.target)) return;
    closeChars();
  };

  const escapeChars = (e) => {
    if (e.key === 'Escape' && chars.el) { e.stopPropagation(); closeChars(); }
  };

  /* The grid, and what is in it: the ones you have used lately first, then the
   * groups. A search takes the groups apart and shows what matched, in the
   * order the groups are written — which puts "≤" above "λ" when you type "l",
   * because a report needs the first far more often than the second. */
  function renderChars() {
    const el = chars.el;
    if (!el) return;
    const grid = el.querySelector('.rcx-grid');
    const where = el.querySelector('.rcx-where');
    grid.textContent = '';

    const caret = caretContext(chars.target);
    where.textContent = caret ? `after ${caret}` : 'click in the text first';
    where.classList.toggle('rcx-nowhere', !caret);

    const terms = tidy(chars.query).toLowerCase().split(' ').filter(Boolean);
    const view = [];
    const groups = [];

    if (!terms.length) {
      const kept = recent().map(charFor).filter(Boolean);
      if (kept.length) groups.push(['Lately', kept]);
    }
    for (const [name, list] of CHARS) {
      const hits = terms.length
        ? list.filter((row) => terms.every((t) =>
            row[0] === t || row[1].includes(t) || row[2].includes(t)))
        : list;
      if (hits.length) groups.push([name, hits]);
    }

    for (const [name, list] of groups) {
      const head = document.createElement('div');
      head.className = 'rcx-group';
      head.textContent = name;
      grid.appendChild(head);
      const row = document.createElement('div');
      row.className = 'rcx-tiles';
      for (const item of list) {
        const i = view.length;
        view.push(item);
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'rcx-tile';
        tile.textContent = item[0];
        tile.title = `${item[1]}  ·  ${item[0]}`;
        tile.addEventListener('click', () => { chars.at = i; putChar(); });
        tile.addEventListener('mousemove', () => {
          if (chars.at === i) return;
          chars.at = i;
          paintChars();
        });
        row.appendChild(tile);
      }
      grid.appendChild(row);
    }

    if (!view.length) {
      const none = document.createElement('div');
      none.className = 'rcx-note';
      none.textContent = 'Nothing by that name.';
      grid.appendChild(none);
    }

    chars.view = view;
    chars.at = Math.min(chars.at, Math.max(0, view.length - 1));
    paintChars();
  }

  /* Which tile is chosen, repainted on its own rather than through
   * `renderChars` — an arrow key that rebuilt the whole grid would lose the
   * scroll position on every press. */
  function paintChars() {
    const el = chars.el;
    if (!el) return;
    const tiles = [...el.querySelectorAll('.rcx-tile')];
    tiles.forEach((tile, i) => tile.classList.toggle('rcx-on', i === chars.at));
    tiles[chars.at]?.scrollIntoView({ block: 'nearest' });
    const item = chars.view[chars.at];
    el.querySelector('.rcx-foot').textContent = item
      ? `${item[0]}   ${item[1]}       ⏎  insert    esc  close`
      : '↑↓←→  choose    ⏎  insert    esc  close';
  }

  function onCharKey(e) {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: CHAR_COLS, ArrowUp: -CHAR_COLS }[e.key];
    if (step) {
      e.preventDefault();
      if (!chars.view.length) return;
      chars.at = Math.max(0, Math.min(chars.view.length - 1, chars.at + step));
      return paintChars();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      putChar();
    }
  }

  function putChar() {
    const item = chars.view[chars.at];
    if (!item) return;
    if (!typeText(chars.target, item[0])) {
      return say('Click in the article text where the character goes, then press again.', 'trouble');
    }
    remember(item[0]);
    closeChars();
    say(`${item[0]}  ${item[1]}`);
  }

  // ————————————————————————————————————————————————————— the keys

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); return move(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); return move(-1); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (panel.mode === 'found') return void confirmLookup();
      if (panel.mode === 'trouble') return void startLookup(panel.query);
      if (panel.mode !== 'pick') return;
      if (e.metaKey || e.ctrlKey) return addToBatch();
      if (panel.batch.length) return void citeNumbers(panel.batch);
      return activate();
    }
    if (e.key === 'Backspace' && !panel.query && panel.batch.length) {
      e.preventDefault();
      panel.batch.pop();
      render();
    }
  }

  function move(dir) {
    if (!panel.view.length) return;
    panel.at = (panel.at + dir + panel.view.length) % panel.view.length;
    render();
  }

  function activate() {
    const item = panel.view[panel.at];
    if (!item) return;
    if (item.kind === 'lookup') return void startLookup(panel.query);
    citeNumbers([+item.badge]);
  }

  /* Several at once. A paragraph resting on three papers is written
   * `<sup>2,5,9</sup>`, and typing three searches and pressing return three
   * times would leave three separate markers to merge by hand. Each ⌘⏎ drops
   * a number in the tray and clears the box for the next search; return cites
   * the tray, in one marker, in order. */
  function addToBatch() {
    const item = panel.view[panel.at];
    if (!item || item.kind !== 'ref') return;
    const n = +item.badge;
    if (!panel.batch.includes(n)) panel.batch.push(n);
    panel.query = '';
    panel.el.querySelector('.rcx-q').value = '';
    recount();
    // radioUpdater: the highlight stays on the reference just picked, rather than
    // going back to the first row, where it looked as if that had been picked too.
    const picked = panel.view.findIndex((item) => item.kind === 'ref' && +item.badge === n);
    if (picked >= 0) panel.at = picked;
    render();
  }

  // —————————————————————————————————————————————————— the two actions

  function citeNumbers(numbers) {
    const target = panel.target;
    const replacing = !!panel.marker;
    const out = insertCitation(target, numbers, replacing);
    if (!out.ok) {
      say('Click in the article text where the citation goes, then press again.', 'trouble');
      return;
    }
    closePanel();
    if (out.raised === false) {
      return say(`Wrote ${out.marker}, but this editor would not raise it. ` +
                 'Select the number and press x¹.', 'trouble');
    }
    say(out.already ? `Already cited there — ${out.marker}`
        : out.merged && replacing ? `Changed to ${out.marker}`
        : out.merged ? `Merged into ${out.marker}`
        : `Cited ${out.marker}`);
  }

  /* The lookup, in two halves with your say-so in between.
   *
   * Nothing is added on the strength of an identifier alone: a mistyped PMID
   * resolves perfectly well to somebody else's paper, and the only person who
   * can tell is the one who knows which paper they meant. So the first half
   * asks and shows, and the second half — one more return — writes. */
  async function startLookup(query) {
    const search = tidy(query);
    if (!search) return;
    panel.mode = 'asking';
    panel.query = search;
    render();

    const cached = citeCached(search);
    if (cached) return void landed(cached);
    try {
      const said = await askCite(search);
      rememberCite(search, said);
      landed(said);
    } catch (err) {
      if (!panel.el) return;
      panel.mode = 'trouble';
      panel.trouble = err.message;
      render();
    }
  }

  function landed(said) {
    if (!panel.el) return;
    if (!said.citation || said.error) {
      panel.mode = 'trouble';
      panel.trouble = said.error ||
        'The citation tool found nothing to look up in that — it takes a DOI, PMID, PMCID, ' +
        'PII, ISBN, a Google Books volume id, or a URL to a paper, a Wikipedia page or any ' +
        'other website.';
      render();
      return;
    }
    panel.rows = referenceBoxes();
    panel.next = nextNumber(panel.rows);
    panel.mode = 'found';
    panel.found = said;
    render();
  }

  async function confirmLookup() {
    const said = panel.found;
    const target = panel.target;
    if (!said?.citation) return;

    // Read once more, here rather than at "found": a slow lookup gives you
    // time to add a reference by hand, and the number has to be the one the
    // list has now.
    const rows = referenceBoxes();
    const n = nextNumber(rows);
    const line = `${n}. ${said.citation}`;

    // On the clipboard before anything is touched. If the box cannot be made,
    // or the page does something unexpected, the lookup is still in your hands.
    navigator.clipboard?.writeText(line).catch(() => { /* the box is the point */ });

    panel.mode = 'adding';
    panel.next = n;
    render();

    try {
      await addReference(line);
    } catch (err) {
      if (!panel.el) return;
      panel.mode = 'trouble';
      panel.trouble = err.message;
      render();
      return;
    }

    const out = insertCitation(target, [n]);
    closePanel();
    say(out.ok
      ? `Reference ${n} added and cited ${out.marker}`
      : `Reference ${n} added. Click in the text where it belongs and cite it.`,
      out.ok ? 'good' : 'trouble');
  }

  /* A line at the bottom of the window, for a second and a half. The panel is
   * gone by then and the marker is somewhere up in the text, possibly off
   * screen — this is the receipt. */
  let toast = null;
  function say(text, kind) {
    toast?.remove();
    const el = document.createElement('div');
    el.className = `rcx-say ${kind === 'trouble' ? 'rcx-say-trouble' : ''}`;
    el.textContent = text;
    document.body.appendChild(el);
    toast = el;
    setTimeout(() => { if (toast === el) { el.remove(); toast = null; } }, 4200);
  }

  // ——————————————————————————————————————————————————— the button

  const HINT = 'Cite a reference here (alt-shift-C) — pick one of the article’s references, ' +
               'or paste a DOI, PMID, PMCID, PII, ISBN, Google Books id or URL to add a new one';
  const CHARS_HINT = 'Insert a character that is not on the keyboard (alt-shift-X) — ' +
                     '≤ ≥ ± × ≈ ~ ° µ ² ³ → β Δ and the rest, by name';

  function mount() {
    if (!inEditor()) return;

    // Buttons that are no longer on the page belong to an editor that is no
    // longer there.
    for (let i = editors.length - 1; i >= 0; i--) {
      if (!editors[i].button?.isConnected) editors.splice(i, 1);
    }

    const fresh = editableWithin(document)
      .filter((f) => !editors.some((e) => e.root === f.root));

    for (const found of fresh) {
      const bar = toolbarFor(found.host);
      if (!bar) continue;
      const { el: anchor, how } = anchorIn(bar.members);
      if (anchor.parentElement?.querySelector(':scope > .rcx-btn')) continue;
      const button = cloneButton(anchor, 'cite');
      anchor.insertAdjacentElement('afterend', button);

      /* Attached is not the same as visible. A clone of a control that is
       * itself hidden — a toolbar in a collapsed panel, a template the form
       * has not used yet — is a button nobody can press, and the corner is
       * better than that. */
      const box = button.getBoundingClientRect();
      if (!box.width || !box.height) {
        button.remove();
        continue;
      }
      const entry = hold(found, button, `beside ${how}`);

      /* And the characters, beside the citations: two buttons, one toolbar
       * row, and the second one is the cheaper of the two to lose — so if it
       * cannot be drawn it simply is not there, and the citation button, which
       * is the point of all this, is unaffected. */
      const glyphs = cloneButton(anchor, 'chars');
      button.insertAdjacentElement('afterend', glyphs);
      if (glyphs.getBoundingClientRect().width) {
        entry.chars = glyphs;
        press(glyphs, () => {
          if (chars.el && chars.button === glyphs) return closeChars();
          closePanel();
          closeChars();
          glyphs.classList.add('rcx-open');
          openChars(entry, glyphs);
        });
      } else {
        glyphs.remove();
      }
    }

    /* Nothing anywhere to stand beside. One button, pinned to the corner, for
     * the first editable on the page — never one per field, which on a form
     * with six of them would be six buttons in the same corner. */
    if (!editors.length && fresh.length) {
      const button = plainButton();
      document.body.appendChild(button);
      hold(fresh[0], button, 'floating, top right');
    }
  }

  function hold(found, button, how) {
    const entry = { ...found, button, how, caret: null };
    editors.push(entry);
    watchCaret(entry);
    press(button, () => {
      if (panel.el && panel.button === button) return closePanel();
      closePanel();
      closeChars();
      button.classList.add('rcx-open');
      openPanel(entry, button);
    });
    return entry;
  }

  /* Capture, and stopped dead: whatever the editor has bound to its toolbar,
   * this press is not for it. And `mousedown` is swallowed as well, so the
   * caret in the article stays where it was while the panel opens. */
  function press(button, what) {
    button.addEventListener('mousedown', (e) => e.preventDefault(), true);
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      what();
    }, true);
  }

  /* When there is no toolbar to borrow from: Radiopaedia's own flat button,
   * built rather than cloned, in the corner of the window. */
  function plainButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rcx-btn rcx-btn-cite rcx-solo';
    button.appendChild(icon('cite'));
    button.setAttribute('title', HINT);
    button.setAttribute('aria-label', 'Cite a reference');
    return button;
  }

  /* The control it stands beside, cloned and stripped.
   *
   * Same tag, same classes, same everything the stylesheet knows about it —
   * and no attribute the editor could recognise. `data-mce-name`, `id`,
   * `href`, `aria-*`: all of it goes, on the button and on whatever it is
   * wrapped around, because that is how a toolbar knows which command a press
   * belongs to.
   *
   * The INSIDE, though, is emptied and drawn again rather than relabelled.
   * A toolbar of icons hides its text — a background sprite and a text-indent,
   * an icon font and a glyph in `::before`, a `font-size:0` — and a clone of
   * one of those with "[1]" written into it is a button that is there, and
   * takes the press, and cannot be seen. So the borrowed markup keeps the
   * padding and the hover and loses everything that decides what is drawn; the
   * icon is ours, an SVG that owes the stylesheet nothing. */
  function cloneButton(anchor, kind) {
    const button = anchor.cloneNode(true);
    strip(button);
    for (const el of button.querySelectorAll('*')) strip(el);

    button.textContent = '';
    button.appendChild(icon(kind));
    button.classList.add('rcx-btn', `rcx-btn-${kind}`);
    if (button.tagName === 'BUTTON') button.type = 'button';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('title', kind === 'chars' ? CHARS_HINT : HINT);
    button.setAttribute('aria-label', kind === 'chars' ? 'Insert a character' : 'Cite a reference');
    return button;
  }

  function strip(el) {
    for (const name of el.getAttributeNames()) {
      if (name !== 'class' && name !== 'style') el.removeAttribute(name);
    }
  }

  /* The icon: a number in square brackets, drawn rather than written.
   *
   * Strokes and not text, because a font-size or a colour inherited from the
   * toolbar can make text vanish and cannot make a path vanish. `currentColor`
   * so it still takes the button's colour when the panel below it is open. */
  const ICON = 'http://www.w3.org/2000/svg';

  /* Sized against the letters they stand next to rather than against the box
     they are drawn in: at stroke 2 in a 24 box the first one came out a shade
     thinner and shorter than the H3 beside it, which reads as "not quite a
     button". Omega for the characters, because a palette of things that are
     not on the keyboard has been called Ω for about thirty years. */
  const ICONS = {
    // The quotation mark, filled: it is what a citation looks like everywhere
    // else, and at nineteen pixels a solid shape stays a shape where a
    // hairline stroke goes to mush.
    cite: { fill: ['M6 17h3l2-4V7H5v6h3z', 'M14 17h3l2-4V7h-6v6h3z'] },
    // Omega, because a palette of things that are not on the keyboard has been
    // called Ω for about thirty years. Stroked, like the toolbar's own icons.
    chars: { line: ['M9.6 19.6c-2.3-1.5-3.6-3.8-3.6-6.5C6 8.9 8.7 5.4 12 5.4s6 3.5 6 7.7c0 2.7-1.3 5-3.6 6.5',
                    'M5.4 19.6h4.6',
                    'M14 19.6h4.6'] },
  };

  function icon(kind) {
    const shape = ICONS[kind] || ICONS.cite;
    const svg = document.createElementNS(ICON, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'rcx-icon');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of shape.fill || []) {
      const path = document.createElementNS(ICON, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
    }
    for (const d of shape.line || []) {
      const path = document.createElementNS(ICON, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '2.3');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
    }
    return svg;
  }

  /* The same thing from the keyboard, and from inside the editor's own iframe
   * — which is where your hands are when you want it. Alt-shift-C: TinyMCE
   * keeps alt-shift-1..7 for its headings and this is not one of them. */
  function shortcut(e) {
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    const key = String(e.key).toLowerCase();
    if (key !== 'c' && key !== 'x') return;
    const here = editors.find((t) => t.doc === e.target?.ownerDocument) || editors[0];
    if (!here?.button?.isConnected) return;
    e.preventDefault();

    if (key === 'x') {
      if (chars.el) return closeChars();
      const on = here.chars?.isConnected ? here.chars : here.button;
      on.classList.add('rcx-open');
      return openChars(here, on);
    }
    if (panel.el) return closePanel();
    here.button.classList.add('rcx-open');
    openPanel(here, here.button);
  }

  // ————————————————————————————————————————————————————— the looks

  /* The panel is Radiopaedia's own furniture, borrowed: a hairline border that
   * goes darker along the bottom, a 2px corner, Open Sans, and the purple the
   * site puts on its headings for the one thing that is selected. Only the
   * numbers are ours — they are the whole subject, so they get a badge and
   * they get to be the boldest thing in the row.
   *
   * The button itself has almost nothing here. It is a clone of H3 and it
   * keeps H3's stylesheet; what these three lines add is the tint that says
   * the panel below it is open. */
  addStyle(`
    /* Only used when there was no toolbar to clone from. Radiopaedia's own
       ".btn.btn-flat", by its numbers: 6px/12px of padding, 12px semibold on
       an 18px line, a 2px corner, a hairline border darker along the bottom. */
    .rcx-solo {
      position:fixed; top:14px; right:14px; z-index:99997;
      padding:6px 12px; border-radius:2px;
      border:1px solid rgba(0,0,0,.1); border-bottom-color:rgba(0,0,0,.25);
      background:#ededed; color:#333;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.2), 0 2px 10px rgba(0,0,0,.18);
      font-family:"Open Sans", system-ui, -apple-system, sans-serif;
      font-size:12px; font-weight:600; line-height:18px; cursor:pointer;
    }

    /* The clone keeps the toolbar's classes, and those classes were written
       to draw an icon: a sprite in the background, a glyph in ::before, a
       text-indent that pushes the label off the edge of the world. All of it
       has to go, or the button is there and takes the press and cannot be
       seen. The icon inside owes them nothing. */
    /* radioUpdater: the dark grey of the toolbar's other icons. */
    .rcx-btn {
      color:#333 !important;
      background-image:none !important;
      text-indent:0 !important;
      font-size:14px !important; line-height:1 !important; letter-spacing:normal !important;
      overflow:visible !important; visibility:visible !important; opacity:1 !important;
      cursor:pointer;
      display:inline-flex !important; align-items:center; justify-content:center;
      /* As narrow as it can be and still be pressable. The toolbar is one row
         that wraps when it runs out of width, and every control on it is a
         chance to wrap — so ours asks for the least it can: no minimum width
         beyond the icon, and less padding at the sides than the control it was
         cloned from, which was sized for a two-character label. */
      min-width:0 !important; min-height:0 !important;
      padding-left:6px !important; padding-right:6px !important;
    }
    .rcx-btn::before, .rcx-btn::after,
    .rcx-btn *::before, .rcx-btn *::after { content:none !important; display:none !important; }
    .rcx-btn * { background-image:none !important; text-indent:0 !important; color:inherit !important; }
    .rcx-icon {
      width:1.35em !important; height:1.35em !important;
      display:block !important; visibility:visible !important; opacity:1 !important;
      color:inherit; flex:0 0 auto;
    }
    /* The fill is set on the paths as a presentation attribute, and a
       presentation attribute loses to any stylesheet rule at all — including
       the toolbar's own icon CSS, which was written for its sprite glyphs and
       lands on our paths because they are inside its button. On the omega,
       which is a stroked outline and nothing else, an inherited fill floods
       the counter and the whole thing goes out as a purple blob; the quote
       mark is filled anyway, so there it never showed. Say it again in a
       voice a stylesheet cannot outrank, and say it for both: stroked paths
       hollow, unstroked paths solid. */
    .rcx-icon path[stroke] { fill:none !important; }
    .rcx-icon path:not([stroke]) { fill:currentColor !important; }
    .rcx-btn.rcx-open { background:#ddd !important; }

    .rcx-panel {
      position:fixed; z-index:99998; width:min(560px, calc(100vw - 16px));
      display:flex; flex-direction:column; overflow:hidden;
      background:#fff; border:1px solid rgba(0,0,0,.14);
      border-bottom-color:rgba(0,0,0,.28); border-radius:3px;
      box-shadow:0 8px 28px rgba(0,0,0,.18);
      font-family:"Open Sans", system-ui, -apple-system, sans-serif;
      font-size:13px; line-height:18px; color:#333;
    }

    .rcx-head {
      display:flex; align-items:baseline; gap:8px; padding:7px 8px 7px 10px;
      background:#f7f7f7; border-bottom:1px solid rgba(0,0,0,.08);
    }
    .rcx-lede { font-size:12px; font-weight:600; color:#5b2d90; flex:0 0 auto; }
    /* Where the marker will land, in the words it will land after. Middle
       ellipsis rather than a wrap: this line must never make the panel taller. */
    .rcx-where {
      flex:1 1 auto; min-width:0; color:#888; font-size:11px;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .rcx-nowhere { color:#b45309; }
    .rcx-x {
      flex:0 0 auto; padding:0 4px; border:0; background:transparent;
      color:#aaa; font-size:15px; line-height:15px; cursor:pointer;
    }
    .rcx-x:hover { color:#555; }

    .rcx-q {
      margin:0; padding:9px 10px; border:0; border-bottom:1px solid rgba(0,0,0,.08);
      font-family:inherit; font-size:14px; line-height:20px; color:#222;
      background:#fff; outline:none; width:100%; box-sizing:border-box;
    }
    .rcx-q::placeholder { color:#bbb; }

    /* The tray: numbers put by for one marker. */
    .rcx-batch {
      display:flex; flex-wrap:wrap; gap:4px; padding:6px 8px 0;
    }
    .rcx-batch[hidden] { display:none; }
    .rcx-chip {
      padding:1px 6px; border:1px solid rgba(91,45,144,.3); border-radius:2px;
      background:rgba(91,45,144,.08); color:#5b2d90;
      font-family:inherit; font-size:11px; font-weight:600; cursor:pointer;
    }
    .rcx-chip:hover { background:rgba(91,45,144,.18); }

    .rcx-list { overflow-y:auto; overscroll-behavior:contain; }

    .rcx-row {
      display:flex; align-items:flex-start; gap:8px; padding:7px 10px;
      border-bottom:1px solid rgba(0,0,0,.05); cursor:pointer;
    }
    .rcx-row:last-child { border-bottom:0; }
    /* The chosen row, marked down the edge as well as by its wash: on a
       laptop screen at an angle the wash alone is a guess. */
    .rcx-on { background:rgba(91,45,144,.07); box-shadow:inset 3px 0 0 #5b2d90; }

    /* The number, which is the entire point of the exercise. */
    .rcx-n {
      flex:0 0 auto; min-width:22px; padding:1px 5px; border-radius:2px;
      background:#eee; color:#555; text-align:center;
      font-size:12px; font-weight:700; font-variant-numeric:tabular-nums;
    }
    .rcx-on .rcx-n { background:#5b2d90; color:#fff; }
    .rcx-n-picked { background:#5b2d90; color:#fff; }
    .rcx-row-lookup .rcx-n { background:#0f766e; color:#fff; }

    .rcx-body { flex:1 1 auto; min-width:0; }
    .rcx-lede-row {
      display:block; color:#5b2d90; font-size:11px; font-weight:700;
      text-transform:uppercase; letter-spacing:.04em;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .rcx-row-lookup .rcx-lede-row { color:#0f766e; }
    /* Two lines of the reference and no more. A reference is eighty words
       long and the panel is not a reading room — what is here is enough to
       tell one paper from another, which is all that is being asked. */
    .rcx-text {
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
      overflow:hidden; color:#444; font-size:12px; line-height:17px;
    }
    .rcx-hit { background:#fde68a; font-weight:600; }

    /* ————— the characters picker: the same panel, a grid instead of a list */
    .rcx-chars { width:min(392px, calc(100vw - 16px)); }
    .rcx-grid { overflow-y:auto; overscroll-behavior:contain; padding:0 8px 8px; }
    .rcx-group {
      padding:9px 2px 5px; color:#999; font-size:11px; font-weight:700;
      letter-spacing:.04em; text-transform:uppercase;
    }
    .rcx-tiles { display:grid; grid-template-columns:repeat(9, 1fr); gap:3px; }
    /* Big enough to read a hairline glyph like ′ or ¼ at a glance, and square
       so the grid stays a grid whatever is in it. Serif for the characters
       themselves: this is the one place where the shape of the mark IS the
       content, and Open Sans draws several of these as near-identical bars. */
    .rcx-tile {
      display:flex; align-items:center; justify-content:center;
      aspect-ratio:1; min-height:32px; padding:0;
      border:1px solid transparent; border-radius:2px; background:transparent;
      color:#333; font-family:Georgia, "Times New Roman", serif; font-size:17px;
      line-height:1; cursor:pointer;
    }
    .rcx-tile:hover { background:rgba(91,45,144,.08); }
    .rcx-tile.rcx-on {
      background:#5b2d90; border-color:#5b2d90; color:#fff;
    }

    .rcx-note { padding:12px 12px 14px; }
    .rcx-note-head { font-weight:600; color:#444; }
    .rcx-note-body { margin-top:3px; color:#777; font-size:12px; }
    .rcx-trouble .rcx-note-head { color:#b45309; }

    /* What came back, waiting to be agreed to. */
    .rcx-found { padding:11px 12px 13px; }
    .rcx-found-head { font-weight:600; color:#222; }
    .rcx-found-meta { margin-top:2px; color:#0f766e; font-size:11px; font-weight:600; }
    .rcx-found-body {
      margin-top:8px; padding:8px; border-radius:2px;
      background:#fafafa; border:1px solid rgba(0,0,0,.07);
      color:#444; font-size:12px; line-height:17px;
    }

    .rcx-foot {
      padding:6px 10px; border-top:1px solid rgba(0,0,0,.08); background:#fafafa;
      color:#999; font-size:11px; white-space:nowrap; overflow:hidden;
      text-overflow:ellipsis;
    }
    .rcx-odd { color:#b45309; cursor:help; }

    /* The receipt, bottom right, and gone before it is in the way. */
    .rcx-say {
      position:fixed; right:16px; bottom:16px; z-index:99999;
      max-width:min(420px, calc(100vw - 32px));
      padding:8px 12px; border-radius:3px;
      background:#5b2d90; color:#fff;
      box-shadow:0 6px 20px rgba(0,0,0,.22);
      font-family:"Open Sans", system-ui, -apple-system, sans-serif;
      font-size:12px; line-height:17px; font-weight:600;
    }
    .rcx-say-trouble { background:#b45309; }

    /* The box that has just been filled in, so the eye finds it when the page
       scrolls down to it. */
    .rcx-fresh {
      outline:2px solid #5b2d90 !important;
      outline-offset:1px;
      transition:outline-color 1.6s ease-out;
    }
  `);

  // ——————————————————————————————————————————————————————— bootstrap

  const keyed = new WeakSet();
  function listenKeys(doc) {
    if (keyed.has(doc)) return;
    keyed.add(doc);
    doc.addEventListener('keydown', shortcut, true);
  }

  // radioUpdater: how many references the article had when the page loaded,
  // once its reference boxes are there to count.
  let refsAtLoad = null;

  function wire() {
    if (refsAtLoad === null && inEditor()) refsAtLoad = referenceBoxes().length || null;
    mount();
    listenKeys(document);
    for (const t of editors) listenKeys(t.doc);
  }

  wire();

  /* The editor mounts itself after the page, and Radiopaedia rebuilds parts of
   * the form as you add and remove references — so the button has to be put
   * back whenever it goes. Debounced, because this observer sees every
   * keystroke's worth of DOM the editor makes, and re-reading every button on
   * the page for each one would be a way to make typing slow. */
  let settling = null;
  new MutationObserver(() => {
    clearTimeout(settling);
    settling = setTimeout(wire, 250);
  }).observe(document.body, { childList: true, subtree: true });

  /* One line at startup. If the button is nowhere to be seen, this is the
   * first thing to look at: no line at all means the script is not running;
   * a line saying `editors: 0` means it is running and did not find the
   * toolbar, which is a different problem with a different fix. */
  console.info('[Radiopaedia Cite]', running(), 'active ·', location.pathname,
               '· editor page:', inEditor(),
               '· editable fields:', editableWithin(document).length,
               '· buttons:', editors.length
                 ? editors.map((e) => e.how).join(', ')
                 : 'NONE',
               '· references:', inEditor() ? referenceBoxes().length : 0);

  /* Which version is actually installed, which is the first thing to know
   * when a fix has been released and the trouble has not gone away: the
   * manager updates on its own schedule, and the file on somebody's disk is
   * not the file in their browser. */
  function running() {
    // radioUpdater: the extension's version, which citePickerBridge.js writes on the page.
    return 'radioUpdater v' + (document.documentElement.dataset.radioupdater || '?');
  }

  /* And something to ask, when that line is not enough.
   *
   * `radiopaediaCite.look()` in the console reports what the script can see of
   * the page — how many editable fields, what it took for a toolbar, what the
   * controls in it are called — which is everything needed to work out why a
   * button did not appear, from the machine where it did not appear. It reads
   * and returns; it changes nothing. */
  try {
    const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    page.radiopaediaCite = {
      look() {
        const fields = editableWithin(document);
        const report = {
          version: running(),
          url: location.href,
          editorPage: inEditor(),
          tinymce: !!(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window).tinymce,
          lastMarker: lastPut,
          editableFields: fields.length,
          buttons: editors.map((e) => e.how),
          references: referenceBoxes().length,
          fields: fields.map((f) => {
            const bar = toolbarFor(f.host);
            return {
              field: f.host.tagName + (f.host.className ? '.' + String(f.host.className).split(' ').join('.') : ''),
              words: tidy(f.root.textContent).slice(0, 40),
              toolbar: bar
                ? bar.bar.tagName + (bar.bar.className ? '.' + String(bar.bar.className).split(' ').join('.') : '')
                : 'NOT FOUND',
              controls: bar
                ? bar.members.map((el) => tidy(el.textContent) ||
                    tidy(el.getAttribute('aria-label') || el.getAttribute('title') || '') ||
                    `<${el.tagName.toLowerCase()}>`)
                : [],
              standsBeside: bar ? anchorIn(bar.members).how : null,
            };
          }),
        };
        console.log(JSON.stringify(report, null, 2));
        return report;
      },
    };
  } catch { /* a sandbox that will not take it: the console line still prints */ }
})();

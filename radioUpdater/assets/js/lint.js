// Radiopaedia Lint, by Giorgio (https://github.com/gmadevs/radiopaedia-lint-userscript),
// MIT licensed (LICENSE-Giorgio.txt), ported from userscript v3.4.0. Its automatic mode, missing-sections margin,
// citation chips, ↻ forced re-read and retraction check are left out; the other changes for
// radioUpdater are marked "radioUpdater:".

/*
 * How this hangs together
 * -----------------------
 * The radiopaedia.work linter has an API — `GET /api/v1/lint?article=…`,
 * JSON, no key — and that is what this script asks. `fromApi()` below turns
 * one entry of `lints[]` into one finding: `condition` gives the check
 * ("Radiopaedia.OxfordComma" → "Oxford Comma", the same words the linter's own
 * page prints), `trimmed` gives the line as plain text, `matched` gives the
 * offending words inside it, `line`/`position` say where they were.
 *
 * Before this the findings were read off the linter's HTML page, through
 * Tailwind classes that were not an API: a new stylesheet, and the button
 * quietly stopped finding anything on every article. Now a field would have to
 * be renamed for that to happen — and fourteen kilobytes of JSON arrive where
 * four hundred of markup used to.
 *
 * `matched` is the part with the most in it. The old parser had to guess which
 * words a finding was about by reading the quotes out of its prose; the API
 * simply says. `position` says WHICH copy of them, counted along the line, so
 * on a sentence with six commas in it the sixth is the one that lights up.
 *
 * The anchor is the SNIPPET, not `line:column`: add one paragraph above and
 * every number shifts, and the editor's lines are not the linter's lines to
 * begin with. A snippet, on the other hand, can simply be searched for in the
 * editor text.
 *
 * The editor DOM is never touched. No `<mark>` wrapped around the text: those
 * would end up inside the article the first time you save. The highlight is a
 * layer of rectangles laid over the page, drawn from the `getClientRects()` of
 * the Ranges and redrawn on every scroll — the content stays exactly as it was.
 *
 * The linter lints the PUBLISHED article, not the text sitting in your form.
 * The findings are a snapshot of how things were before you started, so "done"
 * is a mark you make, not a re-check. What can be verified for free is
 * verified: as soon as a snippet can no longer be found in the text, its
 * finding closes itself — which is also how you see that a fix landed.
 *
 * One request here is one request to Radiopaedia: the linter reads the article
 * on our behalf. This is a human clicking a button on one article at a time,
 * so that is fine — but it is why there is no prefetching and no automatic
 * retry, and why the result is kept in `sessionStorage` rather than asked for
 * again on every reload.
 */

(function () {
  'use strict';

  // radioUpdater: GM_addStyle, for a script that is not in a userscript manager.
  function addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // radioUpdater: GM_xmlhttpRequest. The request goes through background.js, which
  // answers { status, text }, or { failed: 'timeout' | 'network' }.
  function askBackground(slug) {
    return new Promise((resolve) => {
      if (!chrome.runtime?.id) return resolve({ failed: 'network' });
      chrome.runtime.sendMessage({ type: 'lint', slug }, (response) => {
        resolve(chrome.runtime.lastError || !response ? { failed: 'network' } : response);
      });
    });
  }

  const EDITOR_TIMEOUT = 30_000;    // how long we wait for the WYSIWYG to initialise
  const PENDING_KEY = 'rlx-lint-pending';
  const CACHE_KEY = 'rlx-lint-cache:';

  // What a Cloudflare interstitial carries instead of the results.
  const CHALLENGE = ['start_challenge', 'bot_management', 'Verifying you are human'];

  const COLORS = {
    error:      { ink: '#dc2626', wash: 'rgba(220, 38, 38, .22)' },
    warning:    { ink: '#d97706', wash: 'rgba(217, 119, 6, .22)' },
    suggestion: { ink: '#2563eb', wash: 'rgba(37, 99, 235, .20)' },
    other:      { ink: '#6b7280', wash: 'rgba(107, 114, 128, .20)' },
  };
  const paint = (severity) => COLORS[severity] || COLORS.other;

  // How much room the highlight takes beyond the words themselves.
  const PAD_X = 3, PAD_Y = 1;
  // A finding you have just fixed, or ignored: still on screen, no longer a finding.

  // ————————————————————————————————————————————————————————————— text

  /* One line of it, whatever came in. */
  function tidy(v) {
    return String(v ?? '').replace(/\s+/g, ' ').trim();
  }

  /* The text of a piece of the article the API quotes back at us.
   *
   * `matched`, `display` and `match` carry the article's markup with them —
   * `<strong> </strong>`, `<sup>24</sup>`, `<h6>Others</h6>` — and what has to
   * be found in the editor is the text, not the tags. `DOMParser` rather than
   * an `innerHTML` on a detached node: the document it builds is inert, so
   * nothing in there runs, loads or fetches anything. Strings with no `<` in
   * them skip it, which is most of them. */
  function plain(html) {
    const raw = String(html ?? '');
    if (!raw.includes('<')) return tidy(raw);
    return tidy(new DOMParser().parseFromString(raw, 'text/html').body.textContent);
  }

  /* Typography folded onto its plain forms: curly quotes and dashes onto the
   * straight ones, runs of space onto one space, invisible characters onto
   * nothing at all. That last pass earns its place on its own — `\s` in JS
   * does **not** cover the zero-width space, and articles are full of them:
   * the linter quotes the "Radiographic features" heading with a U+200B stuck
   * to the front, and one of those, invisible to the eye, is enough for a
   * snippet never to be found.
   *
   * This is the shape words are read in when the words themselves matter —
   * the names the linter quotes are compared here, where "Alvarado" is
   * still two syllables and a capital A. */
  function fold(s) {
    return String(s ?? '')
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—−]/g, '-')
      .replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* And the shape things get compared in when only the letters matter: the
   * fold, with the spacing and the case taken out too. Ignoring spacing is
   * what makes the comparison survive both the phantom spaces the linter drags
   * along from `<sup>` markers and quotes, and the missing ones between one
   * tag and the next in the editor. */
  function flat(s) {
    return fold(s).replace(/\s+/g, '').toLowerCase();
  }

  // ————————————————————————————————————————————— the findings

  /* The check's name, as the linter's own page prints it:
   * "Radiopaedia.StrongListColonPosition" → "Strong List Colon Position". The
   * API answers with the condition that fired, which is those same words run
   * together — putting the spaces back is the whole translation. */
  function checkName(condition) {
    const bare = String(condition ?? '').replace(/^.*\./, '');
    return bare.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim() || 'Finding';
  }

  /* A line with its citation markers taken out.
   *
   * `<sup>2,4,6,11,12</sup>` is a list of references, not a sentence, and the
   * commas in it are not commas in the prose. They still have to come out of
   * the *counting* even though they stay in the text — see `nthInLine`. The
   * second pass catches a `<sup>` the slice cut in half, which is exactly what
   * happens when the position we are counting up to is inside one. */
  const CITATION = /<sup\b[^>]*>[\s\S]*?<\/sup>/gi;
  const CITATION_OPEN = /<sup\b[^>]*>[\s\S]*$/i;
  const unref = (html) => String(html ?? '').replace(CITATION, '').replace(CITATION_OPEN, '');

  /* Is this offset inside a citation? An unclosed `<sup>` in everything before
   * it is the whole test. */
  function inCitation(html, upTo) {
    const before = String(html ?? '').slice(0, upTo);
    return (before.match(/<sup\b/gi) || []).length > (before.match(/<\/sup>/gi) || []).length;
  }

  /* Which copy of the offending words, counted along the line they sit on.
   *
   * `matched` is often something the line holds several times over — a comma,
   * a semicolon, an acronym used twice — and the finding is about exactly one
   * of them. `position` says which: the offset of the match into `match`, the
   * raw line. Counting the copies that come before it gives the occurrence to
   * light up, and counting them in `flat()` shape is what keeps that number
   * true in the editor, where the markup is gone and the spacing is not the
   * linter's. */
  function nthInLine(lint) {
    const needle = flat(plain(lint.matched));
    const position = Number(lint.position);
    if (!needle || !lint.match || !(position > 1)) return 1;

    /* Zero means "do not narrow at all", and that is the honest answer when
     * the linter's own position lands inside a citation. "More than 5 commas
     * in a single sentence" is reported against the comma of
     * `<sup>2,4,6,11,12</sup>`: the finding is about the sentence, the
     * position is about the reference list, and there is no way to tell which
     * comma of the prose was meant — because none was. Lighting the whole
     * sentence says what the message says; lighting a comma inside the
     * superscript points at the one place the reader cannot act on. */
    if (inCitation(lint.match, position - 1)) return 0;

    const before = flat(plain(unref(String(lint.match).slice(0, position - 1))));
    let n = 1;
    for (let at = before.indexOf(needle); at >= 0; at = before.indexOf(needle, at + 1)) n++;
    return n;
  }

  /* Where the missing comma goes, for the findings that are about a comma
   * that is not there.
   *
   * "Use the Oxford comma in 'patchy, reticulonodular or mixed'" quotes the
   * phrase, and lighting the phrase says which one it means — but not where
   * the comma belongs, which is the only thing you actually have to know. It
   * belongs immediately before the last conjunction, and that is something the
   * phrase itself says: the last ` or ` / ` and ` / ` nor ` in it.
   *
   * Two offsets come back because two things need one. The note prints the
   * phrase as it should read, and prints it in the spacing a human wrote; the
   * caret is drawn in the editor's text, which is indexed in `flat()` shape.
   * The same point, counted twice. */
  const CONJUNCTION = /\s+(?:or|and|nor)\b/gi;

  function insertion(lint) {
    if (lint.condition !== 'Radiopaedia.OxfordComma') return null;
    const phrase = plain(lint.matched);
    let at = -1;
    for (const m of phrase.matchAll(CONJUNCTION)) at = m.index;
    if (at <= 0) return null;
    return {
      insert: ',',
      flatAt: flat(phrase.slice(0, at)).length,
      fixed: phrase.slice(0, at) + ',' + phrase.slice(at),
    };
  }

  /* One entry of `lints[]`, one finding — in the order they occur in the
   * article rather than grouped by check, so that walking them with `j` walks
   * the article from top to bottom.
   *
   * The snippet is `trimmed`, the line with the markup taken out of it: that
   * is the shape the editor's text is in, and the one `anchor()` searches for.
   * The message is left exactly as it came, markup and all — the linter's own
   * page shows it that way, and `'<strong> </strong>'` tells you something
   * that `' '` does not.
   *
   * `occurrence` is which COPY OF THE PARAGRAPH this finding is about, and
   * that is counted per line, not per message. An article that says the same
   * sentence twice comes back with findings on two different lines and the
   * second one must walk to the second copy; four acronyms in one paragraph
   * come back as four findings on one line quoting one snippet, and all four
   * belong to the copy that is actually there. Counting identical messages
   * instead — which is all the linter's page gave us to count — sent the
   * second 'NOW' of a paragraph looking for a second paragraph, and it
   * reported "snippet not found" for the rest of the run. Which of the four
   * lights up is `targetNth`'s business, not this one's. */
  function fromApi(data) {
    const inOrder = [...(data.lints || [])].sort(
      (a, b) => ((+a.line || 0) - (+b.line || 0)) || ((+a.position || 0) - (+b.position || 0)));
    const copies = new Map();   // snippet → the copy of it we are on, and its line
    const out = [];

    for (const lint of inOrder) {
      const message = tidy(lint.message);
      if (!message) continue;
      const check = checkName(lint.condition);
      const severity = tidy(lint.severity).toLowerCase();
      const snippet = plain(lint.trimmed || lint.display || lint.match);
      const where = lint.line == null ? null
        : (lint.position == null ? String(lint.line) : `${lint.line}:${lint.position}`);

      // `inOrder` is sorted by line, so a line that is not the one this snippet
      // was last seen on is the next copy of it.
      let copy = copies.get(snippet);
      if (!copy) copies.set(snippet, copy = { line: lint.line, n: 1 });
      else if (copy.line !== lint.line) { copy.line = lint.line; copy.n++; }

      out.push({ check, severity, line: where, message, snippet,
                 target: flat(plain(lint.matched)), targetNth: nthInLine(lint),
                 point: insertion(lint),
                 occurrence: copy.n, key: `${check}|${message}|${snippet}` });
    }
    return out;
  }

  // ——————————————————————————————————————————————————— network

  /* Nothing that is not a lint result gets out of here. That is what lets the
   * rest of the file read an empty `lints[]` as an article with nothing wrong
   * with it, rather than as an answer it failed to understand. */
  async function askLinter(slug) {
    const r = await askBackground(slug);
    if (r.failed === 'timeout') throw new Error('The linter did not answer within a minute.');
    if (r.failed) throw new Error('Request to the linter failed. If radioUpdater was just updated, reload the page.');
    const body = r.text;
    if (CHALLENGE.some((m) => body.includes(m))) {
      throw new Error(
        'Cloudflare bot check. Open radiopaedia.work in a tab, clear the check, ' +
        'then try again.');
    }
    let data = null;
    try { data = JSON.parse(body); } catch { /* said below, with the status */ }
    if (r.status >= 400) {
      // 404 and 422 are the article: not found, or nothing in it to lint.
      throw new Error(data?.error
        ? `${data.error} (article "${slug}")`
        : `The linter answered ${r.status}.`);
    }
    if (!data || !Array.isArray(data.lints)) {
      throw new Error('The linter answered something that is not a lint result.');
    }
    return data;
  }

  // ————————————————————————————— finding the editor and anchoring snippets in it

  /* Radiopaedia edits in a WYSIWYG: the text may live in an iframe (TinyMCE)
   * or in a contenteditable. Every plausible root is collected and searched —
   * an article has several fields, and a finding can land in any of them. */
  const EDITOR_SELECTORS = [
    'iframe.tox-edit-area__iframe',
    'iframe[id$="_ifr"]',
    'div.tox-edit-area [contenteditable="true"]',
    'div.mce-content-body[contenteditable="true"]',
    'trix-editor',
    'div.ql-editor',
    '[contenteditable="true"]',
  ];

  function editorRoots() {
    const roots = [];
    const seen = new Set();
    for (const sel of EDITOR_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        let root = el, frame = null;
        if (el.tagName === 'IFRAME') {
          let d = null;
          try { d = el.contentDocument; } catch { /* never on someone else's iframe */ }
          if (!d || !d.body) continue;
          root = d.body;
          frame = el;
        }
        if (seen.has(root)) continue;
        // A contenteditable nested inside one we already took would bring the
        // same text along twice.
        if (roots.some((r) => !r.frame && r.root.contains(root))) continue;
        seen.add(root);
        roots.push({ root, frame });
      }
    }
    return roots;
  }

  /* Wait until the editor actually holds text: freshly mounted it is empty,
   * and searching it then would anchor nothing. */
  function awaitEditor() {
    return new Promise((resolve) => {
      const deadline = Date.now() + EDITOR_TIMEOUT;
      (function poll() {
        const roots = editorRoots().filter((r) => (r.root.textContent || '').trim().length > 40);
        if (roots.length) return resolve(roots);
        if (Date.now() > deadline) return resolve(editorRoots());
        setTimeout(poll, 400);
      })();
    });
  }

  /* What counts as one piece of text on its own: a heading, a paragraph, a
   * list item. Ranges never care about these — the index does, to be able to
   * say "this match IS that heading" rather than "this match is somewhere in
   * the article". */
  const BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,dd,dt,td,th,caption,figcaption,blockquote,pre,div';

  /* The index of a root: the flattened string of all its text, plus the node
   * and offset each character came from. A Range over any substring can be
   * rebuilt from that, even one crossing several tags.
   *
   * Every character also remembers the block it belongs to, and every block
   * the stretch of characters that is its whole text. That is what lets a
   * match be recognised as filling a block exactly — see `pick`. */
  function buildIndex(root) {
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest('script, style, noscript')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let s = '';
    const nodes = [], offsets = [], owners = [], cited = [];
    const blocks = new Map();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const raw = n.nodeValue || '';
      const owner = n.parentElement.closest(BLOCKS) || root;
      // Reference markers stay in the text — the snippet quotes them — but
      // they are not prose, and nothing gets highlighted inside one.
      const isCitation = !!n.parentElement.closest('sup');
      for (let i = 0; i < raw.length; i++) {
        const c = flat(raw[i]);
        if (!c) continue;              // whitespace: out of the index by construction
        const at = s.length;
        s += c;
        nodes.push(n);
        offsets.push(i);
        owners.push(owner);
        cited.push(isCitation);
        const b = blocks.get(owner);
        if (b) b.to = at; else blocks.set(owner, { from: at, to: at });
      }
    }
    return { root, s, nodes, offsets, owners, cited, blocks };
  }

  /* Every place the needle falls, in document order. Capped, because a very
   * short snippet can occur a hundred times over and nothing past the first
   * few is ever asked for. */
  function locateAll(index, needle, cap = 200) {
    const hits = [];
    if (!needle) return hits;
    for (let from = index.s.indexOf(needle); from >= 0 && hits.length < cap;
         from = index.s.indexOf(needle, from + 1)) {
      const to = from + needle.length - 1;
      if (to < index.nodes.length) hits.push({ from, to });
    }
    return hits;
  }

  /* True when the match is not merely inside a block but IS one: the heading
   * "Toxic", not the word toxic in a sentence. */
  function fillsBlock(index, { from, to }) {
    const b = index.blocks.get(index.owners[from]);
    return !!b && b.from === from && b.to === to;
  }

  /* Which occurrence of the needle this finding gets.
   *
   * Occurrences that fill a block exactly are offered first. The linter quotes
   * a heading as just its words — "Toxic" for `HEADINGS VALID` — and an
   * article that says "in most cases, toxic and metabolic disease…" in a
   * paragraph above the heading would otherwise have that sentence lit
   * instead: first in the text, and the wrong place by any reading.
   *
   * The preference only decides *among* matches, never invents one: with no
   * block-filling match, or fewer of them than the occurrence asked for, the
   * plain document order is used exactly as before. That is what keeps a
   * one-word snippet the linter really did mean in prose from being dragged
   * onto a heading that happens to repeat the word. */
  function pick(index, needle, occurrence) {
    const hits = locateAll(index, needle);
    if (!hits.length) return null;
    const exact = hits.filter((h) => fillsBlock(index, h));
    const list = exact.length >= occurrence ? exact : hits;
    return list[occurrence - 1] || null;
  }

  function rangeFrom(index, { from, to }) {
    const r = index.root.ownerDocument.createRange();
    r.setStart(index.nodes[from], index.offsets[from]);
    r.setEnd(index.nodes[to], index.offsets[to] + 1);
    return r;
  }

  /* Where the offending words sit inside the snippet: the copy `nthInLine`
   * counted if it is there, the first one otherwise. A count that has run out
   * is no reason to give up the narrowing — the line the linter counted along
   * and the text sitting in the form are not always the same text any more.
   *
   * Nought is not a count, it is `nthInLine` saying the linter pointed into a
   * citation: nothing to narrow onto, the whole snippet stays lit.
   *
   * Copies inside reference markers are set aside while there is one in the
   * prose. The comma of `<sup>2,4,6,11,12</sup>` is a comma in the text of the
   * page and nothing else — highlighting it for a finding about the sentence
   * puts the reader's eye on the one thing they must not touch. */
  function within(index, wide, needle, nth) {
    if (!needle || nth === 0) return -1;
    const hay = index.s.slice(wide.from, wide.to + 1);
    const hits = [];
    for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) hits.push(at);
    if (!hits.length) return -1;
    const prose = hits.filter((at) => !index.cited[wide.from + at]);
    const list = prose.length ? prose : hits;
    return list[Math.min(Math.max(nth || 1, 1), list.length) - 1];
  }

  /* Anchor every finding still open. Each root is indexed once, and which copy
   * of the snippet a finding gets is its OWN `occurrence`, the one `fromApi`
   * counted — not a running tally of how many findings quoted that snippet
   * before it. The difference is the whole paragraph rule: one paragraph
   * naming three acronyms comes back as three findings quoting exactly the
   * same snippet, and a running tally would send the second to a second copy
   * of that paragraph, which does not exist — the first acronym would light
   * up and the other two would report "snippet not found". Only a snippet the
   * article really does say twice — findings on a second line of its own —
   * carries occurrence 2, 3, … and those are the ones that must walk forward.
   *
   * Two passes: the snippet says *where*, `matched` says *what*. Once the
   * snippet is found, the words the API named are searched for inside it and
   * the highlight tightens onto them — one lit acronym is worth more than a
   * whole paragraph washed in colour. When there is nothing left of them once
   * the tags are out (`<strong> </strong>` is a space), or they cannot be
   * found in there, the snippet stays lit: too wide beats nothing. */
  /* radioUpdater: Tiptap's text is not in an iframe, and it scrolls inside a box of its
   * own. A line scrolled out of that box still has a place on the page, over the fields
   * below the editor, so the marks are clipped to it as they are to an iframe. */
  function scrollerOf(root) {
    for (let el = root; el && el !== document.documentElement; el = el.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
    }
    return null;
  }

  /* radioUpdater: after the first look, a finding follows its own words rather than its
   * paragraph. Upstream looks for the whole paragraph every time, so typing anywhere in
   * it closed every finding in it.
   *
   * The words alone will not do for a comma or a short word, which are all over the text,
   * so each carries the letters either side of it as well and the copy with the most of
   * them in place is the one. The shorter the words, the more of those it takes: a copy
   * short of that is some other comma, and the one it was about has been fixed. */
  const TRACK_CONTEXT = 24;   // letters each side
  const TRACK_ENOUGH = 12;    // the words' own length and the letters in place, together

  const sameFromStart = (a, b) => {
    let n = 0;
    while (n < a.length && a[n] === b[n]) n++;
    return n;
  };
  const sameFromEnd = (a, b) => {
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
    return n;
  };

  function trackFrom(f, rootAt, index, spot) {
    f.track = {
      rootAt,
      text: index.s.slice(spot.from, spot.to + 1),
      before: index.s.slice(Math.max(0, spot.from - TRACK_CONTEXT), spot.from),
      after: index.s.slice(spot.to + 1, spot.to + 1 + TRACK_CONTEXT),
      from: spot.from,
      cited: !!index.cited[spot.from],
    };
  }

  function follow(track, index) {
    let best = null;
    for (let at = index.s.indexOf(track.text); at >= 0; at = index.s.indexOf(track.text, at + 1)) {
      if (!track.cited && index.cited[at]) continue;
      const end = at + track.text.length;
      const score = sameFromEnd(index.s.slice(Math.max(0, at - TRACK_CONTEXT), at), track.before) +
                    sameFromStart(index.s.slice(end, end + TRACK_CONTEXT), track.after);
      if (track.text.length + score < TRACK_ENOUGH) continue;
      // Level on letters, as with a sentence written twice: the one nearest where it was.
      const away = Math.abs(at - track.from);
      if (!best || score > best.score || (score === best.score && away < best.away)) {
        best = { from: at, to: end - 1, score, away };
      }
    }
    return best;
  }

  function firstLook(f, indices) {
    const needle = flat(f.snippet);
    if (!needle) return null;
    for (let i = 0; i < indices.length; i++) {
      const wide = pick(indices[i], needle, f.occurrence || 1);
      if (!wide) continue;
      const rel = within(indices[i], wide, f.target, f.targetNth);
      f.narrowed = rel >= 0;
      return { rootAt: i, spot: f.narrowed ? { from: wide.from + rel, to: wide.from + rel + f.target.length - 1 } : wide };
    }
    return null;
  }

  function anchor(findings, roots) {
    const indices = roots.map((r) => buildIndex(r.root));
    for (const f of findings) {
      f.range = null; f.frame = null; f.caret = null;
      if (f.state === 'ignored') continue;

      const found = f.track
        ? { rootAt: f.track.rootAt, spot: follow(f.track, indices[f.track.rootAt]) }
        : firstLook(f, indices);
      if (!found?.spot) continue;

      const { rootAt, spot } = found;
      const index = indices[rootAt];
      trackFrom(f, rootAt, index, spot);
      f.range = rangeFrom(index, spot);
      f.frame = roots[rootAt].frame;

      /* The caret sits between two characters, so it is anchored on the one
       * before it and drawn against that character's trailing edge. Only
       * when the highlight really is the quoted phrase: on a finding that
       * stayed wide, an offset into the phrase points at nothing. */
      if (f.narrowed && f.point) {
        const at = spot.from + f.point.flatAt;
        if (at > spot.from && at <= spot.to + 1) {
          f.caret = rangeFrom(index, { from: at - 1, to: at - 1 });
        }
      }
      f.root = roots[rootAt].root;
      f.clip = roots[rootAt].frame || scrollerOf(roots[rootAt].root);
    }
  }

  // ———————————————————————————————————————————————————————————— the stage

  addStyle(`
    .rlx-busy { opacity:.5 !important; cursor:progress; }
    .rlx-tool { position:relative !important; }
    .rcx-btn .rlx-tool-n { position:absolute; top:-5px; right:-5px; min-width:15px; padding:0 3px;
      border-radius:8px; color:#fff !important; font:700 10px/15px system-ui,-apple-system,sans-serif;
      text-align:center; white-space:nowrap; pointer-events:none; }

    #rlx-layer { position:fixed; inset:0; pointer-events:none; z-index:99997; }
    .rlx-mark { position:fixed; border-radius:2px; }
    .rlx-mark.rlx-current { outline:2px solid; outline-offset:1px; }

    /* The insertion caret: a rule between two letters, with the character it
       stands for above it. A transform rather than a negative left, so the
       glyph stays centred on the rule whatever character it is. */
    .rlx-caret { position:fixed; width:2px; border-radius:1px; }
    .rlx-caret::after {
      /* Under the rule rather than over it: a comma belongs on the baseline,
         and the line above is somebody else's text. */
      content:attr(data-insert); position:absolute; left:50%; top:100%;
      transform:translate(-50%, -68%);
      font:800 15px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    #rlx-note {
      position:fixed; z-index:99999; max-width:min(30em, 78vw);
      padding:.6em .8em; border-radius:8px; border-left:4px solid;
      background:#fff; color:#111; box-shadow:0 6px 24px rgba(0,0,0,.22);
      font:14px/1.45 system-ui,-apple-system,sans-serif;
    }
    #rlx-note .rlx-head { display:flex; gap:.5em; align-items:baseline;
      font-size:12px; text-transform:uppercase; letter-spacing:.04em; opacity:.8; }
    #rlx-note .rlx-msg { margin-top:.35em; }
    #rlx-note .rlx-hint { margin-top:.4em; font-size:12px; opacity:.62; }
    #rlx-note .rlx-fix { margin-top:.4em; padding:.25em .5em; border-radius:6px;
      background:rgba(127,127,127,.14); font-weight:600; }
    #rlx-note .rlx-acts { display:flex; gap:.4em; margin-top:.6em; flex-wrap:wrap; }
    #rlx-note button { padding:.25em .7em; border:1px solid rgba(127,127,127,.35); border-radius:6px;
      background:transparent; color:inherit; font:600 13px/1.4 system-ui,-apple-system,sans-serif;
      cursor:pointer; }
    #rlx-note button:hover { background:rgba(127,127,127,.18); }
    #rlx-note button.rlx-primary { background:#059669; border-color:transparent; color:#fff; }
    #rlx-note button.rlx-primary:hover { background:#047857; }

    #rlx-banner {
      position:fixed; left:50%; top:18px; transform:translateX(-50%); z-index:99999;
      display:flex; align-items:center; gap:.6em;
      max-width:min(42em, 94vw); padding:.7em 1em; border-radius:12px;
      background:#111827; color:#f9fafb; box-shadow:0 8px 30px rgba(0,0,0,.35);
      font:14px/1.45 system-ui,-apple-system,sans-serif; cursor:pointer;
      animation: rlx-banner-in .18s ease-out;
    }
    #rlx-banner .rlx-tick { color:#34d399; font-size:17px; line-height:1; }
    #rlx-banner .rlx-sub { display:block; margin-top:.15em; font-size:12.5px; opacity:.75; }
    @keyframes rlx-banner-in {
      from { opacity:0; transform:translate(-50%, -8px); }
      to   { opacity:1; transform:translate(-50%, 0); }
    }

    @media (prefers-color-scheme: dark) {
      #rlx-note { background:#1f2937; color:#f3f4f6; }
    }
  `);

  const stage = {
    slug: null,
    findings: [],
    roots: [],
    i: -1,            // the finding the note is about, or -1 for none
    hits: [],         // where each finding's boxes are, for the pointer to find
    layer: null, note: null,
    live: false,
  };

  function createStage() {
    if (stage.live) return;
    stage.live = true;

    stage.layer = document.createElement('div');
    stage.layer.id = 'rlx-layer';
    document.body.appendChild(stage.layer);

    stage.note = document.createElement('div');
    stage.note.id = 'rlx-note';
    stage.note.hidden = true;
    document.body.appendChild(stage.note);

    addEventListener('scroll', scheduleDraw, true);
    addEventListener('resize', scheduleDraw);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousemove', onMove, true);
    paintTool();
  }

  /* Scrolling and keystrokes inside an iframe never reach the document above:
   * they have to be listened for on its own window. */
  function listenToFrames() {
    for (const { frame, root } of stage.roots) {
      const w = frame?.contentWindow;
      if (w && !w.__rlxListening) {
        w.__rlxListening = true;
        w.addEventListener('scroll', scheduleDraw, true);
        w.document.addEventListener('keydown', onKey, true);
        w.document.addEventListener('mousemove', (e) => onHover(e, frame), true);
      }
      // radioUpdater: changes to the text rather than `input`, which ctrl-Z and the
      // toolbar's buttons do not fire in Tiptap.
      if (!root.__rlxListening) {
        root.__rlxListening = true;
        new MutationObserver(reanchorSoon).observe(root, { childList: true, subtree: true, characterData: true });
      }
    }
  }

  function destroyStage() {
    if (!stage.live) return;
    stage.live = false;
    clearTimeout(hoverTimer);
    stage.layer?.remove(); stage.note?.remove();
    removeEventListener('scroll', scheduleDraw, true);
    removeEventListener('resize', scheduleDraw);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousemove', onMove, true);
    stage.findings = []; stage.hits = []; stage.i = -1;
    paintTool();
  }

  // ———————————————————————————————————————————————— the all-clear banner

  /* Nothing to show on the text means there is nothing to put a stage around:
   * marks on no words at all are a worse way of saying "clean" than a sentence. The
   * banner goes away on its own, on a click, or on Esc — it is an answer, not
   * a thing to manage. */
  let bannerTimer = null;

  function showBanner(headline, sub) {
    hideBanner();
    const el = document.createElement('div');
    el.id = 'rlx-banner';
    el.innerHTML =
      '<span class="rlx-tick">\u2713</span><span></span>';
    const body = el.lastElementChild;
    body.textContent = headline;
    if (sub) {
      const small = document.createElement('span');
      small.className = 'rlx-sub';
      small.textContent = sub;
      body.appendChild(small);
    }
    el.title = 'Click to dismiss';
    el.addEventListener('click', hideBanner);
    document.body.appendChild(el);
    document.addEventListener('keydown', bannerKey, true);
    bannerTimer = setTimeout(hideBanner, 7000);
  }

  function hideBanner() {
    clearTimeout(bannerTimer);
    bannerTimer = null;
    document.getElementById('rlx-banner')?.remove();
    document.removeEventListener('keydown', bannerKey, true);
  }

  function bannerKey(e) {
    if (e.key === 'Escape') hideBanner();
  }

  // —————————————————————————————————————————————————————— drawing

  let drawPending = null;
  function scheduleDraw() {
    if (drawPending) return;
    drawPending = requestAnimationFrame(() => { drawPending = null; draw(); });
  }

  /* One box per line of text, not one per tag.
   *
   * `getClientRects()` cuts a Range wherever it crosses an element boundary,
   * so "patchy, reticulonodular or mixed" with a link in the middle of it
   * comes back as three rectangles. Drawn as three, with an outline each, they
   * read as three findings and put borders through the middle of the words —
   * on the one finding whose whole point is that the phrase is hard to read.
   *
   * Rectangles that share a line become the single box that line deserves.
   * Sharing a line is judged by overlap rather than by equal tops: a
   * superscript sits higher and is shorter than the text around it, and it
   * belongs to the same line all the same. A phrase that wraps still gets one
   * box per line, which is the honest picture. */
  function mergeLines(spans) {
    const lines = [];
    for (const s of spans) {
      const line = lines.find((l) =>
        Math.min(l.y + l.h, s.y + s.h) - Math.max(l.y, s.y) > Math.min(l.h, s.h) / 2);
      if (!line) { lines.push({ ...s }); continue; }
      const right = Math.max(line.x + line.w, s.x + s.w);
      const bottom = Math.max(line.y + line.h, s.y + s.h);
      line.x = Math.min(line.x, s.x);
      line.y = Math.min(line.y, s.y);
      line.w = right - line.x;
      line.h = bottom - line.y;
    }
    return lines;
  }

  /* The lines a finding covers, in page coordinates, ready to draw. */
  function lineBoxes(f) {
    const off = f.frame ? f.frame.getBoundingClientRect() : { left: 0, top: 0 };
    const box = f.clip ? f.clip.getBoundingClientRect() : null;
    let rects;
    try { rects = f.range.getClientRects(); } catch { return { box, lines: [] }; }

    const spans = [];
    for (const r of rects) {
      if (!r.width || !r.height) continue;
      let x = r.left + off.left, y = r.top + off.top, w = r.width, h = r.height;
      if (box) {
        // Clip against what it scrolls inside: without this the rectangles would
        // spill past the edges of the editor.
        const x1 = Math.max(x, box.left), y1 = Math.max(y, box.top);
        const x2 = Math.min(x + w, box.right), y2 = Math.min(y + h, box.bottom);
        if (x2 <= x1 || y2 <= y1) continue;
        x = x1; y = y1; w = x2 - x1; h = y2 - y1;
      }
      spans.push({ x, y, w, h });
    }
    return { box, lines: mergeLines(spans) };
  }

  const overlaps = (a, b) =>
    Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) &&
    Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

  function draw() {
    if (!stage.live) return;
    stage.layer.textContent = '';
    stage.hits = [];

    /* One phrase, two findings: only the one you are reading about.
     *
     * A sentence can be too long AND be missing a comma, and then two washes
     * land on the same words. Stacked, they mix into a third colour that
     * belongs to neither, and two outlines run through the text a pixel
     * apart. The finding in the note is the one you are working on, so it
     * keeps the words; the other stands down whole — not just on the line
     * they share — and gets them back, in its own colour, the moment you step
     * onto it. Half a highlight left behind on the lines that did not clash
     * would read as a phrase nobody is talking about. */
    const cur = stage.findings[stage.i];
    const lit = cur?.range && cur.state === 'open' ? lineBoxes(cur).lines : [];

    for (let k = 0; k < stage.findings.length; k++) {
      const f = stage.findings[k];
      if (!f.range || f.state !== 'open') continue;
      const c = paint(f.severity);
      const { box, lines } = lineBoxes(f);
      const size = lines.reduce((sum, l) => sum + l.w * l.h, 0);
      for (const l of lines) stage.hits.push({ k, size, ...l });
      if (k !== stage.i && lines.some((s) => lit.some((l) => overlaps(l, s)))) continue;

      for (const s of lines) {
        /* A few pixels of air around the words.
         *
         * A rectangle that ends exactly where the text ends puts its edge —
         * and the outline just outside it — on the last glyph, and the last
         * glyph is sometimes the whole finding: "the colon should not be bold"
         * highlights `iatrogenic:`, and the colon it is talking about ends up
         * under the border, with the text caret alongside it for company.
         * Selections in every editor ever written have this air; the highlight
         * should too. */
        let x = s.x - PAD_X, y = s.y - PAD_Y;
        let w = s.w + PAD_X * 2, h = s.h + PAD_Y * 2;
        if (box) {
          // Do not let the padding push the box out of the iframe it belongs to.
          const x1 = Math.max(x, box.left), y1 = Math.max(y, box.top);
          const x2 = Math.min(x + w, box.right), y2 = Math.min(y + h, box.bottom);
          x = x1; y = y1; w = x2 - x1; h = y2 - y1;
        }
        const mark = document.createElement('div');
        mark.className = 'rlx-mark' + (k === stage.i ? ' rlx-current' : '');
        mark.style.cssText = `left:${x}px; top:${y}px; width:${w}px; height:${h}px;` +
                             `background:${c.wash}; outline-color:${c.ink};`;
        stage.layer.appendChild(mark);
      }
    }
    drawCaret(stage.findings[stage.i]);
    placeNote();
  }

  /* The place the comma is missing from, on the current finding only: a rule
   * standing between the two characters it goes between, with the character
   * itself sitting above it. A washed phrase says *this one*; this says
   * *here*, which is the thing you cannot read off the message. */
  function drawCaret(f) {
    if (!f?.caret || f.state !== 'open' || !f.point) return;
    let rects;
    try { rects = f.caret.getClientRects(); } catch { return; }
    const r = rects[rects.length - 1];
    if (!r || !r.height) return;

    const off = f.frame ? f.frame.getBoundingClientRect() : { left: 0, top: 0 };
    const box = f.clip ? f.clip.getBoundingClientRect() : null;
    const x = r.right + off.left, y = r.top + off.top;
    // Inside what it scrolls in, like the marks.
    if (box && (x < box.left || x > box.right || y + r.height < box.top || y > box.bottom)) return;
    const c = paint(f.severity);
    const el = document.createElement('div');
    el.className = 'rlx-caret';
    el.dataset.insert = f.point.insert;
    el.style.cssText = `left:${x - 1}px; top:${y}px; height:${r.height}px; ` +
                       `background:${c.ink}; color:${c.ink};`;
    stage.layer.appendChild(el);
  }

  /* radioUpdater: the note follows the pointer rather than a bar. Pointing at a mark opens
   * its note, and the pointer can cross to the note to press something. A short wait
   * before moving off one, so that crossing a mark on the way does not swap the note. */
  let hoverTimer = null;
  let hoverWanted = -1;

  function findingAt(x, y) {
    let best = null;
    for (const h of stage.hits) {
      const inside = x >= h.x - PAD_X && x <= h.x + h.w + PAD_X && y >= h.y - PAD_Y && y <= h.y + h.h + PAD_Y;
      // The smallest, so a word's finding can be reached inside a sentence's.
      if (inside && (!best || h.size < best.size)) best = h;
    }
    return best ? best.k : -1;
  }

  function onHover(e, frame) {
    if (!stage.live) return;
    const off = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
    const onNote = e.target?.closest?.('#rlx-note');
    const want = onNote ? stage.i : findingAt(e.clientX + off.left, e.clientY + off.top);
    if (want === hoverWanted) return;
    hoverWanted = want;
    clearTimeout(hoverTimer);
    if (want !== stage.i) hoverTimer = setTimeout(() => setCurrent(want), stage.i < 0 ? 60 : 250);
  }

  const onMove = (e) => onHover(e, null);

  function setCurrent(k) {
    clearTimeout(hoverTimer);
    hoverWanted = k;
    stage.i = k;
    renderNote();
    draw();
  }

  function noteButton(label, title, what, primary) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    if (primary) b.className = 'rlx-primary';
    b.addEventListener('mousedown', (e) => e.preventDefault());   // the caret stays in the text
    b.addEventListener('click', what);
    return b;
  }

  function renderNote() {
    const f = stage.findings[stage.i];
    stage.note.textContent = '';
    stage.note.hidden = !f;
    if (!f) return;

    const c = paint(f.severity);
    stage.note.style.borderLeftColor = c.ink;

    const head = document.createElement('div');
    head.className = 'rlx-head';
    const sev = document.createElement('span');
    sev.style.cssText = `color:${c.ink}; font-weight:700`;
    sev.textContent = f.severity || 'finding';
    const where = document.createElement('span');
    where.textContent = f.check;
    head.append(sev, where);

    const msg = document.createElement('div');
    msg.className = 'rlx-msg';
    msg.textContent = f.message;
    stage.note.append(head, msg);

    // The phrase as it should read. The message quotes it as it is, which
    // leaves the difference between the two for the reader to find.
    if (f.point?.fixed) {
      const fix = document.createElement('div');
      fix.className = 'rlx-fix';
      fix.style.color = c.ink;
      fix.textContent = f.point.fixed;
      stage.note.appendChild(fix);
    }

    const acts = document.createElement('div');
    acts.className = 'rlx-acts';
    if (f.point && f.caret) {
      acts.appendChild(noteButton('Apply', 'Make this change in the text (Alt+Enter)', () => applyFix(f), true));
    }
    acts.appendChild(noteButton('Ignore', 'Hide this finding in this tab (Alt+X). The article and the linter are not changed.', () => ignore(f)));
    stage.note.appendChild(acts);
  }

  /* Beside the words, or hidden while they are scrolled out of view. */
  function placeNote() {
    const f = stage.findings[stage.i];
    if (!f || !stage.live) return;
    const spot = highlightBounds(f);
    stage.note.hidden = !spot;
    if (!spot) return;
    const n = stage.note.getBoundingClientRect();
    const { left, top } = notePlacement(spot, n.width, n.height);
    stage.note.style.left = `${left}px`;
    stage.note.style.top = `${top}px`;
  }

  /* The box around the WHOLE highlight, in page coordinates, as far as it is in view.
   * Only the first line would put the note over the rest of a finding that wraps. */
  function highlightBounds(f) {
    const lines = f.range ? lineBoxes(f).lines : [];
    if (!lines.length) return null;
    return {
      left: Math.min(...lines.map((l) => l.x)),
      top: Math.min(...lines.map((l) => l.y)),
      right: Math.max(...lines.map((l) => l.x + l.w)),
      bottom: Math.max(...lines.map((l) => l.y + l.h)),
    };
  }

  /* Where to put the note so it stays on screen and off the highlight.
   *
   * Four places are tried in order — below, above, right, left — each one
   * pulled back inside the viewport first and then checked for overlap, since
   * being pushed back in can slide a candidate right over the text it was
   * meant to sit clear of. The first that lands clean wins. */
  function notePlacement(spot, w, h) {
    const gap = 6, edge = 12;

    const clamp = (p) => ({
      left: Math.min(Math.max(p.left, edge), Math.max(edge, innerWidth - w - edge)),
      top: Math.min(Math.max(p.top, edge), Math.max(edge, innerHeight - h - edge)),
    });
    const clear = (p) => p.left + w <= spot.left || p.left >= spot.right ||
                         p.top + h <= spot.top || p.top >= spot.bottom;

    const tries = [
      { left: spot.left, top: spot.bottom + gap },
      { left: spot.left, top: spot.top - h - gap },
      { left: spot.right + gap, top: spot.top },
      { left: spot.left - w - gap, top: spot.top },
    ];
    for (const t of tries) {
      const p = clamp(t);
      if (clear(p)) return p;
    }
    return clamp(tries[0]);
  }

  // ————————————————————————————————————————————————— navigation and actions

  function bringIntoView(f) {
    try {
      const c = f.range.startContainer;
      const el = c.nodeType === 1 ? c : c.parentElement;
      el?.scrollIntoView({ block: 'center', inline: 'nearest' });
      // If the text lives in an iframe, scrolling inside it is only half the
      // job: the iframe itself has to be brought into view in the page above.
      f.frame?.scrollIntoView({ block: 'nearest' });
    } catch { /* the range can be stale after an edit */ }
  }

  // The keyboard's way to what the pointer does: the next mark, scrolled into view.
  function step(dir) {
    const n = stage.findings.length;
    for (let k = 1; k <= n; k++) {
      const j = ((stage.i + dir * k) % n + n) % n;
      const f = stage.findings[j];
      if (f.state === 'open' && f.range) {
        bringIntoView(f);
        return setCurrent(j);
      }
    }
  }

  /* Only here, and only in this tab: the article and the linter never hear of it, and it
   * lasts through a re-lint and a reload until the tab is closed. */
  const ignoredKey = (slug) => `rlx-ignored:${slug}`;

  function ignoredHere(slug) {
    try { return JSON.parse(sessionStorage.getItem(ignoredKey(slug))) || []; } catch { return []; }
  }

  function ignore(f) {
    try {
      sessionStorage.setItem(ignoredKey(stage.slug), JSON.stringify([...ignoredHere(stage.slug), f.key]));
    } catch { /* quota: until the next lint, then */ }
    f.state = 'ignored';
    f.range = null;
    setCurrent(-1);
    paintTool();
  }

  /* radioUpdater: the change goes in as typing at the caret, the way the picker's markers
   * do, so that the editor keeps it and one ctrl-Z takes it out again. */
  function applyFix(f) {
    const doc = f.caret.endContainer.ownerDocument;
    const spot = doc.createRange();
    spot.setStart(f.caret.endContainer, f.caret.endOffset);
    spot.collapse(true);
    f.root.focus({ preventScroll: true });
    const selection = doc.getSelection();
    selection.removeAllRanges();
    selection.addRange(spot);
    if (!doc.execCommand('insertText', false, f.point.insert)) return;

    f.state = 'done';
    f.range = null;
    setCurrent(-1);
    paintTool();
    reanchorSoon();
  }

  function isTyping(t) {
    if (!t || t.nodeType !== 1) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  /* With Alt the shortcuts work even while you are typing in the editor. Keyed on
   * `e.code`, the physical key, because on macOS Option+j arrives as '∆'. */
  function onKey(e) {
    if (!stage.live || e.metaKey || e.ctrlKey) return;
    const f = stage.findings[stage.i];
    const keys = {
      next: () => step(1),
      prev: () => step(-1),
      ignore: () => f && ignore(f),
      apply: () => f?.point && f.caret && applyFix(f),
      close: () => (f ? setCurrent(-1) : destroyStage()),
    };
    const m = e.altKey
      ? { KeyJ: 'next', KeyK: 'prev', KeyX: 'ignore', Enter: 'apply', NumpadEnter: 'apply' }[e.code]
      : !isTyping(e.target) && { j: 'next', k: 'prev', x: 'ignore', Escape: 'close' }[e.key];
    if (m) { e.preventDefault(); keys[m](); }
  }

  /* Re-anchor after an edit. Words that can no longer be found are words you fixed, so
   * their mark goes, and comes back if ctrl-Z brings them back. Nothing moves you. */
  let reanchorPending = null;
  function reanchorSoon() {
    clearTimeout(reanchorPending);
    reanchorPending = setTimeout(() => {
      if (!stage.live) return;
      anchor(stage.findings, stage.roots);
      for (const f of stage.findings) {
        if (f.state === 'ignored') continue;
        f.state = f.range ? 'open' : 'done';
      }
      if (!stage.findings[stage.i]?.range) setCurrent(-1);
      else draw();
      paintTool();
    }, 700);
  }

  // ————————————————————————————————————————————————————————— the button

  function currentSlug() {
    const m = /^\/articles\/([^/?#]+)/.exec(location.pathname);
    // radioUpdater: /articles/new is the form for a new article, with nothing to lint yet.
    return m && m[1] !== 'new' ? decodeURIComponent(m[1]) : null;
  }
  const inEditor = () => /\/edit\/?$/.test(location.pathname);

  let button = null;

  const SEVEREST = ['error', 'warning', 'suggestion'];

  /* radioUpdater: in the editor, Lint is a button in the toolbar rather than one by
   * the title. It is a copy
   * of the citation picker's Ω, so it has that button's place and look; the picker
   * is the part of radioUpdater that knows where the toolbar is.
   * shortcut: no toolbar for the picker means no button here, only Lint from the article page. */
  const TOOL_TITLE = 'Lint this article. Point at a mark to see what it says; Alt+J and Alt+K go ' +
                     'through them. Press again to close them, and again after that to re-lint.';

  function mountTool() {
    const slug = currentSlug();
    const beside = document.querySelector('.rcx-btn-chars');
    if (!slug || !beside) return;

    const b = beside.cloneNode(false);
    b.classList.remove('rcx-btn-chars', 'rcx-open');
    b.classList.add('rlx-tool');
    b.title = TOOL_TITLE;
    b.setAttribute('aria-label', 'Lint this article');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'rcx-icon');
    svg.innerHTML = '<path d="M4 6h13M4 11h9M4 16h5M12 17l3 3 6-7" fill="none" stroke="currentColor" ' +
                    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    b.appendChild(svg);
    // Capture and stopped, as for the picker's: the toolbar's own handlers are not for this press.
    b.addEventListener('mousedown', (e) => e.preventDefault(), true);
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (b.classList.contains('rlx-busy')) return;
      if (stage.live) return destroyStage();
      runLint(slug, { force: true });   // on again is how to ask again
    }, true);
    beside.insertAdjacentElement('afterend', b);
    button = b;
    paintTool();
  }

  function paintTool() {
    if (!button?.classList.contains('rlx-tool')) return;
    button.classList.toggle('rcx-open', stage.live);
    button.querySelector('.rlx-tool-n')?.remove();
    button.title = TOOL_TITLE;
    if (!stage.live) return;

    const open = stage.findings.filter((f) => f.state === 'open');
    const marked = open.filter((f) => f.range);
    if (open.length > marked.length) {
      button.title = `${open.length - marked.length} more could not be found in this text, because the ` +
                     'linter reads the published article. Press to close the findings.';
    }
    if (!marked.length) return;
    const n = document.createElement('span');
    n.className = 'rlx-tool-n';
    n.textContent = marked.length;
    n.style.background = paint(SEVEREST.find((sev) => marked.some((f) => f.severity === sev))).ink;
    button.appendChild(n);
  }

  function mountButton() {
    if (inEditor()) {
      if (!button?.isConnected) mountTool();
      return;
    }
    // `isConnected` rather than a query: the observer also fires for the marks
    // we redraw ourselves on every scroll frame, and searching the document
    // each time would be wasted work.
    if (button?.isConnected) return;
    const slug = currentSlug();
    // radioUpdater: in the article's edit menu, where reviewLink.js adds Review article. It
    // stands where that does, so it comes beneath it when there is one.
    const menu = document.querySelector('#edit-dropdown .jq-dropdown-menu');
    if (!slug || !menu || !/^\/articles\/[^/]+\/?$/.test(location.pathname)) return;

    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'Lint article';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (!link.classList.contains('rlx-busy')) preflight(slug);
    });
    const item = document.createElement('li');
    item.appendChild(link);

    const report = menu.querySelector('a[href*="docs.google.com/forms"]')?.closest('li');
    if (report) report.before(item);
    else menu.appendChild(item);

    button = link;
  }

  // ——————————————————————————————————————————————————————————— startup

  function setButtonState(busy) {
    button?.classList.toggle('rlx-busy', busy);
  }

  /* Only the last article is kept. This is here so that reloading the edit
   * page does not ask the linter a second time, not to build an archive — and
   * the answer is now tens of kB rather than hundreds, which makes it a
   * comfortable fit in `sessionStorage` rather than a tight one. */
  function remember(slug, json) {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(CACHE_KEY) && k !== CACHE_KEY + slug) sessionStorage.removeItem(k);
    }
    try { sessionStorage.setItem(CACHE_KEY + slug, json); } catch { /* quota: never mind */ }
  }

  /* The cache first, the API only if it has to. Both the preflight on the
   * article page and the lint on the edit page come through here, which is
   * what keeps a click at one request: the article page asks, the edit page
   * finds the answer already sitting in `sessionStorage`. */
  async function lintResult(slug, { force } = {}) {
    const cached = force ? null : sessionStorage.getItem(CACHE_KEY + slug);
    if (cached) {
      try { return JSON.parse(cached); } catch { sessionStorage.removeItem(CACHE_KEY + slug); }
    }
    const data = await askLinter(slug);
    remember(slug, JSON.stringify(data));
    return data;
  }

  /* Zero findings is now simply zero findings. Reading the linter's HTML page,
   * an empty result and a parser that had stopped working looked exactly the
   * same, and the doubt had to be written into the code; `askLinter` refuses
   * anything that is not a lint result, so an empty `lints[]` that gets this
   * far is an article with nothing wrong with it. */
  const ALL_CLEAR = 'Nothing to lint.';
  const allClearSub = (slug) => `The linter found no issues in "${slug}".`;

  /* Outside the editor the linter is asked *before* navigating. An article
   * with nothing wrong with it used to cost you the trip to the edit page and
   * the trip back; now it costs a sentence. The answer is kept either way, so
   * this is not an extra request — it is the same one, made earlier. */
  async function preflight(slug) {
    if (!slug) return;
    // radioUpdater: the menu closes on the click, so this is all there is to see meanwhile.
    showBanner('Linting this article…');
    document.querySelector('#rlx-banner .rlx-tick').remove();
    clearTimeout(bannerTimer);
    setButtonState(true);
    try {
      const findings = fromApi(await lintResult(slug));
      if (!findings.length) {
        showBanner(ALL_CLEAR, allClearSub(slug));
        return;
      }
      // Go to the editor and let the lint start there — this way navigation
      // cannot abort anything halfway.
      sessionStorage.setItem(PENDING_KEY, slug);
      location.href = `${location.origin}/articles/${encodeURIComponent(slug)}/edit`;   // radioUpdater: this subdomain
    } catch (err) {
      hideBanner();
      alert(`Lint failed.\n\n${err.message}`);
    } finally {
      setButtonState(false);
    }
  }

  async function runLint(slug, { force } = {}) {
    if (!slug) return;
    stage.slug = slug;
    hideBanner();
    setButtonState(true);
    try {
      const ignored = ignoredHere(slug);
      const findings = fromApi(await lintResult(slug, { force }))
        .filter((f) => !ignored.includes(f.key))
        .map((f) => ({ ...f, state: 'open', range: null, frame: null }));

      if (!findings.length) {
        destroyStage();
        showBanner(ALL_CLEAR, allClearSub(slug));
        return;
      }

      const roots = await awaitEditor();
      if (!roots.length) {
        alert('Cannot find the editor text: open the edit page and try again.');
        return;
      }
      destroyStage();
      stage.roots = roots;
      stage.findings = findings;
      anchor(stage.findings, stage.roots);
      if (!findings.some((f) => f.range)) {
        stage.findings = [];
        showBanner(`${findings.length} finding${findings.length > 1 ? 's' : ''}, none of them in this text.`,
                   'The linter reads the published article, not what is in the editor.');
        return;
      }
      createStage();
      listenToFrames();
      setCurrent(-1);
      paintTool();
    } catch (err) {
      alert(`Lint failed.\n\n${err.message}`);
    } finally {
      setButtonState(false);
    }
  }

  // ——————————————————————————————————————————————————————— bootstrap

  mountButton();
  // Radiopaedia remounts parts of the page on its own: the button has to be
  // put back whenever it disappears.
  new MutationObserver(() => mountButton())
    .observe(document.body, { childList: true, subtree: true });

  /* One line in the console at startup. If the button is nowhere to be seen,
   * this is the first thing to look at: no line means the problem is not where
   * the button gets put — it is that the script is not running at all. */
  console.info('[Radiopaedia Lint] active ·', location.pathname,
               '· slug:', currentSlug(),
               '· button:', button ? 'mounted' : 'not here',
               button ? button.getBoundingClientRect() : '');

  if (inEditor()) {
    const pending = sessionStorage.getItem(PENDING_KEY);
    if (pending && pending === currentSlug()) {
      sessionStorage.removeItem(PENDING_KEY);
      runLint(pending, {});
    }
  }

})();

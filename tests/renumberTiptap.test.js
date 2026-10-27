import { describe, it, expect, vi, beforeAll } from 'vitest'

// The path Radiopaedia's pages take: the article text is a Tiptap editor, so the
// citations are written through it in one transaction. The editor here is the
// smallest one shaped like Tiptap's (`view.posAtDOM`, `view.state`,
// `view.dispatch`, `getJSON`, `commands.setContent`), over the page's own
// superscripts: superscript number i spans positions 100 × i onwards.
const TEXT =
  '<p>Gliomas are common <sup>3</sup>. They <strong>enhance <sup>1</sup></strong> and bleed <sup>3,1</sup>.</p>'

const REFS = [
  '1. Smith J. Enhancement. AJR 2001;1:1.',
  '2. Jones K. Never cited. AJR 2002;2:2.',
  '3. Brown L. Incidence. AJR 2003;3:3.',
]

function tiptapLike(root) {
  const sups = () => [...root.querySelectorAll('sup')]
  const at = pos => sups().at(Math.floor(pos / 100) - 1)
  const marksOf = sup => [{ type: { name: 'superscript' } }, ...(sup.closest('strong') ? [{ type: { name: 'bold' } }] : [])]

  const ed = {
    dispatches: 0,
    written: [],
    // A superscript whose text in the editor's document is no longer what the page shows.
    stale: null,
    schema: { marks: { superscript: {} } },
    commands: {
      insertContentAt: () => true,
      setContent: json => { root.innerHTML = json },
    },
    getJSON: () => root.innerHTML,
    view: {
      posAtDOM: (node, offset) => 100 * (sups().indexOf(node) + 1) + (offset ? node.textContent.length : 0),
      dispatch(tr) {
        ed.dispatches++
        for (const [from, , node] of tr.steps) {
          at(from).textContent = node.text
          ed.written.push({ text: node.text, marks: node.marks.map(m => m.type.name) })
        }
      },
    },
  }
  ed.view.state = {
    get tr() {
      const steps = []
      return { steps, replaceWith(from, to, node) { steps.push([from, to, node]); return this } }
    },
    doc: {
      nodeAt: pos => ({ marks: marksOf(at(pos)) }),
      textBetween: from => (at(from) === ed.stale ? 'something else' : at(from).textContent),
    },
    schema: { text: (text, marks) => ({ text, marks }) },
  }
  return ed
}

const sups = () => [...document.querySelectorAll('.ProseMirror sup')].map(sup => sup.textContent)
const refs = () => [...document.querySelectorAll('textarea')].map(box => box.value)
const panel = () => document.querySelector('.rcx-sorter')
const button = label => [...document.querySelectorAll('.rcx-sort-foot button')].find(b => b.textContent === label)

describe('Renumber references in a Tiptap editor', () => {
  let ed

  beforeAll(() => {
    document.body.innerHTML =
      '<div class="ProseMirror" contenteditable="true">' + TEXT + '</div>' +
      '<div class="radioupdater-check-all"><button id="radioupdater-check-all">Check all references</button></div>' +
      '<fieldset class="references">' +
      REFS.map(ref => '<div><textarea>' + ref + '</textarea><a>Format citation</a></div>').join('') +
      '</fieldset>'
    const root = document.querySelector('.ProseMirror')
    ed = root.editor = tiptapLike(root)
    vi.spyOn(console, 'info').mockImplementation(() => {})

    require('../radioUpdater/assets/js/renumber.js')
    require('../radioUpdater/assets/js/citePicker.js')
  })

  it('writes every citation in one transaction, keeping their marks', () => {
    document.getElementById('radioupdater-renumber').click()
    button('Renumber').click()

    expect(ed.dispatches).toBe(1)
    expect(sups()).toEqual(['1', '2', '1,2'])
    expect(ed.written).toContainEqual({ text: '2', marks: ['superscript', 'bold'] })
    expect(ed.written.every(w => w.marks.includes('superscript'))).toBe(true)
    expect(refs()).toEqual([
      '1. Brown L. Incidence. AJR 2003;3:3.',
      '2. Smith J. Enhancement. AJR 2001;1:1.',
      '3. Jones K. Never cited. AJR 2002;2:2.',
    ])
  })

  it('puts the text back from the saved document on "Undo renumbering"', () => {
    document.getElementById('radioupdater-renumber-undo').click()

    expect(sups()).toEqual(['3', '1', '3,1'])
    expect(refs()).toEqual(REFS)
  })

  it('writes nothing, and leaves the references alone, when the text no longer matches', () => {
    ed.dispatches = 0
    ed.stale = document.querySelectorAll('.ProseMirror sup')[1]

    document.getElementById('radioupdater-renumber').click()
    button('Renumber').click()

    expect(ed.dispatches).toBe(0)
    expect(sups()).toEqual(['3', '1', '3,1'])
    expect(refs()).toEqual(REFS)
    expect(panel().textContent).toContain('Nothing was changed')
    expect(document.getElementById('radioupdater-renumber-undo').hidden).toBe(true)
  })
})

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

// The citation picker writing a new marker through Tiptap. The editor is the smallest
// one shaped like Tiptap's. Its domAtPos answers as ProseMirror does: inside a marker
// it gives the marker's text, and at the marker's end it gives the paragraph unless
// the side before that position is asked for.
function tiptapLike(root) {
  let caret = null
  let pending = null
  let marker = null

  const chain = {
    focus: () => chain,
    insertContentAt(pos, content) {
      pending = { pos, content }
      return chain
    },
    run() {
      const range = root.ownerDocument.createRange()
      range.setStart(caret.node, caret.offset)
      const sup = root.ownerDocument.createElement('sup')
      sup.textContent = pending.content.at(-1).text
      range.insertNode(sup)
      const spaced = pending.content.length > 1
      if (spaced) sup.before(' ')
      const start = pending.pos + (spaced ? 1 : 0)
      marker = { sup, start, end: start + sup.textContent.length }
      return true
    },
  }

  return {
    chain: () => chain,
    schema: { marks: { superscript: {} } },
    commands: { insertContentAt: () => true },
    view: {
      posAtDOM(node, offset) {
        caret = { node, offset }
        return 100
      },
      domAtPos(pos, side = 0) {
        if (pos < marker.end || side < 0) return { node: marker.sup.firstChild, offset: pos - marker.start }
        return { node: marker.sup.parentElement, offset: 0 }
      },
    },
  }
}

const REFS = Array.from({ length: 12 }, (_, i) => `${i + 1}. Author${i + 1} A. Paper. AJR 2001;1:1.`)

const toast = () => document.querySelector('.rcx-say')

function cite(query) {
  const text = document.querySelector('.ProseMirror p').firstChild
  const selection = document.getSelection()
  selection.collapse(text, 'Vermian hypoplasia'.length)
  document.dispatchEvent(new Event('selectionchange'))
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', altKey: true, shiftKey: true }))
  const box = document.querySelector('.rcx-q')
  box.value = query
  box.dispatchEvent(new Event('input', { bubbles: true }))
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}

describe('The citation picker in a Tiptap editor', () => {
  beforeAll(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    document.body.innerHTML =
      '<div class="ProseMirror" contenteditable="true"><p>Vermian hypoplasia should be abandoned.</p></div>' +
      '<fieldset class="references">' +
      REFS.map(ref => '<div><textarea>' + ref + '</textarea><a>Format citation</a></div>').join('') +
      '</fieldset>'
    require('../radioUpdater/assets/js/renumber.js')
    require('../radioUpdater/assets/js/citePicker.js')
  })

  beforeEach(() => {
    const root = document.querySelector('.ProseMirror')
    root.innerHTML = '<p>Vermian hypoplasia should be abandoned.</p>'
    root.editor = tiptapLike(root)
  })

  it.each([
    ['one digit', 'Author5 ', '5'],
    ['two digits', 'Author12 ', '12'],
  ])('reports a citation of %s as cited', (label, query, number) => {
    cite(query)

    expect(document.querySelector('.ProseMirror sup').textContent).toBe(number)
    expect(toast().textContent).toBe(`Cited ${number}`)
    expect(toast().className).not.toContain('rcx-say-trouble')
  })
})

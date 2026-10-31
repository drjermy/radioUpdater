import { describe, it, expect, vi, beforeAll } from 'vitest'

// The button on a page shaped like Radiopaedia's edit form: a plain contenteditable
// for the article text (no Tiptap, so the markers are rewritten one at a time), the
// "Check all references" button cite.js adds, and three reference boxes. The text
// has a unit (cm³), which is skipped, and an isotope (³F, with a reference 3 in the
// list), which is held as a doubt. In the list, one citation has its space inside the
// tag and one is followed by a nested list: both are citations.
const TEXT =
  '<p>Gliomas are common <sup>3</sup>. They enhance <sup>1</sup> and bleed <sup>3,1</sup>.</p>' +
  '<p>A volume of 30 cm<sup>3</sup>.</p>' +
  '<p>Uptake on <sup>3</sup><strong>F</strong>-FDG PET is high.</p>' +
  '<ul><li>bleeding <sup>1 </sup>and oedema</li><li>mass effect <sup>3</sup><ul><li>also midline shift</li></ul></li></ul>'

const REFS = [
  '1. Smith J. Enhancement. AJR 2001;1:1.',
  '2. Jones K. Never cited. AJR 2002;2:2.',
  '3. Brown L. Incidence. AJR 2003;3:3.',
]

const AS_TYPED = ['3', '1', '3,1', '3', '3', '1 ', '3']

const sups = () => [...document.querySelectorAll('.text sup')].map(sup => sup.textContent)
const refs = () => [...document.querySelectorAll('textarea')].map(box => box.value)
const panel = () => document.querySelector('.rcx-sorter')
const button = (label, within = '.rcx-sort-foot') =>
  [...document.querySelectorAll(`${within} button`)].find(b => b.textContent === label)
const changes = () => [...document.querySelectorAll('.rcx-cite-diff')]
  .filter(mark => mark.querySelector('ins'))
  .map(mark => [mark.querySelector('del').textContent, mark.querySelector('ins').textContent])

describe('Renumber references', () => {
  beforeAll(() => {
    document.body.innerHTML =
      '<div class="text" contenteditable="true">' + TEXT + '</div>' +
      '<div class="radioupdater-check-all"><button id="radioupdater-check-all">Check all references</button></div>' +
      '<fieldset class="references">' +
      REFS.map(ref => '<div><textarea>' + ref + '</textarea><a>Format citation</a></div>').join('') +
      '</fieldset>'
    vi.spyOn(console, 'info').mockImplementation(() => {})
    // jsdom does not scroll.
    Element.prototype.scrollIntoView = vi.fn()

    require('../radioUpdater/assets/js/renumber.js')
    require('../radioUpdater/assets/js/citePicker.js')
  })

  it('stands beside "Check all references"', () => {
    expect(document.getElementById('radioupdater-check-all').nextElementSibling.id).toBe('radioupdater-renumber')
    expect(document.getElementById('radioupdater-renumber-undo').hidden).toBe(true)
  })

  it('shows the new order before writing anything, and holds the isotope as a doubt', () => {
    document.getElementById('radioupdater-renumber').click()

    let rows = [...document.querySelectorAll('.rcx-sort-row')].map(row => row.textContent)
    expect(rows).toEqual([
      '1was 3Brown L. Incidence. AJR 2003;3:3.',
      '2was 1Smith J. Enhancement. AJR 2001;1:1.',
      '3was 2not cited · Jones K. Never cited. AJR 2002;2:2.',
    ])
    let doubts = [...document.querySelectorAll('.rcx-doubt-text')].map(row => row.textContent)
    expect(doubts).toEqual(['…Uptake on 3F-FDG PET is high.…'])
    expect(document.querySelector('.rcx-doubt-why').textContent).toContain('isotope')
    expect(panel().textContent).toContain('Left as they are: 1 superscript')
    expect(sups()).toEqual(AS_TYPED)
    expect(refs()).toEqual(REFS)
  })

  it('will not renumber until the doubt is decided', () => {
    expect(button('Renumber').disabled).toBe(true)
    expect(panel().textContent).toContain('Decide the superscript in amber first.')

    button('Renumber').click()

    expect(sups()).toEqual(AS_TYPED)
  })

  it('marks each citation that will change, outside the text', () => {
    expect(changes()).toEqual([['3', '1'], ['1', '2'], ['3,1', '1,2'], ['1', '2'], ['3', '1']])
    expect(document.querySelectorAll('.rcx-cite-diff mark')).toHaveLength(1)
    expect(document.querySelector('.text .rcx-cite-diff')).toBeNull()
  })

  it('steps through the changes in the text, one citation at a time', () => {
    let next = button('›', '.rcx-sort-steps')
    let on = () => document.querySelector('.rcx-cite-on ins')?.textContent

    next.click()
    next.click()

    expect(document.querySelector('.rcx-step-at').textContent).toBe('2 / 5')
    expect(on()).toBe('2')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()

    button('‹', '.rcx-sort-steps').click()
    button('‹', '.rcx-sort-steps').click()

    expect(document.querySelector('.rcx-step-at').textContent).toBe('5 / 5')
  })

  it('stays open while the text is clicked and read', () => {
    document.querySelector('.text p').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(panel()).not.toBeNull()
  })

  it('rewrites the citations and the references, leaving cm³ and the isotope alone', () => {
    button('Not a citation', '.rcx-doubt').click()
    expect(button('Renumber').disabled).toBe(false)

    button('Renumber').click()

    expect(sups()).toEqual(['1', '2', '1,2', '3', '3', '2 ', '1'])
    expect(refs()).toEqual([
      '1. Brown L. Incidence. AJR 2003;3:3.',
      '2. Smith J. Enhancement. AJR 2001;1:1.',
      '3. Jones K. Never cited. AJR 2002;2:2.',
    ])
    expect(panel()).toBeNull()
    expect(document.querySelector('.rcx-cite-diff')).toBeNull()
    expect(document.querySelector('.rcx-say').textContent).toContain('Renumbered 3 references and 5 citations')
    expect(document.getElementById('radioupdater-renumber-undo').hidden).toBe(false)
  })

  it('says when the list is already in citation order, remembering the decision', () => {
    document.getElementById('radioupdater-renumber').click()

    expect(panel().textContent).toContain('Already in citation order')
    expect(panel().textContent).toContain('Checked: 1 superscript')
    expect(button('Renumber')).toBeUndefined()
    button('Close').click()
  })

  it('puts everything back with "Undo renumbering"', () => {
    document.getElementById('radioupdater-renumber-undo').click()

    expect(sups()).toEqual(AS_TYPED)
    expect(refs()).toEqual(REFS)
    expect(document.getElementById('radioupdater-renumber-undo').hidden).toBe(true)
  })

  it('counts a doubt decided as a citation', () => {
    document.getElementById('radioupdater-renumber').click()

    button('Citation', '.rcx-doubt').click()

    expect(changes()).toEqual([['3', '1'], ['1', '2'], ['3,1', '1,2'], ['3', '1'], ['1', '2'], ['3', '1']])
    button('Cancel').click()
  })

  it('shows the preview again when the form changed while it was open', () => {
    document.getElementById('radioupdater-renumber').click()
    let third = document.querySelectorAll('textarea')[2]
    third.value = '3. Brown L. Incidence, revised. AJR 2003;3:3.'

    button('Renumber').click()

    expect(refs()[0]).toBe(REFS[0])
    expect(panel().textContent).toContain('Incidence, revised')
    button('Cancel').click()
    third.value = REFS[2]
  })

  it('refuses a list with two references under the same number', () => {
    document.querySelectorAll('textarea')[1].value = '1. Jones K. Never cited. AJR 2002;2:2.'

    document.getElementById('radioupdater-renumber').click()

    expect(panel().textContent).toContain('More than one reference is numbered 1.')
    expect(button('Renumber')).toBeUndefined()
    expect(sups()).toEqual(AS_TYPED)
    button('Close').click()
  })

  it('offers nothing when the text cites no reference, even with a gap in the numbers', () => {
    document.querySelector('.text').innerHTML = '<p>No citations here.</p>'
    let boxes = document.querySelectorAll('textarea')
    boxes[0].value = REFS[0]
    boxes[1].value = '3. Jones K. Never cited. AJR 2002;2:2.'
    boxes[2].value = '4. Brown L. Incidence. AJR 2003;3:3.'

    document.getElementById('radioupdater-renumber').click()

    expect(panel().textContent).toContain('No citations to renumber')
    expect(button('Renumber')).toBeUndefined()
    button('Close').click()
  })

  it('counts a box in the reference block that has no link and looks like no citation', () => {
    document.querySelector('.text').innerHTML = '<p>Atlas <sup>2</sup> and text <sup>1</sup>.</p>'
    let boxes = document.querySelectorAll('textarea')
    boxes[0].value = REFS[0]
    boxes[1].value = "2. Clemete's Anatomy - Regional Atlas of the Human Body - 3rd Edition 044311868X"
    boxes[1].nextElementSibling.remove()
    boxes[2].value = REFS[2]

    document.getElementById('radioupdater-renumber').click()

    let rows = [...document.querySelectorAll('.rcx-sort-row')].map(row => row.textContent)
    expect(rows[0]).toContain("Clemete's Anatomy")
    expect(rows).toHaveLength(3)
    button('Cancel').click()
  })
})

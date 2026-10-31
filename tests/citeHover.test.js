import { describe, it, expect, beforeAll } from 'vitest'

// A published article: citations in the text, references numbered at the start of their text.
describe('Citation hover', () => {
  beforeAll(() => {
    document.body.innerHTML =
      '<div class="body user-generated-content"><p>Tears <sup>2</sup> and flaps <sup>1,2</sup>. ' +
      'Uptake of <sup>18</sup>F.</p></div>' +
      '<div id="references"><ul><li>1. Smith J. Tears. <a href="#">doi</a></li><li>2. Jones K. Flaps.</li></ul></div>'
    require('../radioUpdater/assets/js/renumber.js')
    require('../radioUpdater/assets/js/citeHover.js')
  })

  const hover = (i) => document.querySelectorAll('sup')[i].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  const tip = () => document.querySelector('.rcx-ref-tip')

  it('shows the reference a citation cites', () => {
    hover(0)
    expect(tip().textContent).toBe('2. Jones K. Flaps.')
  })

  it('shows each reference of a multiple citation, links included', () => {
    hover(1)
    expect([...tip().children].map((row) => row.textContent)).toEqual(['1. Smith J. Tears. doi', '2. Jones K. Flaps.'])
    expect(tip().querySelector('a')).not.toBeNull()
  })

  it('ignores a superscript citing no reference the article has', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    hover(2)
    expect(tip()).toBeNull()
  })
})

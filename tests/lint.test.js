import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

globalThis.chrome = { runtime: { id: 'test', sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } } }

const { requestLint } = require('../radioUpdater/background.js')

describe('requestLint', () => {
  beforeEach(() => { globalThis.fetch = vi.fn().mockResolvedValue(new Response('{"lints":[]}', { status: 200 })) })

  it('asks the linter about the slug, escaped', async () => {
    expect(await requestLint({ slug: 'a/b' })).toEqual({ status: 200, text: '{"lints":[]}' })
    expect(fetch.mock.calls[0][0]).toBe('https://radiopaedia.work/api/v1/lint?article=a%2Fb')
  })

  it('tells a timeout from a network failure', async () => {
    fetch.mockRejectedValueOnce(Object.assign(new Error(), { name: 'AbortError' }))
    expect(await requestLint({ slug: 'x' })).toEqual({ failed: 'timeout' })
    fetch.mockRejectedValueOnce(new TypeError('offline'))
    expect(await requestLint({ slug: 'x' })).toEqual({ failed: 'network' })
  })
})

describe('Lint in the editor', () => {
  const TEXT = '<p>Forms are infantile, juvenile and adolescent, and it is usually treated early.</p>'
  const PLAIN = 'Forms are infantile, juvenile and adolescent, and it is usually treated early.'
  const finding = (over = {}) => ({
    matched: 'usually', line: 1, position: 51, message: 'Avoid this word', severity: 'warning',
    condition: 'Radiopaedia.Test', match: TEXT, trimmed: PLAIN, ...over,
  })
  const COMMA = finding({
    matched: 'infantile, juvenile and adolescent', position: 11, severity: 'suggestion',
    message: 'Use the Oxford comma', condition: 'Radiopaedia.OxfordComma',
  })
  const observers = []
  let answer

  beforeAll(() => {
    // Disconnected afterwards, or the button's observer fires as jsdom tears the page down.
    globalThis.MutationObserver = class extends MutationObserver {
      constructor(callback) {
        super(callback)
        observers.push(this)
      }
    }
    window.history.pushState({}, '', '/articles/epilepsy/edit')
    document.body.innerHTML = `<a class="rcx-btn rcx-btn-chars"></a>
      <div id="scroller" style="overflow-y:auto"><div id="editor" contenteditable="true">${TEXT}</div></div>`
    document.querySelector('#scroller').getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 100 })
    Element.prototype.scrollIntoView = () => {}
    document.execCommand = vi.fn(() => true)
    chrome.runtime.sendMessage.mockImplementation((message, reply) => {
      reply({ status: 200, text: JSON.stringify(answer) })
    })
    vi.spyOn(console, 'info').mockImplementation(() => {})
    require('../radioUpdater/assets/js/lint.js')
  })

  afterAll(() => observers.forEach((observer) => observer.disconnect()))

  beforeEach(() => {
    sessionStorage.clear()
    document.querySelector('#editor').innerHTML = TEXT
    Range.prototype.getClientRects = () => [{ left: 10, top: 10, width: 100, height: 20, right: 110, bottom: 30 }]
    Range.prototype.getBoundingClientRect = () => ({ left: 10, top: 10, width: 100, height: 20, right: 110, bottom: 30 })
    if (document.querySelector('#rlx-layer')) press()
  })

  const tool = () => document.querySelector('.rlx-tool')
  const press = () => tool().click()
  const note = () => document.querySelector('#rlx-note')
  const asked = () => chrome.runtime.sendMessage.mock.calls
  const settled = (what) => vi.waitFor(() => { if (!document.querySelector(what)) throw new Error(`no ${what}`) })
  const point = (x, y) => document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }))
  const button = (label) => [...note().querySelectorAll('button')].find((b) => b.textContent === label)
  const lint = async (...lints) => {
    answer = { slug: 'epilepsy', article_type: 'general', lints }
    press()
    await settled('.rlx-mark')
  }

  it('asks the linter nothing until pressed', () => {
    expect(tool().previousElementSibling.matches('.rcx-btn-chars')).toBe(true)
    expect(asked()).toHaveLength(0)
  })

  it('marks a finding and counts it, without touching the editor or showing a note', async () => {
    await lint(finding())

    expect(asked().at(-1)[0]).toEqual({ type: 'lint', slug: 'epilepsy' })
    expect(tool().textContent).toBe('1')
    expect(tool().classList.contains('rcx-open')).toBe(true)
    expect(note().hidden).toBe(true)
    expect(document.querySelector('#editor').innerHTML).toBe(TEXT)
    expect(document.querySelector('#rlx-bar')).toBeNull()
  })

  it('shows the note on pointing at the mark, and hides it on leaving', async () => {
    await lint(finding())

    point(20, 15)
    await vi.waitFor(() => expect(note().hidden).toBe(false))
    expect(note().textContent).toContain('Avoid this word')
    expect(button('Apply')).toBeUndefined()

    point(400, 400)
    await vi.waitFor(() => expect(note().hidden).toBe(true))
  })

  it('draws nothing for words scrolled out of the editor', async () => {
    answer = { slug: 'epilepsy', article_type: 'general', lints: [finding()] }
    Range.prototype.getClientRects = () => [{ left: 10, top: 300, width: 100, height: 20, right: 110, bottom: 320 }]
    press()
    await vi.waitFor(() => expect(tool().textContent).toBe('1'))

    expect(document.querySelector('.rlx-mark')).toBeNull()
  })

  it('ignores a finding for this tab, through a re-lint', async () => {
    await lint(finding(), COMMA)
    expect(tool().textContent).toBe('2')
    Range.prototype.getClientRects = () => [{ left: 10, top: 10, width: 100, height: 20, right: 110, bottom: 30 }]

    point(20, 15)
    await vi.waitFor(() => expect(note().hidden).toBe(false))
    let message = note().querySelector('.rlx-msg').textContent
    button('Ignore').click()
    expect(tool().textContent).toBe('1')

    press()
    press()
    await vi.waitFor(() => expect(tool().textContent).toBe('1'))
    point(20, 15)
    await vi.waitFor(() => expect(note().hidden).toBe(false))
    expect(note().querySelector('.rlx-msg').textContent).not.toBe(message)
  })

  it('applies a comma at the place it is missing', async () => {
    document.execCommand.mockClear()
    await lint(COMMA)

    point(20, 15)
    await vi.waitFor(() => expect(button('Apply')).toBeDefined())
    button('Apply').click()

    expect(document.execCommand).toHaveBeenCalledWith('insertText', false, ',')
    let { focusNode, focusOffset } = document.getSelection()
    expect(focusNode.textContent.slice(0, focusOffset)).toBe('Forms are infantile, juvenile')
    expect(tool().textContent).toBe('')
  })

  describe('with a fix from the linter', () => {
    const CAROTID = '<p><a href="/a">cardiac embolism</a> (e.g. <a href="/b">atrial fibrillation</a>, endocarditis)</p>'
    const CAROTID_PLAIN = 'cardiac embolism (e.g. atrial fibrillation, endocarditis)'
    const inlineEg = finding({
      matched: ' (e.g. atrial fibrillation, endocarditis)', position: 40, severity: 'suggestion',
      condition: 'Radiopaedia.InlineEG', message: 'Consider an inline e.g.', match: CAROTID, trimmed: CAROTID_PLAIN,
      suggestions: [', e.g. atrial fibrillation, endocarditis'],
    })
    const pointAtIt = async () => {
      point(20, 15)
      await vi.waitFor(() => expect(note().hidden).toBe(false))
    }
    // What each command was given: the words selected, or where the caret was.
    const commands = () => {
      const seen = []
      document.execCommand.mockImplementation((command, ui, value) => {
        const selection = document.getSelection()
        seen.push({
          command, value, selected: selection.toString(), node: selection.focusNode.textContent,
          offset: selection.focusOffset, inLink: !!selection.focusNode.parentElement.closest('a'),
        })
        return true
      })
      return seen
    }

    afterEach(() => document.execCommand.mockImplementation(() => true))

    it('shows the fix and changes only the words that differ', async () => {
      const seen = commands()
      await lint(finding({ suggestions: ['often'] }))
      await pointAtIt()
      expect(note().querySelector('.rlx-fix').textContent).toBe('often')

      button('Apply').click()

      expect(seen.map(({ command, value, selected }) => [command, value, selected]))
        .toEqual([['insertText', 'often', 'usually']])
      expect(tool().textContent).toBe('')
    })

    it('turns a bracketed e.g. inline without touching the links inside it', async () => {
      document.querySelector('#editor').innerHTML = CAROTID
      const seen = commands()
      await lint(inlineEg)
      await pointAtIt()
      expect(note().querySelector('.rlx-fix').textContent).toBe(', e.g. atrial fibrillation, endocarditis')

      button('Apply').click()

      expect(seen.map(({ command, value, selected }) => [command, value, selected])).toEqual([
        ['delete', undefined, ')'],
        ['delete', undefined, '('],
        ['insertText', ',', ''],
      ])
      // The comma goes after the link, in front of the space, not at the end of the link.
      expect(seen[2]).toMatchObject({ node: ' (e.g. ', offset: 0, inLink: false })
    })

    it('takes out spaces, which the index does not hold', async () => {
      document.querySelector('#editor').innerHTML = '<p>A size of 5 - 7 is seen in most of these patients.</p>'
      const seen = commands()
      await lint(finding({
        matched: '5 - 7', position: 14, condition: 'Radiopaedia.NumberSpacing', message: 'No spaces in a range',
        match: '<p>A size of 5 - 7 is seen in most of these patients.</p>',
        trimmed: 'A size of 5 - 7 is seen in most of these patients.', suggestions: ['5-7'],
      }))
      await pointAtIt()
      button('Apply').click()

      expect(seen.map(({ command, selected }) => [command, selected])).toEqual([['delete', ' '], ['delete', ' ']])
    })

    it('says what will go when the fix is to delete the words', async () => {
      await lint(finding({ suggestions: [''] }))
      await pointAtIt()

      expect(note().querySelector('.rlx-fix').textContent).toBe('Remove "usually"')
      expect(button('Apply')).toBeDefined()
    })

    it('shows both readings of an ambiguous fix and applies neither', async () => {
      await lint(finding({ suggestions: ['there is', 'there has'] }))
      await pointAtIt()

      expect(note().querySelector('.rlx-fix').textContent).toBe('there is or there has')
      expect(button('Apply')).toBeUndefined()
    })

    it('stays a message when the fix moves a tag', async () => {
      await lint(finding({ matched: '<strong>usually:</strong>', suggestions: ['<strong>usually</strong>:'] }))
      await pointAtIt()

      expect(note().querySelector('.rlx-fix')).toBeNull()
      expect(button('Apply')).toBeUndefined()
    })

    it('reads a comparison sign as text, not a tag', async () => {
      document.querySelector('#editor').innerHTML = '<p>Seen when the size is < 5 in most of these patients.</p>'
      await lint(finding({
        matched: '< 5', position: 25, condition: 'Radiopaedia.NumberComparisons', message: 'No space after the sign',
        match: '<p>Seen when the size is &lt; 5 in most of these patients.</p>',
        trimmed: 'Seen when the size is < 5 in most of these patients.', suggestions: ['<5'],
      }))
      await pointAtIt()

      expect(note().querySelector('.rlx-fix').textContent).toBe('<5')
      expect(button('Apply')).toBeDefined()
    })
  })

  describe('after an edit', () => {
    const edit = async (from, to) => {
      const text = document.querySelector('#editor p').firstChild
      text.data = text.data.replace(from, to)
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    // The comma after 'adolescent', and the linter's position counts from 1.
    const SECOND_COMMA = finding({ matched: ',', position: TEXT.indexOf('adolescent,') + 'adolescent,'.length })

    it('keeps a finding when another word in its paragraph changes', async () => {
      await lint(finding(), COMMA)

      await edit('Forms are', 'Types are')

      expect(tool().textContent).toBe('2')
    })

    it('closes only the finding whose own words changed, and ctrl-Z brings it back', async () => {
      await lint(finding(), COMMA)

      await edit('usually', 'often')
      expect(tool().textContent).toBe('1')

      await edit('often', 'usually')
      expect(tool().textContent).toBe('2')
    })

    it('tells one comma from another', async () => {
      await lint(SECOND_COMMA)

      await edit('Forms are', 'Types are')
      expect(tool().textContent).toBe('1')

      await edit('adolescent,', 'adolescent')
      expect(tool().textContent).toBe('')
    })
  })

  it('closes the findings when pressed again', async () => {
    await lint(finding())
    press()

    expect(document.querySelector('#rlx-layer')).toBeNull()
    expect(tool().classList.contains('rcx-open')).toBe(false)
  })

  it('says so when there is nothing to fix', async () => {
    answer = { slug: 'epilepsy', article_type: 'general', lints: [] }
    press()
    await settled('#rlx-banner')

    expect(document.querySelector('#rlx-banner').textContent).toContain('Nothing to lint')
  })
})

describe('Lint on the article page', () => {
  const lintLink = () => [...document.querySelectorAll('#edit-dropdown a')].find((a) => a.textContent === 'Lint article')
  let observe

  beforeAll(() => {
    window.history.pushState({}, '', '/articles/epilepsy')
    document.body.innerHTML = '<div id="edit-dropdown"><ul class="jq-dropdown-menu">' +
      '<li><a class="radioupdater-review-link">Review article</a></li>' +
      '<li><a href="https://docs.google.com/forms/d/x">Report problem with article</a></li>' +
      '</ul></div>'
    chrome.runtime.sendMessage.mockReset()
    chrome.runtime.sendMessage.mockImplementation((message, reply) => reply({ status: 200, text: '{"slug":"epilepsy","lints":[]}' }))
    vi.spyOn(console, 'info').mockImplementation(() => {})
    // Disconnected below, or the observer fires as jsdom tears the page down.
    observe = vi.spyOn(MutationObserver.prototype, 'observe')
    delete require.cache[require.resolve('../radioUpdater/assets/js/lint.js')]
    require('../radioUpdater/assets/js/lint.js')
  })

  afterAll(() => observe.mock.contexts.forEach((observer) => observer.disconnect()))

  it('stands beneath Review article in the menu, and asks nothing until pressed', () => {
    let items = [...document.querySelectorAll('#edit-dropdown li')].map((li) => li.textContent)

    expect(items).toEqual(['Review article', 'Lint article', 'Report problem with article'])
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('stays on the page with a word when there is nothing to fix', async () => {
    sessionStorage.clear()
    lintLink().click()

    expect(chrome.runtime.sendMessage.mock.calls[0][0]).toEqual({ type: 'lint', slug: 'epilepsy' })
    await vi.waitFor(() => expect(document.querySelector('#rlx-banner').textContent).toContain('Nothing to lint'))
    expect(lintLink().classList.contains('rlx-busy')).toBe(false)
  })
})

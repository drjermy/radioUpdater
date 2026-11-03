import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

globalThis.chrome = { runtime: { id: 'test', getManifest: () => ({ version: '9.9.9' }), sendMessage: vi.fn() } }

const { answerCitePicker } = require('../radioUpdater/assets/js/citePickerBridge.js')

describe('answerCitePicker', () => {
  beforeEach(() => {
    chrome.runtime.sendMessage.mockReset()
    window.postMessage = vi.fn()
  })

  it("passes the picker's lookup to the background worker and posts the answer back", () => {
    chrome.runtime.sendMessage.mockImplementation((message, reply) => reply({ data: { citation: 'Smith J. A title.' } }))

    answerCitePicker({ source: window, data: { type: 'rcx-cite-ask', id: 'a1', search: '12345678' } })

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ msg: '12345678', cache: '' }, expect.any(Function))
    expect(window.postMessage).toHaveBeenCalledWith(
      { type: 'rcx-cite-answer', id: 'a1', data: { citation: 'Smith J. A title.' } },
      location.origin,
    )
  })

  it('explains a rate-limited lookup', () => {
    chrome.runtime.sendMessage.mockImplementation((message, reply) => reply({ data: { error: 'rate-limited', retryAfter: 60 } }))

    answerCitePicker({ source: window, data: { type: 'rcx-cite-ask', id: 'a2', search: '12345678' } })

    expect(window.postMessage.mock.calls[0][0].data).toEqual({ error: 'The citation tool is busy. Try again in a minute.' })
  })

  it('ignores messages that are not lookups from this page', () => {
    answerCitePicker({ source: window, data: { type: 'something-else' } })
    answerCitePicker({ source: null, data: { type: 'rcx-cite-ask', id: 'a3', search: 'x' } })

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })
})

describe('citePicker', () => {
  it('starts on a page and reports the radioUpdater version', () => {
    document.documentElement.dataset.radioupdater = '9.9.9'
    vi.spyOn(console, 'info').mockImplementation(() => {})

    require('../radioUpdater/assets/js/renumber.js')
    require('../radioUpdater/assets/js/citePicker.js')

    expect(window.radiopaediaCite.look().version).toBe('radioUpdater v9.9.9')
  })
})

describe('Looking up a paper in the picker', () => {
  const SEARCH = '10.1042/cs20150451'
  const answer = {
    citation: 'Semenza G. A paper. Clin Sci. 2016.',
    retraction: { event: 'expression_of_concern', date: '2026-09-16', notice_url: 'https://doi.org/10.1042/cs20150451_eoc' },
  }

  beforeAll(() => {
    window.history.pushState({}, '', '/articles/epilepsy/edit')
    document.body.innerHTML =
      '<div><div class="bar"><button>B</button><button>H2</button><button>H3</button></div>' +
      '<div contenteditable="true" class="ProseMirror"><p>Some text that is long enough to be the article.</p></div></div>' +
      '<fieldset class="references">' +
      '<div class="row"><input type="checkbox" name="r[0][_destroy]"><textarea>1. Smith J. A paper. 2001.</textarea></div>' +
      '<div class="row"><input type="checkbox" name="r[1][_destroy]"><textarea>2. Jones K. Another paper. 2002.</textarea></div>' +
      '</fieldset>'
    Element.prototype.getBoundingClientRect = () => ({ left: 10, top: 10, right: 60, bottom: 30, width: 50, height: 20 })
    Element.prototype.scrollIntoView = () => {}
    require('../radioUpdater/assets/js/retraction.js')
    chrome.runtime.sendMessage.mockImplementation((message, reply) => reply({ data: answer }))
    // The page and the bridge are in different worlds, and talk only by message.
    vi.spyOn(window, 'postMessage').mockImplementation((data) => {
      if (data.type === 'rcx-cite-ask') answerCitePicker({ source: window, data })
      if (data.type === 'rcx-cite-answer') window.dispatchEvent(new MessageEvent('message', { source: window, data }))
    })
  })

  const look = async () => {
    await vi.waitFor(() => expect(document.querySelector('.rcx-btn-cite')).not.toBeNull())
    document.querySelector('.rcx-btn-cite').click()
    let input = document.querySelector('.rcx-panel input')
    input.value = SEARCH
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(document.querySelector('.rcx-found')).not.toBeNull())
  }

  it('warns before the paper is added, and again from the stored answer', async () => {
    await look()
    expect(document.querySelector('.rcx-found .radioupdater-retraction').textContent).toContain('expression of concern')

    document.querySelector('.rcx-btn-cite').click()
    await look()
    expect(document.querySelector('.rcx-found .radioupdater-retraction').textContent).toContain('expression of concern')
    expect(window.postMessage.mock.calls.filter(([data]) => data.type === 'rcx-cite-ask')).toHaveLength(1)
  })

  it('stops counting a reference once it has been removed', () => {
    expect(window.radiopaediaCite.look().references).toBe(2)

    document.querySelector('input[name="r[1][_destroy]"]').checked = true
    expect(window.radiopaediaCite.look().references).toBe(1)

    document.querySelector('input[name="r[1][_destroy]"]').checked = false
  })
})

describe('manifest', () => {
  it('lists no file in both worlds, where it does not reach the page', () => {
    let { content_scripts: entries } = JSON.parse(require('fs').readFileSync('radioUpdater/manifest.json', 'utf8'))
    let [isolated, main] = [entries.find((e) => !e.world).js, entries.find((e) => e.world === 'MAIN').js]

    expect(isolated.filter((file) => main.includes(file))).toEqual([])
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

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

    require('../radioUpdater/assets/js/citePicker.js')

    expect(window.radiopaediaCite.look().version).toBe('radioUpdater v9.9.9')
  })
})

import { describe, it, expect, vi } from 'vitest'

const { checkInBatches, CHECK_ALL_BATCH } = require('../radioUpdater/assets/js/cite.js')

require('../radioUpdater/assets/js/retraction.js')

describe('checkInBatches', () => {
  it('sends references a batch at a time, in order', async () => {
    let ids = Array.from({ length: CHECK_ALL_BATCH * 2 + 1 }, (_, i) => 'ref_' + i)
    let sendBatch = vi.fn(async () => ({ results: [] }))
    let onProgress = vi.fn()

    await checkInBatches(ids, sendBatch, vi.fn(), onProgress)

    expect(sendBatch.mock.calls.map(call => call[0])).toEqual([
      ids.slice(0, CHECK_ALL_BATCH),
      ids.slice(CHECK_ALL_BATCH, CHECK_ALL_BATCH * 2),
      ids.slice(CHECK_ALL_BATCH * 2),
    ])
    expect(onProgress.mock.calls.map(call => call[0])).toEqual([CHECK_ALL_BATCH, CHECK_ALL_BATCH * 2, ids.length])
  })

  it('waits for Retry-After and resends a rate-limited batch', async () => {
    let sendBatch = vi.fn()
      .mockResolvedValueOnce({ error: 'rate-limited', retryAfter: 12 })
      .mockResolvedValue({ results: [] })
    let wait = vi.fn(async () => {})
    let onProgress = vi.fn()

    await checkInBatches(['a', 'b'], sendBatch, wait, onProgress)

    expect(sendBatch).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(12000)
    expect(onProgress).toHaveBeenCalledWith(2, 2, 12)
  })

  it('moves on after three rate-limited attempts', async () => {
    let sendBatch = vi.fn(async () => ({ error: 'rate-limited', retryAfter: 1 }))
    let ids = Array.from({ length: CHECK_ALL_BATCH + 1 }, (_, i) => 'ref_' + i)

    await checkInBatches(ids, sendBatch, vi.fn(async () => {}))

    expect(sendBatch).toHaveBeenCalledTimes(6)
  })
})

describe('Check all references button', () => {
  it('checks every unchecked reference on an article edit page in one batch request', async () => {
    Object.assign(globalThis, require('../radioUpdater/assets/js/helperScripts.js'))
    let sent = []
    globalThis.chrome = {
      runtime: {
        id: 'test',
        sendMessage: (message, respond) => {
          sent.push(message)
          setTimeout(() => respond({ data: { results: [
            { citation: 'Cited first', match: true },
            { error: 'Could not recognise the input.', status: 422 },
          ] } }), 0)
        },
      },
    }

    document.body.innerHTML = '<form><fieldset class="references">'
      + '<div><textarea id="ref_1">first</textarea></div>'
      + '<div><textarea id="ref_2"></textarea></div>'
      + '<div><textarea id="ref_3">third</textarea></div>'
      + '</fieldset></form>'

    const { updateArticleEdit } = require('../radioUpdater/assets/js/cite.js')
    updateArticleEdit()

    let button = document.getElementById('radioupdater-check-all')
    expect(button.closest('fieldset')).toBeNull()

    button.click()
    expect(button.disabled).toBe(true)
    await vi.waitFor(() => expect(button.disabled).toBe(false))

    expect(sent).toEqual([{ type: 'batch', references: ['first', 'third'] }])
    expect(document.getElementById('ref_1_status').innerText).toBe('Match')
    expect(document.getElementById('ref_1_pre').textContent).toBe('Cited first')
    expect(document.getElementById('ref_3_status').innerText).toBe('Error')
    expect(button.innerText).toBe('Check all references')
  })
})

describe('Check reference button', () => {
  const setup = (answer) => {
    Object.assign(globalThis, require('../radioUpdater/assets/js/helperScripts.js'))
    let sent = []
    globalThis.chrome = {
      runtime: {
        id: 'test',
        sendMessage: (message, respond) => {
          sent.push(message)
          respond({ data: answer() })
        },
      },
    }
    document.body.innerHTML = '<form><fieldset class="references"><div><textarea id="ref_1">first</textarea></div></fieldset></form>'
    require('../radioUpdater/assets/js/cite.js').updateArticleEdit()
    return { sent, button: document.getElementById('ref_1_button') }
  }

  it('does nothing on hover, checks on a click, and checks afresh on the next', () => {
    let { sent, button } = setup(() => ({ citation: 'Cited', match: true }))

    expect(button.textContent).toBe('Check reference')
    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(sent).toEqual([])

    button.click()
    button.click()

    expect(sent).toEqual([{ msg: 'first', cache: '' }, { msg: 'first', cache: 'refresh' }])
    expect(button.textContent).toBe('Check reference')
  })

  it('warns of a retraction under the reference, and clears it on the next check', () => {
    let retraction = { event: 'retraction', date: '2020-01-02', notice_url: 'https://doi.org/10.1000/notice' }
    let answers = [{ citation: 'Cited', match: true, retraction }, { citation: 'Cited', match: true, retraction: null }]
    let { button } = setup(() => answers.shift())

    button.click()
    expect(document.getElementById('ref_1_retraction').textContent).toContain('This paper has been retracted')

    button.click()
    expect(document.getElementById('ref_1_retraction')).toBeNull()
  })
})

describe('Article reference observer', () => {
  it('sets up a newly added reference even when a status text change comes first', async () => {
    Object.assign(globalThis, require('../radioUpdater/assets/js/helperScripts.js'))
    globalThis.chrome = { runtime: { id: 'test', sendMessage: vi.fn() } }
    let errors = []
    window.addEventListener('error', event => errors.push(event.error))

    document.body.innerHTML = '<form><fieldset class="references">'
      + '<div><textarea id="ref_1">first</textarea></div>'
      + '</fieldset></form>'

    const { updateArticleEdit } = require('../radioUpdater/assets/js/cite.js')
    updateArticleEdit()

    document.getElementById('ref_1_status').textContent = 'Searching' // as innerText does in a browser; jsdom's innerText adds no text node
    let added = document.createElement('div')
    added.innerHTML = '<textarea id="ref_2">second</textarea>'
    document.querySelector('fieldset.references').appendChild(added)

    await vi.waitFor(() => expect(document.getElementById('ref_2_button')).not.toBeNull())
    expect(errors).toEqual([])
  })
})

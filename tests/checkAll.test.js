import { describe, it, expect, vi } from 'vitest'

const { checkInBatches, CHECK_ALL_BATCH } = require('../radioUpdater/assets/js/cite.js')

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

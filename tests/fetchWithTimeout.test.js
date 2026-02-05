import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock chrome.runtime before requiring background.js
globalThis.chrome = { runtime: { onMessage: { addListener: vi.fn() } } }

const { fetchWithTimeout, FETCH_TIMEOUT } = require('../radioUpdater/background.js')

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves with the fetch response on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve('ok')
    })

    const response = await fetchWithTimeout('https://example.com')
    expect(await response.text()).toBe('ok')
  })

  it('passes options through to fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ text: () => Promise.resolve('') })

    await fetchWithTimeout('https://example.com', { method: 'POST', body: 'data' })

    const callOptions = fetch.mock.calls[0][1]
    expect(callOptions.method).toBe('POST')
    expect(callOptions.body).toBe('data')
    expect(callOptions.signal).toBeDefined()
  })

  it('attaches an AbortSignal to the fetch request', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({})

    await fetchWithTimeout('https://example.com')

    const callOptions = fetch.mock.calls[0][1]
    expect(callOptions.signal).toBeInstanceOf(AbortSignal)
  })

  it('rejects when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    await expect(fetchWithTimeout('https://example.com')).rejects.toThrow('network error')
  })

  it('aborts after the timeout period', async () => {
    vi.useFakeTimers()

    globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
      return new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    })

    const promise = fetchWithTimeout('https://example.com')

    vi.advanceTimersByTime(FETCH_TIMEOUT)

    await expect(promise).rejects.toThrow('aborted')

    vi.useRealTimers()
  })

  it('has a 30 second timeout', () => {
    expect(FETCH_TIMEOUT).toBe(30000)
  })
})

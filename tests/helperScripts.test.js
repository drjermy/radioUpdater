import { describe, it, expect } from 'vitest'

const { decodeHTML, sanitizeHTML, createButton, createHiddenDiv } = require('../radioUpdater/assets/js/helperScripts.js')

describe('decodeHTML', () => {
  it('decodes basic HTML entities', () => {
    expect(decodeHTML('&amp;')).toBe('&')
    expect(decodeHTML('&lt;')).toBe('<')
    expect(decodeHTML('&gt;')).toBe('>')
    expect(decodeHTML('&quot;')).toBe('"')
  })

  it('passes through plain text unchanged', () => {
    expect(decodeHTML('hello world')).toBe('hello world')
  })

  it('decodes mixed content', () => {
    expect(decodeHTML('Smith &amp; Jones &lt;2024&gt;')).toBe('Smith & Jones <2024>')
  })

  it('handles empty string', () => {
    expect(decodeHTML('')).toBe('')
  })
})

describe('sanitizeHTML', () => {
  it('preserves safe HTML', () => {
    expect(sanitizeHTML('<div class="new">text</div>')).toBe('<div class="new">text</div>')
  })

  it('preserves diff markup structure', () => {
    const diff = '<div class="diff-wrapper"><span class="old">old</span><span class="new">new</span></div>'
    expect(sanitizeHTML(diff)).toBe(diff)
  })

  it('strips script tags', () => {
    expect(sanitizeHTML('<div>safe</div><script>alert(1)</script>')).toBe('<div>safe</div>')
  })

  it('strips style tags', () => {
    expect(sanitizeHTML('<div>safe</div><style>body{display:none}</style>')).toBe('<div>safe</div>')
  })

  it('strips iframe tags', () => {
    expect(sanitizeHTML('<div>safe</div><iframe src="evil.com"></iframe>')).toBe('<div>safe</div>')
  })

  it('strips object tags', () => {
    expect(sanitizeHTML('<div>safe</div><object data="evil.swf"></object>')).toBe('<div>safe</div>')
  })

  it('strips embed tags', () => {
    expect(sanitizeHTML('<div>safe</div><embed src="evil.swf">')).toBe('<div>safe</div>')
  })

  it('removes onclick attributes', () => {
    expect(sanitizeHTML('<div onclick="alert(1)">text</div>')).toBe('<div>text</div>')
  })

  it('removes onerror attributes', () => {
    expect(sanitizeHTML('<img src="x" onerror="alert(1)">')).toBe('<img src="x">')
  })

  it('removes onload attributes', () => {
    expect(sanitizeHTML('<body onload="alert(1)">text</body>')).toBe('text')
  })

  it('removes onmouseover attributes', () => {
    expect(sanitizeHTML('<div onmouseover="alert(1)">text</div>')).toBe('<div>text</div>')
  })

  it('handles combined attack vectors', () => {
    const malicious = '<div onclick="steal()">ok</div><script>alert(1)</script><img onerror="hack()" src="x">'
    const result = sanitizeHTML(malicious)
    expect(result).not.toContain('script')
    expect(result).not.toContain('onclick')
    expect(result).not.toContain('onerror')
    expect(result).toContain('ok')
  })

  it('handles empty string', () => {
    expect(sanitizeHTML('')).toBe('')
  })
})

describe('createButton', () => {
  it('creates a button element', () => {
    const btn = createButton('btn-default')
    expect(btn.tagName).toBe('BUTTON')
  })

  it('adds btn class and the provided class', () => {
    const btn = createButton('btn-secondary')
    expect(btn.classList.contains('btn')).toBe(true)
    expect(btn.classList.contains('btn-secondary')).toBe(true)
  })
})

describe('createHiddenDiv', () => {
  it('creates a div with the given id', () => {
    const child = document.createTextNode('test')
    const div = createHiddenDiv('my-id', child)
    expect(div.tagName).toBe('DIV')
    expect(div.id).toBe('my-id')
  })

  it('has the hidden class', () => {
    const child = document.createTextNode('test')
    const div = createHiddenDiv('my-id', child)
    expect(div.classList.contains('hidden')).toBe(true)
  })

  it('contains the child element', () => {
    const child = document.createTextNode('hello')
    const div = createHiddenDiv('my-id', child)
    expect(div.textContent).toBe('hello')
  })
})

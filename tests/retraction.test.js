import { describe, it, expect } from 'vitest'

const { retractionNotice } = require('../radioUpdater/assets/js/retraction.js')

describe('retractionNotice', () => {
  it('warns of a retraction, with its date and notice', () => {
    let notice = retractionNotice({ event: 'retraction', date: '2020-01-02', notice_url: 'https://doi.org/10.1000/notice' })

    expect(notice.textContent).toBe('This paper has been retractedRecorded by Retraction Watch on 2020-01-02. Read the notice')
    expect(notice.querySelector('a').href).toBe('https://doi.org/10.1000/notice')
    expect(notice.classList.contains('radioupdater-retraction-concern')).toBe(false)
  })

  it('warns less loudly of an expression of concern', () => {
    let notice = retractionNotice({ event: 'expression_of_concern', date: null, notice_url: null })

    expect(notice.textContent).toBe('This paper has an expression of concernRecorded by Retraction Watch. ')
    expect(notice.querySelector('a')).toBeNull()
    expect(notice.classList.contains('radioupdater-retraction-concern')).toBe(true)
  })

  it('says nothing of a reinstatement, or of no retraction', () => {
    expect(retractionNotice({ event: 'reinstatement', date: null, notice_url: null })).toBeNull()
    expect(retractionNotice(null)).toBeNull()
    expect(retractionNotice(undefined)).toBeNull()
  })

  it('does not link to anything but a web address, or write markup from the answer', () => {
    let notice = retractionNotice({ event: 'retraction', date: '<img src=x>', notice_url: 'javascript:alert(1)' })

    expect(notice.querySelector('a')).toBeNull()
    expect(notice.querySelector('img')).toBeNull()
  })
})

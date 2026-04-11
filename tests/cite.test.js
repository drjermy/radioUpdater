import { describe, it, expect } from 'vitest'

const { extractReferenceLinks } = require('../radioUpdater/assets/js/cite.js')

describe('extractReferenceLinks', () => {
  it('extracts a link with its text content', () => {
    let links = extractReferenceLinks('<a href="https://doi.org/10.1234/test">DOI</a>')
    expect(links).toEqual([{ label: 'DOI', url: 'https://doi.org/10.1234/test' }])
  })

  it('extracts multiple links', () => {
    let text = '<a href="https://doi.org/10.1234/test">DOI</a> - <a href="https://pubmed.ncbi.nlm.nih.gov/12345">Pubmed</a>'
    let links = extractReferenceLinks(text)
    expect(links).toHaveLength(2)
    expect(links[0]).toEqual({ label: 'DOI', url: 'https://doi.org/10.1234/test' })
    expect(links[1]).toEqual({ label: 'Pubmed', url: 'https://pubmed.ncbi.nlm.nih.gov/12345' })
  })

  it('collapses doi.org links to "DOI" regardless of link text', () => {
    let links = extractReferenceLinks('<a href="https://doi.org/10.1234/test">https://doi.org/10.1234/test</a>')
    expect(links).toEqual([{ label: 'DOI', url: 'https://doi.org/10.1234/test' }])
  })

  it('collapses doi.org links to "DOI" when link text is empty', () => {
    let links = extractReferenceLinks('<a href="https://doi.org/10.1234/test"></a>')
    expect(links).toEqual([{ label: 'DOI', url: 'https://doi.org/10.1234/test' }])
  })

  it('strips www from hostname label', () => {
    let links = extractReferenceLinks('<a href="https://www.ncbi.nlm.nih.gov/pubmed/123"></a>')
    expect(links).toEqual([{ label: 'ncbi.nlm.nih.gov', url: 'https://www.ncbi.nlm.nih.gov/pubmed/123' }])
  })

  it('handles Google Books link', () => {
    let text = '8. Richard S. Irwin. Intensive Care Medicine. (2008) ISBN: 9780781791533 - <a href="http://books.google.com/books?vid=ISBN9780781791533">Google Books</a>'
    let links = extractReferenceLinks(text)
    expect(links).toEqual([{ label: 'Google Books', url: 'http://books.google.com/books?vid=ISBN9780781791533' }])
  })

  it('handles old-style PubMed link', () => {
    let links = extractReferenceLinks('<a href="https://www.ncbi.nlm.nih.gov/pubmed/18302086">Pubmed</a>')
    expect(links).toEqual([{ label: 'Pubmed', url: 'https://www.ncbi.nlm.nih.gov/pubmed/18302086' }])
  })

  it('handles mixed DOI and PubMed links', () => {
    let text = 'Smith J. Title. <a href="https://doi.org/10.1234/test">DOI</a>. <a href="https://pubmed.ncbi.nlm.nih.gov/99999">PMID</a>'
    let links = extractReferenceLinks(text)
    expect(links).toHaveLength(2)
    expect(links.map(l => l.label)).toEqual(['DOI', 'PMID'])
  })

  it('skips anchors with href="#"', () => {
    let links = extractReferenceLinks('<a href="#">skip</a> <a href="https://example.com">keep</a>')
    expect(links).toHaveLength(1)
    expect(links[0].label).toBe('keep')
  })

  it('returns empty array when no links', () => {
    let links = extractReferenceLinks('Smith J. A generic reference with no links. 2024.')
    expect(links).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(extractReferenceLinks('')).toEqual([])
  })

  it('handles plain text with no HTML', () => {
    let links = extractReferenceLinks('doi: 10.1234/test PMID: 12345')
    expect(links).toEqual([])
  })
})

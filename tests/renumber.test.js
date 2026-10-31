import { describe, it, expect } from 'vitest'

const { renumberPlan, renumberReference, classifySuperscript, markerNumbers } = require('../radioUpdater/assets/js/renumber.js')

describe('renumberPlan', () => {
  it('numbers the references in the order the text first cites them', () => {
    let plan = renumberPlan([[3], [1], [3, 1], [2]], [1, 2, 3])

    expect(plan.problems).toEqual([])
    expect(plan.order).toEqual([2, 0, 1])
    expect(plan.numbers).toEqual([[1], [2], [1, 2], [3]])
  })

  it('follows the order the numbers are written in within one citation', () => {
    expect(renumberPlan([[4, 2]], [1, 2, 3, 4]).order).toEqual([3, 1, 0, 2])
  })

  it('puts the references the text never cites at the end, in their own order', () => {
    let plan = renumberPlan([[4], [2]], [1, 2, 3, 4])

    expect(plan.order).toEqual([3, 1, 0, 2])
    expect(plan.uncited).toEqual([0, 2])
  })

  it('leaves a list already in citation order as it is', () => {
    let plan = renumberPlan([[1], [1, 2], [3]], [1, 2, 3])

    expect(plan.order).toEqual([0, 1, 2])
    expect(plan.numbers).toEqual([[1], [1, 2], [3]])
  })

  it('reads the references by the numbers written on them, not by their place', () => {
    let plan = renumberPlan([[7], [5]], [5, 7])

    expect(plan.order).toEqual([1, 0])
    expect(plan.numbers).toEqual([[1], [2]])
  })

  it('refuses a list with two references under the same number', () => {
    let plan = renumberPlan([[1], [2]], [1, 2, 2, 4, 4, 4])

    expect(plan.problems).toEqual([{ kind: 'duplicate', n: 2 }, { kind: 'duplicate', n: 4 }])
    expect(plan.order).toBeUndefined()
  })

  it('refuses a citation of a number no reference has', () => {
    let plan = renumberPlan([[1], [9], [5, 9]], [1, 2])

    expect(plan.problems).toEqual([{ kind: 'missing', n: 5 }, { kind: 'missing', n: 9 }])
  })

  it('handles an article with no citations', () => {
    let plan = renumberPlan([], [1, 2])

    expect(plan.order).toEqual([0, 1])
    expect(plan.uncited).toEqual([0, 1])
  })
})

describe('renumberReference', () => {
  it('changes the number in front of a reference and nothing else', () => {
    expect(renumberReference('12. Smith J. A title. AJR 2001;3:4.', 3)).toBe('3. Smith J. A title. AJR 2001;3:4.')
    expect(renumberReference('2) Smith J. 12. Brain', 10)).toBe('10) Smith J. 12. Brain')
  })

  it('keeps the invisible characters in front of the number', () => {
    expect(renumberReference('\u200b4. Smith J.', 1)).toBe('\u200b1. Smith J.')
  })

  it('leaves a reference with no number as it is', () => {
    expect(renumberReference('Smith J. A title. 2001.', 4)).toBe('Smith J. A title. 2001.')
  })
})

describe('markerNumbers', () => {
  it.each([
    ['1', [1]], ['2,4,6', [2, 4, 6]], ['2-4', [2, 3, 4]], ['1, 3–5', [1, 3, 4, 5]], ['\u200b7', [7]],
  ])('reads %s', (text, want) => {
    expect(markerNumbers(text)).toEqual(want)
  })

  it.each(['3-1', '1-400', '2,', ',2', '3.', '99m', '-3', ''])('reads %s as no citation', text => {
    expect(markerNumbers(text)).toBeNull()
  })
})

describe('classifySuperscript', () => {
  // The references are numbered 1 to 20 unless a case says otherwise.
  let known = new Set(Array.from({ length: 20 }, (_, i) => i + 1))
  // The numbers are read by the same markerNumbers the page uses.
  let read = (before, text, after, refs = known) =>
    classifySuperscript({ before, text, after, numbers: markerNumbers(text) }, refs)

  it.each([
    ['after a word, before a full stop', 'Gliomas are common ', '3', '. They enhance'],
    ['before a comma', 'enhance ', '1,2', ', and bleed'],
    ['before a word in lower case', 'enhance ', '2-4', ' and bleed'],
    ['at the end of the paragraph', 'and bleed ', '5', ''],
    ['before a closing bracket', '(as in adults ', '6', ')'],
    ['after a percentage', 'in 30% ', '7', ' of cases'],
    ['written against a word', 'seen in some familial cases', '13-15', '. Disease'],
    ['written against a full stop', 'before skull base surgery.', '5', ''],
    ['written against a closing bracket', '(when both are present)', '1', '.'],
    ['after a year', 'first described in 1890 ', '10', '. Hence'],
    ['after a large number', 'a prevalence of 1 in 100,000 ', '1', '.'],
    ['after a gene name', 'a mutation of NOTCH2 ', '4', '.'],
    ['after a measurement', 'by at least 5 mm ', '4-7', '.'],
    ['after the full stop, before the next sentence', 'before skull base surgery.', '5', ' The study'],
    ['after the full stop and a space', 'are common. ', '3', ' They enhance'],
  ])('reads a citation %s', (label, before, text, after) => {
    expect(read(before, text, after).kind).toBe('citation')
  })

  it.each([
    ['¹⁸F-FDG', 'PET with ', '18', 'F-FDG shows uptake', 'letter-after'],
    ['¹⁸F at the start of the paragraph', '', '18', 'F-FDG PET shows', 'letter-after'],
    ['¹⁸F with a space after it', 'PET with ', '18', ' F-FDG shows', 'capital-after'],
    ['¹⁸ FDG', 'PET with ', '18', ' FDG shows', 'capital-after'],
    ['an element symbol after a space (Tc)', 'labelled with ', '19', ' Tc', 'capital-after'],
    ['¹⁸ fluorodeoxyglucose', 'with ', '18', ' fluorodeoxyglucose', 'element-after'],
    ['¹³ carbon', 'labelled with ', '13', ' carbon', 'element-after'],
    ['(¹⁸F)', 'the tracer (', '18', 'F) shows', 'no-space'],
    ['¹⁸ F after a full stop', 'on PET.', '18', ' F-FDG shows', 'capital-after'],
    ['¹⁸ FDG after a full stop', 'on PET.', '18', ' FDG uptake', 'capital-after'],
    ['an element symbol that starts a sentence', 'is rare.', '3', ' In addition', 'capital-after'],
    ['an element name after a full stop', 'on PET.', '18', ' Fluorine-18 uptake', 'element-after'],
    ['a capital with no full stop before', 'enhance ', '3', ' MRI shows', 'capital-after'],
    ['an exponent against a short word', 'E = 0.5mv', '2', ', where', 'no-space'],
    ['an exponent against a number', 'a pressure of 10', '5', ' pascals', 'no-space'],
    ['a citation against a comma', 'after the first episode 2,', '4,9,11', '. During', 'no-space'],
    ['a citation against a capital', 'lesions in the CNS', '16', '. In half', 'no-space'],
    ['a number after a number', 'a count of 10 ', '9', '/L', 'number-before'],
    ['a number after a small number', 'associated with trisomy 21 ', '1', '.', 'number-before'],
    ['a number after a unit', 'measuring 5 mm ', '2', ' in area', 'unit-before'],
    ['a number followed by a hyphen', 'uptake of ', '11', '-C', 'sign-after'],
  ])('holds %s as a doubt', (label, before, text, after, reason) => {
    expect(read(before, text, after)).toEqual({ kind: 'doubt', reason })
  })

  it.each([
    ['⁹⁹ᵐTc', 'labelled with ', '99m', 'Tc-MDP', 'not-numbers'],
    ['Ca²⁺', 'serum Ca', '2+', ' levels', 'not-numbers'],
    ['a negative exponent', '1.2 × 10', '-3', ' mm²/s', 'exponent'],
    ['cm³', 'a volume of 30 cm', '3', '.', 'unit'],
    ['mm²', 'an area of 4 mm', '2', ' at most', 'unit'],
    ['× 10⁹', 'platelets of 150 × 10', '9', '/L', 'exponent'],
    ['x 10⁹ with spaces', 'count of 4 x 10 ', '9', '/L', 'exponent'],
    ['¹⁸F where no reference has 18', 'PET with ', '18', 'F-FDG', 'unknown-numbers'],
  ])('skips %s', (label, before, text, after, reason) => {
    let refs = label.includes('no reference') ? new Set([1, 2, 3]) : known
    expect(read(before, text, after, refs)).toEqual({ kind: 'skip', reason })
  })

  it('reads a citation of a number no reference has as missing', () => {
    expect(read('are common ', '25', '.').kind).toBe('missing')
  })

  it.each([
    ['a full stop inside', 'are common ', '3.', ' They'],
    ['a colon inside', 'Findings include ', '2:', ''],
    ['a full stop for a comma', 'with marked oedema ', '2.3', ''],
    ['a bracket inside', 'in the pons ', '4)', ''],
  ])('holds a citation with %s as malformed', (label, before, text, after) => {
    expect(read(before, text, after).kind).toBe('malformed')
  })

  it('skips a decimal none of whose numbers is a reference', () => {
    expect(read('raised to ', '0.5', '', new Set([1, 2, 3]))).toEqual({ kind: 'skip', reason: 'unknown-numbers' })
  })

  it('reads half of a citation the editor split in two as malformed', () => {
    expect(read('enhance 1', ',2', '.').kind).toBe('malformed')
  })
})

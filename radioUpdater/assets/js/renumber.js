// Numbers an article's references in the order its text first cites them, the way
// Zotero and EndNote number a bibliography. This file works on numbers only:
// citePicker.js reads the citation markers and the reference boxes off the page,
// asks here what each should become, shows that, and writes it back.

// markers: the numbers each citation marker cites, in reading order.
// refs: the number each reference carries, in list order.
//
// When every marker can be matched to exactly one reference, the answer is
//   order    the reference indexes in their new order, the uncited ones last
//   uncited  the indexes of the references no marker cites, in list order
//   numbers  each marker's numbers, renumbered
// and otherwise only `problems`, with nothing to apply: two references with the
// same number, or a marker citing a number no reference has.
function renumberPlan(markers, refs)
{
    let at = new Map()
    let duplicates = new Set()

    refs.forEach(function (n, i) {
        if (at.has(n)) duplicates.add(n)
        else at.set(n, i)
    })

    let cited = markers.flat()
    let missing = new Set(cited.filter(n => ! at.has(n)))

    let problems = [
        ...[...duplicates].sort((a, b) => a - b).map(n => ({ kind: 'duplicate', n })),
        ...[...missing].sort((a, b) => a - b).map(n => ({ kind: 'missing', n })),
    ]
    if (problems.length) return { problems }

    let order = []
    let placed = new Set()
    for (let n of cited) {
        let i = at.get(n)
        if (placed.has(i)) continue
        placed.add(i)
        order.push(i)
    }

    let uncited = refs.map((n, i) => i).filter(i => ! placed.has(i))
    order.push(...uncited)

    let renumbered = new Map(order.map((i, k) => [refs[i], k + 1]))

    return {
        problems,
        order,
        uncited,
        numbers: markers.map(numbers => numbers.map(n => renumbered.get(n))),
    }
}

// What a superscript with a digit in it is, read from its text and from the text
// either side of it in its paragraph. A citation is recognised only in the
// contexts listed here; a superscript that could be a citation but stands
// anywhere else is a doubt, which the person decides. Only a superscript that
// cannot be a citation is skipped, because a citation that is missed keeps its
// old number and points at the wrong reference after renumbering.
//
//   sup.text     the superscript's text, invisible characters taken out
//   sup.numbers  what it cites when read as a citation, or null when it does not
//                read as one ("2,", "3-1")
//   sup.before   its paragraph's text before it, and sup.after the text after it
//   known        the numbers the references carry
//
// Returns { kind, reason }, kind being one of
//   citation   cites references the list has, in a citation's context
//   missing    in a citation's context, citing a number no reference has
//   doubt      could be a citation (some reference has one of its numbers), in a
//              context that is not a citation's; reason says which
//   malformed  digits and punctuation that do not read as a citation ("3.",
//              "2,", "2.3"), with a number some reference has
//   skip       cannot be a citation: a letter or + in it (99m, 2+), a negative
//              exponent, a unit or power of ten, or no number a reference has
function classifySuperscript(sup, known)
{
    let text = sup.text.trim()

    if (/[\p{L}+]/u.test(text)) return { kind: 'skip', reason: 'not-numbers' }
    if (/^[-–—]\s*\d/.test(text)) return { kind: 'skip', reason: 'exponent' }
    if (! sup.numbers) {
        // "3.", "2:", "2.3": a citation with a slip of the keyboard in it, unless
        // none of its numbers is a reference's.
        let digits = (text.match(/\d+/g) || []).map(Number)
        return digits.some(n => known.has(n))
            ? { kind: 'malformed', reason: 'malformed' }
            : { kind: 'skip', reason: 'unknown-numbers' }
    }

    if (UNIT_AGAINST.test(sup.before) && /^[23]$/.test(text)) return { kind: 'skip', reason: 'unit' }
    if (TIMES_TEN.test(sup.before)) return { kind: 'skip', reason: 'exponent' }

    let doubt = doubtBefore(sup.before, text) || doubtAfter(sup.after)
    let cited = sup.numbers.filter(n => known.has(n))

    if (! doubt) {
        return cited.length === sup.numbers.length ? { kind: 'citation', reason: null } : { kind: 'missing', reason: 'missing' }
    }
    if (! cited.length) return { kind: 'skip', reason: 'unknown-numbers' }
    return { kind: 'doubt', reason: doubt }
}

// mm², cm³: the unit written against the superscript.
const UNIT_AGAINST = /(?:^|[^\p{L}])(?:mm|cm|dm|km|m|µm|μm|nm)$/u
// × 10⁹, x 10⁻³: a power of ten.
const TIMES_TEN = /(?:×|·|(?:^|\s)x)\s*10\s*$/

// House style puts a space before a citation, after a word: "enhance <sup>1</sup>".
function doubtBefore(before, text)
{
    if (before === '') return null
    if (! /\s$/.test(before)) {
        // Written against a word in lower case, a full stop or a closing bracket,
        // it is still a citation: "cases<sup>23</sup>", "surgery.<sup>5</sup>".
        // Against a capital, a digit, a comma or a short word it may be an
        // exponent or half a citation: "mv<sup>2</sup>", "10<sup>5</sup>",
        // "2,<sup>4,9</sup>" with the 2 left unraised.
        return /(?:\p{Ll}{3,}|[.)])$/u.test(before) ? null : 'no-space'
    }

    let word = before.trimEnd().split(/\s/).pop().replace(/^[([]+|[)\]]+$/g, '')
    if (/^\d+(?:[.,]\d+)*$/.test(word)) {
        // After a year, or a number too big to be raised to a power, comes a
        // citation: "in 1890 <sup>10</sup>", "1 in 100,000 <sup>3</sup>". A small
        // number may be the base of a power.
        let year = /^(?:1[5-9]\d\d|20\d\d)$/.test(word)
        return year || Number(word.replace(/,/g, '')) >= 100 ? null : 'number-before'
    }
    // After a unit, only a 2 or a 3 may be an area or a volume: "5 mm <sup>2</sup>".
    if (/^(?:mm|cm|dm|km|m|µm|μm|nm|ml|mL|l|L)$/u.test(word) && /^[23]$/.test(text)) return 'unit-before'
    return null
}

// After a citation comes punctuation, the end of the paragraph, or a space and a
// word in lower case: "<sup>1</sup>.", "<sup>1</sup> and". An isotope is followed
// by its element's symbol, which starts with a capital ("<sup>18</sup>F-FDG",
// "<sup>99</sup> Tc"), or by its name ("<sup>18</sup> fluorine").
function doubtAfter(after)
{
    if (after === '') return null

    let c = after[0]
    if (/[.,;:)\]"'”’!?]/.test(c)) return null
    if (/[\p{L}\d]/u.test(c)) return 'letter-after'
    if (! /\s/.test(c)) return 'sign-after'

    let next = after.trimStart()
    if (next === '') return null
    if (/^[\p{Lu}\d]/u.test(next)) return 'capital-after'
    if (ELEMENT_WORD.test(next)) return 'element-after'
    return null
}

// The elements whose isotopes radiology names, and the words built on them.
const ELEMENT_WORD = new RegExp('^(?:fluor\\w*|iod\\w*|technetium|gallium|thallium|indium|xenon|krypton|' +
    'rubidium|carbon|oxygen|nitrogen|copper|zirconium|lutetium|yttrium|radium|strontium|samarium|' +
    'rhenium|chromium|selenium|cobalt|phosph\\w*|holmium|erbium|bismuth|actinium|lead|astatine|terbium|' +
    'hydrogen|deuterium|tritium|sodium|potassium|calcium|iron)\\b', 'i')

// The number at the front of a reference ("4. Smith J…"), with any invisible
// characters before it, which Radiopaedia's text often has.
const LEADING_NUMBER = /^([\s\u200b-\u200d\u2060\ufeff\u00ad]*)\d{1,3}(\s*[.)]\s+)/

// A reference with its number changed to n. One without a number is left as it is.
function renumberReference(text, n)
{
    return String(text).replace(LEADING_NUMBER, (all, before, after) => before + n + after)
}

if (typeof window !== 'undefined') {
    window.radioUpdaterRenumber = { plan: renumberPlan, reference: renumberReference, classify: classifySuperscript }
}

if (typeof module !== 'undefined') {
    module.exports = { renumberPlan, renumberReference, classifySuperscript }
}

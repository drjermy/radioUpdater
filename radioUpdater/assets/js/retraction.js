// The warning for a retracted paper, as on radiopaedia.work/cite, for cite.js and
// citePickerBridge.js. A reinstatement gets no warning.

function retractionNotice(retraction) {
    let retracted = retraction?.event === 'retraction'
    if (! retracted && retraction?.event !== 'expression_of_concern') return null

    let notice = document.createElement('div')
    notice.className = 'radioupdater-retraction' + (retracted ? '' : ' radioupdater-retraction-concern')
    notice.setAttribute('role', 'alert')

    let heading = document.createElement('strong')
    heading.textContent = retracted ? 'This paper has been retracted' : 'This paper has an expression of concern'

    let source = document.createElement('div')
    source.textContent = 'Recorded by Retraction Watch' + (retraction.date ? ' on ' + retraction.date : '') + '. '

    if (/^https?:\/\//i.test(retraction.notice_url)) {
        let link = document.createElement('a')
        link.href = retraction.notice_url
        link.target = '_blank'
        link.rel = 'noopener'
        link.textContent = 'Read the notice'
        source.appendChild(link)
    }

    notice.append(heading, source)
    return notice
}

window.radioUpdaterRetractionNotice = retractionNotice

if (typeof module !== 'undefined') {
    module.exports = { retractionNotice }
}

// The extension's half of the citation picker. citePicker.js runs in the page, where
// it can reach the editor but cannot make the request, so it posts each lookup here;
// this hands it to background.js, as the reference checker does, and posts the
// answer back.

function answerCitePicker(event) {
    if (event.source !== window || event.data?.type !== 'rcx-cite-ask') return

    let { id, search } = event.data
    let answer = data => window.postMessage({ type: 'rcx-cite-answer', id, data }, location.origin)

    if (! chrome.runtime?.id) {
        answer({ error: 'radioUpdater was updated: reload the page to look this up.' })
        return
    }

    chrome.runtime.sendMessage({ msg: search, cache: '' }, function (response) {
        let data = chrome.runtime.lastError ? null : response?.data ?? null

        if (data?.error === 'rate-limited') {
            data = { error: 'The citation tool is busy. Try again in a minute.' }
        }

        answer(data)
    })
}

window.addEventListener('message', answerCitePicker)

// For citePicker.js's startup line, which names the version in use.
document.documentElement.dataset.radioupdater = chrome.runtime?.getManifest?.().version ?? ''

if (typeof module !== 'undefined') {
    module.exports = { answerCitePicker }
}

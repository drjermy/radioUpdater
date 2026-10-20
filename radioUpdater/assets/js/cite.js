let requestInFlight = false
let checkAllRunning = false

// radiopaedia.work cites up to ten references per batch request; five keeps each one quick.
const CHECK_ALL_BATCH = 5

function updateArticleEdit() {
    let editReferenceBlock = document.querySelector('fieldset.references')

    if (editReferenceBlock) {
        addCheckAllButton(editReferenceBlock)
        iterateLinks(document.querySelectorAll('[data-citeitright]'))

        iterateRefTextareas(editReferenceBlock.getElementsByTagName('textarea'))

        let observer = new MutationObserver( function(mutations) {
            iterateLinks(editReferenceBlock.querySelectorAll('[data-citeitright]'))

            // Status and button text changes add text nodes, so check every added element.
            for (let mutation of mutations) {
                for (let addedNode of mutation.addedNodes) {
                    let textarea = addedNode.nodeType === Node.ELEMENT_NODE ? addedNode.querySelector('textarea') : null
                    if (textarea) setupNewReference(textarea.id)
                }
            }
        } )

        observer.observe(editReferenceBlock, { attributes: true, childList: true, subtree: true, attributeOldValue: true })
    }
}

function updateCaseEdit() {
    let editReferenceBlock = document.getElementById('case-references')

    if (editReferenceBlock) {
        addCheckAllButton(editReferenceBlock)
        iterateLinks(document.querySelectorAll('[data-citeitright]'))

        iterateRefTextareas(editReferenceBlock.getElementsByTagName('textarea'))

        let observer = new MutationObserver( function() {
            iterateLinks(editReferenceBlock.querySelectorAll('[data-citeitright]'))
            let textareas = editReferenceBlock.querySelectorAll('textarea:not([id$="-1_citation"])')
            for (let textarea of textareas) {
                textarea.style.width = '574px'
                textarea.closest('div').style.width = '600px'
                setupNewReference(textarea.id)
            }
        } )

        observer.observe(editReferenceBlock, { attributes: true, childList: true, subtree: true, attributeOldValue: true })
    }
}

function iterateLinks(links) {
    for (let i = 0; i < links.length; i++) {
        links[i].remove()
    }
}

function iterateRefTextareas(textareas)
{
    for (let i = 0; i < textareas.length; i++) {

        let textarea = textareas[i]
        let actions = document.createElement('div')
        actions.className = 'radioupdater-actions'

        actions.appendChild(citeButton(textarea))
        actions.appendChild(statusButton(textarea))

        textarea.parentNode.appendChild(actions)

        setupReferenceLinks(textarea)
    }
}

function preloadReference(textareaId, cache) {

    if (! startReference(textareaId)) return

    let el = document.getElementById(textareaId)

    let responded = false
    let responseTimeout = setTimeout(function () {
        if (! responded) {
            responded = true
            requestInFlight = false
            showResult(textareaId, null)
        }
    }, 35000)

    requestInFlight = true

    chrome.runtime.sendMessage({msg: el.value, cache: cache}, function (response) {
        if (responded) return
        responded = true
        requestInFlight = false
        clearTimeout(responseTimeout)

        showResult(textareaId, chrome.runtime.lastError ? null : response?.data)
    })

}

/**
 * Clear a reference's previous result and show it as searching. Returns false
 * when there is nothing to look up.
 */
function startReference(textareaId) {

    let el = document.getElementById(textareaId)

    let status = document.getElementById(el.id + '_status')
    let button = document.getElementById(el.id + '_button')
    let preDiv = document.getElementById(el.id + '_pre')
    let diffDiv = document.getElementById(el.id + '_diff')

    if (preDiv) {
        preDiv.remove()
    }

    if (diffDiv) {
        diffDiv.remove()
    }

    if (! el.value) {
        button.disabled = false
        return false
    }

    if (! chrome.runtime?.id) {
        button.disabled = false
        setStatus(status, 'Reload extension', 'red', true)
        return false
    }

    button.disabled = true
    status.classList.remove('hidden')
    setStatus(status, 'Searching', '#74bcf7', true)

    return true
}

/**
 * Show a looked-up citation (or the error in its place) beside its reference.
 */
function showResult(textareaId, data) {

    let el = document.getElementById(textareaId)
    let parent = el.parentNode

    let status = document.getElementById(el.id + '_status')
    let button = document.getElementById(el.id + '_button')

    button.disabled = false
    button.dataset.state = 'loaded'
    button.innerText = "CiteItRight (click)"

    if (! data || data.error || ! data.citation) {
        setStatus(status, data?.error === 'rate-limited' ? 'Rate limited' : 'Error', 'red', true)
        return
    }

    if (data.match) {
        setStatus(status, 'Match', '#74bcf7', true)
    } else {
        setStatus(status, 'Review', '#74bcf7')
    }

    let numberedCitation = document.createTextNode(data.index ? data.index + '. ' + data.citation : data.citation)
    let preDiv = createHiddenDiv(el.id + '_pre', numberedCitation)
    parent.appendChild(preDiv)

    if (parent.getElementsByClassName('differences').length === 0) {
        if (!data.match) {
            let diffDiv = document.createElement('div')
            diffDiv.id = el.id + '_diff'
            diffDiv.innerHTML = sanitizeHTML(data.diff)
            diffDiv.classList.add('differences')
            diffDiv.classList.add('hidden')
            parent.appendChild(diffDiv)
        }
    }
}

function addCheckAllButton(referenceBlock)
{
    if (document.getElementById('radioupdater-check-all')) return

    let button = createButton('btn-default')
    button.id = 'radioupdater-check-all'
    button.innerText = 'Check all references'
    button.addEventListener('click', function (event) {
        event.preventDefault()
        checkAllReferences(this, referenceBlock)
    })

    // Outside the reference block, whose MutationObserver reacts to every change inside it.
    let wrapper = document.createElement('div')
    wrapper.className = 'radioupdater-check-all'
    wrapper.appendChild(button)
    referenceBlock.parentNode.insertBefore(wrapper, referenceBlock)
}

async function checkAllReferences(button, referenceBlock)
{
    if (checkAllRunning) return

    let textareaIds = [...referenceBlock.querySelectorAll('textarea')]
        .filter(textarea => textarea.value.trim() && document.getElementById(textarea.id + '_button')?.dataset.state === 'ready')
        .map(textarea => textarea.id)

    checkAllRunning = true
    button.disabled = true

    await checkInBatches(textareaIds, checkBatch, sleep, function (checked, total, retryAfter) {
        button.innerText = retryAfter
            ? 'Rate limited, retrying in ' + retryAfter + 's'
            : 'Checking ' + checked + ' of ' + total
    })

    checkAllRunning = false
    button.disabled = false
    button.innerText = 'Check all references'
}

/**
 * Sends references to the server a batch at a time, waiting for each batch before
 * the next, and retries a rate-limited batch after the server's Retry-After (up to
 * three attempts).
 */
async function checkInBatches(textareaIds, sendBatch, wait, onProgress = function () {})
{
    for (let start = 0; start < textareaIds.length; start += CHECK_ALL_BATCH) {
        let batch = textareaIds.slice(start, start + CHECK_ALL_BATCH)
        onProgress(start + batch.length, textareaIds.length)

        for (let attempt = 1; attempt <= 3; attempt++) {
            let data = await sendBatch(batch)

            if (data?.error !== 'rate-limited' || attempt === 3) break

            onProgress(start + batch.length, textareaIds.length, data.retryAfter)
            await wait(data.retryAfter * 1000)
        }
    }
}

/**
 * Look up a batch of references in one request and show each result as it lands.
 */
function checkBatch(textareaIds)
{
    let ids = textareaIds.filter(startReference)

    if (ids.length === 0) return Promise.resolve(null)

    let references = ids.map(id => document.getElementById(id).value)

    return new Promise(function (resolve) {
        chrome.runtime.sendMessage({type: 'batch', references: references}, function (response) {
            let data = chrome.runtime.lastError ? null : response?.data
            let results = data?.results ?? []

            ids.forEach((id, i) => showResult(id, results[i] ?? data))

            resolve(data)
        })
    })
}

function sleep(ms)
{
    return new Promise(resolve => setTimeout(resolve, ms))
}

function showDiff(el)
{
    el.innerText = 'Update'

    let diffDiv = document.getElementById(el.dataset.textarea + '_diff')
    if (diffDiv) {
        diffDiv.classList.remove('hidden')
    }
}

function hideDiff(el)
{
    el.innerText = 'Review'

    let diffDiv = document.getElementById(el.dataset.textarea + '_diff')
    if (diffDiv) {
        diffDiv.classList.add('hidden')
    }
}

function statusButton(textarea)
{
    let status = createButton('btn-secondary')
    status.classList.add('hidden')
    status.style.marginLeft = '1rem'
    status.style.marginTop = "1rem"
    status.dataset.textarea = textarea.id
    status.id = textarea.id + '_status'

    addStatusButtonListeners(status)

    return status
}

function addStatusButtonListeners(el)
{
    el.addEventListener("mouseover", function() {
        if (this.dataset.state === 'review') {
            showDiff(this)
        }
    })
    el.addEventListener("mouseout", function() {
        if (this.dataset.state === 'review') {
            hideDiff(this)
        }
    })
    el.addEventListener("click", function(event) {
        event.preventDefault()

        if (this.dataset.state === 'undo') {
            undoCitation(this)
        } else {
            copyCitation(this)
        }

    })
}

function setupNewReference(textareaId)
{
    let textarea = document.getElementById(textareaId)
    if (! textarea) return

    let existingButton = document.getElementById(textareaId + '_button')
    if (existingButton) {
        if (existingButton.dataset.textarea === textareaId) return
        existingButton.closest('div').remove()
    }

    let actions = document.createElement('div')
    actions.className = 'radioupdater-actions'

    actions.appendChild(citeButton(textarea))
    actions.appendChild(statusButton(textarea))

    textarea.parentNode.appendChild(actions)

    setupReferenceLinks(textarea)
}

function citeButton(textarea)
{
    let button = createButton('btn-default')
    button.dataset.textarea = textarea.id
    button.id = textarea.id + '_button'
    button.style.marginTop = "1rem"
    button.dataset.state = 'ready'
    button.appendChild(document.createTextNode("CiteItRight (hover)"))

    addCiteButtonListeners(button)

    return button
}

function addCiteButtonListeners(el)
{
    el.addEventListener("mouseover", function () {
        if (this.dataset.state === 'ready') {
            let button = this
            button._hoverTimeout = setTimeout(function () {
                triggerLoad(button)
            }, 300)
        }
    })
    el.addEventListener("mouseout", function () {
        if (this._hoverTimeout) {
            clearTimeout(this._hoverTimeout)
            this._hoverTimeout = null
        }
    })
    el.addEventListener("click", function (event) {
        event.preventDefault()
        if (this._hoverTimeout) {
            clearTimeout(this._hoverTimeout)
            this._hoverTimeout = null
        }
        triggerLoad(this, 'refresh')
    })
}

function triggerLoad(el, cache = '')
{
    if ((requestInFlight || checkAllRunning) && cache !== 'refresh') return

    preloadReference(el.dataset.textarea, cache)
}

function copyCitation(el)
{
    let textarea = document.getElementById(el.dataset.textarea)
    let preDiv = document.getElementById(el.dataset.textarea + '_pre')

    if (textarea && preDiv) {
        let undoDiv = createHiddenDiv(el.dataset.textarea + '_undo', document.createTextNode(textarea.value))
        el.parentNode.appendChild(undoDiv)

        textarea.value = decodeHTML(preDiv.innerHTML)
        preDiv.remove()
        let diffDiv = document.getElementById(el.dataset.textarea + '_diff')
        if (diffDiv) diffDiv.remove()

        renderReferenceLinks(textarea)

        el.dataset.state = 'undo'
        el.innerText = 'Undo'
    }
}

function undoCitation(el)
{
    let textarea = document.getElementById(el.dataset.textarea)
    let undoDiv = document.getElementById(el.dataset.textarea + '_undo')

    if (textarea && undoDiv) {
        textarea.value = decodeHTML(undoDiv.innerHTML)
        undoDiv.remove()

        renderReferenceLinks(textarea)

        el.classList.add('hidden')
    }
}

function setStatus(status, statusText, statusColour = '#74bcf7', disabled = false)
{
    status.dataset.state = statusText.toLowerCase().replace(/\s+/g, '-')
    status.style.backgroundColor = statusColour
    status.innerText = statusText
    status.disabled = disabled;
}

function extractReferenceLinks(text) {
    let links = []
    let doc = new DOMParser().parseFromString(text, 'text/html')
    let anchors = doc.querySelectorAll('a[href]')

    anchors.forEach(function (a) {
        let href = a.getAttribute('href')
        if (!href || href === '#') return
        let label
        if (/doi\.org\//i.test(href)) {
            label = 'DOI'
        } else {
            label = a.textContent.trim() || hrefToLabel(href)
        }
        links.push({ label: label, url: href })
    })

    return links
}

function hrefToLabel(href) {
    try {
        let host = new URL(href).hostname.replace(/^www\./, '')
        return host
    } catch (_) {
        return 'Link'
    }
}

function renderReferenceLinks(textarea) {
    let existingDiv = document.getElementById(textarea.id + '_reflinks')
    if (existingDiv) existingDiv.remove()

    let links = extractReferenceLinks(textarea.value)
    if (links.length === 0) return

    // Find the actions div for this textarea
    let actionsDiv = document.getElementById(textarea.id + '_button')
    actionsDiv = actionsDiv ? actionsDiv.closest('.radioupdater-actions') : null

    let div = document.createElement('div')
    div.id = textarea.id + '_reflinks'
    div.className = 'radioupdater-reflinks'

    links.forEach(function (link, i) {
        if (i > 0) div.appendChild(document.createTextNode(' | '))
        let a = document.createElement('a')
        a.href = link.url
        a.target = '_blank'
        a.rel = 'noopener'
        a.textContent = link.label
        div.appendChild(a)
    })

    if (actionsDiv) {
        actionsDiv.appendChild(div)
    } else {
        textarea.parentNode.appendChild(div)
    }
}

function setupReferenceLinks(textarea) {
    renderReferenceLinks(textarea)

    if (!textarea.dataset.reflinksListening) {
        textarea.dataset.reflinksListening = 'true'
        textarea.addEventListener('change', function () { renderReferenceLinks(this) })
        textarea.addEventListener('blur', function () { renderReferenceLinks(this) })
    }
}

if (typeof module !== 'undefined') {
    module.exports = { extractReferenceLinks, checkInBatches, CHECK_ALL_BATCH, updateArticleEdit }
}

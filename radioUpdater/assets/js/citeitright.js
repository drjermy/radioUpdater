function updateArticleEdit() {
    let editReferenceBlock = document.querySelector('fieldset.references')

    if (editReferenceBlock) {
        iterateLinks(document.querySelectorAll('[data-citeitright]'))

        iterateRefTextareas(editReferenceBlock.getElementsByTagName('textarea'))

        let observer = new MutationObserver( function(mutations) {
            let addedNode = mutations[0].addedNodes[0]
            if (! addedNode) return
            let textarea = addedNode.querySelector('textarea')
            if (! textarea) return
            setupNewReference(textarea.id)
        } )

        observer.observe(editReferenceBlock, { attributes: true, childList: true, attributeOldValue: true })
    }
}

function updateCaseEdit() {
    let editReferenceBlock = document.getElementById('case-references')

    if (editReferenceBlock) {
        iterateRefTextareas(editReferenceBlock.getElementsByTagName('textarea'))

        let observer = new MutationObserver( function(mutations) {
            let textarea;
            if (mutations[0].target.parentElement.id === 'case-references' && mutations[0].type === 'childList') {
                textarea = mutations[0].addedNodes[0].querySelector('textarea')
                if (textarea) {
                    textarea.style.width = '574px'
                    textarea.closest('div').style.width = '600px'
                    setupNewReference(textarea.id)
                }
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
        actions.style.clear = 'left'

        actions.appendChild(citeItRightButton(textarea))
        actions.appendChild(statusButton(textarea))

        textarea.parentNode.appendChild(actions)
    }
}

function preloadReference(textareaId, cache) {

    let el = document.getElementById(textareaId)
    let htmlReference = el.value

    let parent = el.parentNode

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

    if (! htmlReference) {
        button.disabled = false
        return null
    }

    status.classList.remove('hidden')
    setStatus(status, 'Searching', '#74bcf7', true)

    chrome.runtime.sendMessage({msg: htmlReference, cache: cache}, function ({data}) {
        button.disabled = false
        button.dataset.state = 'loaded'
        button.innerText = "CiteItRight (click)"

        if (data.error) {
            setStatus(status, 'Error', 'red', true)
        } else {
            if (! data.citation) {
                setStatus(status, 'Error', 'red', true)
            } else {
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
        }
    })

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
    let button = document.getElementById(textareaId + '_button')
    let status = document.getElementById(textareaId + '_status')

    button.dataset.textarea = textareaId
    status.dataset.textarea = textareaId

    addCiteItRightButtonListeners(button)
    addStatusButtonListeners(status)
}

function citeItRightButton(textarea)
{
    let button = createButton('btn-default')
    button.dataset.textarea = textarea.id
    button.id = textarea.id + '_button'
    button.style.marginTop = "1rem"
    button.dataset.state = 'ready'
    button.appendChild(document.createTextNode("CiteItRight (hover)"))

    addCiteItRightButtonListeners(button)

    return button
}

function addCiteItRightButtonListeners(el)
{
    el.addEventListener("mouseover", function () {
        if (this.dataset.state === 'ready') {
            triggerLoad(this)
        }
    })
    el.addEventListener("click", function (event) {
        event.preventDefault()
        triggerLoad(this, 'refresh')
    })
}

function triggerLoad(el, cache = '')
{
    let status = document.getElementById(el.dataset.textarea + '_status')
    status.disabled = true

    el.disabled = true
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

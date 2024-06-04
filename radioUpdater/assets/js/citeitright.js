function updateArticleEdit() {
    addIdByQuery('a.add.reference.btn', 'addReferenceButton')
    addIdByQuery('fieldset.references', 'references')
    
    let editReferenceBlock = document.getElementById('references')

    if (editReferenceBlock) {
        iterateLinks(document.querySelectorAll('[data-citeitright]'))

        iterateRefTextareas(editReferenceBlock.getElementsByTagName('textarea'))

        let observer = new MutationObserver( function(mutations) {
            let textareaId = mutations[0].addedNodes[0].querySelector('textarea').id
            setupNewReference(textareaId)
        } )

        observer.observe(document.getElementById('references'), { attributes: true, childList: true, attributeOldValue: true })
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
        button.innerText = "CiteItRight (click)"

        if (data.error) {
            setStatus(status, 'Report', 'red')
            el.dataset.error = JSON.stringify(data)
        } else {
            if (! data.citation) {
                setStatus(status, 'Report', 'red')
                el.dataset.error = JSON.stringify(data)
            } else {

                el.removeAttribute('data-error')

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
                        diffDiv.innerHTML = data.diff
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
        if (this.innerText === 'Review') {
            showDiff(this)
        }
    })
    el.addEventListener("mouseout", function() {
        if (this.innerText === 'Update') {
            hideDiff(this)
        }
    })
    el.addEventListener("click", function(event) {
        event.preventDefault()

        if (this.innerText === 'Report') {
            reportCitation(this)
        } else if (this.innerText === 'Undo') {
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
    button.appendChild(document.createTextNode("CiteItRight (hover)"))

    addCiteItRightButtonListeners(button)

    return button
}

function addCiteItRightButtonListeners(el)
{
    el.addEventListener("mouseover", function () {
        if (this.innerText === "CiteItRight (hover)") {
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
        document.getElementById(el.dataset.textarea + '_diff').remove()

        el.innerText = 'Undo'
    }
}

function undoCitation(el)
{
    let textarea = document.getElementById(el.dataset.textarea)
    let undoDiv = document.getElementById(el.dataset.textarea + '_undo')

    if (textarea && undoDiv) {
        textarea.value = decodeHTML(undoDiv.innerHTML)
        textarea.dataset.error = JSON.stringify({
            'search': undoDiv.innerHTML,
            'error': 'User report'
        })
        undoDiv.remove()

        setStatus(el, 'Report', 'red')
    }
}

function reportCitation(el)
{
    let textarea = document.getElementById(el.dataset.textarea)

    chrome.runtime.sendMessage({error: textarea.dataset.error}, function ({data}) {

        if (data.id) {
            setStatus(el, 'Reported')
            el.disabled = true
        } else {
            setStatus(el, 'Reporting failed', 'red')
        }
    })

}

function setStatus(status, statusText, statusColour = '#74bcf7', disabled = false)
{
    status.style.backgroundColor = statusColour
    status.innerText = statusText
    status.disabled = disabled;
}

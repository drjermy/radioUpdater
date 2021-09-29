updateArticleEdit();

function updateArticleEdit() {
    let editReferenceBlock = document.getElementsByClassName('references');

    if (editReferenceBlock[0]) {
        iterateLinks(document.querySelectorAll('[data-citeitright]'))

        iterateRefTextareas(editReferenceBlock[0].getElementsByTagName('textarea'))
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

        actions.appendChild(citeItRightButton(textarea))
        actions.appendChild(statusButton(textarea))

        textareas[i].parentNode.appendChild(actions);
    }
}

function preloadReference(textareaId, cache) {

    let el = document.getElementById(textareaId)
    let htmlReference = el.value

    let parent = el.parentNode

    let status = document.getElementById(el.id + '_status')
    let button = document.getElementById(el.id + '_button')
    let preDiv = document.getElementById(el.id + '_pre')

    if (preDiv) {
        preDiv.remove()
    }

    status.classList.remove('hidden')
    status.innerText = 'Searching'

    chrome.runtime.sendMessage({msg: htmlReference, cache: cache}, function ({data}) {
        button.disabled = false;
        button.innerText = "CiteItRight (click)"

        if (data.error || ! data.citation) {
            status.innerText = 'Error'
        } else {

            if (data.match) {
                status.innerText = 'Match'
            } else {
                status.innerText = 'Review'
                status.disabled = false
            }

            let preDiv = document.createElement('div');
            let numberedCitation = document.createTextNode(data.index ? data.index + '. ' + data.citation : data.citation)
            preDiv.id = el.id + '_pre'
            preDiv.appendChild(numberedCitation)
            preDiv.classList.add('preRef')
            preDiv.classList.add('hidden')
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
    });

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

function copyCitation(el)
{
    let textarea = document.getElementById(el.dataset.textarea)
    let preDiv = document.getElementById(el.dataset.textarea + '_pre')

    if (textarea && preDiv) {
        textarea.innerHTML = preDiv.innerHTML
        preDiv.remove()
        document.getElementById(el.dataset.textarea + '_diff').remove()

        el.innerText = 'Match'
        el.disabled = true
    }
}

function triggerLoad(el, cache = '')
{
    let status = document.getElementById(el.dataset.textarea + '_status')
    status.disabled = true

    el.disabled = true;
    preloadReference(el.dataset.textarea, cache)
}

function createButton(buttonClass)
{
    let button = document.createElement('button');
    button.classList.add('btn')
    button.classList.add(buttonClass)
    button.style.marginTop = "1rem"

    return button
}

function citeItRightButton(textarea)
{
    let button = createButton('btn-default')
    button.dataset.textarea = textarea.id
    button.id = textarea.id + '_button'
    button.appendChild(document.createTextNode("CiteItRight (hover)"));
    button.addEventListener("mouseover", function (event) {
        if (this.innerText === "CiteItRight (hover)") {
            triggerLoad(this)
        }
    })
    button.addEventListener("click", function (event) {
        event.preventDefault()
        triggerLoad(this, 'refresh')
    })

    return button;
}

function statusButton(textarea)
{
    let status = createButton('btn-secondary')
    status.classList.add('hidden')
    status.style.marginLeft = '1rem'
    status.dataset.textarea = textarea.id
    status.id = textarea.id + '_status'
    status.addEventListener("mouseover", function(event) {
        showDiff(this)
    })
    status.addEventListener("mouseout", function(event) {
        hideDiff(this)
    })
    status.addEventListener("click", function(event) {
        event.preventDefault()
        copyCitation(this)
    })

    return status
}

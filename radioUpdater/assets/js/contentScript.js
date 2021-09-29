updateArticleEdit();

function updateArticleEdit() {
    let editReferenceBlock = document.getElementsByClassName('references');

    if (editReferenceBlock !== null) {
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

        let actions = document.createElement('div')

        let button = document.createElement('button');
        button.classList.add('btn')
        button.classList.add('btn-default')
        button.style.marginTop = "1rem"
        button.dataset.textarea = textareas[i].id
        button.id = textareas[i].id + '_button'
        button.appendChild(document.createTextNode("CiteItRight (hover)"));
        button.addEventListener("mouseover", function (event) {
            let status = document.getElementById(this.dataset.textarea + '_status')
            if (status.classList.contains('hidden')) {
                this.disabled = true;
                status.disabled = true
                preloadReference(this.dataset.textarea)
            }
        })
        button.addEventListener("click", function (event) {
            event.preventDefault()
            let status = document.getElementById(this.dataset.textarea + '_status')
            this.disabled = true;
            status.disabled = true
            preloadReference(this.dataset.textarea, 'refresh')
        })

        let status = document.createElement('button')
        status.classList.add('btn')
        status.classList.add('btn-secondary')
        status.classList.add('hidden')
        status.style.marginTop = "1rem"
        status.style.marginLeft = '1rem'
        status.dataset.textarea = textareas[i].id
        status.id = textareas[i].id + '_status'
        status.addEventListener("mouseover", function(event) {
            let diffDiv = document.getElementById(this.dataset.textarea + '_diff')
            if (diffDiv) {
                diffDiv.classList.remove('hidden')
            }
            this.innerText = 'Update'
        })
        status.addEventListener("mouseout", function(event) {
            let diffDiv = document.getElementById(this.dataset.textarea + '_diff')
            if (diffDiv) {
                diffDiv.classList.add('hidden')
            }
            this.innerText = 'Review'
        })
        status.addEventListener("click", function(event) {
            event.preventDefault()
            let textarea = document.getElementById(this.dataset.textarea)
            let preDiv = document.getElementById(this.dataset.textarea + '_pre')
            if (textarea && preDiv) {
                textarea.innerHTML = preDiv.innerHTML
                this.innerText = 'Match'
                this.disabled = true
                preDiv.remove()
                document.getElementById(this.dataset.textarea + '_diff').remove()
            }
        })

        actions.appendChild(button)
        actions.appendChild(status)

        textareas[i].parentNode.appendChild(actions);
    }
}

function preloadReference(textareaId, cache = '') {

    let el = document.getElementById(textareaId)
    let htmlReference = el.innerHTML

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

        if (data.error) {
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

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
        // overwriteClick(links[i])
    }
}

function iterateRefTextareas(textareas)
{
    for (let i = 0; i < textareas.length; i++) {
        textareas[i].addEventListener("mouseover", function (event) {
            preloadReference(this)
        });

        textareas[i].addEventListener("dblclick", function (event) {
            confirmReference(this)
        })

        createSiblingNode(textareas[i], "link", ['button'])
    }
}

function overwriteClick(link) {
    link.addEventListener("click", function (event) {

        event.preventDefault()

        if (link.innerText === 'Format citation') {
            updateReference(this)
        } else if (link.innerText === 'Undo') {
            undoReference(this)
        }

    });
}

function preloadReference(that) {

    let htmlReference = that.innerHTML
    let parent = that.parentNode

    if (parent.getElementsByClassName('oldRef').length === 0) {
        parent.appendChild(hiddenReference(htmlReference));
    }

    if (parent.getElementsByClassName('preRef').length === 0) {
        that.style.borderColor = "#65419b"

        chrome.runtime.sendMessage({msg: htmlReference}, function ({data}) {
            if (data.error) {
                that.style.borderColor = "red"
            } else {
                that.style.borderColor = "green"
                that.style.color = data.match ? "green" : "red"

                let prefetchedReference = data.index ? data.index + '. ' + data.citation : data.citation

                createSiblingNode(that, prefetchedReference, ['preRef', 'hidden'])

                if (parent.getElementsByClassName('differences').length === 0) {
                    if (!data.match) {
                        let htmlObject = document.createElement('div');
                        htmlObject.innerHTML = data.diff;
                        htmlObject.classList.add("differences")
                        parent.appendChild(htmlObject)
                    }
                }
            }
        });
    }

}

function confirmReference(textarea) {
    let htmlReference = textarea.innerHTML;
    let parent = textarea.parentNode;

    if (parent.getElementsByClassName('preRef').length === 0) return;

    if (parent.getElementsByClassName('oldRef').length === 0) {
        parent.appendChild(hiddenReference(htmlReference));
    }

    if (parent.getElementsByClassName('differences').length > 0) {
        parent.getElementsByClassName('differences')[0].remove()
    }

    let prefetchedReference = parent.getElementsByClassName('preRef');
    textarea.innerHTML = prefetchedReference[0].innerHTML;
    textarea.style.color = 'green';
}

function updateReference(that) {
    let parent = that.parentNode;
    let textarea = parent.getElementsByTagName('textarea');
    let htmlReference = textarea[0].innerHTML;

    if (textarea[0].parentNode.getElementsByClassName('oldRef').length === 0) {
        textarea[0].parentNode.appendChild(hiddenReference(htmlReference));
    }

    if (textarea[0].parentNode.getElementsByClassName('differences').length > 0) {
        textarea[0].parentNode.getElementsByClassName('differences')[0].remove()
    }

    let prefetchedReference = parent.getElementsByClassName('preRef');

    if (prefetchedReference.length > 0) {
        textarea[0].innerHTML = prefetchedReference[0].innerHTML;
        textarea[0].style.color = 'green';
        that.innerHTML = 'Undo'
    } else {
        that.innerHTML = 'Formatting'
        chrome.runtime.sendMessage({msg: htmlReference}, function ({data}) {
            if (data.error) {
                textarea[0].style.color = 'red';
            } else {
                textarea[0].innerHTML = data.index ? data.index + '. ' + data.citation : data.citation
                textarea[0].style.color = 'green';

                that.innerHTML = data.match ? 'No change' : 'Undo'
            }
        });
    }

}

function undoReference(that) {
    let parent = that.parentNode;
    let previousReference = parent.getElementsByClassName('oldRef');
    let textarea = parent.getElementsByTagName('textarea');

    textarea[0].innerHTML = decodeHTML(previousReference[0].innerHTML);
    textarea[0].style.color = 'red';

    previousReference[0].remove();

    that.innerHTML = 'Format citation'
}

function createSiblingNode(node, sibling, classes = []) {
    let parent = node.parentNode
    let elementNode = document.createElement("div")

    if (typeof sibling === 'string') {
        sibling = document.createTextNode(sibling)
    }

    elementNode.appendChild(sibling)

    classes.forEach(function(className) {
        if (className) {
            elementNode.classList.add(className)
        }
    })

    parent.appendChild(elementNode)
}

function hiddenReference(htmlReference) {
    let oldRefBlock = document.createElement("div");
    let refNode = document.createTextNode(htmlReference);

    oldRefBlock.appendChild(refNode);
    oldRefBlock.classList.add('oldRef');
    oldRefBlock.classList.add('hidden');

    return oldRefBlock;
}

let decodeHTML = function (html) {
    let txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
};

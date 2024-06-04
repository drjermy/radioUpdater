const addIdByQuery = function (query, id) {
    let queryResult = document.querySelector(query)
    if (queryResult) {
        queryResult.id = id
        return queryResult
    }
}

const decodeHTML = function (html) {
    let txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
}

const insertAfter = function (referenceNode, newNode) {
    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
}

function createButton(buttonClass)
{
    let button = document.createElement('button')
    button.classList.add('btn')
    button.classList.add(buttonClass)

    return button
}

function createHiddenDiv(id, child)
{
    let hiddenDiv = document.createElement('div')
    hiddenDiv.id = id
    hiddenDiv.classList.add('hidden')
    hiddenDiv.appendChild(child)

    return hiddenDiv
}

const kebabCase = string => string
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
const decodeHTML = function (html) {
    let txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
}

function sanitizeHTML(html) {
    let doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll('script,style,iframe,object,embed').forEach(function(n) { n.remove() })
    doc.querySelectorAll('*').forEach(function(n) {
        for (let attr of [...n.attributes]) {
            if (attr.name.startsWith('on')) n.removeAttribute(attr.name)
        }
    })
    return doc.body.innerHTML
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

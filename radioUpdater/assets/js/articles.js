const updateArticleView = function (articleName) {

    let actions = addIdByQuery('div.doi-actions', 'article-actions')
    
    let button = document.createElement('a')
    button.classList.add('btn')
    button.classList.add('btn-flat')
    button.style.marginRight = '2px'
    button.innerText = 'Q'
    button.href = '/questions/new/?article=' + articleName
    actions.prepend(button)
}
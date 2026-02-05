const pathname = window.location.pathname.split('?')[0].replace(/\/\s*$/, "")
const articleType = pathname.split('/')[1]
const finalPart = pathname.split('/').pop()

const isEdit = finalPart === 'edit' || finalPart === 'new'

if (articleType === 'articles' && isEdit) {
    updateArticleEdit()
} else if (articleType === 'cases' && isEdit) {
    updateCaseEdit()
}

const contextCheck = setInterval(function () {
    if (! chrome.runtime?.id) {
        clearInterval(contextCheck)

        let banner = document.createElement('div')
        banner.className = 'radioupdater-reload-banner'
        banner.textContent = 'RadioUpdater was updated. Please refresh the page to continue using it.'
        document.body.prepend(banner)
    }
}, 5000)

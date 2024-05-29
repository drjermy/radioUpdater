const pathname = window.location.pathname
const articleType = pathname.split('/')[1]
const finalPart = pathname.substring(pathname.lastIndexOf('/') + 1)
const isEdit = finalPart === 'edit' || finalPart === 'new'

if (articleType === 'articles' && isEdit) {
    updateArticleEdit()
} else if (articleType === 'cases' && isEdit) {
    updateCaseEdit()
} else if (articleType === 'questions' && isEdit) {
    updateAutoQuestion()
}
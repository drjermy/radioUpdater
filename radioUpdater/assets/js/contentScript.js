let articleTyle = window.location.pathname.split('/')[1]

addElementIds()

updateArticleEdit()
updateCaseEdit()

updateAutoQuestion()

function addElementIds()
{
    addIdByQuery('a.add.reference.btn', 'addReferenceButton')
    addIdByQuery('fieldset.references', 'references')
}

function updateAutoQuestion() {
    let relatedArticlesSection = document.getElementById('related-articles')

    if (relatedArticlesSection) {
        let questionButton = document.createElement('button')
        questionButton.classList.add('btn')
        questionButton.classList.add('btn-default')
        questionButton.innerText = 'AutoQuestion'
        questionButton.id = 'auto-question-button'
        questionButton.disabled = true
        questionButton.addEventListener('mouseup', getNewQuestion)

        relatedArticlesSection.appendChild(questionButton)

        watchForArticleUpdates()
    }
}



function getNewQuestion() {

    let questionButton = document.getElementById('auto-question-button')
    questionButton.disabled = true;

    let questionTextarea = document.getElementById('for_multiple_choice_question_stem')
    let stemContent = questionTextarea.querySelectorAll('[contenteditable="true"]')[0]

    let explanationContentEditable = document.getElementById('for_multiple_choice_question_explanation').querySelectorAll('[contenteditable="true"]')[0]

    let article = document.getElementsByClassName('related-article-form-li')[0].getElementsByTagName('a')[0].getAttribute("href")

    article = article.substring(article.lastIndexOf('/') + 1)

    chrome.runtime.sendMessage({question: article}, function ({data}) {

        questionButton.disabled = false
        if (data.error) {

        } else {
            // Set question
            let wrappedQuestion = document.createElement('p')
            wrappedQuestion.innerText = data.question
            stemContent.prepend(wrappedQuestion)
            stemContent.querySelectorAll('[data-placeholder]')[0].remove()

            // Set options
            document.getElementById('multiple_choice_question_alternatives_attributes_0_alternative_text').innerText = data.answers.a
            document.getElementById('multiple_choice_question_alternatives_attributes_1_alternative_text').innerText = data.answers.b
            document.getElementById('multiple_choice_question_alternatives_attributes_2_alternative_text').innerText = data.answers.c
            document.getElementById('multiple_choice_question_alternatives_attributes_3_alternative_text').innerText = data.answers.d
            document.getElementById('multiple_choice_question_alternatives_attributes_4_alternative_text').innerText = data.answers.e

            // Set correct answer
            let correctOptions = ['a', 'b', 'c', 'd', 'e']
            let radioN = (correctOptions.findIndex((element) => element === data.correct));
            document.getElementById('multiple_choice_question_alternatives_attributes_' + radioN + '_correct_true').click()

            // Set explanation
            let wrappedExplanation = document.createElement('p')
            wrappedExplanation.innerText = data.explanation
            explanationContentEditable.prepend(wrappedExplanation)
            explanationContentEditable.querySelectorAll('[data-placeholder]')[0].remove()
        }

    });

}

function watchForArticleUpdates()
{
    // Select the node that will be observed for mutations
    document.getElementsByClassName('related-article-form-ul')[0].id = 'related-article-list';

    let relatedArticleList = document.getElementById('related-article-list')

    if (relatedArticleList) {
        let observer = new MutationObserver( function(mutations) {
            document.getElementById('auto-question-button').disabled = relatedArticleList.childElementCount < 1
        })

        observer.observe(relatedArticleList, { attributes: true, childList: true, attributeOldValue: true })
    }

}
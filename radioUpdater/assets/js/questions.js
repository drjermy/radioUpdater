const relatedArticlesSection = document.getElementById('mcq-related-articles')

function updateAutoQuestion() {
    // Add the form.
    if (relatedArticlesSection) {
        const autoQuestionDiv = document.createElement('div')
        autoQuestionDiv.id = 'auto-questions'
        autoQuestionDiv.style.marginTop = '1rem'
        autoQuestionDiv.style.marginBottom = '1rem'

        const questionLabel = document.createElement('label')
        questionLabel.classList.add('control-label')
        questionLabel.innerText = 'Autogenerate Questions'

        const questionDesc = document.createElement('p')
        questionDesc.classList.add('help-block')
        questionDesc.innerText = "This is a radioUpdater block that is added by JBJ's extension. Add a related article above and then click the button.";

        const questionInput = document.createElement('input')
        questionInput.classList.add('form-control')
        questionInput.classList.add('input-sm')
        questionInput.placeholder = 'Refine the question using this topic.'
        questionInput.style.marginRight = '1rem'
        questionInput.style.display = 'inline-block'
        questionInput.style.width = 'auto'
        questionInput.style.minWidth = '460px'
        questionInput.id = 'auto-question-input'

        const questionButton = document.createElement('button')
        questionButton.classList.add('btn')
        questionButton.classList.add('btn-default')
        questionButton.innerText = 'AutoQuestion'
        questionButton.style.display = 'inline-block'
        questionButton.id = 'auto-question-button'
        questionButton.disabled = true
        questionButton.addEventListener('mouseup', getNewQuestion)

        autoQuestionDiv.appendChild(questionLabel)
        autoQuestionDiv.appendChild(questionDesc)
        autoQuestionDiv.appendChild(questionInput)
        autoQuestionDiv.appendChild(questionButton)

        insertAfter(relatedArticlesSection, autoQuestionDiv)

        watchForArticleUpdates()
    }
}

function watchForArticleUpdates()
{
    // Select the node that will be observed for mutations
    document.getElementsByClassName('related-article-form-ul')[0].id = 'related-article-list';

    let relatedArticleList = document.getElementById('related-article-list')

    if (relatedArticleList) {
        let observer = new MutationObserver( function() {
            document.getElementById('auto-question-button').disabled = relatedArticleList.childElementCount < 1
        })

        observer.observe(relatedArticleList, { attributes: true, childList: true, attributeOldValue: true })
    }

}

function getNewQuestion() {

    // Get the question textarea.
    let questionTextarea = document.getElementById('for_multiple_choice_question_stem')
    let stemContent = questionTextarea.querySelectorAll('[contenteditable="true"]')[0]
    stemContent.id = 'question-content-textarea'

    // Get the explanation textarea.
    let explanationContentEditable = document.getElementById('for_multiple_choice_question_explanation').querySelectorAll('[contenteditable="true"]')[0]

    // Determine the type of question
    let type = 'basic-factual'
    let typeList = document.getElementsByClassName('question-category-titles')[0];
    let activeType = kebabCase(typeList.getElementsByClassName('active')[0].innerText)

    if (activeType === 'image-interpretation') {
        alert("We can't auto-generate Image Interpretation questions yet. Change Type at the top of the page.")
        return
    }

    // Disable the question generator button
    let questionButton = document.getElementById('auto-question-button')
    questionButton.disabled = true;

    // Get the first related article
    let article = document.getElementsByClassName('related-article-form-li')[0].getElementsByTagName('a')[0].getAttribute("href")
    article = article.substring(article.lastIndexOf('/') + 1)

    // Generate a prompt
    let prompt = document.getElementById('auto-question-input').value

    let payload = {
        type: activeType,
        article: article,
        prompt: prompt,
    }

    chrome.runtime.sendMessage({question: payload}, function ({data}) {

        questionButton.disabled = false

        if (data.error) {

        } else {
            // Remove question p
            const questionPs = stemContent.getElementsByTagName('p')
            for (const questionP of questionPs) {
                questionP.remove()
            }

            // Remove explanation p
            const explanationPs = explanationContentEditable.getElementsByTagName('p')
            for (const explanationP of explanationPs) {
                explanationP.remove()
            }

            // Set question
            let wrappedQuestion = document.createElement('p')
            wrappedQuestion.innerText = data.question

            stemContent.prepend(wrappedQuestion)

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

            questionButton.innerText = 'Regenerate'

        }

    });

}
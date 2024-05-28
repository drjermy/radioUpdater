chrome.runtime.onMessage.addListener(function (message, sender, senderResponse) {

    if (message.error) {

        let encodedError = encodeURIComponent(message.error)

        fetch('https://citeitright.co.uk/report?error=' + encodedError)
            .then(response => response.text())
            .then(data => {
                let dataObj = JSON.parse(data)
                senderResponse({data: dataObj})
            })
            .catch(error => {
                senderResponse({ reported: false })
            })
        return true;

    } else if(message.question) {

        fetch('https://ai.radiopaedia.work/questions/api/' + message.question)
            .then(response => response.text())
            .then(data => {
                let dataObj = JSON.parse(data)
                senderResponse({ data: dataObj })
            })
            .catch(error => {
                senderResponse({ question: false })
            })
        return true; // Will respond asynchronously.

    } else {

        let encodedRef = encodeURIComponent(message.msg)
        let cache = message.cache

        fetch('https://citeitright.co.uk/rest?search=' + encodedRef + '&cache=' + cache)
            .then(response => response.text())
            .then(data => {
                let dataObj = JSON.parse(data)
                senderResponse({data: dataObj})
            })
            .catch(error => {
                senderResponse({
                    data: {
                        search: message.msg,
                        cache: cache,
                        error: error
                    }
                })
            })
        return true; // Will respond asynchronously.
    }
});

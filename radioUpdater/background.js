chrome.runtime.onMessage.addListener(function (message, sender, senderResponse) {

    if (message.error) {

        let encodedError = encodeURIComponent(message.error)

        fetch('https://citeitright.co.uk/report?error=' + encodedError)
            .then(response => response.text())
            .then(data => {
                try {
                    let dataObj = JSON.parse(data)
                    senderResponse({data: dataObj})
                } catch (e) {
                    senderResponse({ reported: false })
                }
            })
            .catch(error => {
                senderResponse({ reported: false })
            })
        return true;

    } else {

        let encodedRef = encodeURIComponent(message.msg)
        let cache = message.cache

        fetch('https://citeitright.co.uk/rest?search=' + encodedRef + '&cache=' + cache)
            .then(response => response.text())
            .then(data => {
                try {
                    let dataObj = JSON.parse(data)
                    senderResponse({data: dataObj})
                } catch (e) {
                    senderResponse({
                        data: {
                            search: message.msg,
                            cache: cache,
                            error: 'Invalid response from server'
                        }
                    })
                }
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

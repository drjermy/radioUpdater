chrome.runtime.onMessage.addListener(function (message, sender, senderResponse) {

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
                    error: error
                }
            })
        })
    return true;  // Will respond asynchronously.

});

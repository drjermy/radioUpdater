const FETCH_TIMEOUT = 30000

function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeout))
}

chrome.runtime.onMessage.addListener(function (message, sender, senderResponse) {

    if (message.error) {

        fetchWithTimeout('https://citeitright.co.uk/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: message.error
        })
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

        fetchWithTimeout('https://citeitright.co.uk/rest?search=' + encodedRef + '&cache=' + cache)
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
                        error: 'Request failed or timed out'
                    }
                })
            })
        return true;
    }
});

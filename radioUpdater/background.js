const FETCH_TIMEOUT = 30000

function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeout))
}

const API = 'https://radiopaedia.work/api/v1/citations'

function requestCitations(message) {
    if (message.type === 'batch') {
        return fetchWithTimeout(API + '/batch', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ references: message.references }),
        })
    }

    return fetchWithTimeout(API + '?search=' + encodeURIComponent(message.msg) + '&cache=' + message.cache, {
        headers: { 'Accept': 'application/json' },
    })
}

chrome.runtime.onMessage.addListener(function (message, sender, senderResponse) {

    requestCitations(message)
        .then(response => {
            if (response.status === 429) {
                return { error: 'rate-limited', retryAfter: Number(response.headers.get('Retry-After')) || 60 }
            }

            return response.text().then(text => {
                try {
                    return JSON.parse(text)
                } catch (e) {
                    return { error: 'Invalid response from server' }
                }
            })
        })
        .catch(() => ({ error: 'Request failed or timed out' }))
        .then(data => senderResponse({ data: { search: message.msg, cache: message.cache, ...data } }))

    return true;
});

if (typeof module !== 'undefined') {
    module.exports = { fetchWithTimeout, FETCH_TIMEOUT, requestCitations }
}

const FETCH_TIMEOUT = 30000

function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ms)

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

const LINT_API = 'https://radiopaedia.work/api/v1/lint?article='
const LINT_TIMEOUT = 60000 // the linter may have to read the article from Radiopaedia first

function requestLint({ slug }) {
    // Cookies, so that having cleared a Cloudflare check on radiopaedia.work counts.
    return fetchWithTimeout(LINT_API + encodeURIComponent(slug), { headers: { 'Accept': 'application/json' }, credentials: 'include' }, LINT_TIMEOUT)
        .then(response => response.text().then(text => ({ status: response.status, text })))
        .catch(error => ({ failed: error.name === 'AbortError' ? 'timeout' : 'network' }))
}

chrome.runtime.onMessage.addListener(function (message, sender, senderResponse) {

    if (message.type === 'lint') {
        requestLint(message).then(senderResponse)
        return true
    }

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
    module.exports = { fetchWithTimeout, FETCH_TIMEOUT, requestCitations, requestLint }
}

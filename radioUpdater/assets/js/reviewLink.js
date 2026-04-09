const REVIEW_LINK_SECRET = '1c8df1e11ad323b45657a6ba346b2f6282cbf9c3f71714c634aa6f3f162fc8a0'
const REVIEW_BASE_URL = 'https://radiopaedia.work/review/link'
const LINK_EXPIRY_SECONDS = 300 // 5 minutes

async function hmacSha256(message, secret) {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

function getArticleSlug() {
    const match = window.location.pathname.match(/^\/articles\/([^/?#]+)/)
    return match ? match[1] : null
}

function getLoggedInUsername() {
    const profileLink = document.querySelector('a.user-menu-profile[href*="/users/"]')
    if (!profileLink) return null
    const match = profileLink.getAttribute('href').match(/\/users\/([^/?#]+)/)
    return match ? match[1] : null
}

async function buildReviewUrl(slug, reviewer) {
    const expires = Math.floor(Date.now() / 1000) + LINK_EXPIRY_SECONDS
    const message = `${reviewer}:${slug}:${expires}`
    const signature = await hmacSha256(message, REVIEW_LINK_SECRET)

    const params = new URLSearchParams({ reviewer, article: slug, expires, signature })
    return `${REVIEW_BASE_URL}?${params}`
}

function injectReviewLink(menu) {
    if (menu.querySelector('.radioupdater-review-link')) return

    const slug = getArticleSlug()
    if (!slug) return

    const reportItem = menu.querySelector('a[href*="docs.google.com/forms"]')
    if (!reportItem) return

    const li = document.createElement('li')
    const link = document.createElement('a')
    link.textContent = 'Review article'
    link.href = '#'
    link.classList.add('radioupdater-review-link')

    link.addEventListener('click', async (e) => {
        e.preventDefault()
        const reviewer = getLoggedInUsername() || 'editor'
        const url = await buildReviewUrl(slug, reviewer)
        window.open(url, '_blank')
    })

    li.appendChild(link)
    reportItem.closest('li').before(li)
}

// Only run on article view pages (not edit/new)
const reviewPathname = window.location.pathname.split('?')[0].replace(/\/\s*$/, '')
if (reviewPathname.match(/^\/articles\/[^/]+$/) && !reviewPathname.endsWith('/edit') && document.querySelector('.peer-review-this-article')) {
    // Dropdown may not exist yet — watch for it
    const observer = new MutationObserver(() => {
        const menu = document.querySelector('#edit-dropdown .jq-dropdown-menu')
        if (menu) injectReviewLink(menu)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    // Also try immediately in case it's already in the DOM
    const menu = document.querySelector('#edit-dropdown .jq-dropdown-menu')
    if (menu) injectReviewLink(menu)
}

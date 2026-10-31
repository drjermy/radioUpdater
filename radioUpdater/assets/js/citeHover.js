// Hovering a citation in a published article shows the references it cites. Radiopaedia's
// tippy is bundled, not global, so this draws its own; markerNumbers comes from renumber.js.

(function () {
    const SUP = '.user-generated-content sup'
    let tip = null
    let hideTimer = null

    // The references by the number each one's text starts with ("12. Smith J…").
    function referencesByNumber() {
        const refs = new Map()
        for (const li of document.querySelectorAll('#references li')) {
            const n = /^\s*(\d{1,3})\.\s/.exec(li.textContent)
            if (n) refs.set(+n[1], li)
        }
        return refs
    }

    function hide() {
        tip?.remove()
        tip = null
    }

    function show(sup, items) {
        hide()
        tip = document.createElement('div')
        tip.className = 'rcx-ref-tip'
        tip.setAttribute('role', 'tooltip')
        for (const li of items) {
            const row = document.createElement('div')
            row.append(...li.cloneNode(true).childNodes)
            for (const a of row.querySelectorAll('a[href]')) {
                if (a.host !== location.host) Object.assign(a, { target: '_blank', rel: 'noopener' })
            }
            tip.appendChild(row)
        }
        document.body.appendChild(tip)

        const at = sup.getBoundingClientRect()
        const left = Math.max(8, Math.min(at.left, window.innerWidth - tip.offsetWidth - 8))
        const below = at.bottom + 6
        const top = below + tip.offsetHeight > window.innerHeight ? at.top - tip.offsetHeight - 6 : below
        tip.style.left = `${left}px`
        tip.style.top = `${Math.max(8, top)}px`
    }

    document.addEventListener('mouseover', (e) => {
        if (!(e.target instanceof Element)) return
        if (e.target.closest('.rcx-ref-tip')) return clearTimeout(hideTimer)
        const sup = e.target.closest(SUP)
        if (!sup || sup.isContentEditable) return

        // Only a superscript whose every number is a reference's: ¹⁸F in an
        // article with ten references is an isotope, not a citation.
        const numbers = window.radioUpdaterRenumber?.markerNumbers(sup.textContent)
        if (!numbers) return
        const refs = referencesByNumber()
        const items = numbers.map((n) => refs.get(n))
        if (items.some((li) => !li)) return

        sup.classList.add('rcx-cited')
        clearTimeout(hideTimer)
        show(sup, items)
    })

    // A short grace period, so the pointer can cross onto the tooltip to click a link.
    document.addEventListener('mouseout', (e) => {
        if (e.target instanceof Element && e.target.closest(`${SUP}, .rcx-ref-tip`)) {
            clearTimeout(hideTimer)
            hideTimer = setTimeout(hide, 200)
        }
    })
    window.addEventListener('scroll', hide, { passive: true })
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide() })
})()

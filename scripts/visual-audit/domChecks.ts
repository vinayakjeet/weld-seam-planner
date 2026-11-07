// Runs inside the page (page.evaluate serialises it), so it must not use anything from outside its own body.

export interface TextIssue {
  kind: 'clipped-x' | 'clipped-y' | 'offscreen' | 'covered' | 'overlap' | 'contrast' | 'token'
  text: string
  region: string
  detail: string
}

export interface DomReport {
  theme: string | undefined
  logo: string | null
  brokenImages: string[]
  issues: TextIssue[]
  // Every text the page shows, with the region it sits in and the role of its nearest control or heading.
  texts: { text: string; region: string; role: string; font: string }[]
}

export function domChecks(): DomReport {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const ctx = probe.getContext('2d', { willReadFrequently: true })!

  type RGBA = [number, number, number, number]
  const rgba = (css: string): RGBA => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return [d[0]!, d[1]!, d[2]!, d[3]! / 255]
  }
  const over = (top: RGBA, bottom: RGBA): RGBA => {
    const a = top[3]
    return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1]
  }
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const luminance = (c: RGBA) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2])
  const contrast = (a: RGBA, b: RGBA) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi! + 0.05) / (lo! + 0.05)
  }

  const describe = (el: Element): string => {
    const label = el.getAttribute('aria-label')
    const cls = (el.getAttribute('class') ?? '').slice(0, 60)
    return `${el.tagName.toLowerCase()}${label ? `[${label}]` : ''}${cls ? `.${cls}` : ''}`
  }
  const regionOf = (el: Element): string => {
    const dialog = el.closest('[role="dialog"]')
    if (dialog) return `dialog: ${dialog.querySelector('h2')?.textContent ?? ''}`
    const landmark = el.closest('header, footer, aside, main, nav, section[aria-label="Timeline"], [role="tooltip"], [role="menu"]')
    if (!landmark) return 'page'
    const label = landmark.getAttribute('aria-label')
    return `${landmark.tagName.toLowerCase()}${label ? `: ${label}` : ''}`
  }
  const roleOf = (el: Element): string => {
    const control = el.closest('button, a, label, h1, h2, h3, h4, th, dt, dd, [role="columnheader"], [role="cell"], [role="tab"], [role="menuitem"], [role="alert"], p, li, option, kbd')
    if (!control) return 'text'
    return control.getAttribute('role') ?? control.tagName.toLowerCase()
  }
  const srOnly = (el: Element): boolean => {
    for (let a: Element | null = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.position === 'absolute' && parseFloat(cs.width) <= 1 && parseFloat(cs.height) <= 1 && cs.overflow === 'hidden') return true
      if (cs.display === 'none' || cs.visibility === 'hidden') return true
    }
    return false
  }

  // elementFromPoint skips elements that ignore the pointer, such as labels drawn over the canvas; the check wants
  // whatever is painted on top, so every element takes the pointer while it runs.
  const hitStyle = document.createElement('style')
  hitStyle.textContent = '* { pointer-events: auto !important; }'
  document.head.append(hitStyle)

  const dialogOpen = document.querySelector('[role="dialog"]') !== null
  const issues: TextIssue[] = []
  const texts: DomReport['texts'] = []
  const placed: { box: DOMRect; parent: Element; text: string; region: string }[] = []

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim()
    const parent = node.parentElement
    if (!text || !parent) continue
    if (parent.closest('script, style, option, title, noscript')) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5)
    if (rects.length === 0 || srOnly(parent)) continue
    const left = Math.min(...rects.map((r) => r.left))
    const right = Math.max(...rects.map((r) => r.right))
    const top = Math.min(...rects.map((r) => r.top))
    const bottom = Math.max(...rects.map((r) => r.bottom))
    const box = new DOMRect(left, top, right - left, bottom - top)
    const region = regionOf(parent)
    const cs = getComputedStyle(parent)
    texts.push({ text, region, role: roleOf(parent), font: `${cs.fontFamily.split(',')[0]} ${cs.fontSize} ${cs.fontWeight}` })

    // The part of the text that shows: clipped by every ancestor that hides its overflow. Text scrolled out of a list
    // is not on screen, so it is not checked.
    let shown = box
    let clipped: TextIssue | null = null
    let scrolledAway = false
    for (let a: Element | null = parent; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a)
      const ar = a.getBoundingClientRect()
      const outsideY = box.top < ar.top - 1 || box.bottom > ar.bottom + 1
      if (outsideY && (acs.overflowY === 'auto' || acs.overflowY === 'scroll') && (box.bottom < ar.top + 2 || box.top > ar.bottom - 2)) {
        scrolledAway = true
        break
      }
      if (!clipped && acs.overflowX !== 'visible' && (box.left < ar.left - 1 || box.right > ar.right + 1)) {
        clipped = { kind: 'clipped-x', text, region, detail: `${Math.round(box.width)} px of text in ${Math.round(ar.width)} px, by ${describe(a)}` }
      }
      if (!clipped && outsideY && (acs.overflowY === 'hidden' || acs.overflowY === 'clip')) {
        clipped = { kind: 'clipped-y', text, region, detail: `by ${describe(a)}` }
      }
      if (acs.overflowX !== 'visible' || acs.overflowY !== 'visible') {
        const l = Math.max(shown.left, ar.left)
        const t = Math.max(shown.top, ar.top)
        shown = new DOMRect(l, t, Math.max(0, Math.min(shown.right, ar.right) - l), Math.max(0, Math.min(shown.bottom, ar.bottom) - t))
      }
    }
    if (scrolledAway || shown.width < 1 || shown.height < 1) continue
    if (clipped) issues.push(clipped)
    if (shown.right > vw + 1 || shown.bottom > vh + 1 || shown.left < -1 || shown.top < -1) {
      issues.push({ kind: 'offscreen', text, region, detail: `box ${Math.round(shown.left)},${Math.round(shown.top)} to ${Math.round(shown.right)},${Math.round(shown.bottom)}` })
      continue
    }
    const inDialog = parent.closest('[role="dialog"]') !== null
    if (dialogOpen && !inDialog) continue

    const cx = Math.min(Math.max(shown.left + shown.width / 2, 0), vw - 1)
    const cy = Math.min(Math.max(shown.top + shown.height / 2, 0), vh - 1)
    const hit = document.elementFromPoint(cx, cy)
    if (hit && !parent.contains(hit) && !hit.contains(parent)) {
      // An open menu or tooltip covers what is under it on purpose.
      if (!hit.closest('[role="menu"], [role="tooltip"], [data-radix-popper-content-wrapper]')) {
        issues.push({ kind: 'covered', text, region, detail: `under ${describe(hit)}` })
      }
      continue
    }
    placed.push({ box: shown, parent, text, region })

    // Contrast: the text colour, faded by any opacity on the way up, over the stacked backgrounds behind it.
    const layers: RGBA[] = []
    let opacity = 1
    let base: RGBA | null = null
    for (let a: Element | null = parent; a; a = a.parentElement) {
      const acs = getComputedStyle(a)
      opacity *= Number(acs.opacity)
      const bg = rgba(acs.backgroundColor)
      if (bg[3] > 0) layers.push(bg)
      if (bg[3] >= 0.999) {
        base = bg
        break
      }
    }
    let behind: RGBA = base ?? [255, 255, 255, 1]
    for (let i = base ? layers.length - 2 : layers.length - 1; i >= 0; i--) behind = over(layers[i]!, behind)
    const ink = rgba(cs.color)
    const painted = over([ink[0], ink[1], ink[2], ink[3] * opacity], behind)
    const ratio = contrast(painted, behind)
    const size = parseFloat(cs.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700)
    const disabled = parent.closest('button:disabled, [aria-disabled="true"]') !== null
    if (!disabled && ratio < (large ? 3 : 4.5)) {
      issues.push({ kind: 'contrast', text, region, detail: `${ratio.toFixed(2)}:1 at ${cs.fontSize}, ${cs.color} on rgb(${behind.slice(0, 3).map(Math.round).join(', ')})` })
    }
  }

  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!
      const b = placed[j]!
      if (a.parent === b.parent || a.parent.contains(b.parent) || b.parent.contains(a.parent)) continue
      const w = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left)
      const h = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top)
      if (w <= 0 || h <= 0) continue
      const smaller = Math.min(a.box.width * a.box.height, b.box.width * b.box.height)
      if (w * h > 0.15 * smaller) issues.push({ kind: 'overlap', text: `${a.text} | ${b.text}`, region: `${a.region} | ${b.region}`, detail: `${Math.round(w)} by ${Math.round(h)} px` })
    }
  }

  hitStyle.remove()

  const TOKENS = /\bNaN\b|\bundefined\b|\bnull\b|Infinity|\[object|\u2013|\u2014|(^|[^\d:])0:00\b|(^|\s)-0(\s|$)/
  for (const t of texts) {
    if (TOKENS.test(t.text)) issues.push({ kind: 'token', text: t.text, region: t.region, detail: t.role })
  }

  const logo = document.querySelector('img[alt="Armatrix"]')
  return {
    theme: document.documentElement.dataset.theme,
    logo: logo ? logo.getAttribute('src') : null,
    brokenImages: [...document.images].filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.src),
    issues,
    texts,
  }
}

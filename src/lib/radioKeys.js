/**
 * Arrow keys across a set of radio buttons, the way a radio group behaves:
 * the arrows move to the next free option and choose it, so Tab enters the
 * set once instead of stopping on every time of the day.
 *
 * Bound once on the container (keydown bubbles), and it reads the direction
 * from the page: in Arabic the next option is to the left.
 *
 * @param {KeyboardEvent} e
 * @param {HTMLElement} container holds every radio of the set, across groups
 */
export function arrowToRadio(e, container) {
  if (!(e.target instanceof HTMLElement) || e.target.getAttribute('role') !== 'radio') return
  const rtl = getComputedStyle(container).direction === 'rtl'
  const step = {
    ArrowDown: 1,
    ArrowUp: -1,
    ArrowLeft: rtl ? 1 : -1,
    ArrowRight: rtl ? -1 : 1,
  }[e.key]
  if (!step) return
  const radios = Array.from(container.querySelectorAll('[role="radio"]:not([disabled])'))
  const i = radios.indexOf(e.target)
  const next = radios[i + step]
  if (i === -1 || !next) return
  e.preventDefault()
  next.focus()
  next.click()
}

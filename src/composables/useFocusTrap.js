import { nextTick, onBeforeUnmount, watch } from 'vue'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Open surfaces, innermost last.
 *
 * Every trap listens on `document`, and stopPropagation does not stop other
 * listeners bound to the *same* node — so without this, one Escape over a
 * confirm dialog closed the dialog and the drawer behind it in the same tick.
 * Escape now belongs to the topmost surface only.
 */
const stack = []

/**
 * The modal contract, in one place: while `open`, focus cannot leave `panel`,
 * Escape closes, the page behind does not scroll, and focus returns to
 * whatever opened the surface.
 *
 * Extracted because the drawer and the confirm dialog each grew their own
 * half of this, and only one of them had the parts that matter — the dialog
 * moved focus in but never trapped it or restored it on close.
 */
export function useFocusTrap(open, panel, onEscape) {
  let lastFocused = null
  const token = Symbol('focus-trap')

  function onKeydown(e) {
    if (!open.value) return

    if (e.key === 'Escape') {
      if (stack[stack.length - 1] !== token) return
      onEscape()
      return
    }

    if (e.key !== 'Tab' || !panel.value) return
    const nodes = Array.from(panel.value.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    )
    if (nodes.length === 0) return

    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function release() {
    const at = stack.indexOf(token)
    if (at !== -1) stack.splice(at, 1)
    // Only the last surface out unlocks the page — otherwise closing a
    // dialog would let the drawer still behind it scroll.
    if (stack.length === 0) document.body.style.overflow = ''
    document.removeEventListener('keydown', onKeydown)
  }

  watch(open, async (isOpen) => {
    if (isOpen) {
      lastFocused = document.activeElement
      stack.push(token)
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      // A surface can name where focus lands; otherwise the first stop.
      ;(
        panel.value?.querySelector('[data-autofocus]') ?? panel.value?.querySelector(FOCUSABLE)
      )?.focus()
    } else {
      release()
      lastFocused?.focus()
    }
  })

  onBeforeUnmount(release)
}

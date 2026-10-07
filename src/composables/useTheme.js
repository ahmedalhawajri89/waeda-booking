import { computed, ref } from 'vue'

/**
 * Light (the default), dark, or whatever the device says — the operator's choice, kept in
 * localStorage. index.html applies the stored choice before first paint; this
 * keeps the attribute in step afterwards, including when the device switches
 * while the page is open and the choice is "system".
 */
const KEY = 'bookingpro:theme'

/** @type {import('vue').Ref<'light' | 'dark' | 'system'>} */
const choice = ref(read())
const media =
  typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
const deviceDark = ref(media?.matches ?? false)
media?.addEventListener('change', (e) => {
  deviceDark.value = e.matches
  apply()
})

function read() {
  try {
    const v = localStorage.getItem(KEY)
    // Light by default: dark is an option an operator picks, not a surprise.
    return v === 'dark' || v === 'system' ? v : 'light'
  } catch {
    return 'light'
  }
}

const resolved = computed(() =>
  choice.value === 'system' ? (deviceDark.value ? 'dark' : 'light') : choice.value,
)

function apply() {
  document.documentElement.dataset.theme = resolved.value
  // Charts and anything else that reads CSS variables once can listen for this.
  window.dispatchEvent(new CustomEvent('themechange', { detail: resolved.value }))
}

/** @param {'light' | 'dark' | 'system'} next */
function setTheme(next) {
  choice.value = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* private mode: the choice lasts the session */
  }
  apply()
}

export function useTheme() {
  return {
    choice,
    resolved,
    isDark: computed(() => resolved.value === 'dark'),
    setTheme,
    toggle: () => setTheme(resolved.value === 'dark' ? 'light' : 'dark'),
  }
}

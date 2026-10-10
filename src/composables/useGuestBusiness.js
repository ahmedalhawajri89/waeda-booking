import { computed } from 'vue'
import { useRoute } from 'vue-router'

/**
 * Where a guest page lives. A business's own link is /b/{slug}; the older
 * /book and /booking/{reference} keep working for the default business, so
 * links already sent to customers do not break.
 */
export function useGuestBusiness() {
  const route = useRoute()
  const slug = computed(() => (route.params.slug ? String(route.params.slug) : null))

  const bookPath = computed(() => (slug.value ? `/b/${slug.value}` : '/book'))
  /** With `token`, the link opens the booking by itself — it is the proof. */
  const managePath = (reference, token) => {
    const path = slug.value ? `/b/${slug.value}/booking/${reference}` : `/booking/${reference}`
    return token ? `${path}?t=${encodeURIComponent(token)}` : path
  }

  return { slug, bookPath, managePath }
}

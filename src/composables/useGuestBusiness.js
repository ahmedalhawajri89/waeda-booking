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
  const managePath = (reference) =>
    slug.value ? `/b/${slug.value}/booking/${reference}` : `/booking/${reference}`

  return { slug, bookPath, managePath }
}

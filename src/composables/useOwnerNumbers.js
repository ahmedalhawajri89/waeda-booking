import { ref } from 'vue'

/**
 * The owner's own numbers, typed once on the landing page.
 *
 * The calculator asks for them; the pricing below reads the same values to
 * say which plan fits, so the visitor is never asked twice and the two
 * sections cannot disagree. Module-level on purpose: one landing page, one
 * set of numbers. Nothing here leaves the page.
 */
const perWeek = ref(60)
const price = ref(150)
const noShowRate = ref(12)
const recovered = ref(40)
/** How many people take bookings: asked by the pricing section. */
const team = ref(1)

export function useOwnerNumbers() {
  return { perWeek, price, noShowRate, recovered, team }
}

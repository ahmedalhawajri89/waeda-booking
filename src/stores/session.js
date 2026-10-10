import { useBookingsStore } from './bookings'
import { useCustomersStore } from './customers'
import { useGuardStore } from './guard'
import { useSettingsStore } from './settings'
import { useSubscriptionStore } from './subscription'

/**
 * Forgets everything the console loaded for the signed-in business.
 *
 * Every store loads once and then trusts `loaded`, so without this the next
 * operator to sign in on the same tab would be shown — and could save over —
 * the previous business's bookings, customers and catalog.
 */
export function resetSessionStores() {
  for (const store of [
    useBookingsStore(),
    useCustomersStore(),
    useGuardStore(),
    useSettingsStore(),
    useSubscriptionStore(),
  ]) {
    store.reset()
  }
}

import { request } from './client'

/**
 * The guest paths, which are not repository operations.
 *
 * A guest does not read a table and write it back — they hand the server four
 * facts and get a reference. Routing that through `repository.saveBookings()`
 * would mean asking an anonymous visitor to PUT the entire booking list, which
 * is both absurd and refused: those writes are operator-only.
 *
 * The server computes the duration, the end time, the price and the reference
 * from the service row. Everything here is what the caller is trusted for, and
 * nothing else.
 */

/**
 * @param {{ serviceId: string, resourceId: string, startAt: string,
 *           name: string, phone: string, email?: string, notes?: string }} input
 * @returns {Promise<{ id: string, reference: string }>}
 */
export function bookPublic(input) {
  return request('/public/bookings', { method: 'POST', body: input, auth: false })
}

/**
 * Busy intervals for one resource, so the wizard can grey out taken slots.
 *
 * Two timestamps each and nothing else — no id, no customer, no status. The
 * alternative would be letting a guest read /bookings, which carries who
 * booked what, to answer a question that only needs when the room is full.
 *
 * @param {string} resourceId
 * @param {string} from  YYYY-MM-DD
 * @param {string} to    YYYY-MM-DD
 * @returns {Promise<{ startAt: string, endAt: string }[]>}
 */
export function busyRanges(resourceId, from, to) {
  const q = new URLSearchParams({ resourceId, from, to })
  return request('/public/availability?' + q, { auth: false })
}

/** Reference plus the phone it was booked with — one factor is not enough. */
export function lookupBooking(reference, phone) {
  return request(
    `/public/bookings/${encodeURIComponent(reference)}?phone=${encodeURIComponent(phone)}`,
    {
      auth: false,
    },
  )
}

export function cancelBooking(reference, phone) {
  return request(`/public/bookings/${encodeURIComponent(reference)}/cancel`, {
    method: 'POST',
    body: { phone },
    auth: false,
  })
}

/** Move your own booking; the server keeps the service and the person. */
export function rescheduleBooking(reference, phone, startAt) {
  return request(`/public/bookings/${encodeURIComponent(reference)}/reschedule`, {
    method: 'POST',
    body: { phone, startAt },
    auth: false,
  })
}

/**
 * Seats taken in a class's sessions — counts per session, never who.
 * @param {string} serviceId
 * @param {string} from  YYYY-MM-DD
 * @param {string} to    YYYY-MM-DD
 * @returns {Promise<{ startAt: string, resourceId: string, taken: number }[]>}
 */
export function classSeats(serviceId, from, to) {
  const q = new URLSearchParams({ from, to })
  return request(`/public/classes/${serviceId}/seats?` + q, { auth: false })
}

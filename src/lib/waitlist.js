import { format } from 'date-fns'
import { hasConflict } from './availability'

/**
 * Filling a freed slot: which slots are free again, and who should be offered
 * them. Pure, like the rest of the guard — the demo backend and
 * Backfill.php on the server apply it.
 *
 * A slot is worth refilling when it was cancelled or released, is still far
 * enough ahead for someone to make it, and nobody has taken the time since.
 *
 * @typedef {object} WaitlistEntry
 * @property {string} id
 * @property {string} customerId
 * @property {string} serviceId
 * @property {string | null} day     'YYYY-MM-DD', or null for any day.
 * @property {[number, number] | null} window  Minutes from midnight, or null for any time.
 * @property {'waiting' | 'booked' | 'removed'} status
 * @property {string} createdAt
 */

/** Less notice than this and nobody can realistically take the slot. */
export const MIN_NOTICE_MS = 60 * 60_000
/** How many people are offered one slot at once — first to answer wins. */
export const OFFER_TO = 3

const localDay = (iso) => format(new Date(iso), 'yyyy-MM-dd')
const minutesOf = (iso) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** Has a backfill already been offered for this freed booking? */
const offeredFor = (messages, bookingId) =>
  messages.filter((m) => m.bookingId === bookingId && m.template === 'backfill_offer')

/**
 * Cancelled or released bookings whose time is still worth selling.
 * @returns {import('@/types').Booking[]}
 */
export function freedSlots(bookings, messages, now = Date.now()) {
  return bookings.filter(
    (b) =>
      b.status === 'cancelled' &&
      new Date(b.startAt).getTime() - now >= MIN_NOTICE_MS &&
      offeredFor(messages, b.id).length === 0 &&
      // Taken again already — by the operator, or a customer online.
      !hasConflict({ ...b, id: `${b.id}:refill` }, bookings),
  )
}

/** Does a waitlist entry want this slot? */
export function wants(entry, slot) {
  if (entry.status !== 'waiting' || entry.serviceId !== slot.serviceId) return false
  if (entry.day && entry.day !== localDay(slot.startAt)) return false
  if (entry.window) {
    const m = minutesOf(slot.startAt)
    if (m < entry.window[0] || m >= entry.window[1]) return false
  }
  return true
}

/**
 * Who to offer a freed slot, best first: people waiting for exactly this,
 * oldest wait first; then regulars of the service, most visits first. Never
 * the customer who gave the slot up, nor anyone already booked that day.
 *
 * @returns {{ customerId: string, entryId: string | null, reason: 'waitlist' | 'regular' }[]}
 */
export function candidatesFor(slot, { waitlist, bookings, now = Date.now() }) {
  const day = localDay(slot.startAt)
  const busy = new Set(
    bookings
      .filter(
        (b) => (b.status === 'pending' || b.status === 'confirmed') && localDay(b.startAt) === day,
      )
      .map((b) => b.customerId),
  )
  const eligible = (customerId) => customerId !== slot.customerId && !busy.has(customerId)

  const out = []
  const seen = new Set()
  const add = (customerId, entryId, reason) => {
    if (seen.has(customerId) || !eligible(customerId) || out.length >= OFFER_TO) return
    seen.add(customerId)
    out.push({ customerId, entryId, reason })
  }

  for (const e of [...waitlist]
    .filter((e) => wants(e, slot))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    add(e.customerId, e.id, 'waitlist')
  }

  // Regulars: completed this service at least twice in the last 90 days.
  const since = now - 90 * 86_400_000
  const visits = new Map()
  for (const b of bookings) {
    if (b.status !== 'completed' || b.serviceId !== slot.serviceId) continue
    if (new Date(b.startAt).getTime() < since) continue
    visits.set(b.customerId, (visits.get(b.customerId) ?? 0) + 1)
  }
  for (const [customerId] of [...visits].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])) {
    add(customerId, null, 'regular')
  }
  return out
}

/** The newest offer of this freed slot, and whether it is still open. */
export function slotTaken(freed, bookings) {
  return hasConflict({ ...freed, id: `${freed.id}:refill`, status: 'confirmed' }, bookings)
}

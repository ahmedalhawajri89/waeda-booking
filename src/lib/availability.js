import { addMinutes, isBefore } from 'date-fns'
import { time } from './format'
import { rowFor, windowFor } from './hours'
import { priceFor } from './pricing'
import { iso } from './zone'
import { serviceById } from '@/data/catalog'

/** Statuses that occupy their slot. Cancelled and no-show release the time. */
const BLOCKING = new Set(['pending', 'confirmed'])

/** Statuses that used their time. A completed booking no longer blocks a
 * slot, but it did fill the day — leaving it out read every past day as empty
 * and made today's occupancy fall as appointments were closed out. */
const OCCUPYING = new Set([...BLOCKING, 'completed'])

/** Half-open overlap: touching edges do not collide. */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

/**
 * The hours in force on this date — a special period's, else the week's.
 * @param {import('./hours').Schedule} hours
 * @param {Date} date
 * @returns {import('@/types').BusinessHours | undefined}
 */
export function hoursFor(hours, date) {
  return rowFor(hours, date)
}

export function isOpenOn(hours, date) {
  return windowFor(date, hours) !== null
}

/**
 * The single source of truth for "when can this be booked".
 * Everything — the guest wizard, the operator form, the calendar and conflict
 * detection — reads availability from here, so they can never disagree.
 *
 * @param {object} opts
 * @param {Date} opts.date
 * @param {import('@/types').Service} opts.service
 * @param {string} opts.resourceId
 * @param {import('@/types').Booking[]} opts.bookings
 * @param {import('@/types').BusinessHours[]} opts.hours
 * @param {number} [opts.stepMin] Grid granularity in minutes.
 * @param {Date} [opts.now]
 * @param {string} [opts.excludeBookingId] Ignore this booking when testing overlap — used when rescheduling.
 * @param {number | null} [opts.durationMin] A length the service offers; its own when absent.
 * @returns {import('@/types').Slot[]}
 */
export function generateSlots(opts) {
  const { date, service, resourceId, bookings, hours, stepMin = 30, excludeBookingId } = opts
  const durationMin = opts.durationMin ?? service.durationMin
  const now = opts.now ?? new Date()

  // The business day that starts on `date`, which may run past midnight.
  const w = windowFor(date, hours)
  if (!w) return []

  const { open, close } = w
  const occupied = durationMin + service.bufferMin

  const relevant = bookings.filter(
    (b) =>
      b.resourceId === resourceId &&
      b.id !== excludeBookingId &&
      BLOCKING.has(b.status) &&
      new Date(b.startAt) < close &&
      new Date(b.endAt) > open,
  )

  const slots = []
  for (let cursor = open; !isBefore(close, addMinutes(cursor, occupied));) {
    const start = cursor
    const end = addMinutes(start, occupied)

    // A prayer pause is not booked time, it is no time at all: left out,
    // like the hours the business is closed, rather than shown as taken.
    if (w.breaks.some((b) => overlaps(start, end, b.start, b.end))) {
      cursor = addMinutes(cursor, stepMin)
      continue
    }
    const taken = sessionFull(
      { serviceId: service.id, startAt: start },
      relevant.filter((b) => overlaps(start, end, new Date(b.startAt), new Date(b.endAt))),
      service.capacity ?? 1,
    )

    slots.push({
      // Plain UTC strings: the window's dates may be on the business's clock.
      startAt: iso(start),
      endAt: iso(end),
      label: time(start),
      // Shown under the time when it differs (the peak): the price is the time's.
      priceMinor: priceFor(service, start, durationMin, hours),
      state: taken ? 'taken' : isBefore(start, now) ? 'past' : 'available',
    })

    cursor = addMinutes(cursor, stepMin)
  }

  return slots
}

/**
 * Would a booking at this time collide with anything already on the resource?
 * @param {{ startAt: string, endAt: string, resourceId: string, id?: string }} candidate
 * @param {import('@/types').Booking[]} bookings
 */
export function hasConflict(candidate, bookings, capacityOf = capacityFromCatalog) {
  const start = new Date(candidate.startAt)
  const end = new Date(candidate.endAt)
  const over = bookings.filter(
    (b) =>
      b.resourceId === candidate.resourceId &&
      b.id !== candidate.id &&
      BLOCKING.has(b.status) &&
      overlaps(start, end, new Date(b.startAt), new Date(b.endAt)),
  )
  return sessionFull(candidate, over, capacityOf(candidate.serviceId))
}

/**
 * Given what overlaps a booking, is there room for it? A class shares its
 * time with the other seats of the same session (same service, same start),
 * up to its capacity; anything else at that time is a clash, as on the
 * server (BookingWriter::overlaps).
 */
function sessionFull(candidate, over, capacity) {
  if (!capacity || capacity <= 1) return over.length > 0
  const at = new Date(candidate.startAt).getTime()
  const same = over.filter(
    (b) => b.serviceId === candidate.serviceId && new Date(b.startAt).getTime() === at,
  )
  return same.length !== over.length || same.length >= capacity
}

function capacityFromCatalog(serviceId) {
  return serviceById(serviceId)?.capacity ?? 1
}

/**
 * Booked minutes vs. open minutes for a given day — drives the occupancy bar.
 * @returns {{ bookedMin: number, openMin: number, ratio: number }}
 */
export function occupancyFor(date, bookings, hours) {
  const w = windowFor(date, hours)
  if (!w) return { bookedMin: 0, openMin: 0, ratio: 0 }

  const { open, close } = w
  const openMin = (close.getTime() - open.getTime()) / 60000

  const bookedMin = bookings
    .filter((b) => OCCUPYING.has(b.status))
    .reduce((total, b) => {
      const s = new Date(b.startAt)
      const e = new Date(b.endAt)
      if (!overlaps(s, e, open, close)) return total
      const from = Math.max(s.getTime(), open.getTime())
      const to = Math.min(e.getTime(), close.getTime())
      return total + (to - from) / 60000
    }, 0)

  return { bookedMin, openMin, ratio: openMin === 0 ? 0 : Math.min(1, bookedMin / openMin) }
}

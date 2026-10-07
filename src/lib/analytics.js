import { eachDayOfInterval, format, isWithinInterval, startOfDay, endOfDay } from 'date-fns'
import { occupancyFor } from './availability'

/**
 * Every figure the analytics screen shows, as pure functions over the
 * bookings already in the store.
 *
 * Pure and separate from the view for two reasons: these are the numbers an
 * operator would act on, so they need to be testable without mounting
 * anything; and nothing here may invent data. If a metric cannot be derived
 * from the booking model it does not belong on the screen.
 */

/**
 * @typedef {object} DateRange
 * @property {Date} from
 * @property {Date} to
 */

/** Bookings that have reached a decision — the denominator for rate metrics. */
const SETTLED = new Set(['completed', 'no_show'])

/**
 * @param {import('@/types').Booking[]} bookings
 * @param {DateRange} range
 * @returns {import('@/types').Booking[]}
 */
export function inRange(bookings, range) {
  const interval = { start: startOfDay(range.from), end: endOfDay(range.to) }
  return bookings.filter((b) => isWithinInterval(new Date(b.startAt), interval))
}

/**
 * @typedef {object} Kpis
 * @property {number} occupancy          0–1. Booked minutes over open minutes, averaged across open days.
 * @property {number} revenueCollected   Minor units.
 * @property {number} revenueOutstanding Minor units.
 * @property {number} noShowRate         0–1.
 * @property {number} cancellationRate   0–1.
 * @property {number} medianLeadHours    Hours between creating a booking and the appointment itself.
 * @property {number} bookingCount
 */

/**
 * @param {import('@/types').Booking[]} bookings
 * @param {DateRange} range
 * @param {import('@/types').BusinessHours[]} hours
 * @returns {Kpis}
 */
export function computeKpis(bookings, range, hours) {
  const scoped = inRange(bookings, range)

  // Averaged over open days only. Including closed days would silently
  // dilute the number by however many days a week the business is shut.
  const days = eachDayOfInterval({ start: range.from, end: range.to })
  let ratioSum = 0
  let openDays = 0
  for (const day of days) {
    const dayBookings = scoped.filter((b) => isSameDayIso(b.startAt, day))
    const { openMin, ratio } = occupancyFor(day, dayBookings, hours)
    if (openMin === 0) continue
    ratioSum += ratio
    openDays += 1
  }

  const collected = scoped
    .filter((b) => b.paymentStatus === 'paid')
    .reduce((s, b) => s + b.priceMinor, 0)

  // Money the business is owed: work it is committed to or has done, not yet
  // paid for. Cancelled bookings are not owed; refunded ones are settled.
  const outstanding = scoped
    .filter(
      (b) =>
        (b.status === 'confirmed' || b.status === 'completed') &&
        (b.paymentStatus === 'unpaid' || b.paymentStatus === 'deposit_paid'),
    )
    .reduce((s, b) => s + b.priceMinor, 0)

  const settled = scoped.filter((b) => SETTLED.has(b.status))
  const noShows = settled.filter((b) => b.status === 'no_show').length
  const cancelled = scoped.filter((b) => b.status === 'cancelled').length

  const leads = scoped
    .map((b) => (new Date(b.startAt).getTime() - new Date(b.createdAt).getTime()) / 3_600_000)
    .filter((h) => h >= 0)
    .sort((a, b) => a - b)

  return {
    occupancy: openDays === 0 ? 0 : ratioSum / openDays,
    revenueCollected: collected,
    revenueOutstanding: outstanding,
    noShowRate: settled.length === 0 ? 0 : noShows / settled.length,
    cancellationRate: scoped.length === 0 ? 0 : cancelled / scoped.length,
    medianLeadHours: median(leads),
    bookingCount: scoped.length,
  }
}

function median(sorted) {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function isSameDayIso(iso, day) {
  const d = new Date(iso)
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  )
}

/* ------------------------------------------------------------------ series */

/**
 * @typedef {object} DailyPoint
 * @property {Date} date
 * @property {string} label
 * @property {number} bookings
 * @property {number} revenueMinor
 */

/**
 * @param {import('@/types').Booking[]} bookings
 * @param {DateRange} range
 * @returns {DailyPoint[]}
 */
export function dailySeries(bookings, range) {
  const scoped = inRange(bookings, range)
  return eachDayOfInterval({ start: range.from, end: range.to }).map((date) => {
    const onDay = scoped.filter((b) => isSameDayIso(b.startAt, date))
    return {
      date,
      label: format(date, 'd/M'),
      bookings: onDay.length,
      revenueMinor: onDay
        .filter((b) => b.paymentStatus === 'paid')
        .reduce((s, b) => s + b.priceMinor, 0),
    }
  })
}

/**
 * @param {import('@/types').Booking[]} bookings
 * @param {DateRange} range
 * @param {(b: import('@/types').Booking) => string} key
 * @param {readonly string[]} keys
 */
export function countBy(bookings, range, key, keys) {
  const out = Object.fromEntries(keys.map((k) => [k, 0]))
  for (const b of inRange(bookings, range)) out[key(b)] += 1
  return out
}

export function byChannel(bookings, range) {
  return countBy(bookings, range, (b) => b.channel, ['online', 'phone', 'walk_in'])
}

export function byStatus(bookings, range) {
  return countBy(bookings, range, (b) => b.status, [
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'no_show',
  ])
}

/**
 * Demand by weekday and hour.
 *
 * The most operationally useful chart here: it answers "when do I need more
 * staff", which no single number can. Cancelled bookings are excluded —
 * demand means time people actually wanted.
 *
 * @returns {{ weekday: number, hour: number, count: number }[]}
 */
export function demandHeatmap(bookings, range, fromHour = 8, toHour = 20) {
  const grid = new Map()
  for (const b of inRange(bookings, range)) {
    if (b.status === 'cancelled') continue
    const d = new Date(b.startAt)
    const h = d.getHours()
    if (h < fromHour || h > toHour) continue
    const k = `${d.getDay()}:${h}`
    grid.set(k, (grid.get(k) ?? 0) + 1)
  }

  const out = []
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = fromHour; hour <= toHour; hour++) {
      out.push({ weekday, hour, count: grid.get(`${weekday}:${hour}`) ?? 0 })
    }
  }
  return out
}

/**
 * @typedef {object} ServiceTotals
 * @property {string} serviceId
 * @property {number} count
 * @property {number} revenueMinor
 */

/**
 * @param {import('@/types').Booking[]} bookings
 * @param {DateRange} range
 * @returns {ServiceTotals[]}
 */
export function topServices(bookings, range) {
  const m = new Map()
  for (const b of inRange(bookings, range)) {
    if (b.status === 'cancelled') continue
    const row = m.get(b.serviceId) ?? { serviceId: b.serviceId, count: 0, revenueMinor: 0 }
    row.count += 1
    row.revenueMinor += b.priceMinor
    m.set(b.serviceId, row)
  }
  return [...m.values()].sort((a, b) => b.revenueMinor - a.revenueMinor)
}

/**
 * @typedef {object} ResourceTotals
 * @property {string} resourceId
 * @property {number} count       Bookings that were not cancelled.
 * @property {number} revenueMinor
 * @property {number} completed
 * @property {number} noShow
 * @property {number} noShowRate  Of the bookings that were decided (completed or no-show).
 * @property {number} bookedMin   Minutes on the calendar, buffer excluded.
 */

/**
 * How each person on the team did over the range — the question an owner
 * with more than one chair asks first.
 *
 * @param {import('@/types').Booking[]} bookings
 * @param {DateRange} range
 * @returns {ResourceTotals[]}
 */
export function byResource(bookings, range) {
  const m = new Map()
  for (const b of inRange(bookings, range)) {
    if (b.status === 'cancelled') continue
    const row = m.get(b.resourceId) ?? {
      resourceId: b.resourceId,
      count: 0,
      revenueMinor: 0,
      completed: 0,
      noShow: 0,
      noShowRate: 0,
      bookedMin: 0,
    }
    row.count += 1
    row.revenueMinor += b.priceMinor
    if (b.status === 'completed') row.completed += 1
    if (b.status === 'no_show') row.noShow += 1
    row.bookedMin += Math.max(0, (new Date(b.endAt) - new Date(b.startAt)) / 60000)
    m.set(b.resourceId, row)
  }
  for (const row of m.values()) {
    const decided = row.completed + row.noShow
    row.noShowRate = decided ? row.noShow / decided : 0
  }
  return [...m.values()].sort((a, b) => b.revenueMinor - a.revenueMinor)
}

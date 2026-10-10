import { addDays, addMinutes, set, startOfDay } from 'date-fns'
import { isWithinHours } from './hours'
import { inZone, iso } from './zone'

/**
 * A class's upcoming sessions, and how full each one is.
 *
 * A class runs at set times each week — Sunday and Tuesday at 18:30 with
 * Hind, say — so a guest picks a session from a list, not a time from a
 * grid. Each seat is an ordinary booking; a session's seats taken are the
 * blocking bookings of that service, on that resource, at that start.
 *
 * @typedef {{ weekday: number, time: string, resourceId: string }} WeeklySession
 * @typedef {{ startAt: string, endAt: string, resourceId: string, taken: number,
 *   capacity: number, left: number }} Session
 */

const BLOCKING = new Set(['pending', 'confirmed'])

export const isGroup = (service) => (service?.capacity ?? 1) > 1

/** Seats taken in one session. */
export function seatsTaken(bookings, serviceId, resourceId, startAt) {
  const at = new Date(startAt).getTime()
  return bookings.filter(
    (b) =>
      b.serviceId === serviceId &&
      b.resourceId === resourceId &&
      BLOCKING.has(b.status) &&
      new Date(b.startAt).getTime() === at,
  ).length
}

/**
 * The sessions in the coming days, soonest first, inside opening hours and
 * not yet started. `takenFor` says how many seats each has gone.
 *
 * @param {import('@/types').Service & { sessions?: WeeklySession[] }} service
 * @param {{ from?: Date, days?: number, schedule?: import('./hours').Schedule,
 *   now?: Date, takenFor: (resourceId: string, startAt: string) => number,
 *   resources?: { id: string }[] }} opts
 * @returns {Session[]}
 */
export function upcomingSessions(service, opts) {
  if (!isGroup(service) || !service.sessions?.length) return []
  const { days = 28, schedule = [], takenFor, resources } = opts
  const now = opts.now ?? new Date()
  const from = startOfDay(inZone(opts.from ?? now))
  const allowed = resources ? new Set(resources.map((r) => r.id)) : null
  const out = []
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i)
    for (const s of service.sessions) {
      if (s.weekday !== day.getDay()) continue
      if (allowed && !allowed.has(s.resourceId)) continue
      const [h, m] = s.time.split(':').map(Number)
      const start = set(day, { hours: h, minutes: m, seconds: 0, milliseconds: 0 })
      if (start <= now) continue
      const end = addMinutes(start, service.durationMin + service.bufferMin)
      // A session the business is closed for that day (a holiday) is not offered.
      if (!isWithinHours(start, end, schedule)) continue
      const startAt = iso(start)
      const taken = takenFor(s.resourceId, startAt)
      out.push({
        startAt,
        endAt: iso(end),
        resourceId: s.resourceId,
        taken,
        capacity: service.capacity,
        left: Math.max(0, service.capacity - taken),
      })
    }
  }
  return out.sort((a, b) => a.startAt.localeCompare(b.startAt))
}

import { describe, expect, it } from 'vitest'
import { generateSlots, hasConflict, occupancyFor, overlaps } from '../availability'
import { Sparkles } from 'lucide-vue-next'

/**
 * The availability engine decides what can be booked, so a mistake here is a
 * double-booking or a slot the business can never sell. It is also pure, which
 * makes it the highest-value thing in the codebase to test.
 */

const service = {
  id: 's1',
  name: 'استشارة',
  description: '',
  durationMin: 30,
  bufferMin: 10,
  priceMinor: 15000,
  resourceIds: ['r1'],
  icon: Sparkles,
  isActive: true,
}

/**
 * Dates are built in local time, not from an ISO string with a fixed offset.
 *
 * hoursFor() keys off Date#getDay(), which is local — correctly, since the
 * operator's week is their own. A literal like '2030-03-03T00:00:00+03:00'
 * therefore lands on a different weekday depending on where the test runs,
 * and the suite passes or fails by machine. These helpers pin the weekday
 * instead of the instant.
 */
function localDayWithWeekday(weekday) {
  const d = new Date(2030, 2, 1)
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function at(day, hour, minute = 0) {
  const d = new Date(day)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

/** Short day: 09:00–12:00, so "no slot may run past closing" has real teeth. */
const OPEN_DAY = localDayWithWeekday(0)
const CLOSED_DAY = localDayWithWeekday(2)

const hours = [
  { weekday: 0, open: '09:00', close: '12:00', isClosed: false },
  { weekday: 1, open: '09:00', close: '18:00', isClosed: false },
  { weekday: 2, open: '09:00', close: '18:00', isClosed: true },
  { weekday: 3, open: '09:00', close: '18:00', isClosed: false },
  { weekday: 4, open: '09:00', close: '18:00', isClosed: false },
  { weekday: 5, open: '09:00', close: '18:00', isClosed: false },
  { weekday: 6, open: '09:00', close: '18:00', isClosed: false },
]

function booking(over = {}) {
  return {
    id: 'b1',
    reference: 'BK-2030-0001',
    customerId: 'c1',
    serviceId: 's1',
    resourceId: 'r1',
    startAt: at(OPEN_DAY, 10),
    endAt: at(OPEN_DAY, 10, 40),
    status: 'confirmed',
    paymentStatus: 'unpaid',
    priceMinor: 15000,
    channel: 'online',
    createdAt: '2030-03-01T10:00:00+03:00',
    updatedAt: '2030-03-01T10:00:00+03:00',
    history: [],
    ...over,
  }
}

const d = (iso) => new Date(iso)

describe('overlaps', () => {
  it('treats ranges as half-open, so touching edges do not collide', () => {
    // The rule the whole system depends on: a 10:00–10:40 booking leaves
    // 10:40 free. The tstzrange '[)' in the schema encodes the same thing.
    expect(
      overlaps(
        d('2030-03-03T10:00:00Z'),
        d('2030-03-03T10:40:00Z'),
        d('2030-03-03T10:40:00Z'),
        d('2030-03-03T11:20:00Z'),
      ),
    ).toBe(false)
  })

  it('detects a partial overlap', () => {
    expect(
      overlaps(
        d('2030-03-03T10:00:00Z'),
        d('2030-03-03T10:40:00Z'),
        d('2030-03-03T10:39:00Z'),
        d('2030-03-03T11:00:00Z'),
      ),
    ).toBe(true)
  })

  it('detects full containment in both directions', () => {
    const outer = [d('2030-03-03T09:00:00Z'), d('2030-03-03T12:00:00Z')]
    const inner = [d('2030-03-03T10:00:00Z'), d('2030-03-03T10:30:00Z')]
    expect(overlaps(outer[0], outer[1], inner[0], inner[1])).toBe(true)
    expect(overlaps(inner[0], inner[1], outer[0], outer[1])).toBe(true)
  })
})

describe('hasConflict', () => {
  const existing = booking()

  it('reports a clash on the same resource', () => {
    const candidate = booking({
      id: 'b2',
      startAt: at(OPEN_DAY, 10, 20),
      endAt: at(OPEN_DAY, 11),
    })
    expect(hasConflict(candidate, [existing])).toBe(true)
  })

  it('ignores a different resource', () => {
    const candidate = booking({ id: 'b2', resourceId: 'r2' })
    expect(hasConflict(candidate, [existing])).toBe(false)
  })

  it('never conflicts with itself', () => {
    expect(hasConflict(existing, [existing])).toBe(false)
  })

  it.each(['cancelled', 'no_show'])('lets a %s booking release its time', (status) => {
    const freed = booking({ status })
    const candidate = booking({ id: 'b2' })
    expect(hasConflict(candidate, [freed])).toBe(false)
  })

  it.each(['pending', 'confirmed'])('treats a %s booking as blocking', (status) => {
    const held = booking({ status })
    const candidate = booking({ id: 'b2' })
    expect(hasConflict(candidate, [held])).toBe(true)
  })
})

describe('generateSlots', () => {
  const base = {
    date: OPEN_DAY,
    service,
    resourceId: 'r1',
    hours,
    now: new Date(OPEN_DAY.getTime() - 86_400_000),
  }

  it('returns nothing on a closed day', () => {
    expect(generateSlots({ ...base, date: CLOSED_DAY, bookings: [] })).toEqual([])
  })

  it('never offers a slot that would run past closing', () => {
    const slots = generateSlots({ ...base, bookings: [] })
    // Not .at(-1): the project targets ES2020, and raising the lib for a test
    // would quietly permit newer syntax in shipped code too.
    const last = slots[slots.length - 1]
    // The day closes at 12:00 and the service occupies 40 minutes, so the last
    // slot a business could actually honour starts at 11:20.
    expect(new Date(last.endAt).getTime()).toBeLessThanOrEqual(new Date(at(OPEN_DAY, 12)).getTime())
  })

  it('marks a taken slot rather than hiding it', () => {
    // Absence is ambiguous — a hidden slot could mean "closed" or "booked".
    const slots = generateSlots({ ...base, bookings: [booking()] })
    expect(slots.filter((s) => s.state === 'taken').length).toBeGreaterThan(0)
    expect(slots.some((s) => s.startAt === at(OPEN_DAY, 10))).toBe(true)
  })

  it('frees the slot again when rescheduling that same booking', () => {
    const existing = booking()
    const withExclusion = generateSlots({
      ...base,
      bookings: [existing],
      excludeBookingId: existing.id,
    })
    expect(withExclusion.every((s) => s.state !== 'taken')).toBe(true)
  })

  it('marks slots before `now` as past', () => {
    const slots = generateSlots({ ...base, bookings: [], now: new Date(at(OPEN_DAY, 10)) })
    expect(slots.some((s) => s.state === 'past')).toBe(true)
    expect(slots.some((s) => s.state === 'available')).toBe(true)
  })

  it('reserves the buffer, not just the service duration', () => {
    const slots = generateSlots({ ...base, bookings: [] })
    const first = slots[0]
    const minutes = (new Date(first.endAt).getTime() - new Date(first.startAt).getTime()) / 60000
    expect(minutes).toBe(service.durationMin + service.bufferMin)
  })
})

describe('occupancyFor', () => {
  it('is zero on a closed day rather than dividing by zero', () => {
    expect(occupancyFor(CLOSED_DAY, [booking()], hours)).toEqual({
      bookedMin: 0,
      openMin: 0,
      ratio: 0,
    })
  })

  it('counts only the part of a booking inside opening hours', () => {
    // The day is 09:00–12:00. This booking runs 11:00–13:00, so only an hour
    // of it is inside — counting all 120 minutes would report 66% occupancy
    // on a 3-hour day for one booking.
    const spilling = booking({ startAt: at(OPEN_DAY, 11), endAt: at(OPEN_DAY, 13) })
    const { bookedMin, openMin } = occupancyFor(OPEN_DAY, [spilling], hours)
    expect(openMin).toBe(180)
    expect(bookedMin).toBe(60)
  })

  it('ignores cancelled bookings', () => {
    expect(occupancyFor(OPEN_DAY, [booking({ status: 'cancelled' })], hours).bookedMin).toBe(0)
  })

  it('counts completed bookings, which used their time', () => {
    expect(occupancyFor(OPEN_DAY, [booking({ status: 'completed' })], hours).bookedMin).toBe(
      occupancyFor(OPEN_DAY, [booking({ status: 'confirmed' })], hours).bookedMin,
    )
    expect(
      occupancyFor(OPEN_DAY, [booking({ status: 'completed' })], hours).bookedMin,
    ).toBeGreaterThan(0)
  })

  it('never exceeds 1 even when bookings overlap', () => {
    const many = Array.from({ length: 10 }, (_, i) => booking({ id: `b${i}`, resourceId: `r${i}` }))
    expect(occupancyFor(OPEN_DAY, many, hours).ratio).toBeLessThanOrEqual(1)
  })
})

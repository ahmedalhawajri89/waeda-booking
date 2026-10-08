import { describe, expect, it } from 'vitest'
import { seatsTaken, upcomingSessions } from '../sessions'
import { hasConflict } from '../availability'

/** Yoga: three seats, Sundays and Tuesdays at 07:00 with r1. */
const yoga = {
  id: 'yoga',
  durationMin: 60,
  bufferMin: 0,
  capacity: 3,
  sessions: [
    { weekday: 0, time: '07:00', resourceId: 'r1' },
    { weekday: 2, time: '07:00', resourceId: 'r1' },
  ],
}
const open = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  open: '06:00',
  close: '22:00',
  isClosed: false,
}))
// Sunday 3 March 2030, 07:00 local.
const SUN = new Date(2030, 2, 3, 7)
const seat = (id, over = {}) => ({
  id,
  serviceId: 'yoga',
  resourceId: 'r1',
  startAt: SUN.toISOString(),
  endAt: new Date(SUN.getTime() + 3_600_000).toISOString(),
  status: 'confirmed',
  ...over,
})
const capacityOf = (id) => (id === 'yoga' ? 3 : 1)

describe('upcomingSessions', () => {
  it('lists the weekly times in the coming days, with the seats left', () => {
    const list = upcomingSessions(yoga, {
      from: new Date(2030, 2, 1),
      days: 7,
      schedule: open,
      now: new Date(2030, 2, 1),
      takenFor: (r, at) => seatsTaken([seat('a'), seat('b')], 'yoga', r, at),
    })
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ taken: 2, left: 1, capacity: 3 })
    expect(list[1]).toMatchObject({ taken: 0, left: 3 })
  })

  it('leaves out a day the business is closed', () => {
    const closedSunday = open.map((h) => (h.weekday === 0 ? { ...h, isClosed: true } : h))
    const list = upcomingSessions(yoga, {
      from: new Date(2030, 2, 1),
      days: 7,
      schedule: closedSunday,
      now: new Date(2030, 2, 1),
      takenFor: () => 0,
    })
    expect(list).toHaveLength(1)
  })
})

describe('seats in the same session', () => {
  it('share the time up to the capacity', () => {
    expect(hasConflict(seat('c'), [seat('a'), seat('b')], capacityOf)).toBe(false)
    expect(hasConflict(seat('d'), [seat('a'), seat('b'), seat('c')], capacityOf)).toBe(true)
  })

  it('still clash with anything else at that time', () => {
    const other = { ...seat('x'), serviceId: 'private' }
    expect(hasConflict(seat('a'), [other], capacityOf)).toBe(true)
    expect(hasConflict(other, [seat('a')], capacityOf)).toBe(true)
  })
})

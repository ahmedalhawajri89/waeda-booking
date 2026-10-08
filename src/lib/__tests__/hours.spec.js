import { describe, expect, it } from 'vitest'
import { businessDayOf, isWithinHours, openAt, rowFor, weekSpan, windowFor } from '../hours'
import { generateSlots, occupancyFor } from '../availability'

/**
 * Business days that run past midnight, and special periods. Mirrored by
 * api/tests/Unit/HoursTest.php — the same cases, the same answers.
 */

// Thursday 7 March 2030 and the Friday after, local time.
const THU = new Date(2030, 2, 7)
const FRI = new Date(2030, 2, 8)
const at = (day, h, m = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)

const week = (open, close, closed = []) =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    open,
    close,
    isClosed: closed.includes(weekday),
  }))

/** A padel club: 16:00 to 02:00, Friday closed. */
const LATE = week('16:00', '02:00', [5])

describe('a day that runs past midnight', () => {
  it('closes the next morning', () => {
    const w = windowFor(THU, LATE)
    expect(w.open).toEqual(at(THU, 16))
    expect(w.close).toEqual(at(FRI, 2))
    expect(w.overnight).toBe(true)
  })

  it('counts 1 a.m. as part of the evening before', () => {
    expect(businessDayOf(at(FRI, 1), LATE)).toEqual(THU)
    expect(businessDayOf(at(FRI, 2), LATE)).toEqual(FRI)
    expect(businessDayOf(at(THU, 20), LATE)).toEqual(THU)
  })

  it('is open at 1 a.m. on the closed day, because that is still Thursday', () => {
    expect(openAt(at(FRI, 1), LATE)?.day).toEqual(THU)
    expect(openAt(at(FRI, 3), LATE)).toBeNull()
  })

  it('accepts a booking across midnight and refuses one past closing', () => {
    expect(isWithinHours(at(FRI, 0, 30), at(FRI, 1, 30), LATE)).toBe(true)
    expect(isWithinHours(at(THU, 23, 30), at(FRI, 0, 30), LATE)).toBe(true)
    expect(isWithinHours(at(FRI, 1, 30), at(FRI, 2, 30), LATE)).toBe(false)
    expect(isWithinHours(at(THU, 15), at(THU, 16), LATE)).toBe(false)
  })

  it('offers times after midnight, and stops at closing', () => {
    const service = { durationMin: 60, bufferMin: 0 }
    const slots = generateSlots({
      date: THU,
      service,
      resourceId: 'r1',
      bookings: [],
      hours: LATE,
      now: new Date(2030, 0, 1),
    })
    expect(slots[0].startAt).toBe(at(THU, 16).toISOString())
    expect(slots.at(-1).startAt).toBe(at(FRI, 1).toISOString())
  })

  it('measures occupancy over the whole late day', () => {
    const booking = {
      status: 'confirmed',
      startAt: at(FRI, 0).toISOString(),
      endAt: at(FRI, 1).toISOString(),
    }
    const o = occupancyFor(THU, [booking], LATE)
    expect(o.openMin).toBe(600)
    expect(o.bookedMin).toBe(60)
  })

  it('treats equal times as no day at all', () => {
    expect(windowFor(THU, week('09:00', '09:00'))).toBeNull()
  })

  it('spans the week from the earliest open to the latest close', () => {
    expect(weekSpan(LATE)).toEqual({ fromHour: 16, toHour: 25 })
    expect(weekSpan(week('09:00', '18:00'))).toEqual({ fromHour: 9, toHour: 17 })
  })
})

describe('a special period', () => {
  const schedule = {
    hours: week('09:00', '18:00'),
    specialPeriods: [
      {
        id: 'p1',
        label: 'رمضان',
        startsOn: '2030-03-07',
        endsOn: '2030-03-07',
        hours: week('20:00', '02:00'),
      },
    ],
  }

  it('replaces the week on its dates only', () => {
    expect(rowFor(schedule, THU).open).toBe('20:00')
    expect(rowFor(schedule, FRI).open).toBe('09:00')
    expect(windowFor(THU, schedule).period.label).toBe('رمضان')
  })

  it('carries its late night into the next morning', () => {
    expect(businessDayOf(at(FRI, 1), schedule)).toEqual(THU)
    expect(isWithinHours(at(FRI, 1), at(FRI, 1, 30), schedule)).toBe(true)
  })

  it('can close the business for a holiday', () => {
    const holiday = {
      ...schedule,
      specialPeriods: [
        {
          id: 'e',
          label: 'إجازة العيد',
          startsOn: '2030-03-07',
          endsOn: '2030-03-08',
          hours: week('09:00', '18:00', [0, 1, 2, 3, 4, 5, 6]),
        },
      ],
    }
    expect(windowFor(THU, holiday)).toBeNull()
    expect(windowFor(FRI, holiday)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { durationsOf, isPeak, priceFor } from '../pricing'
import { generateSlots } from '../availability'

/**
 * A padel court — App\Services\Pricing on the server reads the same cases.
 * 150 for an hour, 200 from five, 60/90/120 minutes, open 16:00 to 02:00.
 */
const padel = {
  durationMin: 60,
  durationOptions: [60, 90, 120],
  bufferMin: 0,
  priceMinor: 15000,
  peakFrom: '17:00',
  peakPriceMinor: 20000,
}
const late = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  open: '16:00',
  close: '02:00',
  isClosed: false,
}))
const THU = new Date(2030, 2, 7)
const at = (h, m = 0, plusDays = 0) =>
  new Date(THU.getFullYear(), THU.getMonth(), THU.getDate() + plusDays, h, m)

describe('priceFor', () => {
  it('charges the base price before the peak', () => {
    expect(priceFor(padel, at(16), null, late)).toBe(15000)
  })

  it('charges the peak price from the peak hour', () => {
    expect(isPeak(padel, at(17), late)).toBe(true)
    expect(priceFor(padel, at(19), null, late)).toBe(20000)
  })

  it('keeps the evening price after midnight on a late day', () => {
    expect(priceFor(padel, at(1, 0, 1), null, late)).toBe(20000)
  })

  it('charges a longer game in proportion', () => {
    expect(priceFor(padel, at(16), 90, late)).toBe(22500)
    expect(priceFor(padel, at(20), 120, late)).toBe(40000)
  })

  it('has no peak when none is set', () => {
    expect(priceFor({ ...padel, peakFrom: null }, at(20), null, late)).toBe(15000)
  })
})

describe('durationsOf', () => {
  it('always includes the default length, in order', () => {
    expect(durationsOf({ durationMin: 60, durationOptions: [120, 90] })).toEqual([60, 90, 120])
    expect(durationsOf({ durationMin: 30 })).toEqual([30])
  })
})

describe('slots for a chosen length', () => {
  const slotsFor = (durationMin) =>
    generateSlots({
      date: THU,
      service: padel,
      resourceId: 'c1',
      bookings: [],
      hours: late,
      durationMin,
      now: new Date(2020, 0, 1),
    })

  it('stops a long game where it would run past closing', () => {
    expect(slotsFor(null).at(-1).startAt).toBe(at(1, 0, 1).toISOString())
    expect(slotsFor(120).at(-1).startAt).toBe(at(0, 0, 1).toISOString())
  })

  it('prices each time for the length chosen', () => {
    const s = slotsFor(90).find((x) => x.startAt === at(18).toISOString())
    expect(s.priceMinor).toBe(30000)
  })
})

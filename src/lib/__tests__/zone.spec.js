import { afterEach, beforeEach, expect, it } from 'vitest'
import { startOfDay } from 'date-fns'
import { inZone, iso, setBusinessZone } from '../zone'
import { isWithinHours, windowFor } from '../hours'
import { generateSlots } from '../availability'
import { groupByPeriod } from '@/composables/useGuestAvailability'

/**
 * A clinic in Riyadh open 09:00–17:00, read by a browser anywhere: run with
 * TZ=Asia/Dubai or TZ=America/New_York and the answers must not move.
 * (Code review F3.)
 */
const HOURS = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  open: '09:00',
  close: '17:00',
  isClosed: false,
}))
const SERVICE = { id: 's1', durationMin: 30, bufferMin: 0, capacity: 1 }

beforeEach(() => setBusinessZone('Asia/Riyadh'))
afterEach(() => setBusinessZone(null))

// Tuesday 5 March 2030, as the clinic's own day.
const tuesday = () => startOfDay(inZone('2030-03-05T09:00:00Z'))

it("opens and closes on the business's clock, not the visitor's", () => {
  const w = windowFor(tuesday(), HOURS)

  expect(iso(w.open)).toBe('2030-03-05T06:00:00.000Z') // 09:00 in Riyadh
  expect(iso(w.close)).toBe('2030-03-05T14:00:00.000Z') // 17:00 in Riyadh
})

it('offers the first slot at 09:00 Riyadh, labelled 9:00', () => {
  const slots = generateSlots({
    date: tuesday(),
    service: SERVICE,
    resourceId: 'r1',
    bookings: [],
    hours: HOURS,
    now: new Date('2030-01-01T00:00:00Z'),
  })

  expect(slots[0].startAt).toBe('2030-03-05T06:00:00.000Z')
  expect(slots[0].label).toMatch(/^9:00/)
  expect(slots.at(-1).startAt).toBe('2030-03-05T13:30:00.000Z') // the 16:30 slot
})

it("checks a booking against the business's hours", () => {
  // 08:00Z is 11:00 in Riyadh: open. 14:30Z is 17:30: closed.
  expect(isWithinHours('2030-03-05T08:00:00Z', '2030-03-05T08:30:00Z', HOURS)).toBe(true)
  expect(isWithinHours('2030-03-05T14:30:00Z', '2030-03-05T15:00:00Z', HOURS)).toBe(false)
})

it("groups times by the business's morning and afternoon", () => {
  const groups = groupByPeriod([
    { startAt: '2030-03-05T06:00:00.000Z' }, // 09:00 Riyadh
    { startAt: '2030-03-05T10:00:00.000Z' }, // 13:00 Riyadh
  ])

  expect(groups.map((g) => [g.key, g.slots.length])).toEqual([
    ['am', 1],
    ['noon', 1],
  ])
})

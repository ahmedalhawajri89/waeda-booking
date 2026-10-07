import { describe, expect, it } from 'vitest'
import {
  byChannel,
  byStatus,
  computeKpis,
  dailySeries,
  demandHeatmap,
  topServices,
  byResource,
} from '../analytics'

/**
 * These numbers are what an operator would act on, so the interesting cases
 * are the ones that produce a wrong-but-plausible figure: an empty period, a
 * denominator of zero, a metric counting rows it should not.
 */

const hours = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  open: '09:00',
  close: '19:00',
  isClosed: false,
}))

/**
 * Local-time dates, not fixed-offset literals: the range functions bucket by
 * calendar day via getDay/getDate, so an ISO string with a hard-coded offset
 * lands on a different day depending on where the test runs.
 */
function local(day, hour = 10, minute = 0) {
  return new Date(2030, 2, day, hour, minute, 0, 0).toISOString()
}

function booking(over = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    reference: 'BK-2030-0001',
    customerId: 'c1',
    serviceId: 's1',
    resourceId: 'r1',
    startAt: local(4, 10),
    endAt: local(4, 10, 40),
    status: 'completed',
    paymentStatus: 'paid',
    priceMinor: 15000,
    channel: 'online',
    createdAt: local(1, 10),
    updatedAt: local(1, 10),
    history: [],
    ...over,
  }
}

const range = {
  from: new Date(2030, 2, 1, 0, 0, 0, 0),
  to: new Date(2030, 2, 7, 23, 59, 0, 0),
}

describe('computeKpis', () => {
  it('returns zeros for an empty period instead of NaN', () => {
    // Every rate here is a division; an empty list is the input most likely
    // to reach a user, on a brand new account.
    const k = computeKpis([], range, hours)
    expect(k.occupancy).toBe(0)
    expect(k.noShowRate).toBe(0)
    expect(k.cancellationRate).toBe(0)
    expect(k.medianLeadHours).toBe(0)
    expect(Number.isNaN(k.occupancy)).toBe(false)
  })

  it('counts only fully paid bookings as collected revenue', () => {
    const k = computeKpis(
      [
        booking({ paymentStatus: 'paid', priceMinor: 10000 }),
        booking({ paymentStatus: 'deposit_paid', priceMinor: 50000 }),
        booking({ paymentStatus: 'unpaid', priceMinor: 50000 }),
      ],
      range,
      hours,
    )
    expect(k.revenueCollected).toBe(10000)
  })

  it('counts committed work as outstanding, and not cancelled work', () => {
    const k = computeKpis(
      [
        booking({ status: 'confirmed', paymentStatus: 'unpaid', priceMinor: 10000 }),
        booking({ status: 'completed', paymentStatus: 'deposit_paid', priceMinor: 20000 }),
        // Cancelled is not owed, and must not inflate the figure.
        booking({ status: 'cancelled', paymentStatus: 'unpaid', priceMinor: 90000 }),
      ],
      range,
      hours,
    )
    expect(k.revenueOutstanding).toBe(30000)
  })

  it('measures the no-show rate against settled bookings only', () => {
    // Pending bookings have not had the chance to be a no-show yet. Counting
    // them would report a rate that falls simply because more were booked.
    const k = computeKpis(
      [
        booking({ status: 'no_show' }),
        booking({ status: 'completed' }),
        booking({ status: 'pending' }),
        booking({ status: 'pending' }),
      ],
      range,
      hours,
    )
    expect(k.noShowRate).toBe(0.5)
  })

  it('measures the cancellation rate against every booking', () => {
    const k = computeKpis(
      [booking({ status: 'cancelled' }), booking(), booking(), booking()],
      range,
      hours,
    )
    expect(k.cancellationRate).toBe(0.25)
  })

  it('takes the median lead time, so one far-future booking cannot skew it', () => {
    const created = new Date(2030, 2, 4, 0, 0, 0, 0)
    const lead = (hoursAhead) =>
      booking({
        createdAt: created.toISOString(),
        startAt: new Date(created.getTime() + hoursAhead * 3_600_000).toISOString(),
      })
    const k = computeKpis([lead(1), lead(2), lead(3)], range, hours)
    expect(Math.round(k.medianLeadHours)).toBe(2)
  })

  it('ignores bookings outside the range', () => {
    const k = computeKpis(
      [booking({ startAt: new Date(2029, 0, 1, 10).toISOString() })],
      range,
      hours,
    )
    expect(k.bookingCount).toBe(0)
  })
})

describe('series', () => {
  it('emits one point per day, including days with nothing on them', () => {
    // A gap would let the chart draw a straight line across a quiet week and
    // make it look busy.
    const series = dailySeries([booking()], range)
    expect(series).toHaveLength(7)
    expect(series.filter((p) => p.bookings > 0)).toHaveLength(1)
  })

  it('counts every channel, including the ones with no bookings', () => {
    const counts = byChannel([booking({ channel: 'phone' })], range)
    expect(counts).toEqual({ online: 0, phone: 1, walk_in: 0 })
  })

  it('counts every status key', () => {
    const counts = byStatus([booking({ status: 'no_show' })], range)
    expect(Object.keys(counts)).toHaveLength(5)
    expect(counts.no_show).toBe(1)
  })
})

describe('demandHeatmap', () => {
  it('excludes cancelled bookings — demand means time people wanted', () => {
    const cells = demandHeatmap([booking({ status: 'cancelled' })], range)
    expect(cells.every((c) => c.count === 0)).toBe(true)
  })

  it('covers all seven days and the whole hour window', () => {
    const cells = demandHeatmap([], range, 8, 20)
    expect(cells).toHaveLength(7 * 13)
  })
})

describe('topServices', () => {
  it('sorts by revenue and excludes cancelled bookings', () => {
    const rows = topServices(
      [
        booking({ serviceId: 's1', priceMinor: 10000 }),
        booking({ serviceId: 's2', priceMinor: 30000 }),
        booking({ serviceId: 's3', priceMinor: 90000, status: 'cancelled' }),
      ],
      range,
    )
    expect(rows.map((r) => r.serviceId)).toEqual(['s2', 's1'])
  })
})

describe('byResource', () => {
  it('totals each person, ignores cancellations, and rates no-shows on decided bookings', () => {
    const rows = byResource(
      [
        booking({ resourceId: 'r1', priceMinor: 10000 }),
        booking({ resourceId: 'r1', priceMinor: 10000, status: 'no_show' }),
        booking({ resourceId: 'r1', priceMinor: 99999, status: 'cancelled' }),
        booking({ resourceId: 'r2', priceMinor: 30000, status: 'confirmed' }),
      ],
      range,
    )
    expect(rows.map((r) => r.resourceId)).toEqual(['r2', 'r1'])
    const r1 = rows.find((r) => r.resourceId === 'r1')
    expect(r1.count).toBe(2)
    expect(r1.revenueMinor).toBe(20000)
    expect(r1.noShowRate).toBe(0.5)
    expect(r1.bookedMin).toBe(80)
    // Nothing decided yet: no rate rather than a divide-by-zero.
    expect(rows.find((r) => r.resourceId === 'r2').noShowRate).toBe(0)
  })
})

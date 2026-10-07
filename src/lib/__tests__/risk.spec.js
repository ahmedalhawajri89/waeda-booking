import { describe, expect, it } from 'vitest'
import { PRIOR_RATE, buildRiskModel, tierOf, wasPrepaid } from '../risk'

const NOW = new Date('2030-03-10T12:00:00Z').getTime()
let seq = 0

/** A settled or upcoming booking; `daysAgo` < 0 is in the future. */
function booking({
  daysAgo = 3,
  customerId = 'c1',
  status = 'completed',
  channel = 'phone',
  prepaid = false,
  leadDays = 1,
} = {}) {
  const start = new Date(NOW - daysAgo * 86_400_000)
  start.setUTCHours(10, 0, 0, 0)
  const created = new Date(start.getTime() - leadDays * 86_400_000)
  return {
    id: `b${++seq}`,
    customerId,
    status,
    channel,
    startAt: start.toISOString(),
    createdAt: created.toISOString(),
    priceMinor: 10000,
    paymentStatus: prepaid ? 'paid' : 'unpaid',
    history: prepaid
      ? [{ at: new Date(start.getTime() - 3_600_000).toISOString(), type: 'payment_recorded' }]
      : [],
  }
}

const upcoming = (over = {}) => booking({ daysAgo: -2, status: 'confirmed', ...over })

describe('buildRiskModel', () => {
  it('falls back to the prior with no history, and does not invent a record', () => {
    const model = buildRiskModel([], NOW)
    const risk = model.score(upcoming())

    expect(model.overall).toBeCloseTo(PRIOR_RATE, 5)
    expect(risk.probability).toBeGreaterThan(0.05)
    expect(risk.probability).toBeLessThan(0.25)
    expect(risk.factors.some((f) => f.key === 'history')).toBe(false)
  })

  it("weighs a customer's own record, and says so", () => {
    const history = [
      ...Array.from({ length: 30 }, () => booking({ customerId: 'steady' })),
      booking({ customerId: 'flaky', status: 'no_show' }),
      booking({ customerId: 'flaky', status: 'no_show' }),
      booking({ customerId: 'flaky', status: 'no_show' }),
      booking({ customerId: 'flaky' }),
    ]
    const model = buildRiskModel(history, NOW)

    const flaky = model.score(upcoming({ customerId: 'flaky' }))
    const steady = model.score(upcoming({ customerId: 'steady' }))

    expect(flaky.probability).toBeGreaterThan(steady.probability * 2)
    expect(flaky.factors[0].label).toBe('غاب 3 من 4 مواعيد سابقة')
  })

  it('learns which kinds of booking get missed at this business', () => {
    // Online bookings are missed here; phone bookings never are.
    const history = [
      ...Array.from({ length: 40 }, (_, i) =>
        booking({
          customerId: `o${i}`,
          channel: 'online',
          status: i % 3 === 0 ? 'no_show' : 'completed',
        }),
      ),
      ...Array.from({ length: 40 }, (_, i) => booking({ customerId: `p${i}`, channel: 'phone' })),
    ]
    const model = buildRiskModel(history, NOW)

    const online = model.score(upcoming({ customerId: 'new1', channel: 'online' }))
    const phone = model.score(upcoming({ customerId: 'new2', channel: 'phone' }))

    expect(online.probability).toBeGreaterThan(phone.probability)
    expect(model.drivers[0].key).toBe('channel')
    expect(model.drivers[0].worst).toBe('حجز من الموقع')
  })

  it('does not let a handful of bookings convince it of anything', () => {
    // One Monday booking, missed. Shrinkage keeps that from dominating.
    const history = [
      ...Array.from({ length: 50 }, (_, i) => booking({ customerId: `x${i}` })),
      booking({ customerId: 'y', status: 'no_show' }),
    ]
    const model = buildRiskModel(history, NOW)
    const weekday = model
      .score(upcoming({ customerId: 'z' }))
      .factors.find((f) => f.key === 'weekday')

    expect(Math.abs(weekday.delta)).toBeLessThan(1)
  })

  it('prices the risk', () => {
    const risk = buildRiskModel([], NOW).score(upcoming())
    expect(risk.expectedLossMinor).toBe(Math.round(risk.probability * 10000))
  })
})

describe('wasPrepaid', () => {
  it('counts a payment before the appointment, not one at the desk afterwards', () => {
    const before = booking({ prepaid: true })
    const after = booking()
    after.paymentStatus = 'paid'
    after.history = [
      {
        at: new Date(new Date(after.startAt).getTime() + 3_600_000).toISOString(),
        type: 'payment_recorded',
      },
    ]

    expect(wasPrepaid(before, NOW)).toBe(true)
    expect(wasPrepaid(after, NOW)).toBe(false)
  })
})

describe('tierOf', () => {
  it('cuts at the configured thresholds', () => {
    const t = { mediumAt: 0.15, highAt: 0.3 }
    expect(tierOf(0.1, t)).toBe('low')
    expect(tierOf(0.15, t)).toBe('medium')
    expect(tierOf(0.31, t)).toBe('high')
  })
})

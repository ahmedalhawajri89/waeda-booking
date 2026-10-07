import { describe, expect, it } from 'vitest'
import { candidatesFor, freedSlots, wants } from '../waitlist'
import { planActions } from '../guardEngine'
import { applyActions, applyOfferReply } from '../guardBackend'
import { DEFAULT_POLICY } from '../guard'

// Tuesday 5 March 2030, 10:00 local.
const NOW = new Date(2030, 2, 5, 10, 0).getTime()
const local = (d, h, m = 0) => new Date(2030, 2, d, h, m).toISOString()

const booking = (over = {}) => ({
  id: 'b1',
  customerId: 'c1',
  serviceId: 's1',
  resourceId: 'r1',
  status: 'confirmed',
  paymentStatus: 'unpaid',
  startAt: local(5, 15),
  endAt: local(5, 15, 40),
  createdAt: local(1, 9),
  priceMinor: 15000,
  history: [],
  ...over,
})
const entry = (over = {}) => ({
  id: 'w1',
  customerId: 'c2',
  serviceId: 's1',
  day: null,
  window: null,
  status: 'waiting',
  createdAt: local(1, 9),
  ...over,
})
const freed = booking({ status: 'cancelled' })
const customers = [
  { id: 'c1', name: 'سارة خالد' },
  { id: 'c2', name: 'جود الغامدي' },
  { id: 'c3', name: 'فيصل القرني' },
]
const services = [{ id: 's1', name: 'استشارة', durationMin: 30, bufferMin: 10, priceMinor: 15000 }]

describe('freedSlots', () => {
  it('finds a cancelled booking still far enough ahead', () => {
    expect(freedSlots([freed], [], NOW).map((b) => b.id)).toEqual(['b1'])
  })

  it('ignores one too close to start, one already offered, and one taken again', () => {
    const soon = booking({
      id: 'b2',
      status: 'cancelled',
      startAt: local(5, 10, 30),
      endAt: local(5, 11, 10),
    })
    const offered = [{ bookingId: 'b1', template: 'backfill_offer' }]
    const retaken = booking({ id: 'b3' }) // same room, same time, confirmed

    expect(freedSlots([soon], [], NOW)).toEqual([])
    expect(freedSlots([freed], offered, NOW)).toEqual([])
    expect(freedSlots([freed, retaken], [], NOW)).toEqual([])
  })
})

describe('wants', () => {
  it('matches service, and day and window when given', () => {
    expect(wants(entry(), freed)).toBe(true)
    expect(wants(entry({ serviceId: 's2' }), freed)).toBe(false)
    expect(wants(entry({ day: '2030-03-05' }), freed)).toBe(true)
    expect(wants(entry({ day: '2030-03-06' }), freed)).toBe(false)
    expect(wants(entry({ window: [15 * 60, 18 * 60] }), freed)).toBe(true)
    expect(wants(entry({ window: [9 * 60, 12 * 60] }), freed)).toBe(false)
    expect(wants(entry({ status: 'booked' }), freed)).toBe(false)
  })
})

describe('candidatesFor', () => {
  it('puts the waitlist first, oldest wait first, then regulars', () => {
    const history = [1, 2].map((d) =>
      booking({
        id: `h${d}`,
        customerId: 'c3',
        status: 'completed',
        startAt: local(d, 9),
        endAt: local(d, 9, 40),
      }),
    )
    const waitlist = [
      entry({ id: 'w2', customerId: 'c4', createdAt: local(3, 9) }),
      entry({ id: 'w1', customerId: 'c2', createdAt: local(2, 9) }),
    ]

    const out = candidatesFor(freed, { waitlist, bookings: [freed, ...history], now: NOW })

    expect(out.map((c) => [c.customerId, c.reason])).toEqual([
      ['c2', 'waitlist'],
      ['c4', 'waitlist'],
      ['c3', 'regular'],
    ])
  })

  it('never offers the slot back to who gave it up, or to someone already booked that day', () => {
    const busy = booking({
      id: 'b9',
      customerId: 'c2',
      startAt: local(5, 12),
      endAt: local(5, 12, 40),
      resourceId: 'r2',
    })
    const waitlist = [entry({ customerId: 'c1' }), entry({ id: 'w2', customerId: 'c2' })]

    expect(candidatesFor(freed, { waitlist, bookings: [freed, busy], now: NOW })).toEqual([])
  })
})

describe('the refill, end to end', () => {
  const waitlist = [entry(), entry({ id: 'w2', customerId: 'c3', createdAt: local(2, 9) })]
  let ref = 0
  const nextReference = () => `BK-2030-${String(++ref).padStart(4, '0')}`

  function offered() {
    const actions = planActions({
      bookings: [freed],
      messages: [],
      waitlist,
      policy: DEFAULT_POLICY,
      model: { score: () => ({ probability: 0.05, factors: [] }) },
      now: NOW,
    }).filter((a) => a.kind === 'backfill')
    return applyActions({ actions, bookings: [freed], customers, services, messages: [], now: NOW })
  }

  it('offers the freed time to each candidate, by name', () => {
    const { added } = offered()
    expect(added.map((m) => m.customerId)).toEqual(['c2', 'c3'])
    expect(added[0].body).toContain('مرحباً جود')
    expect(added[0].body).toContain('أول من يرد يأخذه')
  })

  it('books it for the first to say yes, and tells the next one it went', () => {
    const first = offered()
    const [toJood, toFaisal] = first.added
    const base = { customers, services, waitlist, nextReference, now: NOW }

    const won = applyOfferReply({ ...base, ...first, offerId: toJood.id, text: '1' })
    expect(won.booking).toMatchObject({
      customerId: 'c2',
      startAt: freed.startAt,
      status: 'confirmed',
    })
    expect(won.waitlist.find((e) => e.id === 'w1').status).toBe('booked')
    expect(won.messages.at(-1)).toMatchObject({
      template: 'backfill_won',
      payload: { priceMinor: 15000 },
    })

    const late = applyOfferReply({ ...base, ...won, offerId: toFaisal.id, text: 'أكيد' })
    expect(late.booking).toBeNull()
    expect(late.messages.at(-1).template).toBe('backfill_taken')
    expect(late.bookings.filter((b) => b.status === 'confirmed')).toHaveLength(1)
  })

  it('takes a no politely, and keeps them waiting', () => {
    const first = offered()
    const r = applyOfferReply({
      customers,
      services,
      waitlist,
      nextReference,
      now: NOW,
      ...first,
      offerId: first.added[0].id,
      text: 'لا',
    })
    expect(r.booking).toBeNull()
    expect(r.messages.at(-1).template).toBe('backfill_declined')
    expect(r.waitlist.find((e) => e.id === 'w1').status).toBe('waiting')
  })
})

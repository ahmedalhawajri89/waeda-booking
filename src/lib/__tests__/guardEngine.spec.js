import { describe, expect, it } from 'vitest'
import { interpretReply, planActions } from '../guardEngine'
import { DEFAULT_POLICY } from '../guard'

const NOW = new Date('2030-03-10T08:00:00Z').getTime()
const HOUR = 3_600_000

/** A model that returns a fixed probability, so tiers are under test control. */
const modelAt = (p) => ({ score: () => ({ probability: p, factors: [], expectedLossMinor: 0 }) })

function booking(hoursAway, over = {}) {
  return {
    id: over.id ?? 'b1',
    customerId: 'c1',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    startAt: new Date(NOW + hoursAway * HOUR).toISOString(),
    createdAt: new Date(NOW - 72 * HOUR).toISOString(),
    priceMinor: 15000,
    history: [],
    ...over,
  }
}

const plan = (bookings, { p = 0.05, messages = [], policy = DEFAULT_POLICY } = {}) =>
  planActions({ bookings, messages, policy, model: modelAt(p), now: NOW })

const out = (template, bookingId = 'b1') => ({ bookingId, direction: 'out', template })

describe('planActions', () => {
  it('reminds a low-risk booking once it is inside the reminder window', () => {
    expect(plan([booking(30)])).toEqual([])
    expect(plan([booking(20)])).toEqual([{ kind: 'send', bookingId: 'b1', template: 'reminder' }])
  })

  it('never sends the same message twice', () => {
    expect(plan([booking(20)], { messages: [out('reminder')] })).toEqual([])
  })

  it('asks a medium-risk booking to confirm instead of a plain reminder', () => {
    const actions = plan([booking(2)], { p: 0.2 })
    expect(actions).toEqual([{ kind: 'send', bookingId: 'b1', template: 'confirm_request' }])
  })

  it('asks a high-risk unpaid booking for a deposit', () => {
    const templates = plan([booking(20)], { p: 0.5 }).map((a) => a.template)
    expect(templates).toContain('deposit_request')
  })

  it('does not ask a customer who already confirmed', () => {
    const confirmed = booking(2, { history: [{ type: 'customer_confirmed' }] })
    expect(
      plan([confirmed], { p: 0.5, messages: [out('reminder'), out('deposit_request')] }),
    ).toEqual([])
  })

  it('releases an unconfirmed booking only when the policy allows it', () => {
    const asked = [out('confirm_request'), out('deposit_request')]
    expect(plan([booking(1)], { p: 0.5, messages: asked })).toEqual([])

    const auto = { ...DEFAULT_POLICY, autoRelease: true, releaseHoursBefore: 2 }
    expect(plan([booking(1)], { p: 0.5, messages: asked, policy: auto })).toEqual([
      { kind: 'release', bookingId: 'b1' },
    ])
  })

  it('never releases a booking that was not first asked to confirm', () => {
    const auto = { ...DEFAULT_POLICY, autoRelease: true, releaseHoursBefore: 2 }
    const actions = plan([booking(1)], { p: 0.5, messages: [], policy: auto })
    expect(actions.some((a) => a.kind === 'release')).toBe(false)
  })

  it('leaves past and cancelled bookings alone', () => {
    expect(plan([booking(-1), booking(2, { id: 'b2', status: 'cancelled' })], { p: 0.5 })).toEqual(
      [],
    )
  })
})

describe('interpretReply', () => {
  it.each([
    ['1', 'confirm'],
    ['نعم', 'confirm'],
    ['أكيد جاي', 'confirm'],
    ['تمام.', 'confirm'],
    ['👍', 'confirm'],
    ['2', 'cancel'],
    ['ألغيه لو سمحت', 'cancel'],
    ['ما بقدر اجي', 'cancel'],
    ['بتأخر ربع ساعة', 'late'],
    ['مين معي؟', 'unknown'],
    ['ممكن أغير الموعد للخميس', 'reschedule'],
  ])('%s → %s', (text, intent) => {
    expect(interpretReply(text)).toBe(intent)
  })

  it('reads a number inside a longer word as nothing', () => {
    expect(interpretReply('10 دقائق')).toBe('unknown')
  })
})

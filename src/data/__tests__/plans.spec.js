import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectivePlan, planByKey, priceFor, trialDaysLeft } from '../plans'

const NOW = new Date(2026, 9, 8, 12)
const days = (n) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

describe('plans', () => {
  it('runs the trial plan while the trial lasts, then what is paid for', () => {
    expect(effectivePlan({ plan: 'free', trialEndsAt: days(3) }, NOW).plan.key).toBe('pro')
    expect(effectivePlan({ plan: 'free', trialEndsAt: days(-1) }, NOW).plan.key).toBe('free')
    expect(effectivePlan({ plan: 'basic', trialEndsAt: null }, NOW).plan.key).toBe('basic')
  })

  it('falls back to the free plan for anything it does not know', () => {
    expect(effectivePlan({ plan: 'platinum', trialEndsAt: null }, NOW).plan.key).toBe('free')
  })

  it('counts trial days up, and stops at zero', () => {
    expect(trialDaysLeft({ trialEndsAt: days(8.2) }, NOW)).toBe(9)
    expect(trialDaysLeft({ trialEndsAt: days(-2) }, NOW)).toBe(0)
  })

  it('charges ten months for a year', () => {
    expect(priceFor(planByKey('basic'), 'yearly')).toBe(99_000)
    expect(priceFor(planByKey('pro'), 'monthly')).toBe(24_900)
  })
})

/* -------------------------------------------------------------- the store */
vi.mock('@/data/repository', () => ({
  isDemoBackend: true,
  repository: { loadSubscription: vi.fn(), requestPlan: vi.fn() },
}))

let useSubscriptionStore
let createPinia
let setActivePinia
let repository
beforeAll(async () => {
  ;({ createPinia, setActivePinia } = await import('pinia'))
  ;({ useSubscriptionStore } = await import('@/stores/subscription'))
  ;({ repository } = await import('@/data/repository'))
}, 30000)

let sub
beforeEach(() => {
  setActivePinia(createPinia())
  sub = useSubscriptionStore()
})

const load = async (raw) => {
  repository.loadSubscription.mockResolvedValueOnce(raw)
  await sub.load(true)
}

describe('the subscription store', () => {
  it('counts a message pack into this month', async () => {
    await load({
      plan: 'basic',
      trialEndsAt: null,
      usage: { messages: 290, extraMessages: 500, staff: 2 },
    })
    expect(sub.messageAllowance).toBe(800)
    expect(sub.messagesLeft).toBe(510)
    expect(sub.alert).toBeNull()
  })

  it('warns at 80 percent, and says the guard stopped at 100', async () => {
    await load({
      plan: 'basic',
      trialEndsAt: null,
      usage: { messages: 250, extraMessages: 0, staff: 1 },
    })
    expect(sub.alert.tone).toBe('warning')
    await load({
      plan: 'basic',
      trialEndsAt: null,
      usage: { messages: 300, extraMessages: 0, staff: 1 },
    })
    expect(sub.alert.tone).toBe('danger')
  })

  it('warns when a trial is about to end', async () => {
    await load({
      plan: 'free',
      trialEndsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      usage: { messages: 0, extraMessages: 0, staff: 1 },
    })
    expect(sub.inTrial).toBe(true)
    expect(sub.alert.text).toMatch(/تنتهي تجربتك/)
  })

  it('knows when the team is full', async () => {
    await load({
      plan: 'free',
      trialEndsAt: null,
      usage: { messages: 0, extraMessages: 0, staff: 1 },
    })
    expect(sub.canAddStaff(1)).toBe(false)
    expect(sub.allows('refill')).toBe(false)
  })
})

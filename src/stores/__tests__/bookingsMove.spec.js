import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Moving a booking — the one door the calendar's drag-and-drop and the
 * reschedule drawer both come through. It must refuse what the API refuses,
 * because the store writes optimistically and a move the server later rejects
 * looks done until the page reloads.
 */
vi.mock('@/data/repository', () => ({
  isDemoBackend: true,
  repository: { updateBooking: vi.fn((b) => Promise.resolve(b)) },
}))
vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

let useBookingsStore
let createPinia
let setActivePinia

beforeAll(async () => {
  // Cold imports of the store graph are slow on the first run.
  ;({ createPinia, setActivePinia } = await import('pinia'))
  ;({ useBookingsStore } = await import('@/stores/bookings'))
}, 90000)

/** s1 runs on r1 and r2 (30 + 10 min); s2 only on r1. See data/catalog.js. */
function booking(over = {}) {
  return {
    id: 'b1',
    reference: 'BK-2030-0001',
    customerId: 'c1',
    serviceId: 's1',
    resourceId: 'r1',
    startAt: '2030-03-03T07:00:00.000Z',
    endAt: '2030-03-03T07:40:00.000Z',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    priceMinor: 15000,
    channel: 'online',
    history: [],
    ...over,
  }
}

let store
beforeEach(() => {
  setActivePinia(createPinia())
  store = useBookingsStore()
})

describe('move', () => {
  it('moves to another person at the same time and says so in the log', () => {
    store.items = [booking()]
    expect(store.move('b1', { startAt: '2030-03-03T07:00:00.000Z', resourceId: 'r2' })).toBe(true)
    const b = store.byId('b1')
    expect(b.resourceId).toBe('r2')
    expect(b.history.at(-1).summary).toMatch(/مع/)
  })

  it('refuses a person who is busy then, and changes nothing', () => {
    store.items = [booking(), booking({ id: 'b2', reference: 'BK-2030-0002', resourceId: 'r2' })]
    expect(store.move('b1', { startAt: '2030-03-03T07:00:00.000Z', resourceId: 'r2' })).toBe(
      'conflict',
    )
    expect(store.byId('b1').resourceId).toBe('r1')
  })

  it('refuses a person who does not offer the service', () => {
    store.items = [booking({ serviceId: 's2', endAt: '2030-03-03T08:00:00.000Z' })]
    expect(store.move('b1', { startAt: '2030-03-03T09:00:00.000Z', resourceId: 'r2' })).toBe(
      'not_offered',
    )
  })

  it('recomputes the end from the service when the time moves', () => {
    store.items = [booking()]
    store.move('b1', { startAt: '2030-03-03T09:00:00.000Z' })
    expect(store.byId('b1').endAt).toBe('2030-03-03T09:40:00.000Z')
  })

  it('keeps reschedule() working for time-only callers', () => {
    store.items = [booking()]
    expect(store.reschedule('b1', '2030-03-03T10:00:00.000Z')).toBe(true)
    expect(store.byId('b1').resourceId).toBe('r1')
  })
})

describe('lengths and weekly series', () => {
  it('keeps a chosen length when a booking moves', () => {
    store.items = [booking({ durationMin: 90, endAt: '2030-03-03T08:40:00.000Z' })]
    store.move('b1', { startAt: '2030-03-03T09:00:00.000Z' })
    // 90 minutes and the 10-minute buffer of s1.
    expect(store.byId('b1').endAt).toBe('2030-03-03T10:40:00.000Z')
  })

  it('books the same slot every week, and skips a week that is taken', async () => {
    const { repository } = await import('@/data/repository')
    repository.createBooking = vi.fn((b) => Promise.resolve({ ...b, reference: 'BK' }))
    // Week 2 is taken on r1 at 07:00.
    store.items = [
      booking({
        id: 'taken',
        startAt: '2030-03-10T07:00:00.000Z',
        endAt: '2030-03-10T07:40:00.000Z',
      }),
    ]
    const { created, skipped } = await store.createWeekly(
      { customerId: 'c1', serviceId: 's1', resourceId: 'r1', startAt: '2030-03-03T07:00:00.000Z' },
      3,
    )
    expect(created).toHaveLength(2)
    expect(skipped).toHaveLength(1)
    expect(new Set(created.map((b) => b.seriesId)).size).toBe(1)
    expect(store.seriesOf(created[0].seriesId)).toHaveLength(2)
  })
})

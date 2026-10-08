import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Keeping a booking's promise: a guest's booking waits to be seen by the
 * business, and a booking whose time has passed waits to be closed — the
 * guard learns only from closed ones.
 */
vi.mock('@/data/repository', () => ({
  isDemoBackend: true,
  repository: {
    updateBooking: vi.fn((b) => Promise.resolve(b)),
    acknowledgeBooking: vi.fn((id) =>
      Promise.resolve({ id, acknowledgedAt: '2030-01-01T00:00:00Z' }),
    ),
  },
}))
vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

let useBookingsStore
let createPinia
let setActivePinia
let repository

beforeAll(async () => {
  ;({ createPinia, setActivePinia } = await import('pinia'))
  ;({ useBookingsStore } = await import('@/stores/bookings'))
  ;({ repository } = await import('@/data/repository'))
}, 30000)

const HOUR = 3600_000
const at = (ms) => new Date(Date.now() + ms).toISOString()

function booking(over = {}) {
  return {
    id: 'b1',
    reference: 'BK-2030-0001',
    customerId: 'c1',
    serviceId: 's1',
    resourceId: 'r1',
    startAt: at(48 * HOUR),
    endAt: at(48 * HOUR + 40 * 60_000),
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
  vi.clearAllMocks()
})

const reasons = () => store.attention.map((a) => a.reason)

describe('a guest booking waiting to be seen', () => {
  it('needs the business when nobody has seen it', () => {
    store.items = [booking({ acknowledgedAt: null })]
    expect(reasons()).toEqual(['unacknowledged'])
  })

  it('counts a booking from before the field existed as seen', () => {
    store.items = [booking()]
    expect(reasons()).toEqual([])
  })

  it('is seen once acknowledged, and says so to the backend', () => {
    store.items = [booking({ acknowledgedAt: null })]
    store.acknowledge('b1')
    expect(store.byId('b1').acknowledgedAt).toBeTruthy()
    expect(repository.acknowledgeBooking).toHaveBeenCalledWith('b1')
    expect(reasons()).toEqual([])
  })

  it('is seen when someone at the business acts on it', () => {
    store.items = [booking({ status: 'pending', acknowledgedAt: null })]
    store.setStatus('b1', 'confirmed')
    expect(store.byId('b1').acknowledgedAt).toBeTruthy()
  })

  it('is new again when the guest moves it', () => {
    store.items = [booking({ acknowledgedAt: '2030-01-01T00:00:00Z' })]
    expect(store.move('b1', { startAt: at(72 * HOUR) }, { byGuest: true })).toBe(true)
    expect(store.byId('b1').acknowledgedAt).toBeNull()
  })

  it('starts unseen only when the guest made it', async () => {
    repository.createBooking = vi.fn((b) => Promise.resolve({ ...b, reference: 'BK-1' }))
    const desk = await store.create({
      customerId: 'c1',
      serviceId: 's1',
      resourceId: 'r1',
      startAt: at(24 * HOUR),
    })
    const guest = await store.create({
      customerId: 'c1',
      serviceId: 's1',
      resourceId: 'r2',
      startAt: at(24 * HOUR),
      channel: 'online',
      byGuest: true,
    })
    expect(desk.acknowledgedAt).toBeTruthy()
    expect(guest.acknowledgedAt).toBeNull()
  })
})

describe('a booking whose time has passed', () => {
  it('asks whether they came, confirmed or not', () => {
    store.items = [
      booking({ id: 'a', status: 'confirmed', startAt: at(-3 * HOUR), endAt: at(-2 * HOUR) }),
      booking({ id: 'b', status: 'pending', startAt: at(-5 * HOUR), endAt: at(-4 * HOUR) }),
    ]
    expect(reasons()).toEqual(['overdue_completion', 'overdue_completion'])
  })

  it('leaves the list once closed', () => {
    store.items = [booking({ status: 'pending', startAt: at(-5 * HOUR), endAt: at(-4 * HOUR) })]
    store.setStatus('b1', 'no_show')
    expect(reasons()).toEqual([])
  })
})

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The demo backend's conflict rule.
 *
 * It exists so the two backends agree about what is legal — a rule the API
 * enforces and the demo does not is a bug that only appears in production.
 * These tests are here because getting it slightly wrong is silent: the store
 * mutates in memory either way, so a save that never lands looks exactly like
 * a save that did until someone reloads the page.
 */

const store = new Map()

vi.stubGlobal('localStorage', {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
})

const KEY = 'bookingpro:bookings:v1'

function booking(over = {}) {
  return {
    id: 'b1',
    reference: 'BK-2030-0001',
    customerId: 'c1',
    serviceId: 's1',
    resourceId: 'r1',
    startAt: '2030-03-03T10:00:00.000Z',
    endAt: '2030-03-03T10:40:00.000Z',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    priceMinor: 15000,
    channel: 'online',
    createdAt: '2030-03-01T10:00:00.000Z',
    updatedAt: '2030-03-01T10:00:00.000Z',
    history: [],
    ...over,
  }
}

/** Two bookings that genuinely overlap on the same resource. */
const CLASHING = [
  booking({ id: 'a' }),
  booking({
    id: 'b',
    startAt: '2030-03-03T10:20:00.000Z',
    endAt: '2030-03-03T11:00:00.000Z',
  }),
]

let repository
let isConflict

// The repository pulls in the risk model and the guard engine; transforming
// them cold under a parallel run can outlast one test's timeout. Pay it once.
beforeAll(async () => {
  await import('../repository')
}, 60_000)

beforeEach(async () => {
  store.clear()
  vi.resetModules()
  const repoModule = await import('../repository')
  const errorsModule = await import('../errors')
  repository = repoModule.repository
  isConflict = errorsModule.isConflict
})

describe('the local repository refuses to introduce an overlap', () => {
  it('rejects a new booking that creates a conflict', async () => {
    store.set(KEY, JSON.stringify([CLASHING[0]]))

    await expect(repository.createBooking(CLASHING[1])).rejects.toSatisfy(isConflict)
  })

  it('leaves what was already stored untouched when it rejects', async () => {
    const original = [CLASHING[0]]
    store.set(KEY, JSON.stringify(original))

    await repository.createBooking(CLASHING[1]).catch(() => {})

    expect(JSON.parse(store.get(KEY))).toEqual(original)
  })

  it('accepts a write beside a conflict that was already there', async () => {
    // The seed ships one deliberately, so the Today screen has something to
    // put in its needs-attention queue. Refusing every write because of it
    // meant nothing an operator did ever persisted.
    store.set(KEY, JSON.stringify(CLASHING))

    await repository.createBooking(booking({ id: 'c', resourceId: 'r2' }))
    await repository.updateBooking({ ...CLASHING[0], paymentStatus: 'paid' })

    expect(JSON.parse(store.get(KEY))).toHaveLength(3)
  })

  it('rejects moving a booking onto another', async () => {
    store.set(
      KEY,
      JSON.stringify([
        booking({ id: 'a' }),
        booking({
          id: 'b',
          startAt: '2030-03-03T12:00:00.000Z',
          endAt: '2030-03-03T12:40:00.000Z',
        }),
      ]),
    )

    await expect(
      repository.updateBooking(
        booking({
          id: 'b',
          startAt: '2030-03-03T10:20:00.000Z',
          endAt: '2030-03-03T11:00:00.000Z',
        }),
      ),
    ).rejects.toSatisfy(isConflict)
  })

  it('lets a cancelled booking release its slot', async () => {
    store.set(KEY, JSON.stringify([booking({ id: 'a' })]))

    await repository.updateBooking(booking({ id: 'a', status: 'cancelled' }))
    await expect(
      repository.createBooking(booking({ id: 'b', startAt: '2030-03-03T10:20:00.000Z' })),
    ).resolves.toMatchObject({ id: 'b' })
  })

  it('treats touching edges as free, matching overlaps()', async () => {
    store.set(KEY, JSON.stringify([booking({ id: 'a' })]))

    await expect(
      repository.createBooking(
        booking({
          id: 'b',
          startAt: '2030-03-03T10:40:00.000Z',
          endAt: '2030-03-03T11:20:00.000Z',
        }),
      ),
    ).resolves.toMatchObject({ id: 'b' })
  })
})

describe('creating a booking on the local repository', () => {
  it('is idempotent: the same id twice stores one booking', async () => {
    // Matches the API, where a retried create returns the first.
    const first = await repository.createBooking(booking({ id: 'x' }))
    const again = await repository.createBooking(booking({ id: 'x' }))

    expect(again.reference).toBe(first.reference)
    expect(JSON.parse(store.get(KEY))).toHaveLength(1)
  })

  it('issues the next reference after the highest one stored this year', async () => {
    const year = new Date().getFullYear()
    store.set(
      KEY,
      JSON.stringify([
        booking({ id: 'a', reference: `BK-${year}-0641` }),
        booking({ id: 'b', reference: `BK-${year - 1}-0900`, resourceId: 'r2' }),
      ]),
    )

    const saved = await repository.createBooking(booking({ id: 'c', resourceId: 'r3' }))

    expect(saved.reference).toBe(`BK-${year}-0642`)
  })
})

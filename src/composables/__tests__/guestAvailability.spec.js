import { beforeAll, beforeEach, expect, it, vi } from 'vitest'

/**
 * The taken times a guest sees: never "everything free" while they are still
 * loading or could not be loaded, and never an older answer over a newer one.
 */
// The HTTP layer under the real public API module. A plain function, not a
// vi.fn: vitest counts an error thrown inside a vi.fn against the test even
// when the code under test catches it, which is the very case tested here.
const server = vi.hoisted(() => ({ answer: () => [] }))
vi.mock('@/data/repository', () => ({ isDemoBackend: false, repository: {} }))
vi.mock('@/data/api/client', () => ({ request: (...args) => server.answer(...args) }))

let useGuestAvailability
beforeAll(async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  ;({ useGuestAvailability } = await import('@/composables/useGuestAvailability'))
}, 90000)
beforeEach(() => {
  server.answer = () => Promise.resolve([])
})

const range = { startAt: '2030-03-05T07:00:00Z', endAt: '2030-03-05T07:30:00Z' }

it('is loading until the taken times arrive, then ready', async () => {
  server.answer = () => Promise.resolve([range])
  const avail = useGuestAvailability()
  expect(avail.busyState.value).toBe('loading')

  await avail.loadBusy([{ id: 'r1' }])

  expect(avail.busyState.value).toBe('ready')
  expect(avail.busy.value.r1).toEqual([range])
})

it('says it failed instead of showing every time as free', async () => {
  server.answer = () => Promise.reject(new Error('offline'))
  const avail = useGuestAvailability()

  await avail.loadBusy([{ id: 'r1' }])

  expect(avail.busyState.value).toBe('failed')
})

it('keeps the newest answer when an older one arrives later', async () => {
  let releaseOld
  const answers = [
    () => new Promise((resolve) => (releaseOld = () => resolve([range]))),
    () => Promise.resolve([]),
  ]
  server.answer = () => answers.shift()()
  const avail = useGuestAvailability()

  const old = avail.loadBusy([{ id: 'r1' }])
  await avail.loadBusy([{ id: 'r2' }])
  releaseOld()
  await old

  expect(Object.keys(avail.busy.value)).toEqual(['r2'])
  expect(avail.busyState.value).toBe('ready')
})

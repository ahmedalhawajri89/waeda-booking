import { beforeAll, expect, it, vi } from 'vitest'

/** The code review's F1: signing out must not leave the last business's data loaded. */
vi.mock('@/data/repository', () => ({
  isDemoBackend: true,
  repository: { loadBookings: vi.fn(() => Promise.resolve([{ id: 'b1' }])) },
}))
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

let pinia, useAuthStore, useBookingsStore
beforeAll(async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  pinia = createPinia()
  setActivePinia(pinia)
  ;({ useAuthStore } = await import('@/stores/auth'))
  ;({ useBookingsStore } = await import('@/stores/bookings'))
}, 90000)

it('review F1: signing out clears the bookings the previous operator loaded', async () => {
  const bookings = useBookingsStore()
  await bookings.load()
  expect(bookings.items).toHaveLength(1)

  await useAuthStore().signOut()

  expect(bookings.loaded).toBe(false)
  expect(bookings.items).toHaveLength(0)
})

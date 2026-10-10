import { beforeAll, expect, it, vi } from 'vitest'

/** The code review's F7: a network failure on start-up is not a dead token. */
const writeToken = vi.fn()
vi.mock('@/data/repository', () => ({ isDemoBackend: false, repository: {} }))
vi.mock('@/data/api/client', () => ({
  readToken: () => 'valid-token',
  writeToken,
  request: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
}))

let useAuthStore
beforeAll(async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  ;({ useAuthStore } = await import('@/stores/auth'))
}, 90000)

it('review F7: going offline on a reload does not sign the operator out', async () => {
  await useAuthStore().init()

  expect(writeToken).not.toHaveBeenCalledWith(null)
})

import { beforeAll, beforeEach, expect, it, vi } from 'vitest'

/**
 * The catalog arrays are shared: a guest page for another business loads
 * that business's catalog into them. Back on the console, the operator's own
 * must be loaded again — and another business's must never be saved over it.
 * (Code review F2.)
 */
const catalogOf = (name) => ({
  business: { name, slug: name, category: null, address: null },
  services: [],
  resources: [],
  businessHours: [],
  specialPeriods: [],
  prayer: { enabled: false, prayers: [] },
})
const repository = {
  loadCatalog: vi.fn(),
  saveCatalog: vi.fn(() => Promise.resolve()),
}
vi.mock('@/data/repository', () => ({ isDemoBackend: false, repository }))

let setPublicOrg, useSettingsStore, business
beforeAll(async () => {
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  ;({ setPublicOrg } = await import('@/data/api/client'))
  ;({ useSettingsStore } = await import('@/stores/settings'))
  ;({ business } = await import('@/data/business'))
}, 90000)

beforeEach(() => {
  repository.loadCatalog.mockReset()
  repository.saveCatalog.mockClear()
  repository.loadCatalog.mockImplementation(() => Promise.resolve(catalogOf(currentName())))
})
let current = null
const currentName = () => current ?? 'mine'
function onPage(slug) {
  current = slug
  setPublicOrg(slug)
}

it('the console reloads its own catalog after a guest page loaded another', async () => {
  const settings = useSettingsStore()
  onPage(null)
  await settings.load()
  onPage('other')
  await settings.load(true)
  expect(business.name).toBe('other')

  onPage(null)
  await settings.load()

  expect(repository.loadCatalog).toHaveBeenCalledTimes(3)
  expect(business.name).toBe('mine')
})

it("another business's catalog is never saved over the console's", async () => {
  const settings = useSettingsStore()
  onPage('other')
  await settings.load(true)

  onPage(null)
  settings.toggleService('anything')
  settings.saveService({ id: 's1', name: 'x', iconKey: 'Sparkles', resourceIds: [] })

  expect(repository.saveCatalog).not.toHaveBeenCalled()
})

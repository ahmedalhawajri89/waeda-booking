import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { repository } from '@/data/repository'
import { currentPublicOrg } from '@/data/api/client'
import {
  applyCatalog,
  businessHours,
  prayer,
  resources,
  services,
  specialPeriods,
} from '@/data/catalog'
import { business } from '@/data/business'
import { uid } from '@/lib/id'

/**
 * Owns the business configuration Settings edits.
 *
 * It does not hold the catalog — the reactive arrays in data/catalog.ts do,
 * because roughly ten modules already import those directly. This store
 * loads them through the repository, applies edits in place, and writes back.
 * That keeps one source of truth and leaves the persistence seam intact.
 */
export const useSettingsStore = defineStore('settings', () => {
  const isLoading = ref(false)
  const error = ref(null)
  const loaded = ref(false)
  /**
   * Whose catalog the arrays hold: a guest page's business (its slug) or the
   * console's own (''). A booking page for another business loads that one
   * into the same arrays, so the console must reload rather than trust
   * `loaded` — and must never save what it did not load for itself.
   */
  const loadedFor = ref(null)
  const scope = () => currentPublicOrg() ?? ''

  /** @returns {import('@/data/catalog').CatalogSnapshot} */
  function snapshot() {
    return {
      business: {
        name: business.name,
        slug: business.slug,
        category: business.category,
        address: business.address,
      },
      // icon is a component; iconKey is what persists.
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category ?? null,
        description: s.description,
        durationMin: s.durationMin,
        durationOptions: s.durationOptions?.length ? [...s.durationOptions] : null,
        bufferMin: s.bufferMin,
        priceMinor: s.priceMinor,
        peakFrom: s.peakFrom ?? null,
        peakPriceMinor: s.peakPriceMinor ?? null,
        capacity: s.capacity ?? 1,
        sessions: (s.sessions ?? []).map((x) => ({ ...x })),
        resourceIds: [...s.resourceIds],
        iconKey: iconKeyOf(s.id),
        isActive: s.isActive,
      })),
      resources: resources.map((r) => ({ ...r })),
      businessHours: businessHours.map((h) => ({ ...h })),
      specialPeriods: specialPeriods.map((p) => ({ ...p, hours: p.hours.map((h) => ({ ...h })) })),
      prayer: { ...prayer, prayers: [...prayer.prayers] },
    }
  }

  /**
   * The catalog arrays hold resolved components, so the key has to be tracked
   * alongside. Kept here rather than widening the Service type, which the rest
   * of the app reads constantly and never needs the key for.
   */
  const iconKeys = ref({})
  const iconKeyOf = (serviceId) => iconKeys.value[serviceId] ?? 'Sparkles'

  async function load(force = false) {
    const wanted = scope()
    if (loaded.value && !force && loadedFor.value === wanted) return
    isLoading.value = true
    error.value = null
    try {
      const snap = await repository.loadCatalog()
      iconKeys.value = Object.fromEntries(snap.services.map((s) => [s.id, s.iconKey]))
      applyCatalog(snap)
      loaded.value = true
      loadedFor.value = wanted
    } catch {
      error.value = 'تعذّر تحميل الإعدادات. تحقّق من الاتصال ثم أعد المحاولة.'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * The one way a catalog is written back — refused unless what is loaded is
   * the console's own, so another business's services can never be saved
   * over this one's.
   */
  function write(snap, failure) {
    if (loadedFor.value !== '' || scope() !== '') {
      error.value = 'تغيّرت الصفحة قبل الحفظ. أعد تحميل الإعدادات ثم حاول مرة أخرى.'
      return
    }
    repository.saveCatalog(snap).catch(() => {
      error.value = failure
    })
  }

  function persist() {
    write(snapshot(), 'تعذّر حفظ الإعدادات.')
  }

  /* --------------------------------------------------------------- services */

  /** @param {import('@/data/catalog').ServiceRow} row */
  function saveService(row) {
    iconKeys.value[row.id] = row.iconKey
    const next = snapshot()
    const i = next.services.findIndex((s) => s.id === row.id)
    if (i === -1) next.services.push(row)
    else next.services[i] = row
    applyCatalog(next)
    // Reported like every other settings save — this one used to be the only
    // write whose failure vanished.
    write(next, 'تعذّر حفظ الخدمة.')
  }

  /** @returns {import('@/data/catalog').ServiceRow} */
  function newService() {
    return {
      id: uid('s_'),
      name: '',
      description: '',
      durationMin: 30,
      bufferMin: 10,
      priceMinor: 10000,
      category: services[0]?.category ?? null,
      resourceIds: resources.filter((r) => r.isActive).map((r) => r.id),
      iconKey: 'Sparkles',
      isActive: true,
    }
  }

  /**
   * Services are deactivated, never deleted: existing bookings reference the
   * service for their price and duration history, and removing it would leave
   * them pointing at nothing.
   */
  function toggleService(id) {
    const s = services.find((x) => x.id === id)
    if (!s) return
    s.isActive = !s.isActive
    persist()
  }

  /* -------------------------------------------------------------- resources */

  function saveResource(resource) {
    const i = resources.findIndex((r) => r.id === resource.id)
    if (i === -1) resources.push(resource)
    else resources[i] = resource
    persist()
  }

  function newResource() {
    return { id: uid('r_'), name: '', role: '', gender: null, kind: 'person', isActive: true }
  }

  function toggleResource(id) {
    const r = resources.find((x) => x.id === id)
    if (!r) return
    r.isActive = !r.isActive
    persist()
  }

  /* --------------------------------------------------------------- business */

  /**
   * Name, kind of place and address — what customers see at the top of the
   * booking page. The slug is not editable: links already sent must keep
   * working.
   */
  function saveBusiness(profile) {
    business.name = profile.name
    business.category = profile.category ?? ''
    business.address = profile.address ?? ''
    persist()
  }

  /* ------------------------------------------------------------------ hours */

  function saveHours(next) {
    businessHours.splice(0, businessHours.length, ...next)
    persist()
  }

  /**
   * Ramadan, Eid, a holiday: the whole list, replaced. Kept in date order so
   * the screen and the server read them the same way.
   * @param {import('@/lib/hours').SpecialPeriod[]} next
   */
  function savePeriods(next) {
    const sorted = [...next].sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    specialPeriods.splice(0, specialPeriods.length, ...sorted)
    persist()
  }

  /** Prayer pauses: on or off, the city, which prayers, for how long. */
  function savePrayer(next) {
    Object.assign(prayer, next, { prayers: [...next.prayers] })
    persist()
  }

  const activeServices = computed(() => services.filter((s) => s.isActive))
  const activeResources = computed(() => resources.filter((r) => r.isActive))

  /**
   * Forgets that a catalog was loaded — on sign-out. The arrays in
   * data/catalog are replaced by the next load(), which now has to run.
   */
  function reset() {
    iconKeys.value = {}
    error.value = null
    loaded.value = false
    loadedFor.value = null
  }

  return {
    reset,
    isLoading,
    error,
    loaded,
    load,
    iconKeyOf,
    activeServices,
    activeResources,
    saveService,
    newService,
    toggleService,
    saveResource,
    newResource,
    toggleResource,
    saveHours,
    savePeriods,
    savePrayer,
    saveBusiness,
  }
})

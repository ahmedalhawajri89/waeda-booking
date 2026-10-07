import { reactive } from 'vue'
import { iconFor } from '@/lib/icons'
import { applyBusiness } from './business'

/**
 * The business's own configuration: what it sells, on what, and when.
 *
 * These are reactive arrays rather than plain constants because Settings can
 * now edit them. Roughly ten modules import `services` / `resources` /
 * `businessHours` directly; keeping the same exported references and mutating
 * in place means every one of those consumers picks up an edit without being
 * rewritten to read from a store.
 *
 * The values below are only defaults for a fresh install. The settings store
 * hydrates them from the repository at startup, and persists edits back.
 */

/**
 * The shape that survives JSON — see src/lib/icons.ts for why iconKey.
 * @typedef {Omit<import('@/types').Service, 'icon'> & { iconKey: string }} ServiceRow
 */

/**
 * @typedef {object} CatalogSnapshot
 * @property {ServiceRow[]} services
 * @property {import('@/types').Resource[]} resources
 * @property {import('@/types').BusinessHours[]} businessHours
 */

/**
 * The demo business is one coherent place — a skin and beauty clinic — so the
 * guest page reads like a real storefront: specialists with names and roles,
 * services grouped the way the clinic sells them. Ids stay stable; the tests
 * and the seeded bookings refer to s1–s3 and r1–r2.
 */
export const DEFAULT_RESOURCES = [
  { id: 'r1', name: 'د. سارة العتيبي', role: 'أخصائية جلدية وتجميل', isActive: true },
  { id: 'r2', name: 'د. خالد المطيري', role: 'استشاري جلدية وليزر', isActive: true },
]

export const DEFAULT_SERVICES = [
  {
    id: 's1',
    name: 'استشارة جلدية',
    category: 'الاستشارات',
    description: 'فحص البشرة ومناقشة حالتك ووضع خطة علاج مناسبة.',
    durationMin: 30,
    bufferMin: 10,
    priceMinor: 15000,
    resourceIds: ['r1', 'r2'],
    iconKey: 'Stethoscope',
    isActive: true,
  },
  {
    id: 's2',
    name: 'تنظيف بشرة عميق',
    category: 'العناية بالبشرة',
    description: 'تنظيف وتقشير وترطيب، مناسب لكل أنواع البشرة.',
    durationMin: 45,
    bufferMin: 15,
    priceMinor: 22000,
    resourceIds: ['r1'],
    iconKey: 'Sparkles',
    isActive: true,
  },
  {
    id: 's3',
    name: 'جلسة ليزر',
    category: 'الليزر',
    description: 'جلسة إزالة شعر بالليزر لمنطقة كاملة، بأجهزة معتمدة.',
    durationMin: 120,
    bufferMin: 30,
    priceMinor: 45000,
    resourceIds: ['r2'],
    iconKey: 'HeartPulse',
    isActive: true,
  },
]

/** 0 = Sunday … 6 = Saturday. Hours vary by day, as they do in practice. */
export const DEFAULT_HOURS = [
  { weekday: 0, open: '09:00', close: '18:00', isClosed: false },
  { weekday: 1, open: '09:00', close: '18:00', isClosed: false },
  { weekday: 2, open: '09:00', close: '18:00', isClosed: false },
  { weekday: 3, open: '09:00', close: '18:00', isClosed: false },
  { weekday: 4, open: '09:00', close: '16:00', isClosed: false },
  { weekday: 5, open: '14:00', close: '20:00', isClosed: false },
  { weekday: 6, open: '10:00', close: '18:00', isClosed: false },
]

/** @param {ServiceRow} row @returns {import('@/types').Service} */
export const toService = (row) => {
  const { iconKey, ...rest } = row
  return { ...rest, icon: iconFor(iconKey) }
}

/* --------------------------------------------------------------- live state */

export const services = reactive(DEFAULT_SERVICES.map(toService))
export const resources = reactive(structuredClone(DEFAULT_RESOURCES))
export const businessHours = reactive(structuredClone(DEFAULT_HOURS))

/** Replaces contents in place, so importers keep their reference.
 * @param {CatalogSnapshot} snapshot */
export function applyCatalog(snapshot) {
  applyBusiness(snapshot.business)
  services.splice(0, services.length, ...snapshot.services.map(toService))
  resources.splice(0, resources.length, ...snapshot.resources)
  businessHours.splice(0, businessHours.length, ...snapshot.businessHours)
}

export function serviceById(id) {
  return services.find((s) => s.id === id) ?? null
}

export function resourceById(id) {
  return resources.find((r) => r.id === id) ?? null
}

/** Active resources a service can run on. @param {{ resourceIds: string[] } | null} service */
export function bookableResources(service) {
  if (!service) return []
  return resources.filter((r) => r.isActive && service.resourceIds.includes(r.id))
}

/** What can be booked right now: active, with somewhere active to run.
 *  A deactivated service used to stay on offer in both booking forms. */
export function bookableServices() {
  return services.filter((s) => s.isActive && bookableResources(s).length > 0)
}

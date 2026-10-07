import { reactive } from 'vue'

/**
 * The business a page is about: who, what kind of place, and where.
 *
 * Reactive, and filled from the catalogue load — on a guest page that is the
 * business named in the link (/b/{slug}); in the console, the operator's own.
 * The defaults are the demo clinic, which is also what the demo backend runs.
 */
export const DEFAULT_BUSINESS = {
  name: 'مركز الريحان',
  slug: 'alrayhan',
  category: 'عيادة جلدية وتجميل',
  address: 'حي الياسمين، الرياض',
}

/** Words that describe the kind of place rather than name it. */
const KIND = /^(مركز|عيادة|عيادات|صالون|مطعم|مقهى|أكاديمية|مكتب|استوديو|نادي)\s+/

/** "مركز الريحان" → "ر", "د. سارة" → "س": the name's own letter, not its kind or title. */
export const initialOf = (name) =>
  String(name ?? '')
    .replace(KIND, '')
    .replace(/^(د|أ|م)\.\s*/, '')
    .trim()
    // The article is not the name: "الريحان" stands for "ر".
    .replace(/^ال(?=\S{2,})/, '')
    .charAt(0) || '•'

export const business = reactive({
  ...DEFAULT_BUSINESS,
  get mapsUrl() {
    return this.address ? `https://maps.google.com/?q=${encodeURIComponent(this.address)}` : '#'
  },
  /** "مركز الريحان" → "ر": the name's own first letter, not the kind of place. */
  get initial() {
    return initialOf(this.name)
  },
})

/** @param {Partial<typeof DEFAULT_BUSINESS> | null | undefined} b */
export function applyBusiness(b) {
  const next = { ...DEFAULT_BUSINESS, ...(b ?? {}) }
  business.name = next.name
  business.slug = next.slug
  business.category = next.category ?? ''
  business.address = next.address ?? ''
}

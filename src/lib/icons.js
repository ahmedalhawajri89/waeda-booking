import {
  Coffee,
  Dumbbell,
  HeartPulse,
  Scissors,
  Sparkles,
  Stethoscope,
  Trophy,
  Wrench,
} from 'lucide-vue-next'

/**
 * Icon registry.
 *
 * A Service carries a Vue component for its icon, which cannot survive
 * JSON — so what gets stored is a key, and this resolves it back. The moment
 * services became editable and persisted, the icon had to stop being the
 * component itself.
 *
 * Also the seam the database needs: a `services.icon_key` column maps
 * straight onto this.
 */
export const SERVICE_ICONS = {
  HeartPulse,
  Stethoscope,
  Scissors,
  Sparkles,
  Coffee,
  Dumbbell,
  Trophy,
  Wrench,
}

/** @typedef {keyof typeof SERVICE_ICONS} ServiceIconKey */

export const SERVICE_ICON_KEYS = Object.keys(SERVICE_ICONS)

const FALLBACK = 'Sparkles'

/**
 * @param {string | undefined} key
 * @returns {import('@/types').LucideIcon}
 */
export function iconFor(key) {
  return SERVICE_ICONS[key ?? FALLBACK] ?? SERVICE_ICONS[FALLBACK]
}

/** Arabic labels for the picker — the keys themselves are never shown. */
export const SERVICE_ICON_LABELS = {
  HeartPulse: 'رعاية صحية',
  Stethoscope: 'عيادة',
  Scissors: 'حلاقة وتجميل',
  Sparkles: 'عناية',
  Coffee: 'ضيافة',
  Dumbbell: 'لياقة',
  Wrench: 'صيانة',
}

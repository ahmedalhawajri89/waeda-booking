import { BadgeCheck, CalendarCheck, MousePointerClick } from 'lucide-vue-next'

/**
 * Presentation-only fixtures for the marketing page.
 *
 * These exist as separate, deliberately *different* sets because the previous
 * build reused one cast of names across the hero artifact and the showcase
 * screens, so three distinct panels on the same page looked like the same
 * screenshot pasted three times. Different venue, different names, different
 * services per surface is what makes them read as three products' worth of
 * evidence rather than one.
 *
 * Nothing here reaches the operator app — that data comes from the store.
 */

/**
 * @typedef {object} DemoBlock
 * @property {string} name
 * @property {string} service
 * @property {number} startMin Minutes from midnight.
 * @property {number} durMin
 * @property {'success' | 'info' | 'warning'} tone
 */

/** Hero artifact: a clinic day. */
export const heroDay = {
  title: 'عيادة النخيل',
  room: 'غرفة 1',
  openMin: 9 * 60,
  closeMin: 18 * 60,
  blocks: [
    { name: 'ريم الدوسري', service: 'استشارة أولى', startMin: 9 * 60, durMin: 40, tone: 'success' },
    {
      name: 'بدر الشمري',
      service: 'متابعة دورية',
      startMin: 10 * 60 + 20,
      durMin: 60,
      tone: 'success',
    },
    {
      name: 'لمياء الغامدي',
      service: 'استشارة أولى',
      startMin: 11 * 60 + 40,
      durMin: 40,
      tone: 'info',
    },
    { name: 'طارق المالكي', service: 'فحص شامل', startMin: 14 * 60, durMin: 60, tone: 'info' },
    {
      name: 'جواهر الزهراني',
      service: 'متابعة دورية',
      startMin: 15 * 60 + 20,
      durMin: 40,
      tone: 'warning',
    },
  ],
}

/** The booking scene 2 reschedules — deliberately aimed at an occupied slot. */
export const heroConflict = {
  name: 'منيرة العنزي',
  service: 'استشارة أولى',
  durMin: 40,
  /** Where the operator drops it: straight on top of the 10:20 booking. */
  attemptMin: 10 * 60 + 40,
  /** Where the availability engine puts it instead. */
  resolvedMin: 12 * 60 + 40,
}

export const heroChannels = [
  { key: 'online', label: 'الموقع', icon: MousePointerClick },
  { key: 'phone', label: 'الهاتف', icon: CalendarCheck },
  { key: 'walk_in', label: 'الاستقبال', icon: BadgeCheck },
]

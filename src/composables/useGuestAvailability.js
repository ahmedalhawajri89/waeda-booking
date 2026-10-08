import { computed, ref } from 'vue'
import { addDays, format, startOfDay } from 'date-fns'
import { useBookingsStore } from '@/stores/bookings'
import { schedule } from '@/data/catalog'
import { isDemoBackend } from '@/data/repository'
import { generateSlots } from '@/lib/availability'
import { windowFor } from '@/lib/hours'

/** How far ahead a guest can look, and how far the busy lookup reaches. */
export const SEARCH_DAYS = 28

/** In the order a day is lived: a late night comes after the evening, not before the morning. */
export const PERIODS = [
  { key: 'am', label: 'صباحاً', test: (h) => h >= 4 && h < 12 },
  { key: 'noon', label: 'ظهراً', test: (h) => h >= 12 && h < 17 },
  { key: 'pm', label: 'مساءً', test: (h) => h >= 17 },
  { key: 'late', label: 'بعد منتصف الليل', test: (h) => h < 4 },
]

/** Slots split into morning / afternoon / evening, empty periods dropped. */
export const groupByPeriod = (slots) =>
  PERIODS.map((p) => ({
    ...p,
    slots: slots.filter((s) => p.test(new Date(s.startAt).getHours())),
  })).filter((p) => p.slots.length)

/**
 * Free times as a guest sees them, shared by booking and rescheduling.
 *
 * What is taken comes from one of two places. On the demo backend every
 * booking is in the browser, so the store has them. Against the API a guest
 * may not read /bookings, so the public availability endpoint answers with
 * bare busy intervals, fetched once per resource for the whole window.
 */
export function useGuestAvailability() {
  const bookings = useBookingsStore()
  const busy = ref({})

  const blocking = computed(() =>
    isDemoBackend
      ? bookings.items
      : Object.entries(busy.value).flatMap(([resourceId, ranges]) =>
          ranges.map((b, i) => ({
            id: `busy-${resourceId}-${i}`,
            resourceId,
            status: 'confirmed',
            startAt: b.startAt,
            endAt: b.endAt,
          })),
        ),
  )

  /** @param {{ id: string }[]} resources */
  async function loadBusy(resources) {
    if (isDemoBackend || !resources.length) return
    const { busyRanges } = await import('@/data/api/public')
    const from = format(new Date(), 'yyyy-MM-dd')
    // A day past the window, for the last evening's hours after midnight.
    const to = format(addDays(new Date(), SEARCH_DAYS + 1), 'yyyy-MM-dd')
    const next = {}
    await Promise.all(
      resources.map(async (r) => {
        try {
          next[r.id] = await busyRanges(r.id, from, to)
        } catch {
          // Over-offering is the safe failure: the server still refuses a
          // slot that has gone, while hiding real availability loses a sale.
          next[r.id] = []
        }
      }),
    )
    busy.value = next
  }

  /**
   * One row of times for a day, across every candidate resource. A time is
   * free if anyone can take it, and it remembers who — that is the resource
   * the booking lands on when "anyone" was chosen.
   *
   * @param {Date} day
   * @param {{ service: object | null, resources: { id: string }[], excludeBookingId?: string }} q
   */
  function slotsOn(day, { service, resources, excludeBookingId }) {
    if (!service || !resources.length) return []
    const byStart = new Map()
    for (const r of resources) {
      for (const s of generateSlots({
        date: day,
        service,
        resourceId: r.id,
        bookings: blocking.value,
        hours: schedule,
        excludeBookingId,
      })) {
        const seen = byStart.get(s.startAt)
        if (!seen)
          byStart.set(s.startAt, { ...s, resourceId: s.state === 'available' ? r.id : null })
        else if (seen.state !== 'available' && s.state === 'available')
          byStart.set(s.startAt, { ...s, resourceId: r.id })
      }
    }
    // Times already gone are not choices, and a row of them struck through
    // only buries the ones that are. Taken times stay, disabled.
    const now = new Date()
    return [...byStart.values()]
      .filter((s) => s.state !== 'past' && new Date(s.startAt) > now)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
  }

  /** Free times on a day for the day picker's dots; -1 when closed. */
  function freeCount(day, q) {
    if (!windowFor(day, schedule)) return -1
    if (!q.service) return 1
    return slotsOn(day, q).filter((s) => s.state === 'available').length
  }

  /** The soonest free time from today, or null within the window. */
  function nearest(q) {
    if (!q.service) return null
    for (let i = 0; i < SEARCH_DAYS; i++) {
      const day = addDays(startOfDay(new Date()), i)
      const slot = slotsOn(day, q).find((x) => x.state === 'available')
      if (slot) return { day, slot }
    }
    return null
  }

  return { busy, loadBusy, slotsOn, freeCount, nearest }
}

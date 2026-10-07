import { toast } from 'vue-sonner'
import { useBookingsStore } from '@/stores/bookings'
import { resourceById } from '@/data/catalog'
import { clone } from '@/lib/clone'
import { relativeDayTime } from '@/lib/format'

/**
 * What a drop on the calendar does: try the move, say what happened, and offer
 * the way back. Shared by every view that lets a booking be dragged.
 */
export function useBookingMove() {
  const store = useBookingsStore()

  /** @param {{ id: string, startAt: string, resourceId?: string }} to */
  function move({ id, startAt, resourceId }) {
    const before = store.byId(id) ? clone(store.byId(id)) : null
    const result = store.move(id, { startAt, resourceId })

    if (result === 'conflict') return toast.error('هذا الوقت محجوز عند هذا الشخص. بقي الحجز مكانه.')
    if (result === 'not_offered')
      return toast.error(`${resourceById(resourceId)?.name ?? 'هذا الشخص'} لا يقدّم هذه الخدمة.`)
    if (result !== true) return

    const who =
      resourceId && resourceId !== before?.resourceId ? ` مع ${resourceById(resourceId)?.name}` : ''
    toast.success(`نُقل إلى ${relativeDayTime(startAt)}${who}`, {
      action: { label: 'تراجع', onClick: () => before && store.restore(before) },
    })
  }

  return { move }
}

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { addDays, addMinutes, isAfter } from 'date-fns'
import { toast } from 'vue-sonner'
import { repository } from '@/data/repository'
import { ConflictError, isConflict } from '@/data/errors'
import { resourceById, schedule, serviceById } from '@/data/catalog'
import { hasConflict, occupancyFor } from '@/lib/availability'
import { businessDayOf, sameBusinessDay } from '@/lib/hours'
import { priceFor } from '@/lib/pricing'
import { clone } from '@/lib/clone'
import { dayLabel, time } from '@/lib/format'
import { useCustomersStore } from './customers'

const HOUR = 60 * 60 * 1000

export const useBookingsStore = defineStore('bookings', () => {
  const items = ref([])
  const isLoading = ref(false)
  const error = ref(null)
  const loaded = ref(false)

  /* ---------------------------------------------------------------- load */

  async function load(force = false) {
    if (loaded.value && !force) return
    isLoading.value = true
    error.value = null
    try {
      items.value = await repository.loadBookings()
      loaded.value = true
    } catch {
      error.value = 'تعذّر تحميل الحجوزات. تحقّق من الاتصال ثم أعد المحاولة.'
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Saves one booking, optimistically.
   *
   * The mutations that call this are synchronous — the screen has already
   * moved on by the time the write resolves. On success the stored copy
   * (server timestamps, server-written history) replaces ours; on failure the
   * booking goes back to `before` and a toast says why. It used to set
   * `error`, which the views render as a full-screen error state — so one
   * refused edit replaced the whole page.
   */
  function persist(b, before) {
    repository
      .updateBooking(clone(b))
      .then((saved) => Object.assign(b, saved))
      .catch((e) => {
        Object.assign(b, before)
        toast.error(
          isConflict(e)
            ? 'هذا الوقت لم يعد متاحاً — أُعيد الحجز كما كان'
            : 'تعذّر حفظ التغيير. أُعيد كما كان.',
        )
      })
  }

  /* ------------------------------------------------------------- getters */

  /** @returns {import('@/types').BookingView} */
  function hydrate(booking) {
    const customers = useCustomersStore()
    return {
      booking,
      customer: customers.byId(booking.customerId),
      service: serviceById(booking.serviceId),
      resource: resourceById(booking.resourceId),
    }
  }

  const byId = (id) => items.value.find((b) => b.id === id) ?? null

  const sorted = computed(() => [...items.value].sort((a, b) => a.startAt.localeCompare(b.startAt)))

  /** A business day's bookings — 1 a.m. belongs to the evening before, when it ran late. */
  function onDay(date) {
    return sorted.value.filter((b) => sameBusinessDay(b.startAt, date, schedule))
  }

  /** The business day in progress: past midnight, still last night's while it runs. */
  const currentDay = () => businessDayOf(new Date(), schedule)
  const today = computed(() => onDay(currentDay()))

  /** The next bookings still ahead of us today or later. */
  const upcoming = computed(() => {
    const now = new Date()
    return sorted.value.filter(
      (b) =>
        isAfter(new Date(b.startAt), now) && (b.status === 'confirmed' || b.status === 'pending'),
    )
  })

  const conflicts = computed(() => items.value.filter((b) => hasConflict(b, items.value)))

  /** The predicate the Today screen is built around. Order matters: most urgent first. */
  const attention = computed(() => {
    const now = Date.now()
    const seen = new Set()
    const out = []

    const push = (b, reason) => {
      if (seen.has(b.id)) return
      seen.add(b.id)
      out.push({ booking: b, reason })
    }

    for (const b of conflicts.value) push(b, 'conflict')

    // A class's twelve seats are one thing to deal with, not twelve: the
    // first seat stands for the session, and its drawer lists the rest.
    const sessionSeen = new Set()
    for (const b of sorted.value) {
      const start = new Date(b.startAt).getTime()
      const end = new Date(b.endAt).getTime()

      const live = b.status === 'pending' || b.status === 'confirmed'
      if (live && (serviceById(b.serviceId)?.capacity ?? 1) > 1) {
        const key = `${b.serviceId}|${b.resourceId}|${b.startAt}`
        if (sessionSeen.has(key)) continue
        sessionSeen.add(key)
      }

      // Over, and nobody said whether they came. Pending ones too: a booking
      // nobody confirmed still happened or did not, and the guard learns
      // only from the ones that are closed.
      if (live && end < now) {
        push(b, 'overdue_completion')
      } else if (live && b.acknowledgedAt === null && start > now) {
        push(b, 'unacknowledged')
      } else if (b.status === 'pending' && start - now < 24 * HOUR && start > now - HOUR) {
        push(b, 'pending_soon')
      } else if (
        b.status === 'confirmed' &&
        b.paymentStatus === 'unpaid' &&
        start - now < 2 * HOUR &&
        start > now
      ) {
        push(b, 'unpaid_imminent')
      }
    }

    return out.sort((a, b) => a.booking.startAt.localeCompare(b.booking.startAt))
  })

  const occupancyToday = computed(() => occupancyFor(currentDay(), today.value, schedule))

  /**
   * Built once per change instead of scanning on every call.
   *
   * CustomersView calls forCustomer() from inside a v-for, and a function call
   * in a template re-runs on every render — so a linear scan there was O(n·m)
   * per paint. The customer drawer and the analytics screen want the same
   * index, so it lives here rather than in the view.
   */
  const byCustomer = computed(() => {
    const m = new Map()
    for (const b of sorted.value) {
      const list = m.get(b.customerId)
      if (list) list.push(b)
      else m.set(b.customerId, [b])
    }
    return m
  })

  function forCustomer(customerId) {
    return byCustomer.value.get(customerId) ?? []
  }

  /* ------------------------------------------------------------- actions */

  /** Every change made here is made by someone at the business, so it is also seen. */
  function appendEvent(b, type, summary, { byGuest = false } = {}) {
    const now = new Date().toISOString()
    b.history.push({ at: now, type, summary })
    b.updatedAt = now
    if (byGuest) b.acknowledgedAt = null
    else b.acknowledgedAt ??= now
  }

  /**
   * @param {{ customerId: string, serviceId: string, resourceId: string, startAt: string,
   *           status?: import('@/types').BookingStatus,
   *           paymentStatus?: import('@/types').PaymentStatus,
   *           channel?: import('@/types').BookingChannel,
   *           notes?: string, durationMin?: number | null, seriesId?: string | null,
   *           byGuest?: boolean }} input
   * @returns {Promise<import('@/types').Booking>} as saved, with the reference the backend issued
   * @throws {ConflictError} if the slot is taken
   */
  async function create(input) {
    const service = serviceById(input.serviceId)
    if (!service) throw new Error('unknown service')

    const start = new Date(input.startAt)
    // A length the service offers (a 90-minute court); its own when absent.
    const durationMin = input.durationMin ?? null
    const end = addMinutes(start, (durationMin ?? service.durationMin) + service.bufferMin)
    const now = new Date().toISOString()

    const booking = {
      // A UUID the backend stores the booking under, so retrying the same
      // create cannot book twice. The reference is the backend's to issue.
      id: crypto.randomUUID(),
      reference: '',
      customerId: input.customerId,
      serviceId: input.serviceId,
      resourceId: input.resourceId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: input.status ?? 'confirmed',
      paymentStatus: input.paymentStatus ?? 'unpaid',
      // The time's price (peak or not) for the length chosen, as the server prices it.
      priceMinor: priceFor(service, start, durationMin, schedule),
      durationMin,
      seriesId: input.seriesId ?? null,
      channel: input.channel ?? 'phone',
      // Made at the desk is seen at the desk. A guest's booking waits until
      // someone at the business opens or acts on it.
      acknowledgedAt: input.byGuest ? null : now,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
      history: [{ at: now, type: 'created', summary: 'أُنشئ الحجز' }],
    }
    if (booking.status === 'confirmed') {
      booking.history.push({ at: now, type: 'confirmed', summary: 'تم تأكيد الحجز' })
    }

    if (hasConflict(booking, items.value)) throw new ConflictError()

    const saved = await repository.createBooking(booking)
    items.value.push(saved)
    return saved
  }

  /**
   * The same booking every week — the padel group's Tuesday. Each week is
   * checked on its own; one that is taken is skipped, not the whole series.
   * @returns {Promise<{ created: import('@/types').Booking[], skipped: Date[] }>}
   */
  async function createWeekly(input, weeks) {
    const seriesId = crypto.randomUUID()
    const created = []
    const skipped = []
    for (let i = 0; i < weeks; i++) {
      const startAt = addDays(new Date(input.startAt), 7 * i).toISOString()
      try {
        created.push(await create({ ...input, startAt, seriesId }))
      } catch (e) {
        if (!(e instanceof ConflictError) && !isConflict(e)) throw e
        skipped.push(new Date(startAt))
      }
    }
    return { created, skipped }
  }

  /** The bookings of a weekly series, in order. */
  const seriesOf = (seriesId) =>
    seriesId ? sorted.value.filter((b) => b.seriesId === seriesId) : []

  function setStatus(id, status) {
    const b = byId(id)
    if (!b) return
    const summaries = {
      pending: 'أُعيد الحجز إلى الانتظار',
      confirmed: 'تم تأكيد الحجز',
      completed: 'اكتملت الخدمة',
      cancelled: 'أُلغي الحجز',
      no_show: 'لم يحضر العميل',
    }
    const eventType =
      status === 'confirmed'
        ? 'confirmed'
        : status === 'completed'
          ? 'completed'
          : status === 'cancelled'
            ? 'cancelled'
            : status === 'no_show'
              ? 'no_show'
              : 'note_added'

    const before = clone(b)
    b.status = status
    appendEvent(b, eventType, summaries[status])
    persist(b, before)
  }

  function setPayment(id, paymentStatus) {
    const b = byId(id)
    if (!b) return
    const summaries = {
      unpaid: 'أُلغي تسجيل الدفع',
      deposit_paid: 'سُجّل عربون',
      paid: 'سُجّل الدفع كاملاً',
      refunded: 'تمت إعادة المبلغ',
    }
    const before = clone(b)
    b.paymentStatus = paymentStatus
    appendEvent(b, 'payment_recorded', summaries[paymentStatus])
    persist(b, before)
  }

  /**
   * Move a booking to another time, another person, or both. Returns a reason
   * string when it refuses ('conflict' · 'not_offered'), true when it moved.
   *
   * The checks live here rather than in a form: the calendar's drag-and-drop
   * and the reschedule drawer both come through this one door, and a slot
   * offered by neither can still be refused.
   *
   * @param {string} id
   * @param {{ startAt: string, resourceId?: string }} to
   * @returns {true | 'missing' | 'conflict' | 'not_offered'}
   */
  function move(id, { startAt, resourceId }, { byGuest = false } = {}) {
    const b = byId(id)
    if (!b) return 'missing'
    const service = serviceById(b.serviceId)
    if (!service) return 'missing'
    const toResource = resourceId ?? b.resourceId
    if (!service.resourceIds.includes(toResource)) return 'not_offered'

    const start = new Date(startAt)
    // A booking keeps the length it was made with.
    const end = addMinutes(start, (b.durationMin ?? service.durationMin) + service.bufferMin)
    const candidate = {
      ...b,
      resourceId: toResource,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    }
    if (hasConflict(candidate, items.value)) return 'conflict'

    const before = clone(b)
    b.resourceId = candidate.resourceId
    b.startAt = candidate.startAt
    b.endAt = candidate.endAt
    // Into or out of the peak: an unpaid booking takes the new time's price.
    if (b.paymentStatus === 'unpaid')
      b.priceMinor = priceFor(service, start, b.durationMin, schedule)
    // From and to, as the API writes it — the log should say what moved.
    const who = (rid) => resourceById(rid)?.name ?? ''
    const changedPerson = before.resourceId !== b.resourceId
    appendEvent(
      b,
      'rescheduled',
      `أُعيدت جدولة الحجز من ${dayLabel(before.startAt)} ${time(before.startAt)}${changedPerson ? ` مع ${who(before.resourceId)}` : ''} إلى ${dayLabel(b.startAt)} ${time(b.startAt)}${changedPerson ? ` مع ${who(b.resourceId)}` : ''}`,
      { byGuest },
    )
    persist(b, before)
    return true
  }

  /** Same time-only move the manage page and older callers use. */
  function reschedule(id, startAt) {
    return move(id, { startAt }) === true
  }

  function addNote(id, note) {
    const b = byId(id)
    if (!b) return
    const before = clone(b)
    b.notes = note
    appendEvent(b, 'note_added', 'أُضيفت ملاحظة')
    persist(b, before)
  }

  /**
   * Take the backend's copies of bookings it changed on its own — the guard
   * releasing a slot, a customer confirming by reply. Updated in place so
   * anything holding a booking keeps holding the live one.
   * @param {import('@/types').Booking[]} changed
   */
  function adopt(changed) {
    for (const next of changed) {
      const b = byId(next.id)
      if (!b) items.value.push(next)
      else if (b.updatedAt !== next.updatedAt || b.status !== next.status) Object.assign(b, next)
    }
  }

  /**
   * "Got it" — the business has seen a booking that arrived on its own, so
   * the guest's page can say it reached them. Opening the booking counts.
   */
  function acknowledge(id) {
    const b = byId(id)
    // null is "not yet"; a booking from before this field existed counts as seen.
    if (!b || b.acknowledgedAt !== null) return
    b.acknowledgedAt = new Date().toISOString()
    repository
      .acknowledgeBooking(id)
      .then((saved) => {
        if (saved?.acknowledgedAt) b.acknowledgedAt = saved.acknowledgedAt
      })
      .catch(() => {
        b.acknowledgedAt = null
      })
  }

  /** Restore a previous snapshot — powers the undo affordance on destructive actions. */
  function restore(snapshot) {
    const b = byId(snapshot.id)
    if (!b) return
    const before = clone(b)
    Object.assign(b, clone(snapshot))
    persist(b, before)
  }

  return {
    items,
    isLoading,
    error,
    loaded,
    load,
    hydrate,
    byId,
    sorted,
    onDay,
    currentDay,
    today,
    upcoming,
    conflicts,
    attention,
    occupancyToday,
    byCustomer,
    forCustomer,
    create,
    createWeekly,
    seriesOf,
    setStatus,
    setPayment,
    reschedule,
    move,
    addNote,
    acknowledge,
    restore,
    adopt,
  }
})

import { addDays, addMinutes, startOfDay } from 'date-fns'
import { depositFor, render } from './guardEngine'
import { understandReply } from './replyRules'
import { generateSlots, hasConflict } from './availability'
import { slotTaken } from './waitlist'
import { dayLabel, time } from './format'

/**
 * Carrying out what the guard decided, over plain arrays.
 *
 * This is the backend half of the guard for the demo: LocalRepository calls it
 * against localStorage the way the API calls GuardEngine.php against MySQL.
 * Pure — it returns new arrays and touches nothing — so the rules about what a
 * reply does to a booking are testable without either store.
 */

const HISTORY = {
  released: 'حُرّر الموعد لعدم تأكيد الحضور',
  customer_confirmed: 'أكّد العميل حضوره برسالة',
  confirmed: 'تم تأكيد الحجز',
  cancelled: 'ألغى العميل الحجز برسالة',
  late: 'أبلغ العميل أنه سيتأخر',
}

function context(booking, customers, services) {
  return {
    name: customers.find((c) => c.id === booking.customerId)?.name ?? 'عميلنا',
    service: services.find((s) => s.id === booking.serviceId)?.name ?? 'الخدمة',
    startAt: booking.startAt,
    depositMinor: depositFor(booking.priceMinor),
  }
}

const nameOf = (customers, id) => customers.find((c) => c.id === id)?.name ?? 'عميلنا'

function message(bookingId, direction, template, body, at, extra = {}) {
  return { id: crypto.randomUUID(), bookingId, direction, template, body, at, ...extra }
}

function withEvent(booking, type, at, patch = {}, summary = HISTORY[type]) {
  return {
    ...booking,
    ...patch,
    updatedAt: at,
    history: [...(booking.history ?? []), { at, type, summary }],
  }
}

/**
 * @param {{ actions: import('./guardEngine').GuardAction[], bookings: any[], customers: any[],
 *           services: any[], messages: import('./guardEngine').Message[], now?: number }} input
 */
export function applyActions({
  actions,
  bookings,
  customers,
  services,
  messages,
  now = Date.now(),
}) {
  const at = new Date(now).toISOString()
  const byId = new Map(bookings.map((b) => [b.id, b]))
  const added = []

  for (const a of actions) {
    const b = byId.get(a.bookingId)
    if (!b) continue
    if (a.kind === 'release') {
      byId.set(b.id, withEvent(b, 'released', at, { status: 'cancelled' }))
      added.push(
        message(
          b.id,
          'out',
          'release_notice',
          render('release_notice', context(b, customers, services)),
          at,
        ),
      )
    } else if (a.kind === 'backfill') {
      const ctx = { ...context(b, customers, services), name: nameOf(customers, a.customerId) }
      added.push(
        message(b.id, 'out', 'backfill_offer', render('backfill_offer', ctx), at, {
          customerId: a.customerId,
          payload: { entryId: a.entryId, reason: a.reason },
        }),
      )
    } else {
      added.push(
        message(b.id, 'out', a.template, render(a.template, context(b, customers, services)), at),
      )
    }
  }

  return { bookings: bookings.map((b) => byId.get(b.id)), messages: [...messages, ...added], added }
}

/** How long an offer of times can still be answered with a number. */
const OFFER_OPEN_MS = 24 * 3600 * 1000

/**
 * The latest offer of times for this booking, while it can still be answered:
 * not used, recent, made against the booking's current time, and with none of
 * its times already past. GuardEngine::openOffer, line for line.
 */
export function openOffer(messages, booking, now = Date.now()) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.bookingId !== booking.id || m.direction !== 'out') continue
    if (m.template !== 'reschedule_offer') continue
    const { used, from, options = [] } = m.payload ?? {}
    if (used || new Date(m.at).getTime() < now - OFFER_OPEN_MS) return null
    if (from && new Date(from).getTime() !== new Date(booking.startAt).getTime()) return null
    if (options.some((o) => new Date(o).getTime() <= now)) return null
    return m
  }
  return null
}

const minutesOf = (iso) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Up to three times the booking could move to, nearest the customer's wish.
 *
 * Asked-for day and part of day first; then anything that day; then the
 * coming week — so an answer always has somewhere to go. `fallback` says the
 * wish itself could not be met, which the message admits.
 *
 * @returns {{ options: string[], fallback: boolean }}
 */
export function findOptions(b, wish, { bookings, services, hours, now }) {
  const service = services.find((s) => s.id === b.serviceId)
  if (!service) return { options: [], fallback: true }

  const free = (date) =>
    generateSlots({
      date,
      service,
      resourceId: b.resourceId,
      bookings,
      hours,
      now: new Date(now),
      excludeBookingId: b.id,
      durationMin: b.durationMin ?? null,
    }).filter((s) => s.state === 'available' && s.startAt !== b.startAt)

  const fits = (slot) => {
    const m = minutesOf(slot.startAt)
    if (wish.window && (m < wish.window[0] || m >= wish.window[1])) return false
    return true
  }
  // An exact time asked for: closest first.
  const byCloseness = (list) =>
    wish.time === undefined
      ? list
      : [...list].sort(
          (x, y) =>
            Math.abs(minutesOf(x.startAt) - wish.time) - Math.abs(minutesOf(y.startAt) - wish.time),
        )
  const pick = (list) => list.slice(0, 3).map((s) => s.startAt)

  const start = wish.day ? new Date(`${wish.day}T00:00:00`) : startOfDay(new Date(now))
  if (wish.day) {
    const sameDay = free(start)
    const wanted = byCloseness(sameDay.filter(fits))
    if (wanted.length) return { options: pick(wanted), fallback: false }
    if (sameDay.length) return { options: pick(byCloseness(sameDay)), fallback: true }
  } else {
    for (let i = 0; i < 7; i++) {
      const wanted = byCloseness(free(addDays(start, i)).filter(fits))
      if (wanted.length) return { options: pick(wanted), fallback: false }
    }
  }

  const anyTime = []
  for (let i = wish.day ? 1 : 0; i < 8 && anyTime.length < 3; i++) {
    anyTime.push(...free(addDays(start, i)))
  }
  return { options: pick(anyTime), fallback: true }
}

/**
 * A customer's reply: recorded, read, acted on, and answered.
 * @returns {{ bookings: any[], messages: any[], booking: any, intent: string }}
 */
export function applyReply({
  bookingId,
  text,
  bookings,
  customers,
  services,
  hours,
  messages,
  now = Date.now(),
}) {
  const at = new Date(now).toISOString()
  const b = bookings.find((x) => x.id === bookingId)
  if (!b) throw new Error('booking not found')

  const offer = openOffer(messages, b, now)
  const u = understandReply(text, { now: new Date(now), offered: offer?.payload.options.length })
  const live = b.status === 'pending' || b.status === 'confirmed'
  let next = b
  let ack = 'ack_handoff'
  let used = null
  /** @type {{ options: string[], fallback: boolean } | null} */
  let offerOut = null

  if (u.intent === 'choose' && live && offer) {
    const target = offer.payload.options[u.option - 1]
    const service = services.find((s) => s.id === b.serviceId)
    const end = addMinutes(
      new Date(target),
      (b.durationMin ?? service.durationMin) + service.bufferMin,
    ).toISOString()
    used = offer.id
    if (hasConflict({ ...b, startAt: target, endAt: end }, bookings)) {
      // Taken since it was offered: say so, and offer again.
      offerOut = findOptions(b, { day: target.slice(0, 10) }, { bookings, services, hours, now })
      offerOut.fallback = true
      ack = null
    } else {
      // Picking a time is answering: the guard must not release it for silence.
      next = withEvent(b, 'customer_confirmed', at, {}, 'اختار العميل موعده الجديد برسالة')
      next = withEvent(
        next,
        'rescheduled',
        at,
        // The business has not seen the new time yet.
        { startAt: target, endAt: end, acknowledgedAt: null },
        `أعاد العميل جدولة الحجز من ${dayLabel(b.startAt)} ${time(b.startAt)} إلى ${dayLabel(target)} ${time(target)}`,
      )
      ack = 'ack_rescheduled'
    }
  } else if (u.intent === 'reschedule' && live) {
    offerOut = findOptions(b, u, { bookings, services, hours, now })
    ack = offerOut.options.length ? null : 'no_slots'
  } else if (u.intent === 'confirm' && live) {
    next = withEvent(b, 'customer_confirmed', at)
    if (b.status === 'pending') next = withEvent(next, 'confirmed', at, { status: 'confirmed' })
    ack = 'ack_confirm'
  } else if (u.intent === 'cancel' && live) {
    next = withEvent(b, 'cancelled', at, { status: 'cancelled' })
    ack = 'ack_cancel'
  } else if (u.intent === 'late' && live) {
    // A note, not a new event type: lateness changes nothing about the booking.
    next = withEvent(b, 'note_added', at, {}, HISTORY.late)
  }

  // A person reads what the guard could not settle: replies it did not
  // understand, lateness, and a move with nowhere to go.
  const needsStaff = ack === 'ack_handoff' || ack === 'no_slots'
  const inbound = message(b.id, 'in', 'reply', text.trim(), at, { intent: u.intent, needsStaff })
  const out = []
  if (offerOut?.options.length) {
    const ctx = { ...context(next, customers, services), ...offerOut }
    out.push(
      message(b.id, 'out', 'reschedule_offer', render('reschedule_offer', ctx), at, {
        payload: { options: offerOut.options, from: next.startAt },
      }),
    )
  }
  if (ack) out.push(message(b.id, 'out', ack, render(ack, context(next, customers, services)), at))

  const kept = used
    ? messages.map((m) => (m.id === used ? { ...m, payload: { ...m.payload, used: true } } : m))
    : messages

  return {
    bookings: bookings.map((x) => (x.id === b.id ? next : x)),
    messages: [...kept, inbound, ...out],
    booking: next,
    intent: u.intent,
  }
}

/**
 * A candidate's answer to a backfill offer.
 *
 * "Yes" books the freed time for them — unless someone answered first, which
 * the same overlap check that guards every booking decides. Everyone else who
 * answers yes afterwards is told, kindly, that it went.
 *
 * @param {{ offerId: string, text: string, bookings: any[], customers: any[], services: any[],
 *           messages: any[], waitlist: import('./waitlist').WaitlistEntry[],
 *           nextReference: () => string, now?: number }} input
 */
export function applyOfferReply({
  offerId,
  text,
  bookings,
  customers,
  services,
  messages,
  waitlist,
  nextReference,
  now = Date.now(),
}) {
  const at = new Date(now).toISOString()
  const offer = messages.find((m) => m.id === offerId && m.template === 'backfill_offer')
  if (!offer) throw new Error('offer not found')
  const freed = bookings.find((b) => b.id === offer.bookingId)
  const service = services.find((s) => s.id === freed.serviceId)
  const intent = understandReply(text, { now: new Date(now) }).intent

  let created = null
  let ack = intent === 'cancel' ? 'backfill_declined' : 'ack_handoff'
  let nextWaitlist = waitlist

  if (intent === 'confirm') {
    if (slotTaken(freed, bookings) || new Date(freed.startAt).getTime() <= now) {
      ack = 'backfill_taken'
    } else {
      created = {
        id: crypto.randomUUID(),
        reference: nextReference(),
        customerId: offer.customerId,
        serviceId: freed.serviceId,
        resourceId: freed.resourceId,
        startAt: freed.startAt,
        endAt: freed.endAt,
        durationMin: freed.durationMin ?? null,
        status: 'confirmed',
        paymentStatus: 'unpaid',
        priceMinor: service?.priceMinor ?? freed.priceMinor,
        channel: 'online',
        // Booked by the guard while nobody watched: new to the business.
        acknowledgedAt: null,
        createdAt: at,
        updatedAt: at,
        history: [
          { at, type: 'created', summary: 'حُجز من موعد متفرّغ عبر مساعد الحضور' },
          { at, type: 'confirmed', summary: 'تم تأكيد الحجز' },
        ],
      }
      if (offer.payload?.entryId) {
        nextWaitlist = waitlist.map((e) =>
          e.id === offer.payload.entryId ? { ...e, status: 'booked' } : e,
        )
      }
      ack = 'backfill_won'
    }
  }

  const ctx = {
    ...context(created ?? freed, customers, services),
    name: nameOf(customers, offer.customerId),
  }
  const inbound = message(freed.id, 'in', 'reply', text.trim(), at, {
    customerId: offer.customerId,
    replyTo: offer.id,
    intent,
    needsStaff: ack === 'ack_handoff',
  })
  const reply = message(freed.id, 'out', ack, render(ack, ctx), at, {
    customerId: offer.customerId,
    ...(created ? { payload: { bookingId: created.id, priceMinor: created.priceMinor } } : {}),
  })

  return {
    bookings: created ? [...bookings, created] : bookings,
    messages: [...messages, inbound, reply],
    waitlist: nextWaitlist,
    booking: created,
    intent,
  }
}

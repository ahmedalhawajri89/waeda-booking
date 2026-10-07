import { addDays, addMinutes, set, startOfDay } from 'date-fns'
import { bookingReference } from '@/lib/id'
import { DEFAULT_HOURS, DEFAULT_SERVICES, serviceById } from './catalog'

/* Seed data is generated relative to "now" so the product always has a live
 * today. It deliberately contains the awkward cases — a scheduling conflict,
 * a no-show, an unpaid imminent booking and a past booking never closed out —
 * so that empty, healthy and problematic states are all reachable in the UI. */

export const customers = [
  {
    id: 'c1',
    name: 'أحمد سعيد',
    phone: '0501234567',
    email: 'ahmed@example.com',
    createdAt: '2025-11-02T09:00:00.000Z',
  },
  {
    id: 'c2',
    name: 'سارة خالد',
    phone: '0552345678',
    email: 'sara@example.com',
    createdAt: '2025-12-14T09:00:00.000Z',
  },
  { id: 'c3', name: 'محمد علي', phone: '0533456789', createdAt: '2026-01-08T09:00:00.000Z' },
  {
    id: 'c4',
    name: 'فاطمة أحمد',
    phone: '0544567890',
    email: 'fatima@example.com',
    createdAt: '2026-01-21T09:00:00.000Z',
  },
  { id: 'c5', name: 'خالد الحربي', phone: '0565678901', createdAt: '2026-02-03T09:00:00.000Z' },
  {
    id: 'c6',
    name: 'نورة القحطاني',
    phone: '0576789012',
    email: 'noura@example.com',
    createdAt: '2026-02-19T09:00:00.000Z',
  },
  { id: 'c7', name: 'عبدالله المطيري', phone: '0587890123', createdAt: '2026-03-05T09:00:00.000Z' },
  {
    id: 'c8',
    name: 'ريم الشمري',
    phone: '0598901234',
    email: 'reem@example.com',
    createdAt: '2026-03-27T09:00:00.000Z',
  },
  { id: 'c9', name: 'يوسف الزهراني', phone: '0509012345', createdAt: '2026-04-11T09:00:00.000Z' },
  {
    id: 'c10',
    name: 'هند العتيبي',
    phone: '0510123456',
    email: 'hind@example.com',
    createdAt: '2026-05-02T09:00:00.000Z',
  },
  { id: 'c11', name: 'ماجد الدوسري', phone: '0521234567', createdAt: '2026-06-16T09:00:00.000Z' },
  {
    id: 'c12',
    name: 'لمى السبيعي',
    phone: '0532345678',
    email: 'lama@example.com',
    createdAt: '2026-07-09T09:00:00.000Z',
  },
  { id: 'c13', name: 'سلطان العنزي', phone: '0543456789', createdAt: '2026-01-15T09:00:00.000Z' },
  {
    id: 'c14',
    name: 'جود الغامدي',
    phone: '0554567890',
    email: 'jood@example.com',
    createdAt: '2026-02-08T09:00:00.000Z',
  },
  { id: 'c15', name: 'فيصل القرني', phone: '0565678912', createdAt: '2026-02-24T09:00:00.000Z' },
  { id: 'c16', name: 'أمل الرشيدي', phone: '0576789023', createdAt: '2026-03-12T09:00:00.000Z' },
  {
    id: 'c17',
    name: 'تركي الشهري',
    phone: '0587890134',
    email: 'turki@example.com',
    createdAt: '2026-03-30T09:00:00.000Z',
  },
  { id: 'c18', name: 'منيرة البقمي', phone: '0598901245', createdAt: '2026-04-18T09:00:00.000Z' },
  { id: 'c19', name: 'بندر المالكي', phone: '0509012356', createdAt: '2026-05-06T09:00:00.000Z' },
  {
    id: 'c20',
    name: 'دانة الحارثي',
    phone: '0510123467',
    email: 'dana@example.com',
    createdAt: '2026-05-21T09:00:00.000Z',
  },
  { id: 'c21', name: 'نايف العسيري', phone: '0521234578', createdAt: '2026-06-03T09:00:00.000Z' },
  { id: 'c22', name: 'شهد الجهني', phone: '0532345689', createdAt: '2026-06-22T09:00:00.000Z' },
  {
    id: 'c23',
    name: 'راكان السهلي',
    phone: '0543456790',
    email: 'rakan@example.com',
    createdAt: '2026-06-29T09:00:00.000Z',
  },
  { id: 'c24', name: 'وعد الثبيتي', phone: '0554567801', createdAt: '2026-07-04T09:00:00.000Z' },
]

/**
 * @typedef {object} SeedSpec
 * @property {number} dayOffset
 * @property {string} hm
 * @property {string} customerId
 * @property {string} serviceId
 * @property {string} resourceId
 * @property {import('@/types').BookingStatus} status
 * @property {import('@/types').PaymentStatus} paymentStatus
 * @property {import('@/types').BookingChannel} channel
 * @property {string} [notes]
 * @property {number} [leadHours] How long before the appointment it was booked. Defaults to 72.
 * @property {boolean} [prepaid] Paid before the appointment, not at it. Defaults to whether it is paid.
 */

/* dayOffset 0 = today. Times are local wall-clock. */
/** @type {SeedSpec[]} */
const SPECS = [
  // ---- today -------------------------------------------------------------
  {
    dayOffset: 0,
    hm: '09:00',
    customerId: 'c1',
    serviceId: 's1',
    resourceId: 'r1',
    status: 'completed',
    paymentStatus: 'paid',
    channel: 'phone',
  },
  {
    dayOffset: 0,
    hm: '10:00',
    customerId: 'c2',
    serviceId: 's2',
    resourceId: 'r1',
    status: 'completed',
    paymentStatus: 'paid',
    channel: 'online',
  },
  // never closed out — will surface in "needs attention" once its time passes
  {
    dayOffset: 0,
    hm: '11:30',
    customerId: 'c3',
    serviceId: 's1',
    resourceId: 'r1',
    status: 'confirmed',
    paymentStatus: 'paid',
    channel: 'walk_in',
  },
  // unpaid and imminent
  {
    dayOffset: 0,
    hm: '13:00',
    customerId: 'c4',
    serviceId: 's1',
    resourceId: 'r2',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    channel: 'online',
    notes: 'تفضل الدفع نقداً عند الحضور.',
  },
  {
    dayOffset: 0,
    hm: '14:00',
    customerId: 'c5',
    serviceId: 's2',
    resourceId: 'r1',
    status: 'confirmed',
    paymentStatus: 'deposit_paid',
    channel: 'phone',
  },
  // pending, starts today — needs a decision
  {
    dayOffset: 0,
    hm: '15:30',
    customerId: 'c6',
    serviceId: 's1',
    resourceId: 'r1',
    status: 'pending',
    paymentStatus: 'unpaid',
    channel: 'online',
  },
  {
    dayOffset: 0,
    hm: '16:00',
    customerId: 'c7',
    serviceId: 's3',
    resourceId: 'r2',
    status: 'confirmed',
    paymentStatus: 'paid',
    channel: 'online',
    notes: 'طاولة بجانب النافذة.',
  },

  // ---- tomorrow ----------------------------------------------------------
  {
    dayOffset: 1,
    hm: '09:30',
    customerId: 'c8',
    serviceId: 's1',
    resourceId: 'r1',
    status: 'confirmed',
    paymentStatus: 'paid',
    channel: 'online',
  },
  {
    dayOffset: 1,
    hm: '11:00',
    customerId: 'c9',
    serviceId: 's2',
    resourceId: 'r1',
    status: 'pending',
    paymentStatus: 'unpaid',
    channel: 'online',
  },
  // deliberate conflict with the booking above on the same resource
  {
    dayOffset: 1,
    hm: '11:30',
    customerId: 'c10',
    serviceId: 's1',
    resourceId: 'r1',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    channel: 'phone',
  },
  {
    dayOffset: 1,
    hm: '14:00',
    customerId: 'c11',
    serviceId: 's3',
    resourceId: 'r2',
    status: 'confirmed',
    paymentStatus: 'deposit_paid',
    channel: 'phone',
  },

  // ---- next few days -----------------------------------------------------
  {
    dayOffset: 2,
    hm: '10:00',
    customerId: 'c12',
    serviceId: 's1',
    resourceId: 'r2',
    status: 'confirmed',
    paymentStatus: 'paid',
    channel: 'online',
  },
  {
    dayOffset: 2,
    hm: '12:00',
    customerId: 'c1',
    serviceId: 's2',
    resourceId: 'r1',
    status: 'pending',
    paymentStatus: 'unpaid',
    channel: 'online',
  },
  {
    dayOffset: 3,
    hm: '09:00',
    customerId: 'c3',
    serviceId: 's1',
    resourceId: 'r1',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    channel: 'walk_in',
  },
  {
    dayOffset: 3,
    hm: '15:00',
    customerId: 'c5',
    serviceId: 's3',
    resourceId: 'r2',
    status: 'confirmed',
    paymentStatus: 'paid',
    channel: 'online',
  },
  {
    dayOffset: 4,
    hm: '11:00',
    customerId: 'c8',
    serviceId: 's2',
    resourceId: 'r1',
    status: 'confirmed',
    paymentStatus: 'deposit_paid',
    channel: 'phone',
  },
  {
    dayOffset: 5,
    hm: '15:00',
    customerId: 'c2',
    serviceId: 's1',
    resourceId: 'r1',
    status: 'confirmed',
    paymentStatus: 'paid',
    channel: 'online',
  },
  {
    dayOffset: 6,
    hm: '11:00',
    customerId: 'c6',
    serviceId: 's1',
    resourceId: 'r2',
    status: 'pending',
    paymentStatus: 'unpaid',
    channel: 'online',
  },

  // ---- history -----------------------------------------------------------
  {
    dayOffset: -1,
    hm: '10:00',
    customerId: 'c1',
    serviceId: 's1',
    resourceId: 'r1',
    status: 'completed',
    paymentStatus: 'paid',
    channel: 'online',
  },
  {
    dayOffset: -1,
    hm: '13:00',
    customerId: 'c4',
    serviceId: 's2',
    resourceId: 'r1',
    status: 'no_show',
    paymentStatus: 'unpaid',
    channel: 'online',
  },
  {
    dayOffset: -2,
    hm: '09:30',
    customerId: 'c2',
    serviceId: 's1',
    resourceId: 'r1',
    status: 'completed',
    paymentStatus: 'paid',
    channel: 'phone',
  },
  {
    dayOffset: -2,
    hm: '14:00',
    customerId: 'c7',
    serviceId: 's3',
    resourceId: 'r2',
    status: 'completed',
    paymentStatus: 'paid',
    channel: 'online',
  },
  {
    dayOffset: -3,
    hm: '11:00',
    customerId: 'c9',
    serviceId: 's2',
    resourceId: 'r1',
    status: 'cancelled',
    paymentStatus: 'refunded',
    channel: 'online',
  },
  {
    dayOffset: -3,
    hm: '16:00',
    customerId: 'c10',
    serviceId: 's1',
    resourceId: 'r2',
    status: 'completed',
    paymentStatus: 'paid',
    channel: 'walk_in',
  },
  {
    dayOffset: -4,
    hm: '10:30',
    customerId: 'c3',
    serviceId: 's1',
    resourceId: 'r1',
    status: 'completed',
    paymentStatus: 'paid',
    channel: 'online',
  },
  {
    dayOffset: -5,
    hm: '12:00',
    customerId: 'c11',
    serviceId: 's2',
    resourceId: 'r1',
    status: 'no_show',
    paymentStatus: 'unpaid',
    channel: 'online',
  },
  {
    dayOffset: -6,
    hm: '15:00',
    customerId: 'c12',
    serviceId: 's1',
    resourceId: 'r1',
    status: 'completed',
    paymentStatus: 'paid',
    channel: 'phone',
  },
  {
    dayOffset: -8,
    hm: '09:00',
    customerId: 'c1',
    serviceId: 's2',
    resourceId: 'r1',
    status: 'completed',
    paymentStatus: 'paid',
    channel: 'online',
  },
  {
    dayOffset: -11,
    hm: '14:00',
    customerId: 'c5',
    serviceId: 's1',
    resourceId: 'r2',
    status: 'completed',
    paymentStatus: 'paid',
    channel: 'online',
  },
  {
    dayOffset: -14,
    hm: '10:00',
    customerId: 'c8',
    serviceId: 's3',
    resourceId: 'r2',
    status: 'completed',
    paymentStatus: 'paid',
    channel: 'phone',
  },
]

const STATUS_EVENT = {
  completed: { type: 'completed', summary: 'اكتملت الخدمة' },
  cancelled: { type: 'cancelled', summary: 'أُلغي الحجز' },
  no_show: { type: 'no_show', summary: 'لم يحضر العميل' },
}

/* ---- generated history ---------------------------------------------------
 * The hand-written specs above are the cases the UI must handle. On their own
 * they leave the analytics screen meaningless: a quarter with a dozen bookings
 * in it reads as an empty chart and a 2% occupancy. Around them sits a
 * generated quarter of ordinary trade — demand that grows over the period, a
 * few no-shows and cancellations, and a lighter book further ahead. The
 * generator is seeded, so the same day always produces the same data. */

const HISTORY_DAYS = 90
const FUTURE_DAYS = 13
const SLOT_MIN = 30

/** mulberry32 — a tiny deterministic PRNG. @param {number} seed */
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** @template T @param {() => number} rand @param {[T, number][]} options @returns {T} */
function weighted(rand, options) {
  let r = rand() * options.reduce((sum, [, w]) => sum + w, 0)
  for (const [value, w] of options) {
    r -= w
    if (r < 0) return value
  }
  return options[options.length - 1][0]
}

/** "09:30" → 570 */
function toMin(hm) {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

/** 570 → "09:30" */
function toHm(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

function spanOf(serviceId) {
  const s = DEFAULT_SERVICES.find((x) => x.id === serviceId)
  return s.durationMin + s.bufferMin
}

// A few customers miss appointments far more often than the rest — the
// pattern a risk model exists to find. Everyone else rarely does.
const FLAKY = new Set(['c3', 'c11', 'c16', 'c21'])

const sigmoid = (x) => 1 / (1 + Math.exp(-x))
const logit = (p) => Math.log(p / (1 - p))

// Regulars come back; most customers book once or twice a quarter.
/** @type {[string, number][]} */
const CUSTOMER_MIX = customers.map((c, i) => [c.id, i < 8 ? 3 : 1])

/** @returns {SeedSpec[]} */
function generateSpecs(now) {
  const rand = seededRandom(20260405)
  /** @type {Map<string, [number, number][]>} */
  const taken = new Map()
  const isFree = (key, from, to) => !(taken.get(key) ?? []).some(([a, b]) => from < b && to > a)
  const hold = (key, from, to) => taken.set(key, [...(taken.get(key) ?? []), [from, to]])

  for (const spec of SPECS) {
    const from = toMin(spec.hm)
    hold(`${spec.dayOffset}|${spec.resourceId}`, from, from + spanOf(spec.serviceId))
  }

  /** @type {SeedSpec[]} */
  const out = []
  for (let dayOffset = -HISTORY_DAYS; dayOffset <= FUTURE_DAYS; dayOffset++) {
    // Today and tomorrow are hand-written: they drive the Today screen.
    if (dayOffset === 0 || dayOffset === 1) continue
    const hours = DEFAULT_HOURS.find((h) => h.weekday === addDays(now, dayOffset).getDay())
    if (!hours || hours.isClosed) continue

    const open = toMin(hours.open)
    const close = toMin(hours.close)
    const progress = (dayOffset + HISTORY_DAYS) / HISTORY_DAYS
    const density =
      (dayOffset < 0 ? 0.42 + 0.33 * progress : Math.max(0.15, 0.6 - dayOffset * 0.035)) *
      (0.8 + rand() * 0.4)
    const target = density * (close - open)

    let booked = 0
    for (let attempt = 0; attempt < 60 && booked < target; attempt++) {
      const serviceId = weighted(rand, [
        ['s1', 5],
        ['s2', 4],
        ['s3', 1.5],
      ])
      const span = spanOf(serviceId)
      const slots = Math.floor((close - span - open) / SLOT_MIN)
      if (slots < 0) continue
      const from = open + Math.floor(rand() * (slots + 1)) * SLOT_MIN
      const { resourceIds } = DEFAULT_SERVICES.find((x) => x.id === serviceId)
      const resourceId = resourceIds[Math.floor(rand() * resourceIds.length)]
      const key = `${dayOffset}|${resourceId}`
      if (!isFree(key, from, from + span)) continue
      hold(key, from, from + span)
      booked += span

      const channel = weighted(rand, [
        ['online', 55],
        ['phone', 30],
        ['walk_in', 15],
      ])
      const leadHours =
        channel === 'walk_in' ? 1 : channel === 'phone' ? 6 + rand() * 66 : 12 + rand() * 300
      const customerId = weighted(rand, CUSTOMER_MIX)
      // Paying up front is mostly an online habit; walk-ins pay at the desk.
      const prepaid = rand() < (channel === 'online' ? 0.3 : channel === 'phone' ? 0.1 : 0)

      let status
      let paymentStatus
      if (dayOffset < 0) {
        // Whether they turned up depends on who they are and how they booked —
        // the causes the research gives: forgetting (long lead times), plans
        // changing, and nothing at stake (no payment up front).
        const pNoShow = sigmoid(
          logit(FLAKY.has(customerId) ? 0.3 : 0.05) +
            (leadHours > 7 * 24 ? 0.8 : leadHours > 72 ? 0.35 : 0) +
            (channel === 'online' ? 0.3 : channel === 'walk_in' ? -1.5 : 0) +
            (prepaid ? -1.4 : 0),
        )
        status = rand() < 0.07 ? 'cancelled' : rand() < pNoShow ? 'no_show' : 'completed'
        if (status === 'completed') {
          paymentStatus = prepaid
            ? 'paid'
            : weighted(rand, [
                ['paid', 94],
                ['unpaid', 6],
              ])
        } else if (status === 'no_show') {
          paymentStatus = prepaid ? 'deposit_paid' : 'unpaid'
        } else {
          paymentStatus = prepaid ? 'refunded' : 'unpaid'
        }
      } else {
        status = rand() < 0.2 ? 'pending' : 'confirmed'
        paymentStatus = prepaid ? (rand() < 0.6 ? 'paid' : 'deposit_paid') : 'unpaid'
      }

      out.push({
        dayOffset,
        hm: toHm(from),
        customerId,
        serviceId,
        resourceId,
        status,
        paymentStatus,
        channel,
        leadHours,
        prepaid,
      })
    }
  }
  return out
}

/** @returns {import('@/types').Booking[]} */
export function buildSeedBookings(now = new Date()) {
  const dated = [...SPECS, ...generateSpecs(now)].map((spec) => {
    const [h, m] = spec.hm.split(':').map(Number)
    return { spec, start: set(startOfDay(addDays(now, spec.dayOffset)), { hours: h, minutes: m }) }
  })
  dated.sort((a, b) => a.start.getTime() - b.start.getTime())

  return dated.map(({ spec, start }, i) => {
    const service = serviceById(spec.serviceId)
    const end = addMinutes(start, service.durationMin + service.bufferMin)
    const lead = spec.leadHours ?? 72
    const before = (hours) => addMinutes(start, -Math.round(hours * 60)).toISOString()
    const createdAt = before(lead)

    const history = [{ at: createdAt, type: 'created', summary: 'أُنشئ الحجز' }]
    if (spec.status !== 'pending') {
      history.push({ at: before((lead * 2) / 3), type: 'confirmed', summary: 'تم تأكيد الحجز' })
    }
    const prepaid = spec.prepaid ?? ['paid', 'deposit_paid'].includes(spec.paymentStatus)
    if (['paid', 'deposit_paid', 'refunded'].includes(spec.paymentStatus)) {
      // Paid ahead, or at the desk once the service was done — the difference
      // is what the risk model reads as "had something at stake".
      history.push({
        at: prepaid ? before(lead / 3) : end.toISOString(),
        type: 'payment_recorded',
        summary: spec.paymentStatus === 'paid' ? 'سُجّل الدفع كاملاً' : 'سُجّل عربون',
      })
    }
    const closing = STATUS_EVENT[spec.status]
    if (closing) {
      history.push({ at: end.toISOString(), type: closing.type, summary: closing.summary })
    }

    return {
      id: `b${i + 1}`,
      // Numbered in date order, as a real ledger would be.
      reference: bookingReference(start.getFullYear(), 101 + i),
      customerId: spec.customerId,
      serviceId: spec.serviceId,
      resourceId: spec.resourceId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: spec.status,
      paymentStatus: spec.paymentStatus,
      priceMinor: service.priceMinor,
      channel: spec.channel,
      notes: spec.notes,
      createdAt,
      updatedAt: createdAt,
      history,
    }
  })
}

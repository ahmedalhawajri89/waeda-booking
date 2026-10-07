/**
 * No-show risk, learned from the business's own history and explained in words.
 *
 * Deliberately not a language model. The question — "how likely is this
 * booking to be missed?" — is a number over structured data, and the operator
 * has to trust it enough to ask for a deposit or make a call. That needs a
 * model whose every point of risk can be traced to a reason they recognise.
 *
 * How it works:
 *
 *   1. From every settled booking (completed or no-show), measure how often
 *      each kind of booking was missed: by lead time, channel, whether money
 *      was paid up front, weekday, time of day, first visit or return.
 *   2. Express each bucket as a shift in log-odds against the overall rate.
 *      Every estimate is shrunk toward the overall rate in proportion to how
 *      little evidence it has, so three bookings on a Friday cannot convince
 *      the model Fridays are cursed.
 *   3. Start a booking from its customer's own (shrunk) rate, add the shifts
 *      that apply to it, and turn the total back into a probability.
 *
 * It is naive in the textbook sense — it treats the factors as independent —
 * which slightly overcounts when they move together. In exchange every factor
 * contributes a number the screen can show as a sentence.
 */

/** Until a business has history, assume this rate — roughly what salons see. */
export const PRIOR_RATE = 0.12
/** How many bookings of evidence a bucket needs before it outweighs the overall rate. */
const BUCKET_PRIOR = 25
/** Same, for one customer's own record. */
const CUSTOMER_PRIOR = 4

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

const logit = (p) => Math.log(p / (1 - p))
const sigmoid = (x) => 1 / (1 + Math.exp(-x))
const clampP = (p) => Math.min(0.97, Math.max(0.01, p))
const HOUR = 3_600_000

/** Paid before the appointment — a payment recorded after it is just settling the bill. */
export function wasPrepaid(b, now = Date.now()) {
  if (new Date(b.startAt).getTime() > now) {
    return b.paymentStatus === 'paid' || b.paymentStatus === 'deposit_paid'
  }
  const start = new Date(b.startAt).getTime()
  return (b.history ?? []).some(
    (e) => e.type === 'payment_recorded' && new Date(e.at).getTime() < start,
  )
}

function leadHours(b) {
  return (new Date(b.startAt).getTime() - new Date(b.createdAt).getTime()) / HOUR
}

/**
 * The factors, each a way of sorting bookings into buckets plus the sentence
 * that explains a bucket to an operator. `visit` is filled in per booking by
 * the trainer and scorer, because it depends on the customer's earlier record.
 */
const FEATURES = [
  {
    key: 'lead',
    name: 'مهلة الحجز',
    bucket: (b) => {
      const h = leadHours(b)
      return h >= 14 * 24 ? 'long' : h >= 72 ? 'mid' : 'short'
    },
    label: {
      long: 'حُجز قبل أكثر من أسبوعين',
      mid: 'حُجز قبل عدة أيام',
      short: 'حُجز قبل وقت قصير',
    },
  },
  {
    key: 'channel',
    name: 'قناة الحجز',
    bucket: (b) => b.channel,
    label: { online: 'حجز من الموقع', phone: 'حجز هاتفي', walk_in: 'حضور مباشر' },
  },
  {
    key: 'prepaid',
    name: 'الدفع المسبق',
    bucket: (b, ctx) => (wasPrepaid(b, ctx.now) ? 'yes' : 'no'),
    label: { yes: 'دفع مسبقاً', no: 'لم يدفع شيئاً مسبقاً' },
  },
  {
    key: 'weekday',
    name: 'اليوم',
    // Seven buckets split the evidence seven ways, so chance alone makes one
    // day look bad. It has to clear a much higher bar before it counts.
    prior: 120,
    bucket: (b) => String(new Date(b.startAt).getDay()),
    label: Object.fromEntries(DAYS.map((d, i) => [String(i), `موعد يوم ${d}`])),
  },
  {
    key: 'daypart',
    name: 'وقت الموعد',
    prior: 60,
    bucket: (b) => {
      const h = new Date(b.startAt).getHours()
      return h < 11 ? 'morning' : h < 15 ? 'midday' : 'evening'
    },
    label: { morning: 'موعد صباحي', midday: 'موعد الظهيرة', evening: 'موعد مسائي' },
  },
  {
    key: 'visit',
    name: 'أول زيارة',
    bucket: (b, ctx) => (ctx.priorVisits === 0 ? 'first' : 'returning'),
    label: { first: 'أول زيارة له', returning: 'عميل سبق أن زار' },
  },
]

const isSettled = (b, now) =>
  (b.status === 'completed' || b.status === 'no_show') && new Date(b.startAt).getTime() < now

/**
 * @typedef {object} RiskFactor
 * @property {string} key
 * @property {string} label   The sentence an operator reads.
 * @property {number} delta   Shift in log-odds; positive raises risk.
 *
 * @typedef {object} Risk
 * @property {number} probability 0–1
 * @property {RiskFactor[]} factors Sorted, strongest first.
 * @property {number} expectedLossMinor What this booking is likely to cost, in minor units.
 *
 * @typedef {object} RiskModel
 * @property {number} overall  The business's own no-show rate, shrunk toward the prior.
 * @property {number} settled  How many bookings it learned from.
 * @property {(b: import('@/types').Booking) => Risk} score
 * @property {{ key: string, name: string, strength: number, worst: string }[]} drivers
 *   What moves risk most at this business, for the overview screen.
 */

/**
 * @param {import('@/types').Booking[]} bookings
 * @param {number} [now]
 * @returns {RiskModel}
 */
export function buildRiskModel(bookings, now = Date.now()) {
  const settled = bookings
    .filter((b) => isSettled(b, now))
    .sort((a, b) => a.startAt.localeCompare(b.startAt))

  const missed = settled.filter((b) => b.status === 'no_show').length
  const overall = clampP((missed + PRIOR_RATE * BUCKET_PRIOR) / (settled.length + BUCKET_PRIOR))

  // Per customer: settled visits in date order, so "first visit" in training
  // means first *at the time*, exactly as it will when scoring a new booking.
  /** @type {Map<string, { n: number, missed: number }>} */
  const byCustomer = new Map()
  /** @type {Record<string, Record<string, { n: number, missed: number }>>} */
  const counts = Object.fromEntries(FEATURES.map((f) => [f.key, {}]))

  for (const b of settled) {
    const record = byCustomer.get(b.customerId) ?? { n: 0, missed: 0 }
    const ctx = { priorVisits: record.n, now }
    for (const f of FEATURES) {
      const k = f.bucket(b, ctx)
      const c = (counts[f.key][k] ??= { n: 0, missed: 0 })
      c.n++
      if (b.status === 'no_show') c.missed++
    }
    record.n++
    if (b.status === 'no_show') record.missed++
    byCustomer.set(b.customerId, record)
  }

  /** Shrunk log-odds shift of one bucket against the overall rate. */
  const priorOf = Object.fromEntries(FEATURES.map((f) => [f.key, f.prior ?? BUCKET_PRIOR]))
  const lift = (featureKey, bucket) => {
    const c = counts[featureKey][bucket]
    if (!c) return 0
    const k = priorOf[featureKey]
    const rate = clampP((c.missed + overall * k) / (c.n + k))
    return logit(rate) - logit(overall)
  }

  function score(b) {
    const record = byCustomer.get(b.customerId) ?? { n: 0, missed: 0 }
    const base = clampP((record.missed + overall * CUSTOMER_PRIOR) / (record.n + CUSTOMER_PRIOR))
    const ctx = { priorVisits: record.n, now }

    /** @type {RiskFactor[]} */
    const factors = []
    if (record.n > 0) {
      factors.push({
        key: 'history',
        label:
          record.missed === 0
            ? `حضر كل مواعيده السابقة (${record.n})`
            : `غاب ${record.missed} من ${record.n} مواعيد سابقة`,
        delta: logit(base) - logit(overall),
      })
    }
    for (const f of FEATURES) {
      // A first visit has no record, so its history factor is absent — the
      // `visit` bucket carries that information instead.
      const k = f.bucket(b, ctx)
      factors.push({ key: f.key, label: f.label[k] ?? f.name, delta: lift(f.key, k) })
    }

    // Not learned: a customer who answered "yes, I'm coming" has told us
    // directly what the model can only estimate. Weighted firmly down.
    if ((b.history ?? []).some((e) => e.type === 'customer_confirmed')) {
      factors.push({ key: 'confirmed', label: 'أكّد حضوره بنفسه', delta: -1.6 })
    }

    const total =
      logit(base) + factors.filter((f) => f.key !== 'history').reduce((s, f) => s + f.delta, 0)
    const probability = clampP(sigmoid(total))
    factors.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))

    return {
      probability,
      factors,
      expectedLossMinor: Math.round(probability * (b.priceMinor ?? 0)),
    }
  }

  const drivers = FEATURES.map((f) => {
    const buckets = Object.keys(counts[f.key])
    let worst = ''
    let strongest = 0
    for (const k of buckets) {
      const d = lift(f.key, k)
      if (d > strongest) {
        strongest = d
        worst = f.label[k] ?? k
      }
    }
    const spread = buckets.length
      ? Math.max(...buckets.map((k) => lift(f.key, k))) -
        Math.min(...buckets.map((k) => lift(f.key, k)))
      : 0
    return { key: f.key, name: f.name, strength: spread, worst }
  }).sort((x, y) => y.strength - x.strength)

  return { overall, settled: settled.length, score, drivers }
}

/** @typedef {'low' | 'medium' | 'high'} RiskTier */

/**
 * @param {number} probability
 * @param {{ mediumAt: number, highAt: number }} thresholds
 * @returns {RiskTier}
 */
export function tierOf(probability, { mediumAt, highAt }) {
  return probability >= highAt ? 'high' : probability >= mediumAt ? 'medium' : 'low'
}

/** Bookings worth scoring: still ahead, and still holding a slot. */
export function isAtStake(b, now = Date.now()) {
  return (b.status === 'confirmed' || b.status === 'pending') && new Date(b.startAt).getTime() > now
}

/** Shifts smaller than this are noise to an operator — real, but not a reason. */
const NOTABLE = 0.25

/**
 * The factors worth saying out loud, strongest first.
 * @param {Risk} risk
 * @param {{ raising?: boolean, limit?: number }} [opts] `raising` keeps only those that add risk.
 */
export function notableFactors(risk, { raising = false, limit = 4 } = {}) {
  return risk.factors
    .filter((f) => (raising ? f.delta > NOTABLE : Math.abs(f.delta) > NOTABLE))
    .slice(0, limit)
}

/**
 * Waeda's own plans — what a business pays, and what it gets.
 *
 * Every booking costs WhatsApp messages (a code, a confirmation, a reminder:
 * about 3–4 US cents in Saudi Arabia), so each plan carries a monthly message
 * allowance and an add-on pack for a busy month. Bookings themselves are never
 * limited: a business out of messages still takes every booking, only the
 * guard stops writing.
 *
 * Mirrored by api/config/plans.php, value for value.
 */
export const PLANS = [
  {
    key: 'free',
    name: 'المجانية',
    tagline: 'لتجربة الحجز الذاتي في منشأة صغيرة',
    priceMinor: 0,
    staff: 1,
    messages: 50,
    features: { refill: false, deposits: false },
  },
  {
    key: 'basic',
    name: 'الأساسية',
    tagline: 'لمنشأة بفريق صغير وحجوزات يومية',
    priceMinor: 9900,
    staff: 3,
    messages: 300,
    features: { refill: true, deposits: false },
  },
  {
    key: 'pro',
    name: 'الاحترافية',
    tagline: 'لمنشأة مزدحمة يكلّفها كل موعد ضائع',
    priceMinor: 24900,
    staff: 10,
    messages: 1000,
    features: { refill: true, deposits: true },
  },
]

/** A year is ten months: two free. */
export const YEARLY_MONTHS = 10

/** For a busy month: more messages, valid until the month ends. */
export const MESSAGE_PACK = { messages: 500, priceMinor: 4900 }

export const TRIAL_DAYS = 14
export const TRIAL_PLAN = 'pro'

export const planByKey = (key) => PLANS.find((p) => p.key === key) ?? PLANS[0]

/** What the plan costs per cycle, in minor units. */
export const priceFor = (plan, cycle = 'monthly') =>
  cycle === 'yearly' ? plan.priceMinor * YEARLY_MONTHS : plan.priceMinor

/** Which features need which plan at least — for "متاح في …" labels. */
export const FEATURE_PLAN = { refill: 'basic', deposits: 'pro' }

/**
 * The plan in force: a running trial is the trial plan, an ended one falls
 * back to whatever is paid for (the free plan when nothing is).
 * @param {{ plan: string, trialEndsAt: string | null }} sub
 */
export function effectivePlan(sub, now = new Date()) {
  const inTrial = !!sub?.trialEndsAt && new Date(sub.trialEndsAt) > now
  return { plan: planByKey(inTrial ? TRIAL_PLAN : sub?.plan), inTrial }
}

/** Whole days left in a trial, rounded up; 0 once it has ended. */
export function trialDaysLeft(sub, now = new Date()) {
  if (!sub?.trialEndsAt) return 0
  return Math.max(0, Math.ceil((new Date(sub.trialEndsAt) - now) / 86_400_000))
}

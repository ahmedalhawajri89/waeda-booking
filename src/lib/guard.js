/**
 * The appointment guard's policy: what to do about a booking at each level of
 * risk. Kept apart from the model in risk.js — the model says how likely a
 * no-show is; the policy is the business deciding what that likelihood is
 * worth acting on.
 */

/**
 * @typedef {object} GuardPolicy
 * @property {number} mediumAt  Probability from which a booking is "medium" risk.
 * @property {number} highAt    …and "high".
 * @property {number} remindHoursBefore   Every booking gets a reminder this far ahead.
 * @property {number} confirmHoursBefore  Medium and high are asked to confirm this far ahead.
 * @property {boolean} depositForHigh     High risk is asked for a deposit.
 * @property {boolean} autoRelease        Unconfirmed medium/high bookings are released…
 * @property {number} releaseHoursBefore  …this far ahead, so the slot can be offered again.
 */

/** @type {GuardPolicy} */
export const DEFAULT_POLICY = Object.freeze({
  mediumAt: 0.15,
  highAt: 0.3,
  remindHoursBefore: 24,
  confirmHoursBefore: 3,
  depositForHigh: true,
  autoRelease: false,
  releaseHoursBefore: 2,
})

export const TIER = {
  low: { label: 'خطر منخفض', short: 'منخفض', tone: 'neutral' },
  medium: { label: 'خطر متوسط', short: 'متوسط', tone: 'warning' },
  high: { label: 'خطر مرتفع', short: 'مرتفع', tone: 'danger' },
}

/**
 * The steps the policy prescribes for a tier, in order, as sentences.
 * @param {import('./risk').RiskTier} tier
 * @param {GuardPolicy} policy
 * @returns {string[]}
 */
export function planFor(tier, policy) {
  const steps = [`تذكير قبل الموعد بـ ${policy.remindHoursBefore} ساعة`]
  if (tier === 'low') return steps
  steps.push(`طلب تأكيد الحضور قبل الموعد بـ ${policy.confirmHoursBefore} ساعات`)
  if (tier === 'high' && policy.depositForHigh) steps.push('طلب عربون لتثبيت الموعد')
  if (policy.autoRelease) {
    steps.push(
      `إن لم يؤكد: يُحرَّر الموعد قبله بـ ${policy.releaseHoursBefore} ساعة ويُعرض على قائمة الانتظار`,
    )
  } else if (tier === 'high') {
    steps.push('إن لم يؤكد: اتصال من الاستقبال')
  }
  return steps
}

/**
 * Normalise a stored policy against the defaults, so a field added later has
 * a value for businesses that saved before it existed.
 * @param {Partial<GuardPolicy> | null | undefined} stored
 * @returns {GuardPolicy}
 */
export function withDefaults(stored) {
  const p = { ...DEFAULT_POLICY, ...(stored ?? {}) }
  // highAt must stay above mediumAt or "medium" would be empty.
  if (p.highAt <= p.mediumAt) p.highAt = Math.min(0.95, p.mediumAt + 0.05)
  // A slot is released only after the customer was asked and did not answer.
  if (p.releaseHoursBefore >= p.confirmHoursBefore) {
    p.confirmHoursBefore = Math.max(2, p.confirmHoursBefore)
    p.releaseHoursBefore = p.confirmHoursBefore - 1
  }
  return p
}

/**
 * The one step worth showing in a list: what the policy does first about this
 * booking that it would not do for any other.
 * @param {import('./risk').RiskTier} tier
 * @param {GuardPolicy} policy
 */
export function headlineAction(tier, policy) {
  if (tier === 'high' && policy.depositForHigh) return 'طلب عربون لتثبيت الموعد'
  if (tier === 'low') return `تذكير قبل الموعد بـ ${policy.remindHoursBefore} ساعة`
  return `طلب تأكيد الحضور قبل الموعد بـ ${policy.confirmHoursBefore} ساعات`
}

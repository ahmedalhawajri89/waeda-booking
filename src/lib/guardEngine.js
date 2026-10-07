import { dayLabel, money, relativeDay, time } from './format'
import { isAtStake, tierOf } from './risk'
import { candidatesFor, freedSlots } from './waitlist'

/**
 * What the appointment guard does, as pure functions over data.
 *
 * `planActions` looks at upcoming bookings, the messages already sent and the
 * policy, and returns what is due now — nothing more. Whoever plays backend
 * (LocalRepository on the demo, GuardEngine.php against the API, which
 * mirrors this file) carries the actions out. Because every action is keyed on
 * a message that would record it, running the planner twice sends nothing
 * twice: it is safe to call on every page load and every scheduler tick.
 */

/** @typedef {'reminder' | 'confirm_request' | 'deposit_request' | 'release_notice' | 'reschedule_offer' | 'backfill_offer' | 'ack_confirm' | 'ack_cancel' | 'ack_handoff' | 'ack_rescheduled' | 'no_slots' | 'backfill_won' | 'backfill_taken' | 'backfill_declined'} Template */

/**
 * @typedef {object} Message
 * @property {string} id
 * @property {string} bookingId
 * @property {'out' | 'in'} direction
 * @property {Template | 'reply'} template
 * @property {string} body
 * @property {string} at ISO
 * @property {'confirm' | 'cancel' | 'late' | 'reschedule' | 'choose' | 'unknown'} [intent] On inbound messages.
 * @property {{ options: string[], used?: boolean }} [payload] On a reschedule offer: the times offered.
 */

/**
 * @typedef {{ kind: 'send', bookingId: string, template: Template }
 *         | { kind: 'release', bookingId: string }
 *         | { kind: 'backfill', bookingId: string, customerId: string, entryId: string | null, reason: string }} GuardAction
 *   `backfill`: offer the freed booking's time to another customer.
 */

const HOUR = 3_600_000

/** Has this booking already been sent this message? */
const sent = (messages, bookingId, template) =>
  messages.some(
    (m) => m.bookingId === bookingId && m.direction === 'out' && m.template === template,
  )

/** Did the customer confirm, by reply or because staff marked it? */
export function customerConfirmed(booking, messages) {
  return (
    (booking.history ?? []).some((e) => e.type === 'customer_confirmed') ||
    messages.some(
      (m) => m.bookingId === booking.id && m.direction === 'in' && m.intent === 'confirm',
    )
  )
}

/**
 * @param {{
 *   bookings: import('@/types').Booking[],
 *   messages: Message[],
 *   policy: import('./guard').GuardPolicy,
 *   model: import('./risk').RiskModel,
 *   waitlist?: import('./waitlist').WaitlistEntry[],
 *   now?: number,
 * }} input
 * @returns {GuardAction[]}
 */
export function planActions({
  bookings,
  messages,
  policy,
  model,
  waitlist = [],
  now = Date.now(),
}) {
  /** @type {GuardAction[]} */
  const actions = []

  for (const b of bookings) {
    if (!isAtStake(b, now)) continue
    const untilStart = new Date(b.startAt).getTime() - now
    const tier = tierOf(model.score(b).probability, policy)
    const confirmed = customerConfirmed(b, messages)
    const askedToConfirm = sent(messages, b.id, 'confirm_request')

    // Released first: a booking past its release point gets nothing else.
    if (
      policy.autoRelease &&
      askedToConfirm &&
      !confirmed &&
      untilStart <= policy.releaseHoursBefore * HOUR
    ) {
      actions.push({ kind: 'release', bookingId: b.id })
      continue
    }

    if (
      tier !== 'low' &&
      !confirmed &&
      !askedToConfirm &&
      untilStart <= policy.confirmHoursBefore * HOUR
    ) {
      actions.push({ kind: 'send', bookingId: b.id, template: 'confirm_request' })
      continue
    }

    // A confirmation request is itself a reminder, so the plain one is only
    // for bookings that will not get it.
    if (
      !askedToConfirm &&
      !sent(messages, b.id, 'reminder') &&
      untilStart <= policy.remindHoursBefore * HOUR
    ) {
      actions.push({ kind: 'send', bookingId: b.id, template: 'reminder' })
    }

    if (
      tier === 'high' &&
      policy.depositForHigh &&
      !confirmed &&
      b.paymentStatus === 'unpaid' &&
      !sent(messages, b.id, 'deposit_request') &&
      untilStart <= policy.remindHoursBefore * HOUR
    ) {
      actions.push({ kind: 'send', bookingId: b.id, template: 'deposit_request' })
    }
  }

  // A slot freed by a cancellation or a release is offered to whoever wants
  // it — so a no-show caught early becomes a booking instead of an empty hour.
  for (const slot of freedSlots(bookings, messages, now)) {
    for (const c of candidatesFor(slot, { waitlist, bookings, now })) {
      actions.push({ kind: 'backfill', bookingId: slot.id, ...c })
    }
  }
  return actions
}

/* ---------------------------------------------------------------- replies */

// Reading replies lives in replyRules.js; re-exported here for the callers
// that already import it from the engine.
export { interpretReply, understandReply } from './replyRules'

/* -------------------------------------------------------------- templates */

/**
 * @param {Template} template
 * @param {{ name: string, service: string, startAt: string, depositMinor?: number,
 *           options?: string[], fallback?: boolean }} ctx
 */
export function render(template, ctx) {
  const first = ctx.name.split(' ')[0]
  const when = `${relativeDay(ctx.startAt)} الساعة ${time(ctx.startAt)}`
  switch (template) {
    case 'reminder':
      return `مرحباً ${first}، نذكّرك بموعد ${ctx.service} ${when}. نراك قريباً!`
    case 'confirm_request':
      return `مرحباً ${first}، موعدك ${ctx.service} ${when}.\nللتأكيد أرسل 1، وللإلغاء أرسل 2.`
    case 'deposit_request':
      return `لتثبيت موعدك ${dayLabel(ctx.startAt)} نرجو دفع عربون ${money(ctx.depositMinor ?? 0)} — سيرسل لك فريقنا رابط الدفع.`
    case 'release_notice':
      return `لم يصلنا تأكيدك، فأُتيح موعد ${time(ctx.startAt)} لعميل آخر. يسعدنا حجز موعد جديد لك في أي وقت.`
    case 'ack_confirm':
      return `تم تأكيد موعدك، نراك ${when} ✅`
    case 'ack_cancel':
      return 'تم إلغاء موعدك. نتمنى رؤيتك قريباً.'
    case 'ack_handoff':
      return 'شكراً لك، سيتواصل معك أحد فريقنا قريباً.'
    case 'reschedule_offer':
      return [
        ctx.fallback
          ? 'لا يوجد وقت متاح في الموعد الذي طلبته، وهذه أقرب الأوقات المتاحة:'
          : 'هذه أقرب الأوقات المتاحة:',
        ...(ctx.options ?? []).map((at, i) => `${i + 1}) ${relativeDay(at)} ${time(at)}`),
        'أرسل رقم الوقت المناسب.',
      ].join('\n')
    case 'ack_rescheduled':
      return `تم نقل موعدك إلى ${when} ✅`
    case 'backfill_offer':
      return `مرحباً ${first}، تفرّغ موعد ${ctx.service} ${when}.\nلحجزه أرسل 1 — أول من يرد يأخذه.`
    case 'backfill_won':
      return `تم حجز الموعد لك ✅ نراك ${when}.`
    case 'backfill_taken':
      return 'عذراً، سبقك أحد إلى هذا الموعد. سنخبرك بالمواعيد القادمة.'
    case 'backfill_declined':
      return 'حسناً، سنخبرك بالمواعيد القادمة.'
    case 'no_slots':
      return 'لا يوجد وقت متاح قريباً لهذه الخدمة، وسيتواصل معك فريقنا لترتيب موعد.'
  }
}

/** A deposit is a third of the price, rounded to whole riyals. */
export const depositFor = (priceMinor) => Math.round(priceMinor / 3 / 100) * 100

export const TEMPLATE_LABEL = {
  reminder: 'تذكير',
  confirm_request: 'طلب تأكيد',
  deposit_request: 'طلب عربون',
  release_notice: 'إشعار تحرير',
  ack_confirm: 'تأكيد الاستلام',
  ack_cancel: 'تأكيد الإلغاء',
  ack_handoff: 'تحويل للفريق',
  reschedule_offer: 'عرض أوقات',
  ack_rescheduled: 'تأكيد النقل',
  no_slots: 'لا أوقات',
  backfill_offer: 'عرض موعد متفرّغ',
  backfill_won: 'تأكيد الحجز',
  backfill_taken: 'سبقه غيره',
  backfill_declined: 'اعتذار',
  reply: 'رد العميل',
  staff: 'رد الفريق',
}

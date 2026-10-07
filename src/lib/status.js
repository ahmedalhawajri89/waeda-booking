import {
  BadgeCheck,
  CircleCheckBig,
  CircleDashed,
  CircleDotDashed,
  Clock,
  CheckCircle2,
  TriangleAlert,
  Undo2,
  UserX,
  XCircle,
} from 'lucide-vue-next'

/** @typedef {'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'muted'} Tone */

/**
 * @typedef {object} StatusMeta
 * @property {string} label
 * @property {import('@/types').LucideIcon} icon
 * @property {Tone} tone
 */

/* Status is never colour-alone: every consumer renders label + icon + tone. */

/** @type {Record<import('@/types').BookingStatus, StatusMeta>} */
export const BOOKING_STATUS = {
  pending: { label: 'بانتظار التأكيد', icon: Clock, tone: 'warning' },
  confirmed: { label: 'مؤكد', icon: CheckCircle2, tone: 'info' },
  completed: { label: 'مكتمل', icon: CircleCheckBig, tone: 'success' },
  cancelled: { label: 'ملغي', icon: XCircle, tone: 'muted' },
  no_show: { label: 'لم يحضر', icon: UserX, tone: 'danger' },
}

/** @type {Record<import('@/types').PaymentStatus, StatusMeta>} */
export const PAYMENT_STATUS = {
  unpaid: { label: 'غير مدفوع', icon: CircleDashed, tone: 'neutral' },
  deposit_paid: { label: 'عربون مدفوع', icon: CircleDotDashed, tone: 'warning' },
  paid: { label: 'مدفوع', icon: BadgeCheck, tone: 'success' },
  refunded: { label: 'مسترجع', icon: Undo2, tone: 'muted' },
}

/** @type {Record<import('@/types').AttentionReason, StatusMeta>} */
export const ATTENTION = {
  conflict: { label: 'تعارض في المواعيد', icon: TriangleAlert, tone: 'danger' },
  overdue_completion: { label: 'انتهى وقته ولم يُغلق', icon: Clock, tone: 'warning' },
  pending_soon: { label: 'بانتظار التأكيد وموعده قريب', icon: Clock, tone: 'warning' },
  unpaid_imminent: { label: 'غير مدفوع وموعده خلال ساعتين', icon: CircleDashed, tone: 'warning' },
}

/**
 * Which actions make sense right now, given the booking's state.
 * @param {import('@/types').BookingStatus} status
 * @param {boolean} hasStarted
 * @returns {import('@/types').BookingStatus[]}
 */
export function nextActions(status, hasStarted) {
  switch (status) {
    case 'pending':
      return ['confirmed', 'cancelled']
    case 'confirmed':
      return hasStarted ? ['completed', 'no_show', 'cancelled'] : ['completed', 'cancelled']
    default:
      return []
  }
}

/**
 * Block colours for a booking on a calendar, from its status tone. One map,
 * so the day view, the week view and the resource columns cannot drift apart.
 * @type {Record<Tone, string>}
 */
export const TONE_BLOCK = {
  success: 'border-success-600/30 bg-success-50 text-success-700',
  warning: 'border-warning-600/40 bg-warning-50 text-warning-700',
  danger: 'border-danger-600/30 bg-danger-50 text-danger-700',
  info: 'border-border-strong bg-surface text-fg',
  neutral: 'border-border-strong bg-surface-sunken text-fg-muted',
  muted: 'border-border bg-canvas text-fg-faint',
}

/** @param {import('@/types').BookingStatus} status */
export const bookingTone = (status) => TONE_BLOCK[BOOKING_STATUS[status]?.tone ?? 'neutral']

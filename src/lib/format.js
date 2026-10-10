import { format, formatDistanceToNowStrict, isSameDay, isToday, isTomorrow } from 'date-fns'
import { ar } from 'date-fns/locale'
import { inZone } from './zone'

/* Single source of truth for every user-visible number, date and time.
 * Nothing in the app hand-builds a display string. */

// Latin digits, matching date-fns' Arabic locale: one screen used to show
// "١٬٩٦٠ ر.س" beside "2%" and "9:00 ص".
export const NUMBER_LOCALE = 'ar-SA-u-nu-latn'

const currency = new Intl.NumberFormat(NUMBER_LOCALE, {
  style: 'currency',
  currency: 'SAR',
  maximumFractionDigits: 0,
})

/** 15000 → "150 ر.س" (minor units in, formatted currency out). */
export function money(minor) {
  return currency.format(minor / 100)
}

/** On the business's clock, so a time reads the same wherever it is read. @param {string | Date} iso */
export function toDate(iso) {
  return inZone(iso)
}

/** "10:00 ص" */
export function time(iso) {
  return format(toDate(iso), 'h:mm a', { locale: ar })
}

/** "10:00 ص – 10:30 ص" */
export function timeRange(startIso, endIso) {
  return `${time(startIso)} – ${time(endIso)}`
}

/** "الأحد 9 أغسطس" */
export function dayLabel(iso) {
  return format(toDate(iso), 'EEEE d MMMM', { locale: ar })
}

/** "الأحد 9 أغسطس 2026" */
export function fullDate(iso) {
  return format(toDate(iso), 'EEEE d MMMM yyyy', { locale: ar })
}

/** "اليوم" / "غداً" / "الأحد 9 أغسطس" — for lists mixing several days. */
export function relativeDay(iso) {
  const d = toDate(iso)
  if (isToday(d)) return 'اليوم'
  if (isTomorrow(d)) return 'غداً'
  return dayLabel(d)
}

/** "4 إلى 10 أكتوبر", or "28 سبتمبر إلى 4 أكتوبر" across a month. */
export function weekRange(startIso, endIso) {
  const start = toDate(startIso)
  const end = toDate(endIso)
  const sameMonth = start.getMonth() === end.getMonth()
  const from = format(start, sameMonth ? 'd' : 'd MMMM', { locale: ar })
  return `${from} إلى ${format(end, 'd MMMM', { locale: ar })}`
}

/** "اليوم، 10:00 ص" */
export function relativeDayTime(iso) {
  return `${relativeDay(iso)}، ${time(iso)}`
}

/** "قبل 3 ساعات" / "خلال 20 دقيقة" */
export function fromNow(iso) {
  const d = toDate(iso)
  const distance = formatDistanceToNowStrict(d, { locale: ar })
  return d.getTime() < Date.now() ? `قبل ${distance}` : `خلال ${distance}`
}

/** "30 دقيقة" / "ساعة" / "ساعة و30 دقيقة" */
export function duration(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  const hPart = h === 0 ? '' : h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : `${h} ساعات`
  const mPart = m === 0 ? '' : `${m} دقيقة`
  if (hPart && mPart) return `${hPart} و${mPart}`
  return hPart || mPart || '—'
}

export { isSameDay }

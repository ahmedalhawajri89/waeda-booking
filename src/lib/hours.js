import { addDays, isSameDay, set, startOfDay } from 'date-fns'
import { prayerBreaks } from './prayer'

/**
 * When a business day starts and ends.
 *
 * A day's hours used to be read as two times on one calendar date, which made
 * "16:00 to 02:00" — a padel club, a café in Ramadan — impossible to say.
 * Now a close at or before the open means the next morning, and everything
 * that asks "is it open", "which slots", "which day does this booking belong
 * to" asks here, so a 1 a.m. booking belongs to the evening it is part of.
 *
 * Mirrored by App\Services\Hours on the server, case for case.
 *
 * A schedule is either the weekly rows on their own or
 * `{ hours, specialPeriods }`, where a special period (Ramadan, a holiday)
 * replaces the weekly rows for the dates it covers.
 *
 * @typedef {import('@/types').BusinessHours[] | { hours: import('@/types').BusinessHours[],
 *   specialPeriods?: SpecialPeriod[], prayer?: unknown }} Schedule
 * @typedef {{ id: string, label: string, startsOn: string, endsOn: string,
 *   hours: import('@/types').BusinessHours[] }} SpecialPeriod
 * @typedef {{ start: Date, end: Date, label: string }} Break
 * @typedef {{ day: Date, open: Date, close: Date, overnight: boolean,
 *   breaks: Break[], period: SpecialPeriod | null }} DayWindow
 */

/** @param {Schedule} s */
export const asSchedule = (s) =>
  Array.isArray(s) ? { hours: s, specialPeriods: [], prayer: null } : s

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function at(day, hm) {
  const [h, m] = String(hm).split(':').map(Number)
  return set(startOfDay(day), { hours: h || 0, minutes: m || 0, seconds: 0, milliseconds: 0 })
}

/** The special period covering this date, if any. */
export function periodOn(schedule, date) {
  const d = ymd(date)
  return (
    (asSchedule(schedule).specialPeriods ?? []).find((p) => p.startsOn <= d && d <= p.endsOn) ??
    null
  )
}

/** The row in force for this date: the special period's, else the week's. */
export function rowFor(schedule, date) {
  const s = asSchedule(schedule)
  const period = periodOn(s, date)
  const rows = period ? period.hours : s.hours
  return rows.find((h) => h.weekday === date.getDay())
}

/** "16:00"–"02:00" runs into the next day; equal times are not a day at all. */
export const isOvernight = (row) => !!row && !row.isClosed && row.close <= row.open

/**
 * The business day that starts on `date`, or null when it is closed.
 * @param {Date} date
 * @param {Schedule} schedule
 * @returns {DayWindow | null}
 */
export function windowFor(date, schedule) {
  const row = rowFor(schedule, date)
  if (!row || row.isClosed || row.open === row.close) return null
  const day = startOfDay(date)
  const open = at(day, row.open)
  const overnight = row.close < row.open
  const close = at(overnight ? addDays(day, 1) : day, row.close)
  const w = { day, open, close, overnight, breaks: [], period: periodOn(schedule, date) }
  // Prayer pauses, when the owner turned them on.
  w.breaks = prayerBreaks(w, asSchedule(schedule).prayer)
  return w
}

/**
 * Which business day an instant belongs to: 01:00 on Friday is Thursday's,
 * when Thursday runs past midnight.
 * @returns {Date} start of that day
 */
export function businessDayOf(instant, schedule) {
  const t = new Date(instant)
  const today = startOfDay(t)
  const yesterday = windowFor(addDays(today, -1), schedule)
  if (yesterday && t < yesterday.close) return yesterday.day
  return today
}

export const sameBusinessDay = (instant, date, schedule) =>
  isSameDay(businessDayOf(instant, schedule), date)

/**
 * Does [start, end) sit inside one business day, clear of its breaks?
 * The day it starts on, or the evening before it, when that ran late.
 */
export function isWithinHours(start, end, schedule) {
  const s = new Date(start)
  const e = new Date(end)
  for (const day of [startOfDay(s), addDays(startOfDay(s), -1)]) {
    const w = windowFor(day, schedule)
    if (!w || s < w.open || e > w.close) continue
    return !w.breaks.some((b) => s < b.end && b.start < e)
  }
  return false
}

/**
 * The hours a week spans, counted from each day's own midnight — a day that
 * runs to 2 a.m. reaches hour 26. For rails and charts that need one range.
 * @returns {{ fromHour: number, toHour: number } | null}
 */
export function weekSpan(schedule) {
  let from = Infinity
  let to = -Infinity
  for (const row of asSchedule(schedule).hours) {
    if (row.isClosed || row.open === row.close) continue
    const [oh, om] = row.open.split(':').map(Number)
    const [ch, cm] = row.close.split(':').map(Number)
    const openMin = oh * 60 + om
    const closeMin = ch * 60 + cm + (row.close < row.open ? 24 * 60 : 0)
    from = Math.min(from, Math.floor(openMin / 60))
    to = Math.max(to, Math.ceil(closeMin / 60) - 1)
  }
  return Number.isFinite(from) ? { fromHour: from, toHour: to } : null
}

/** Is the business open at this instant? For the "open now" line. */
export function openAt(instant, schedule) {
  const t = new Date(instant)
  for (const day of [startOfDay(t), addDays(startOfDay(t), -1)]) {
    const w = windowFor(day, schedule)
    if (w && t >= w.open && t < w.close) return w
  }
  return null
}

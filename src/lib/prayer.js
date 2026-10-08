import { CalculationMethod, Coordinates, PrayerTimes } from 'adhan'
import { addDays, addMinutes } from 'date-fns'
import { cityByKey } from '@/data/cities'
import { hijriOf } from './hijri'

/**
 * Prayer pauses: the times a business does not take bookings because it
 * stops for prayer. Off by default — not every business stops, and Saudi
 * rules on closing for prayer have been loosened — and set by the owner:
 * which city, which prayers, how many minutes, a longer pause for Jumu'ah.
 *
 * The server (App\Services\PrayerBreaks) computes the same pauses with its
 * own library. The two can differ by a minute or three, so both round out to
 * five minutes, and the server only refuses a booking clearly inside one —
 * never a time this page offered.
 */
const STEP_MS = 5 * 60_000
const down = (d) => new Date(Math.floor(d.getTime() / STEP_MS) * STEP_MS)
const up = (d) => new Date(Math.ceil(d.getTime() / STEP_MS) * STEP_MS)

const LABEL = {
  fajr: 'صلاة الفجر',
  dhuhr: 'صلاة الظهر',
  asr: 'صلاة العصر',
  maghrib: 'صلاة المغرب',
  isha: 'صلاة العشاء',
  jumuah: 'صلاة الجمعة',
}

/**
 * The five times on a date, for a city.
 * Umm al-Qura sets isha 90 minutes after maghrib, 120 in Ramadan — a rule
 * the library leaves to the caller, applied here and on the server alike.
 * @returns {Record<'fajr'|'dhuhr'|'asr'|'maghrib'|'isha', Date> | null}
 */
export function prayerTimesOn(date, cityKey) {
  const city = cityByKey(cityKey)
  if (!city) return null
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
  const t = new PrayerTimes(
    new Coordinates(city.lat, city.lng),
    noon,
    CalculationMethod[city.method](),
  )
  const isha =
    city.method === 'UmmAlQura'
      ? addMinutes(t.maghrib, hijriOf(noon).month === 9 ? 120 : 90)
      : t.isha
  return { fajr: t.fajr, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib, isha }
}

/**
 * The pauses that fall inside a business day's window.
 * @param {{ day: Date, open: Date, close: Date }} window
 * @param {typeof import('@/data/cities').DEFAULT_PRAYER | null | undefined} cfg
 * @returns {import('./hours').Break[]}
 */
export function prayerBreaks(window, cfg) {
  if (!cfg?.enabled) return []
  const out = []
  // A late day reaches into the next date's prayers.
  for (const day of [window.day, addDays(window.day, 1)]) {
    if (day >= window.close) break
    const times = prayerTimesOn(day, cfg.city)
    if (!times) return []
    for (const key of cfg.prayers ?? []) {
      const at = times[key]
      if (!at) continue
      const jumuah = key === 'dhuhr' && day.getDay() === 5
      const minutes = jumuah ? (cfg.jumuahMinutes ?? cfg.minutes) : cfg.minutes
      const start = down(at)
      const end = up(addMinutes(at, minutes))
      if (start < window.close && end > window.open) {
        out.push({ start, end, label: LABEL[jumuah ? 'jumuah' : key], prayer: key })
      }
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

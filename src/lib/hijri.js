import { addDays, format, startOfDay } from 'date-fns'

/**
 * Hijri dates from the browser's own Umm al-Qura calendar — the one Saudi
 * Arabia uses — so suggesting "the coming Ramadan" needs no table and no
 * library. The suggestion is only a starting point: the owner can move it by
 * a day when the moon is sighted differently.
 */
const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
})

/** @returns {{ day: number, month: number, year: number }} */
export function hijriOf(date) {
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  return { day: Number(parts.day), month: Number(parts.month), year: parseInt(parts.year, 10) }
}

/**
 * The Ramadan in progress, or the next one: first and last Gregorian day.
 * @param {Date} [from]
 * @returns {{ startsOn: string, endsOn: string, year: number } | null}
 */
export function nextRamadan(from = new Date()) {
  let d = startOfDay(from)
  // Inside Ramadan already: back to its first day.
  while (hijriOf(d).month === 9 && hijriOf(addDays(d, -1)).month === 9) d = addDays(d, -1)
  for (let i = 0; i < 400 && hijriOf(d).month !== 9; i++) d = addDays(d, 1)
  if (hijriOf(d).month !== 9) return null
  const start = d
  while (hijriOf(addDays(d, 1)).month === 9) d = addDays(d, 1)
  return {
    startsOn: format(start, 'yyyy-MM-dd'),
    endsOn: format(d, 'yyyy-MM-dd'),
    year: hijriOf(start).year,
  }
}

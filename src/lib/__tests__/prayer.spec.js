import { describe, expect, it } from 'vitest'
import { prayerBreaks, prayerTimesOn } from '../prayer'
import { isWithinHours, windowFor } from '../hours'
import { generateSlots } from '../availability'

/** Wall-clock time in Riyadh, whatever zone the test machine is in. */
const riyadh = (d) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)

const allDay = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  open: '00:00',
  close: '23:55',
  isClosed: false,
}))
const cfg = (over = {}) => ({
  enabled: true,
  city: 'riyadh',
  prayers: ['dhuhr', 'asr', 'maghrib', 'isha'],
  minutes: 20,
  jumuahMinutes: 45,
  ...over,
})

describe('prayer times', () => {
  it('follows Umm al-Qura for Riyadh', () => {
    const t = prayerTimesOn(new Date(2026, 9, 8), 'riyadh')
    expect(riyadh(t.dhuhr)).toBe('11:41')
    expect(riyadh(t.maghrib)).toBe('17:33')
    expect(riyadh(t.isha)).toBe('19:03')
  })

  it('moves isha to two hours after maghrib in Ramadan', () => {
    const t = prayerTimesOn(new Date(2027, 1, 20), 'riyadh')
    expect((t.isha - t.maghrib) / 60_000).toBe(120)
  })

  it('knows nothing of a city it does not list', () => {
    expect(prayerTimesOn(new Date(2026, 9, 8), 'atlantis')).toBeNull()
  })
})

describe('prayer pauses', () => {
  const thu = new Date(2026, 9, 8)
  const fri = new Date(2026, 9, 9)

  it('is off unless the owner turns it on', () => {
    expect(
      windowFor(thu, { hours: allDay, specialPeriods: [], prayer: cfg({ enabled: false }) }).breaks,
    ).toEqual([])
  })

  it('pauses for the chosen prayers, rounded out to five minutes', () => {
    const w = windowFor(thu, { hours: allDay, specialPeriods: [], prayer: cfg() })
    expect(w.breaks.map((b) => b.label)).toEqual([
      'صلاة الظهر',
      'صلاة العصر',
      'صلاة المغرب',
      'صلاة العشاء',
    ])
    const dhuhr = w.breaks[0]
    expect(riyadh(dhuhr.start)).toBe('11:40')
    expect(riyadh(dhuhr.end)).toBe('12:05')
  })

  it('holds a longer pause for Jumu‘ah', () => {
    const w = windowFor(fri, {
      hours: allDay,
      specialPeriods: [],
      prayer: cfg({ prayers: ['dhuhr'] }),
    })
    expect(w.breaks[0].label).toBe('صلاة الجمعة')
    expect((w.breaks[0].end - w.breaks[0].start) / 60_000).toBeGreaterThanOrEqual(45)
  })

  it('offers no time that runs into a pause, and refuses one inside it', () => {
    const schedule = { hours: allDay, specialPeriods: [], prayer: cfg({ prayers: ['dhuhr'] }) }
    const [pause] = windowFor(thu, schedule).breaks
    const slots = generateSlots({
      date: thu,
      service: { durationMin: 30, bufferMin: 0 },
      resourceId: 'r1',
      bookings: [],
      hours: schedule,
      stepMin: 15,
      now: new Date(2020, 0, 1),
    })
    const clash = slots.filter(
      (s) =>
        s.state === 'available' &&
        new Date(s.startAt) < pause.end &&
        new Date(s.endAt) > pause.start,
    )
    expect(clash).toEqual([])
    expect(isWithinHours(pause.start, pause.end, schedule)).toBe(false)
  })

  it('reaches the next date on a late day', () => {
    const late = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      open: '20:00',
      close: '06:00',
      isClosed: false,
    }))
    const w = windowFor(thu, {
      hours: late,
      specialPeriods: [],
      prayer: cfg({ prayers: ['fajr'] }),
    })
    expect(prayerBreaks(w, cfg({ prayers: ['fajr'] })).map((b) => b.label)).toContain('صلاة الفجر')
  })
})

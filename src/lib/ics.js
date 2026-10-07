/**
 * A single-event .ics file, enough for Apple Calendar, Google Calendar and
 * Outlook to add the appointment with one tap. Times are written in UTC (the
 * trailing Z) so the event lands at the right hour in any timezone.
 */

const stamp = (d) =>
  new Date(d)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

/** RFC 5545 text: escape the four characters that mean something. */
const text = (s) =>
  String(s ?? '')
    .replace(/([\\;,])/g, '\\$1')
    .replace(/\n/g, '\\n')

/**
 * @param {{ uid: string, title: string, start: string, end: string,
 *           location?: string, description?: string }} e
 */
export function buildIcs(e) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Waeda//Booking//AR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${text(e.uid)}`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${text(e.title)}`,
    e.location ? `LOCATION:${text(e.location)}` : null,
    e.description ? `DESCRIPTION:${text(e.description)}` : null,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(e.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

/** Hands the file to the browser as a download. */
export function downloadIcs(filename, content) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

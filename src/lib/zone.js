import { TZDate } from '@date-fns/tz'

/**
 * The business's own clock.
 *
 * Opening hours, slots, "today" and every time a guest reads are the
 * business's wall clock, not the visitor's: a guest in Dubai booking a clinic
 * in Riyadh must see the clinic's 9:00 as 9:00. Dates passed through `inZone`
 * are TZDate instances — real Dates whose getHours/getDay and every date-fns
 * calculation on them run in that zone — so the rest of the code keeps doing
 * ordinary date maths.
 *
 * Set from the catalog (business.timezone). Unset, as on the demo backend,
 * everything stays in the browser's zone exactly as before.
 *
 * One catch: a TZDate's toISOString() carries its offset ("+03:00"), not "Z".
 * Anything stored or compared as a string goes through `iso()`.
 */
let zone = null

/** @param {string | null | undefined} tz an IANA name, e.g. "Asia/Riyadh" */
export function setBusinessZone(tz) {
  zone = tz || null
}

export const businessZone = () => zone

/** This instant, on the business's clock. @param {Date | string | number} d */
export function inZone(d) {
  const ms = d instanceof Date ? d.getTime() : new Date(d).getTime()
  return zone ? new TZDate(ms, zone) : new Date(ms)
}

/** Now, on the business's clock. */
export const nowInZone = () => inZone(Date.now())

/** The UTC ISO string ("…Z") of any Date, TZDate included. */
export const iso = (d) => new Date(d.getTime()).toISOString()

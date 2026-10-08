import { businessDayOf } from './hours'

/**
 * What a booking costs — App\Services\Pricing on the server, case for case.
 *
 * The service's price is for its own duration, and a longer booking costs in
 * proportion (90 minutes of a 60-minute court is one and a half times the
 * price). From the peak hour the peak price applies; 1 a.m. on a late night
 * is still evening, so still peak. The server sets the stored price; this is
 * what the page shows before it asks.
 */

const toMin = (hm) => {
  const [h, m] = String(hm).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** @param {{ peakFrom?: string | null, peakPriceMinor?: number | null }} service */
export function isPeak(service, startAt, schedule) {
  if (!service?.peakFrom || service.peakPriceMinor == null) return false
  const start = new Date(startAt)
  const day = businessDayOf(start, schedule)
  return (start - day) / 60_000 >= toMin(service.peakFrom)
}

/**
 * @param {import('@/types').Service} service
 * @param {string | Date} startAt
 * @param {number | null} [durationMin] a length the service offers; its own when absent
 * @param {import('./hours').Schedule} [schedule]
 */
export function priceFor(service, startAt, durationMin = null, schedule = []) {
  if (!service) return 0
  const base = isPeak(service, startAt, schedule) ? service.peakPriceMinor : service.priceMinor
  const length = durationMin ?? service.durationMin
  return Math.round((base * length) / Math.max(1, service.durationMin))
}

/** The lengths a customer can choose — just the one when none are offered. */
export const durationsOf = (service) =>
  service?.durationOptions?.length
    ? [...new Set([...service.durationOptions, service.durationMin])].sort((a, b) => a - b)
    : service
      ? [service.durationMin]
      : []

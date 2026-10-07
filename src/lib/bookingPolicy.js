/**
 * When a guest may still change their own booking.
 *
 * Up to two hours before it starts. Later than that the slot can no longer be
 * offered to anyone else in time, so the change goes through the business.
 * The API enforces the same number (PublicBookingController::CHANGE_CUTOFF_MIN).
 */
export const CHANGE_CUTOFF_MIN = 120

/** @param {{ status: string, startAt: string } | null} booking */
export function canChange(booking, now = new Date()) {
  if (!booking) return false
  if (booking.status !== 'pending' && booking.status !== 'confirmed') return false
  return new Date(booking.startAt).getTime() - now.getTime() > CHANGE_CUTOFF_MIN * 60000
}

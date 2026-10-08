/* ------------------------------------------------------------------ *
 * Domain model.
 *
 * These are JSDoc typedefs, not TypeScript: nothing here is emitted or
 * imported at runtime. Editors read them through jsconfig.json, so a
 * `@type {import('@/types').Booking}` annotation still gets completion
 * and a red squiggle on a typo — without a compile step in the build.
 *
 * Conventions
 * - Money is stored in minor units (halalas). 15000 → 150.00 ر.س
 * - Durations are whole minutes.
 * - Instants are ISO 8601 strings. Never a pre-formatted display string.
 * - Statuses are machine values; Arabic labels live in the UI layer only.
 * ------------------------------------------------------------------ */

/**
 * A lucide-vue-next icon — a Vue functional component, not a string.
 * @typedef {import('vue').FunctionalComponent<import('lucide-vue-next').LucideProps>} LucideIcon
 */

/** @typedef {'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'} BookingStatus */
/** @typedef {'unpaid' | 'deposit_paid' | 'paid' | 'refunded'} PaymentStatus */
/** @typedef {'online' | 'phone' | 'walk_in'} BookingChannel */

/**
 * @typedef {object} Service
 * @property {string}   id
 * @property {string}   name
 * @property {string}   description
 * @property {number}   durationMin
 * @property {number}   bufferMin     Clean-up / turnaround gap reserved after the appointment.
 * @property {number}   priceMinor
 * @property {string[]} resourceIds
 * @property {LucideIcon} icon
 * @property {boolean}  isActive
 */

/**
 * The thing that can be double-booked: a room, a chair, a practitioner.
 * @typedef {object} Resource
 * @property {string}  id
 * @property {string}  name
 * @property {string}  [role]   what they do, shown to guests
 * @property {'female' | 'male' | null} [gender] lets a guest choose who sees them
 * @property {boolean} isActive
 */

/**
 * @typedef {object} Customer
 * @property {string}  id
 * @property {string}  name
 * @property {string}  phone      The identity key in this market — used for lookup and dedupe.
 * @property {string} [email]
 * @property {string} [notes]
 * @property {string}  createdAt
 */

/**
 * @typedef {'created' | 'confirmed' | 'rescheduled' | 'cancelled'
 *         | 'completed' | 'no_show' | 'payment_recorded' | 'note_added'} BookingEventType
 */

/**
 * @typedef {object} BookingEvent
 * @property {string} at
 * @property {BookingEventType} type
 * @property {string} summary
 */

/**
 * @typedef {object} Booking
 * @property {string} id
 * @property {string} reference     Human-quotable reference, e.g. BK-2026-0431
 * @property {string} customerId
 * @property {string} serviceId
 * @property {string} resourceId
 * @property {string} startAt
 * @property {string} endAt         startAt + durationMin + bufferMin, precomputed for cheap overlap tests.
 * @property {BookingStatus} status
 * @property {PaymentStatus} paymentStatus
 * @property {number} priceMinor    Snapshot of the price at booking time — services change price over time.
 * @property {BookingChannel} channel
 * @property {string | null} [acknowledgedAt] when the business first saw it;
 *   null for a guest's booking nobody has opened yet, absent on older data.
 * @property {string} [notes]
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {BookingEvent[]} history
 */

/**
 * Per-weekday opening times. weekday follows Date#getDay() — 0 = Sunday.
 * @typedef {object} BusinessHours
 * @property {0|1|2|3|4|5|6} weekday
 * @property {string}  open      "09:00"
 * @property {string}  close     "18:00"
 * @property {boolean} isClosed
 */

/* ------------------------------------------------------------------ *
 * Derived / view-model types
 * ------------------------------------------------------------------ */

/** @typedef {'available' | 'taken' | 'past'} SlotState */

/**
 * @typedef {object} Slot
 * @property {string} startAt
 * @property {string} endAt
 * @property {string} label
 * @property {SlotState} state
 */

/** @typedef {'pending_soon' | 'overdue_completion' | 'unacknowledged' | 'unpaid_imminent' | 'conflict'} AttentionReason */

/**
 * @typedef {object} AttentionItem
 * @property {Booking} booking
 * @property {AttentionReason} reason
 */

/**
 * A booking joined with its related entities, ready for display.
 * @typedef {object} BookingView
 * @property {Booking} booking
 * @property {Customer | null} customer
 * @property {Service | null}  service
 * @property {Resource | null} resource
 */

export {}

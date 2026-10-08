import { ConflictError } from '@/data/errors'
import { request } from './client'

/**
 * Repository backed by the Laravel API, implementing exactly the interface
 * LocalRepository does — no store or component changes to switch.
 *
 * There are no mappers here, unlike the Supabase implementation this replaces.
 * That layer existed to translate `start_at` into `startAt` because the client
 * was reading table rows directly. This API is first-party, so its resources
 * emit the domain shape the app already speaks and the translation has nowhere
 * left to live. The seam is still the seam: the storage schema is snake_case
 * and stays behind the controller.
 *
 * Bookings are written one at a time: POST to create under a client-chosen
 * UUID (so a retry cannot book twice), PATCH to change. They used to go up as
 * the whole list in a PUT, which re-created every booking the server had not
 * seen under the client's id — that is, all of them, on every save.
 */
export class ApiRepository {
  async loadBookings() {
    return request('/bookings')
  }

  /** What the server accepts for a booking; it computes the rest. */
  static #body(b) {
    return {
      customerId: b.customerId,
      serviceId: b.serviceId,
      resourceId: b.resourceId,
      startAt: b.startAt,
      status: b.status,
      paymentStatus: b.paymentStatus,
      channel: b.channel,
      // null, not undefined: undefined drops out of the JSON, and the server
      // reads an absent note as "leave it alone" — so it could never be cleared.
      notes: b.notes ?? null,
      durationMin: b.durationMin ?? null,
      seriesId: b.seriesId ?? null,
    }
  }

  /** The server refuses an overlap inside the transaction that writes it.
   *  Surfacing it as a typed error lets the stores say "that time is taken"
   *  rather than showing an operator a database message. */
  static async #write(call) {
    try {
      return await call()
    } catch (e) {
      if (e.status === 409) throw new ConflictError()
      throw e
    }
  }

  async createBooking(booking) {
    return ApiRepository.#write(() =>
      request('/bookings', {
        method: 'POST',
        body: { id: booking.id, ...ApiRepository.#body(booking) },
      }),
    )
  }

  async updateBooking(booking) {
    return ApiRepository.#write(() =>
      request(`/bookings/${booking.id}`, { method: 'PATCH', body: ApiRepository.#body(booking) }),
    )
  }

  /** The plan, its usage, and any request waiting to be activated. */
  async loadSubscription() {
    return request('/subscription')
  }

  /** Ask for a plan or a message pack; someone at Waeda activates it. */
  async requestPlan(body) {
    return request('/subscription/requests', { method: 'POST', body })
  }

  /** The business has seen a booking that arrived on its own. */
  async acknowledgeBooking(id) {
    return request(`/bookings/${id}/acknowledge`, { method: 'POST' })
  }

  async loadCustomers() {
    return request('/customers')
  }

  async saveCustomers(customers) {
    if (customers.length === 0) return
    await request('/customers', { method: 'PUT', body: { customers } })
  }

  async loadCatalog() {
    return request('/catalog')
  }

  async saveCatalog(snapshot) {
    await request('/catalog', { method: 'PUT', body: snapshot })
  }

  async loadGuardPolicy() {
    const { policy } = await request('/guard/policy')
    return policy
  }

  async saveGuardPolicy(policy) {
    await request('/guard/policy', { method: 'PUT', body: policy })
  }

  async loadMessages() {
    return request('/guard/messages')
  }

  /** The server also runs this on a schedule; calling it here just means now. */
  async guardTick() {
    return request('/guard/tick', { method: 'POST' })
  }

  async sendStaffMessage(bookingId, body) {
    return request(`/guard/conversations/${bookingId}/messages`, { method: 'POST', body: { body } })
  }

  async resolveConversation(bookingId) {
    return request(`/guard/conversations/${bookingId}/resolve`, { method: 'POST' })
  }

  async sendReply(bookingId, text) {
    return request('/guard/replies', { method: 'POST', body: { bookingId, text } })
  }

  async loadWaitlist() {
    return request('/guard/waitlist')
  }

  /** Public: the booking page offers it to guests when a day is full. */
  async joinWaitlist(input) {
    await request('/public/waitlist', { method: 'POST', body: input, auth: false })
  }

  async removeFromWaitlist(id) {
    await request(`/guard/waitlist/${id}`, { method: 'DELETE' })
  }

  async replyToOffer(offerId, text) {
    return request(`/guard/offers/${offerId}/replies`, { method: 'POST', body: { text } })
  }

  /**
   * Not implemented on purpose. Against localStorage, reset wipes a browser;
   * against a real database it would wipe a business. Reseeding is an operator
   * task, run with `php artisan db:seed`.
   */
  async reset() {
    throw new Error('reset is only available on the local demo backend')
  }
}

import { buildSeedBookings, customers as seedCustomers } from './seed'
import { DEFAULT_HOURS, DEFAULT_RESOURCES, DEFAULT_SERVICES } from './catalog'
import { DEFAULT_BUSINESS } from './business'
import { ConflictError } from './errors'
import { buildRiskModel } from '@/lib/risk'
import { withDefaults } from '@/lib/guard'
import { planActions } from '@/lib/guardEngine'
import { applyActions, applyOfferReply, applyReply } from '@/lib/guardBackend'
import { addDays, format } from 'date-fns'

/**
 * The seam between the UI and persistence.
 *
 * Everything above this file talks to `repository`; nothing above it knows
 * where the data lives. Which implementation that is comes from the
 * environment — see the factory at the bottom of this file.
 */
/**
 * @typedef {object} Repository
 * @property {() => Promise<import('@/types').Booking[]>} loadBookings
 * @property {(booking: import('@/types').Booking) => Promise<import('@/types').Booking>} createBooking Stores a new booking under the id the client chose and returns it as saved — with the reference the backend issued. Idempotent: the same id twice returns the first.
 * @property {(booking: import('@/types').Booking) => Promise<import('@/types').Booking>} updateBooking Saves one existing booking and returns it as stored.
 * @property {(id: string) => Promise<import('@/types').Booking>} acknowledgeBooking Marks a booking seen by the business; the first time is kept.
 * @property {() => Promise<import('@/types').Customer[]>} loadCustomers
 * @property {(customers: import('@/types').Customer[]) => Promise<void>} saveCustomers
 * @property {() => Promise<import('./catalog').CatalogSnapshot>} loadCatalog Services, resources and opening hours — everything Settings can edit.
 * @property {(snapshot: import('./catalog').CatalogSnapshot) => Promise<void>} saveCatalog
 * @property {() => Promise<import('@/lib/guard').GuardPolicy | null>} loadGuardPolicy null until the business has saved one.
 * @property {(policy: import('@/lib/guard').GuardPolicy) => Promise<void>} saveGuardPolicy
 * @property {() => Promise<import('@/lib/guardEngine').Message[]>} loadMessages Everything the guard has sent and received.
 * @property {() => Promise<{ messages: import('@/lib/guardEngine').Message[], bookings: import('@/types').Booking[] }>} guardTick
 *   Runs the guard now: sends what is due, releases what has expired. Safe to call repeatedly — nothing is sent twice.
 * @property {(bookingId: string, text: string) => Promise<{ messages: import('@/lib/guardEngine').Message[], booking: import('@/types').Booking, intent: string }>} sendReply
 *   A customer's reply, as the channel would deliver it. The demo's simulator calls this.
 * @property {() => Promise<import('@/lib/waitlist').WaitlistEntry[]>} loadWaitlist
 * @property {(input: { serviceId: string, day: string | null, window: [number, number] | null,
 *   name: string, phone: string }) => Promise<void>} joinWaitlist
 *   Anyone can join — the booking page offers it when a day is full.
 * @property {(id: string) => Promise<void>} removeFromWaitlist
 * @property {(offerId: string, text: string) => Promise<{ messages: import('@/lib/guardEngine').Message[],
 *   booking: import('@/types').Booking | null, intent: string }>} replyToOffer
 *   A candidate's answer to the offer of a freed slot. The simulator calls this on the demo.
 * @property {() => Promise<void>} reset
 */

const KEY_BOOKINGS = 'bookingpro:bookings:v1'
const KEY_CUSTOMERS = 'bookingpro:customers:v1'
// v2: the demo became one coherent clinic (named specialists, categories).
const KEY_CATALOG = 'bookingpro:catalog:v2'
const KEY_SEEDED_ON = 'bookingpro:seededOn:v1'
const KEY_GUARD = 'bookingpro:guard:v1'
const KEY_MESSAGES = 'bookingpro:messages:v1'
const KEY_WAITLIST = 'bookingpro:waitlist:v1'
/** Set once a visitor opens their own business: the demo seed stops arriving. */
const KEY_OWNED = 'bookingpro:owned:v1'

/** Simulated latency, so loading states are real rather than theoretical. */
const LATENCY_MS = 220

function delay(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))
}

function read(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota or private mode — the app still works for this session */
  }
}

/** @implements {Repository} */
class LocalRepository {
  /**
   * Seed data is anchored to the day it was generated. If the stored seed is
   * from a previous day, regenerate it so "today" always has a live schedule
   * instead of decaying into an empty screen.
   */
  #ensureFresh() {
    // A business the visitor opened is theirs: no seeded clinic day on top.
    if (read(KEY_OWNED)) {
      if (!read(KEY_BOOKINGS)) write(KEY_BOOKINGS, [])
      return
    }
    const today = new Date().toDateString()
    if (read(KEY_SEEDED_ON) !== today || !read(KEY_BOOKINGS)) {
      write(KEY_BOOKINGS, buildSeedBookings())
      // Keep customers the operator added, but make sure every seeded one the
      // fresh bookings point at exists — a browser seeded by an older build
      // holds a shorter list.
      const stored = read(KEY_CUSTOMERS) ?? []
      const known = new Set(stored.map((c) => c.id))
      write(KEY_CUSTOMERS, [...stored, ...seedCustomers.filter((c) => !known.has(c.id))])
      write(KEY_SEEDED_ON, today)
      // Seed ids are reused every day (b1, b2, …), so yesterday's messages
      // would attach themselves to whichever booking holds that id today.
      write(KEY_MESSAGES, [])
      write(KEY_WAITLIST, LocalRepository.#seedWaitlist())
      this.#seedGuardActivity()
    }
  }

  /**
   * A morning's worth of guard activity, so the demo opens on a guard that has
   * been working rather than an empty log: what was due has been sent, and a
   * few customers have already answered — one yes, one running late, one
   * question for the desk.
   */
  #seedGuardActivity() {
    const input = this.#guardInputs()
    const policy = withDefaults(read(KEY_GUARD))
    const actions = planActions({
      bookings: input.bookings,
      messages: input.messages,
      policy,
      model: buildRiskModel(input.bookings),
    })
    let state = applyActions({ actions, ...input })
    const asked = state.added.filter(
      (m) => m.template === 'confirm_request' || m.template === 'reminder',
    )
    const reply = (bookingId, text) => {
      state = { ...state, ...applyReply({ ...input, ...state, bookingId, text }) }
    }
    // One yes, one running late, one who moves to another day and picks a time.
    const [yes, late, move] = asked
    if (yes) reply(yes.bookingId, '1')
    if (late) reply(late.bookingId, 'بتأخر ربع ساعة')
    if (move) {
      reply(move.bookingId, 'ممكن أغير الموعد لبكرة؟')
      reply(move.bookingId, '1')
    }
    // And one who cancels: the furthest-off booking of a service someone is
    // waiting for, so the slot has the notice and the takers to be refilled.
    const wanted = new Set(input.waitlist.map((e) => e.serviceId))
    const cancelling = asked
      .slice(3)
      .map((m) => state.bookings.find((b) => b.id === m.bookingId))
      .filter(
        (b) =>
          b &&
          wanted.has(b.serviceId) &&
          new Date(b.startAt).getTime() - Date.now() > 2 * 3_600_000,
      )
      .at(-1)
    if (cancelling) reply(cancelling.id, 'ما بقدر اجي، ألغيه')

    // The guard's next run offers the freed time on; the first person asked takes it.
    const refill = planActions({
      ...input,
      ...state,
      policy,
      model: buildRiskModel(state.bookings),
    }).filter((a) => a.kind === 'backfill')
    state = { ...state, ...applyActions({ ...input, ...state, actions: refill }) }
    const firstOffer = state.added.find((m) => m.template === 'backfill_offer')
    let waitlist = input.waitlist
    if (firstOffer) {
      const won = applyOfferReply({
        ...input,
        ...state,
        waitlist,
        offerId: firstOffer.id,
        text: 'أكيد',
        nextReference: () => LocalRepository.#nextReference(state.bookings),
      })
      state = { ...state, ...won }
      waitlist = won.waitlist
    }
    write(KEY_BOOKINGS, state.bookings)
    write(KEY_MESSAGES, state.messages)
    write(KEY_WAITLIST, waitlist)
  }

  /** People already waiting when the demo opens, so a freed slot has somewhere to go. */
  static #seedWaitlist() {
    const day = (n) => format(addDays(new Date(), n), 'yyyy-MM-dd')
    const at = (h) => new Date(Date.now() - h * 3_600_000).toISOString()
    const entry = (id, customerId, serviceId, d, window, hoursAgo) => ({
      id,
      customerId,
      serviceId,
      day: d,
      window,
      status: 'waiting',
      createdAt: at(hoursAgo),
    })
    return [
      entry('w1', 'c14', 's1', null, null, 50),
      entry('w2', 'c17', 's2', null, null, 30),
      entry('w3', 'c20', 's1', day(1), [15 * 60, 18 * 60], 20),
      entry('w4', 'c22', 's3', day(2), null, 12),
      entry('w5', 'c18', 's2', day(1), [9 * 60, 12 * 60], 6),
    ]
  }

  async loadBookings() {
    this.#ensureFresh()
    return delay(read(KEY_BOOKINGS) ?? [])
  }

  /**
   * Every pair of blocking bookings that share a resource and overlap, as
   * `id|id` keys. Half-open, matching overlaps() in src/lib/availability.js
   * and the `start_at < ? and end_at > ?` test the API runs under its lock.
   */
  static #conflictPairs(bookings) {
    const blocking = bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed')
    const pairs = new Set()
    for (let i = 0; i < blocking.length; i++) {
      for (let j = i + 1; j < blocking.length; j++) {
        const a = blocking[i]
        const b = blocking[j]
        if (a.resourceId !== b.resourceId) continue
        if (a.startAt < b.endAt && b.startAt < a.endAt) {
          pairs.add([a.id, b.id].sort().join('|'))
        }
      }
    }
    return pairs
  }

  /**
   * Refuses to persist an overlap this write would *introduce*, so the demo
   * backend enforces the same rule the API enforces inside its booking
   * transaction. Without that the two backends disagree about what is legal,
   * and a bug would only ever show up in production.
   *
   * "Introduce" is load-bearing: the seed ships a deliberate conflict so the
   * Today screen has something to put in its needs-attention queue, and the
   * API refuses the booking being written, not the state of the table around
   * it. This matches.
   */
  static #commit(next, before) {
    const existing = LocalRepository.#conflictPairs(before)
    for (const pair of LocalRepository.#conflictPairs(next)) {
      if (!existing.has(pair)) throw new ConflictError()
    }
    write(KEY_BOOKINGS, next)
  }

  /** The next BK-YYYY-NNNN, from what is stored — not from the list length,
   *  which collided once anything had been booked in another year. */
  static #nextReference(all) {
    const year = new Date().getFullYear()
    const prefix = `BK-${year}-`
    const max = all
      .filter((b) => b.reference?.startsWith(prefix))
      .reduce((m, b) => Math.max(m, Number(b.reference.slice(prefix.length)) || 0), 0)
    return `${prefix}${String(max + 1).padStart(4, '0')}`
  }

  async createBooking(booking) {
    const all = read(KEY_BOOKINGS) ?? []
    // The same id twice is a retry, not a second booking — as on the API.
    const existing = all.find((b) => b.id === booking.id)
    if (existing) return existing
    const saved = { ...booking, reference: LocalRepository.#nextReference(all) }
    LocalRepository.#commit([...all, saved], all)
    return saved
  }

  async updateBooking(booking) {
    const all = read(KEY_BOOKINGS) ?? []
    const i = all.findIndex((b) => b.id === booking.id)
    if (i === -1) throw new Error('booking not found')
    const next = all.slice()
    next[i] = booking
    LocalRepository.#commit(next, all)
    return booking
  }

  /** The business has seen a booking that arrived on its own. First time kept. */
  async acknowledgeBooking(id) {
    const all = read(KEY_BOOKINGS) ?? []
    const b = all.find((x) => x.id === id)
    if (!b) throw new Error('booking not found')
    if (!b.acknowledgedAt) {
      const next = all.map((x) =>
        x.id === id ? { ...x, acknowledgedAt: new Date().toISOString() } : x,
      )
      LocalRepository.#commit(next, all)
      return next.find((x) => x.id === id)
    }
    return b
  }

  async loadCustomers() {
    this.#ensureFresh()
    return delay(read(KEY_CUSTOMERS) ?? seedCustomers)
  }

  async saveCustomers(customers) {
    write(KEY_CUSTOMERS, customers)
  }

  async loadCatalog() {
    const stored = read(KEY_CATALOG)
    return delay(
      stored
        ? { business: DEFAULT_BUSINESS, ...stored }
        : {
            business: { ...DEFAULT_BUSINESS },
            services: structuredClone(DEFAULT_SERVICES),
            resources: structuredClone(DEFAULT_RESOURCES),
            businessHours: structuredClone(DEFAULT_HOURS),
          },
    )
  }

  async saveCatalog(snapshot) {
    write(KEY_CATALOG, snapshot)
  }

  async loadGuardPolicy() {
    return delay(read(KEY_GUARD))
  }

  async saveGuardPolicy(policy) {
    write(KEY_GUARD, policy)
  }

  /* -------------------------------------------------------------- guard */

  #guardInputs() {
    return {
      bookings: read(KEY_BOOKINGS) ?? [],
      customers: read(KEY_CUSTOMERS) ?? seedCustomers,
      services: read(KEY_CATALOG)?.services ?? DEFAULT_SERVICES,
      // The whole schedule, so offers respect late nights and special periods.
      hours: {
        hours: read(KEY_CATALOG)?.businessHours ?? DEFAULT_HOURS,
        specialPeriods: read(KEY_CATALOG)?.specialPeriods ?? [],
        prayer: read(KEY_CATALOG)?.prayer ?? null,
      },
      waitlist: read(KEY_WAITLIST) ?? [],
      messages: read(KEY_MESSAGES) ?? [],
    }
  }

  async loadMessages() {
    return delay(read(KEY_MESSAGES) ?? [])
  }

  async guardTick() {
    this.#ensureFresh()
    const input = this.#guardInputs()
    const actions = planActions({
      waitlist: input.waitlist,
      bookings: input.bookings,
      messages: input.messages,
      policy: withDefaults(read(KEY_GUARD)),
      model: buildRiskModel(input.bookings),
    })
    if (actions.length === 0) return { messages: input.messages, bookings: input.bookings }
    const result = applyActions({ actions, ...input })
    // Releasing only ever frees a slot, so no overlap check is needed here.
    write(KEY_BOOKINGS, result.bookings)
    write(KEY_MESSAGES, result.messages)
    return { messages: result.messages, bookings: result.bookings }
  }

  /** The team writing to a customer; answering closes the hand-off. */
  async sendStaffMessage(bookingId, body, author) {
    const messages = (read(KEY_MESSAGES) ?? []).map((m) =>
      m.bookingId === bookingId && m.needsStaff ? { ...m, needsStaff: false } : m,
    )
    messages.push({
      id: crypto.randomUUID(),
      bookingId,
      direction: 'out',
      template: 'staff',
      body,
      at: new Date().toISOString(),
      payload: { author },
    })
    write(KEY_MESSAGES, messages)
    return delay({ messages })
  }

  /** Nothing left for the team in this conversation. */
  async resolveConversation(bookingId) {
    const messages = (read(KEY_MESSAGES) ?? []).map((m) =>
      m.bookingId === bookingId && m.needsStaff ? { ...m, needsStaff: false } : m,
    )
    write(KEY_MESSAGES, messages)
    return delay({ messages })
  }

  async sendReply(bookingId, text) {
    const result = applyReply({ bookingId, text, ...this.#guardInputs() })
    write(KEY_BOOKINGS, result.bookings)
    write(KEY_MESSAGES, result.messages)
    return delay({ messages: result.messages, booking: result.booking, intent: result.intent })
  }

  async loadWaitlist() {
    this.#ensureFresh()
    return delay(read(KEY_WAITLIST) ?? [])
  }

  async joinWaitlist({ serviceId, day, window, name, phone }) {
    const customers = read(KEY_CUSTOMERS) ?? seedCustomers
    const digits = phone.replace(/\D/g, '')
    let customer = customers.find((c) => c.phone.replace(/\D/g, '') === digits)
    if (!customer) {
      customer = {
        id: crypto.randomUUID(),
        name: name.trim(),
        phone: phone.trim(),
        createdAt: new Date().toISOString(),
      }
      write(KEY_CUSTOMERS, [...customers, customer])
    }
    const waitlist = read(KEY_WAITLIST) ?? []
    write(KEY_WAITLIST, [
      ...waitlist,
      {
        id: crypto.randomUUID(),
        customerId: customer.id,
        serviceId,
        day,
        window,
        status: 'waiting',
        createdAt: new Date().toISOString(),
      },
    ])
    return delay(undefined)
  }

  async removeFromWaitlist(id) {
    write(
      KEY_WAITLIST,
      (read(KEY_WAITLIST) ?? []).map((e) => (e.id === id ? { ...e, status: 'removed' } : e)),
    )
  }

  async replyToOffer(offerId, text) {
    const input = this.#guardInputs()
    const result = applyOfferReply({
      offerId,
      text,
      ...input,
      nextReference: () => LocalRepository.#nextReference(read(KEY_BOOKINGS) ?? []),
    })
    if (result.booking) LocalRepository.#commit(result.bookings, input.bookings)
    write(KEY_MESSAGES, result.messages)
    write(KEY_WAITLIST, result.waitlist)
    return delay({ messages: result.messages, booking: result.booking, intent: result.intent })
  }

  /**
   * Opening a business on the demo: its catalogue replaces the clinic's, and
   * the clinic's bookings, customers and guard log go with it — a new owner
   * starts on an empty day, as they would on the real thing.
   */
  async openBusiness(snapshot) {
    write(KEY_CATALOG, snapshot)
    write(KEY_BOOKINGS, [])
    write(KEY_CUSTOMERS, [])
    write(KEY_MESSAGES, [])
    write(KEY_WAITLIST, [])
    write(KEY_OWNED, true)
    return delay(null)
  }

  async reset() {
    ;[
      KEY_OWNED,
      KEY_BOOKINGS,
      KEY_CUSTOMERS,
      KEY_CATALOG,
      KEY_SEEDED_ON,
      KEY_GUARD,
      KEY_MESSAGES,
      KEY_WAITLIST,
    ].forEach((k) => localStorage.removeItem(k))
  }
}

/**
 * One environment variable decides the backend.
 *
 * With VITE_API_URL set the app talks to the Laravel API and MySQL; without
 * it, to localStorage. That keeps the demo working with no setup, lets
 * development carry on offline, and — the reason it is a flag rather than a
 * rewrite — makes rolling back a deployment a config change instead of a
 * revert.
 *
 * It is also what keeps the public demo alive: Vercel serves this bundle as
 * static files and cannot host PHP or MySQL, so the deployed site runs the
 * localStorage path and stays a complete, working product.
 */
export const isDemoBackend = !import.meta.env.VITE_API_URL

let active = new LocalRepository()

/**
 * Loads the API implementation, and only then.
 *
 * Kept as a dynamic import for the same reason it was one before: code that
 * will never run on the demo backend should not be in the chunk that every
 * visitor downloads.
 *
 * Called once from main.js before mount, so no store ever sees a half-swapped
 * backend.
 */
export async function initRepository() {
  if (isDemoBackend) return
  const { ApiRepository } = await import('./api/repository')
  active = new ApiRepository()
}

/**
 * Delegates rather than being reassigned: consumers import this binding once
 * at module load, so swapping the object underneath is the only way the
 * switch can happen after their import has already resolved.
 */
/** @type {Repository} */
export const repository = {
  loadBookings: () => active.loadBookings(),
  createBooking: (b) => active.createBooking(b),
  updateBooking: (b) => active.updateBooking(b),
  acknowledgeBooking: (id) => active.acknowledgeBooking(id),
  loadCustomers: () => active.loadCustomers(),
  saveCustomers: (c) => active.saveCustomers(c),
  loadCatalog: () => active.loadCatalog(),
  saveCatalog: (s) => active.saveCatalog(s),
  openBusiness: (s) => active.openBusiness(s),
  loadGuardPolicy: () => active.loadGuardPolicy(),
  loadMessages: () => active.loadMessages(),
  guardTick: () => active.guardTick(),
  sendReply: (id, text) => active.sendReply(id, text),
  sendStaffMessage: (id, body, author) => active.sendStaffMessage(id, body, author),
  resolveConversation: (id) => active.resolveConversation(id),
  loadWaitlist: () => active.loadWaitlist(),
  joinWaitlist: (input) => active.joinWaitlist(input),
  removeFromWaitlist: (id) => active.removeFromWaitlist(id),
  replyToOffer: (offerId, text) => active.replyToOffer(offerId, text),
  saveGuardPolicy: (p) => active.saveGuardPolicy(p),
  reset: () => active.reset(),
}

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { repository } from '@/data/repository'
import { buildRiskModel, isAtStake, tierOf } from '@/lib/risk'
import { withDefaults } from '@/lib/guard'
import { customerConfirmed } from '@/lib/guardEngine'
import { useBookingsStore } from './bookings'

const DAY = 86_400_000

/**
 * The appointment guard: the risk model over the bookings already loaded, and
 * the business's policy for acting on it.
 *
 * The model is rebuilt when bookings change rather than per render — it walks
 * the whole history — and every upcoming booking is scored once into a map
 * that badges and lists read from.
 */
export const useGuardStore = defineStore('guard', () => {
  const bookings = useBookingsStore()

  const policy = ref(withDefaults(null))
  const loaded = ref(false)
  const saving = ref(false)

  async function load() {
    if (loaded.value) return
    try {
      policy.value = withDefaults(await repository.loadGuardPolicy())
    } finally {
      loaded.value = true
    }
  }

  /** @param {import('@/lib/guard').GuardPolicy} next */
  async function save(next) {
    saving.value = true
    try {
      const clean = withDefaults(next)
      await repository.saveGuardPolicy(clean)
      policy.value = clean
    } finally {
      saving.value = false
    }
  }

  /* ------------------------------------------------------------ messages */

  /** @type {import('vue').Ref<import('@/lib/guardEngine').Message[]>} */
  const messages = ref([])
  const running = ref(false)

  /**
   * Runs the guard: whatever is due is sent, whatever has expired released.
   * Called on entering the console and then every minute — the backend makes
   * repeating it harmless.
   */
  async function run() {
    if (running.value) return
    running.value = true
    try {
      const result = await repository.guardTick()
      messages.value = result.messages
      bookings.adopt(result.bookings)
    } catch {
      /* the guard is best-effort; the console works without it */
    } finally {
      running.value = false
    }
  }

  /** A customer's reply — from the simulator on the demo, the channel in production. */
  async function reply(bookingId, text) {
    const result = await repository.sendReply(bookingId, text)
    messages.value = result.messages
    bookings.adopt([result.booking])
    // A cancellation frees a slot: run now, so it is offered on at once.
    if (result.intent === 'cancel') void run()
    return result.intent
  }

  /* --------------------------------------------------------------- inbox */

  /** A person on the team answering the customer, in the guard's thread. */
  async function staffReply(bookingId, body) {
    const auth = useAuthStore()
    const result = await repository.sendStaffMessage(bookingId, body, auth.user?.name ?? 'الفريق')
    messages.value = result.messages
  }

  /** Mark a hand-off handled without writing anything. */
  async function resolve(bookingId) {
    const result = await repository.resolveConversation(bookingId)
    messages.value = result.messages
  }

  /**
   * One conversation per booking — the customer and everything said about
   * that appointment — newest activity first. Offers of a freed slot to other
   * customers are not part of anyone's conversation and stay in Refill.
   */
  const conversations = computed(() => {
    const byBooking = new Map()
    for (const m of messages.value) {
      if (m.customerId) continue
      const list = byBooking.get(m.bookingId) ?? []
      list.push(m)
      byBooking.set(m.bookingId, list)
    }
    return [...byBooking]
      .map(([bookingId, list]) => {
        const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at))
        const waiting = sorted.filter((m) => m.needsStaff)
        const last = sorted.at(-1)
        const lastIn = [...sorted].reverse().find((m) => m.direction === 'in')
        return {
          bookingId,
          messages: sorted,
          last,
          needsStaff: waiting.length > 0,
          waitingSince: waiting[0]?.at ?? null,
          customerReplied: !!lastIn,
        }
      })
      .sort((a, b) => b.last.at.localeCompare(a.last.at))
  })

  /* ------------------------------------------------------------ waitlist */

  /** @type {import('vue').Ref<import('@/lib/waitlist').WaitlistEntry[]>} */
  const waitlist = ref([])

  async function loadWaitlist() {
    waitlist.value = await repository.loadWaitlist()
  }

  async function removeFromWaitlist(id) {
    await repository.removeFromWaitlist(id)
    await loadWaitlist()
  }

  /** A candidate answering the offer of a freed slot. */
  async function replyToOffer(offerId, text) {
    const result = await repository.replyToOffer(offerId, text)
    messages.value = result.messages
    if (result.booking) bookings.adopt([result.booking])
    await loadWaitlist()
    return result
  }

  /**
   * Freed slots and what became of them: who was offered each, who answered,
   * and whether it was taken. Newest first.
   */
  const refills = computed(() => {
    const byBooking = new Map()
    for (const m of messages.value) {
      if (!m.customerId) continue
      const group = byBooking.get(m.bookingId) ?? []
      group.push(m)
      byBooking.set(m.bookingId, group)
    }
    return [...byBooking]
      .map(([bookingId, list]) => {
        const offers = list.filter((m) => m.template === 'backfill_offer')
        const won = list.find((m) => m.template === 'backfill_won')
        return {
          bookingId,
          at: offers[0]?.at ?? list[0].at,
          won,
          candidates: offers.map((o) => ({
            offer: o,
            customerId: o.customerId,
            reason: o.payload?.reason,
            answer: list.find((m) => m.direction === 'in' && m.replyTo === o.id) ?? null,
          })),
        }
      })
      .filter((r) => r.candidates.length)
      .sort((a, b) => b.at.localeCompare(a.at))
  })

  /**
   * What the guard kept from being lost, in minor units: freed slots it sold
   * again, and bookings moved by conversation that would otherwise have been
   * cancelled or missed. Counted from what happened — never an estimate.
   */
  const protectedRevenue = computed(() => {
    const refilled = messages.value
      .filter((m) => m.template === 'backfill_won')
      .reduce((sum, m) => sum + (m.payload?.priceMinor ?? 0), 0)
    const kept = messages.value
      .filter((m) => m.template === 'ack_rescheduled')
      .reduce((sum, m) => sum + (bookings.byId(m.bookingId)?.priceMinor ?? 0), 0)
    return { refilled, kept, total: refilled + kept }
  })

  /** @param {string} bookingId */
  function thread(bookingId) {
    return messages.value
      .filter((m) => m.bookingId === bookingId && !m.customerId)
      .sort((a, b) => a.at.localeCompare(b.at))
  }

  /** Replies the rules could not act on, newest first — someone should read these. */
  const forStaff = computed(() =>
    messages.value.filter((m) => m.needsStaff).sort((a, b) => b.at.localeCompare(a.at)),
  )

  const activity = computed(() => {
    const count = (pred) => messages.value.filter(pred).length
    return {
      sent: count((m) => m.direction === 'out' && !m.template.startsWith('ack_')),
      confirmed: count((m) => m.direction === 'in' && m.intent === 'confirm'),
      cancelled: count((m) => m.direction === 'in' && m.intent === 'cancel'),
      released: count((m) => m.template === 'release_notice'),
      refilled: count((m) => m.template === 'backfill_won'),
      rescheduled: count((m) => m.template === 'ack_rescheduled'),
    }
  })

  /** Newest first, for the activity feed. */
  const recent = computed(() =>
    [...messages.value].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30),
  )

  const model = computed(() => buildRiskModel(bookings.items))

  /** id → risk for every booking still ahead and holding its slot. */
  const scores = computed(() => {
    const now = Date.now()
    const m = new Map()
    for (const b of bookings.items) {
      if (!isAtStake(b, now)) continue
      const r = model.value.score(b)
      m.set(b.id, { ...r, tier: tierOf(r.probability, policy.value) })
    }
    return m
  })

  /** @returns {(import('@/lib/risk').Risk & { tier: import('@/lib/risk').RiskTier }) | null} */
  function riskOf(id) {
    return scores.value.get(id) ?? null
  }

  /** Upcoming bookings in the next `days`, riskiest first. */
  function upcoming(days = 7) {
    const until = Date.now() + days * DAY
    return bookings.items
      .filter((b) => scores.value.has(b.id) && new Date(b.startAt).getTime() < until)
      .map((b) => ({ booking: b, risk: scores.value.get(b.id) }))
      .sort((x, y) => y.risk.probability - x.risk.probability)
  }

  const week = computed(() => upcoming(7))
  const exposureMinor = computed(() => week.value.reduce((s, x) => s + x.risk.expectedLossMinor, 0))
  // A customer who already said "I'm coming" needs nothing more from anyone,
  // whatever their record says.
  const flagged = computed(() =>
    week.value.filter(
      (x) => x.risk.tier !== 'low' && !customerConfirmed(x.booking, messages.value),
    ),
  )

  /** Back to nothing loaded — on sign-out, so the next operator never sees these. */
  function reset() {
    policy.value = withDefaults(null)
    loaded.value = false
    messages.value = []
    waitlist.value = []
  }

  return {
    reset,
    policy,
    loaded,
    saving,
    load,
    save,
    model,
    riskOf,
    upcoming,
    week,
    exposureMinor,
    flagged,
    messages,
    running,
    run,
    reply,
    thread,
    forStaff,
    staffReply,
    resolve,
    conversations,
    activity,
    recent,
    waitlist,
    loadWaitlist,
    removeFromWaitlist,
    replyToOffer,
    refills,
    protectedRevenue,
  }
})

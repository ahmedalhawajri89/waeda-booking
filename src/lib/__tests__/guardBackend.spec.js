import { describe, expect, it } from 'vitest'
import { applyActions, applyReply } from '../guardBackend'

const NOW = new Date('2030-03-10T08:00:00Z').getTime()

const booking = (over = {}) => ({
  id: 'b1',
  customerId: 'c1',
  serviceId: 's1',
  status: 'confirmed',
  paymentStatus: 'unpaid',
  startAt: '2030-03-10T12:00:00.000Z',
  priceMinor: 15000,
  history: [],
  ...over,
})
const base = {
  customers: [{ id: 'c1', name: 'سارة خالد' }],
  services: [{ id: 's1', name: 'استشارة' }],
  messages: [],
  now: NOW,
}

describe('applyReply', () => {
  it('confirms a pending booking and records that the customer did', () => {
    const r = applyReply({
      ...base,
      bookings: [booking({ status: 'pending' })],
      bookingId: 'b1',
      text: '1',
    })

    expect(r.booking.status).toBe('confirmed')
    expect(r.booking.history.map((e) => e.type)).toEqual(['customer_confirmed', 'confirmed'])
    expect(r.messages.map((m) => [m.direction, m.template])).toEqual([
      ['in', 'reply'],
      ['out', 'ack_confirm'],
    ])
  })

  it('cancels, freeing the slot', () => {
    const r = applyReply({ ...base, bookings: [booking()], bookingId: 'b1', text: 'الغيه' })
    expect(r.booking.status).toBe('cancelled')
    expect(r.messages[1].template).toBe('ack_cancel')
  })

  it('hands anything it cannot read to staff, and changes nothing', () => {
    const r = applyReply({ ...base, bookings: [booking()], bookingId: 'b1', text: 'مين معي؟' })

    expect(r.booking.status).toBe('confirmed')
    expect(r.messages[0]).toMatchObject({ intent: 'unknown', needsStaff: true })
    expect(r.messages[1].template).toBe('ack_handoff')
  })

  it('does not bring a cancelled booking back by a late "yes"', () => {
    const r = applyReply({
      ...base,
      bookings: [booking({ status: 'cancelled' })],
      bookingId: 'b1',
      text: '1',
    })
    expect(r.booking.status).toBe('cancelled')
    expect(r.messages[0].needsStaff).toBe(true)
  })
})

describe('applyActions', () => {
  it('sends the message the action names, addressed by first name', () => {
    const r = applyActions({
      ...base,
      bookings: [booking()],
      actions: [{ kind: 'send', bookingId: 'b1', template: 'confirm_request' }],
    })
    expect(r.added).toHaveLength(1)
    expect(r.added[0].body).toContain('مرحباً سارة')
    expect(r.added[0].body).toContain('للتأكيد أرسل 1')
  })

  it('releases: cancels with a reason, and tells the customer', () => {
    const r = applyActions({
      ...base,
      bookings: [booking()],
      actions: [{ kind: 'release', bookingId: 'b1' }],
    })

    expect(r.bookings[0].status).toBe('cancelled')
    expect(r.bookings[0].history.at(-1).type).toBe('released')
    expect(r.added[0].template).toBe('release_notice')
  })
})

describe('moving a booking by conversation', () => {
  // Tuesday 5 March 2030, local time. Open 09:00–18:00 every day.
  const now = new Date(2030, 2, 5, 10, 0).getTime()
  const local = (d, h, m = 0) => new Date(2030, 2, d, h, m).toISOString()
  const hours = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    open: '09:00',
    close: '18:00',
    isClosed: false,
  }))
  const services = [
    { id: 's1', name: 'استشارة', durationMin: 30, bufferMin: 10, resourceIds: ['r1'] },
  ]
  const mine = booking({
    resourceId: 'r1',
    startAt: local(5, 13),
    endAt: local(5, 13, 40),
  })
  const ctx = { ...base, services, hours, now }

  it('offers three free times inside the window the customer asked for', () => {
    const r = applyReply({ ...ctx, bookings: [mine], bookingId: 'b1', text: 'خلّيها بكرة العصر' })

    const offer = r.messages.at(-1)
    expect(r.intent).toBe('reschedule')
    expect(offer.template).toBe('reschedule_offer')
    expect(offer.payload.options).toHaveLength(3)
    for (const at of offer.payload.options) {
      const d = new Date(at)
      expect(d.getDate()).toBe(6)
      expect(d.getHours()).toBeGreaterThanOrEqual(15)
      expect(d.getHours()).toBeLessThan(18)
    }
    expect(offer.body).toContain('أرسل رقم الوقت المناسب')
    expect(r.booking.startAt).toBe(mine.startAt) // nothing moves until they choose
  })

  it('moves the booking to the time they pick, and says so', () => {
    const offered = applyReply({
      ...ctx,
      bookings: [mine],
      bookingId: 'b1',
      text: 'خلّيها بكرة العصر',
    })
    const target = offered.messages.at(-1).payload.options[1]

    const r = applyReply({ ...ctx, ...offered, bookingId: 'b1', text: '2' })

    expect(r.intent).toBe('choose')
    expect(r.booking.startAt).toBe(target)
    expect(r.booking.history.at(-1)).toMatchObject({ type: 'rescheduled' })
    expect(r.booking.history.at(-1).summary).toContain('إلى')
    expect(r.messages.at(-1).template).toBe('ack_rescheduled')
    // The offer is spent: a later "2" is no longer a choice.
    expect(r.messages.find((m) => m.template === 'reschedule_offer').payload.used).toBe(true)
  })

  it('offers again if the chosen time was taken in the meantime', () => {
    const offered = applyReply({
      ...ctx,
      bookings: [mine],
      bookingId: 'b1',
      text: 'خلّيها بكرة العصر',
    })
    const target = offered.messages.at(-1).payload.options[0]
    const intruder = booking({
      id: 'b2',
      resourceId: 'r1',
      startAt: target,
      endAt: new Date(new Date(target).getTime() + 40 * 60_000).toISOString(),
    })

    const r = applyReply({
      ...ctx,
      messages: offered.messages,
      bookings: [...offered.bookings, intruder],
      bookingId: 'b1',
      text: '1',
    })

    expect(r.booking.startAt).toBe(mine.startAt)
    expect(r.messages.at(-1).template).toBe('reschedule_offer')
    expect(r.messages.at(-1).payload.options).not.toContain(target)
  })
})

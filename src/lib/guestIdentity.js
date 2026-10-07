/**
 * The guest's identity on this device: no account, no password — a name and a
 * phone number that passed a code once.
 *
 * A customer books a few times a year; asking them to remember a password for
 * that loses more bookings than it protects. Proving the phone once is what
 * matters (it is where the reminder goes), and after that this device simply
 * remembers them so the next booking is two taps.
 *
 * This is a convenience, not a credential: anything here can be edited in the
 * browser. The server-side check arrives with the WhatsApp channel, which is
 * what actually sends the code.
 */
const KEY = 'bookingpro:guest:v1'

/** @returns {{ name: string, phone: string } | null} */
export function rememberedGuest() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const g = JSON.parse(raw)
    return g?.phone ? { name: g.name ?? '', phone: g.phone } : null
  } catch {
    return null
  }
}

export function rememberGuest(name, phone) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name, phone, at: Date.now() }))
  } catch {
    /* storage blocked: they verify again next time */
  }
}

export function forgetGuest() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** Digits only, so "050 111 2222" and "0501112222" are the same person. */
export const samePhone = (a, b) => a.replace(/\D/g, '') === b.replace(/\D/g, '')

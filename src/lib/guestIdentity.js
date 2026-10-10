/**
 * The guest's identity on this device: no account, no password — a name and a
 * phone number that passed a code once.
 *
 * A customer books a few times a year; asking them to remember a password for
 * that loses more bookings than it protects. Proving the phone once is what
 * matters (it is where the reminder goes), and after that this device simply
 * remembers them so the next booking is two taps.
 *
 * The proof is the token the server gave for the code, kept here with the
 * phone. The name and phone are a convenience anyone can edit; the token is
 * what the server checks, and it is good only for the phone it was issued for.
 */
const KEY = 'bookingpro:guest:v1'

/** @returns {{ name: string, phone: string, token: string | null } | null} */
export function rememberedGuest() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const g = JSON.parse(raw)
    return g?.phone ? { name: g.name ?? '', phone: g.phone, token: g.token ?? null } : null
  } catch {
    return null
  }
}

/**
 * @param {string} name
 * @param {string} phone
 * @param {string | null} [token] Left out, the token already kept for this phone
 *   stays; null forgets it (the server no longer accepts it).
 */
export function rememberGuest(name, phone, token) {
  const kept = rememberedGuest()
  const proof =
    token !== undefined ? token : kept && samePhone(kept.phone, phone) ? kept.token : null
  try {
    localStorage.setItem(KEY, JSON.stringify({ name, phone, token: proof, at: Date.now() }))
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

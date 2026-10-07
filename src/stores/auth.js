import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { isDemoBackend, repository } from '@/data/repository'
import { business } from '@/data/business'

const KEY = 'bookingpro:session:v1'

/** @typedef {'operator' | 'customer'} AppRole */

/**
 * @typedef {object} SessionUser
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {AppRole} role
 */

/**
 * The session, from the Laravel API when configured and from localStorage when
 * not.
 *
 * The public surface is the same either way — user, isAuthenticated,
 * isOperator, signIn, signOut — so the router guard and every screen work
 * against both. The demo path is still a session that verifies nothing, and
 * says so on the login screen; it exists so the app is usable with no setup.
 *
 * Role comes from the server's own response to /auth/me, never from anything
 * the client stored. A role kept in localStorage beside the token would make
 * "operator" a thing the user could type into devtools; here the token is the
 * only thing the client holds, and the server decides what it means.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)

  /**
   * False until the session has been resolved.
   *
   * This is the whole reason the guard had to change. Restoring a session
   * means asking the server whether the stored token is still good, so a
   * synchronous `isAuthenticated` check on a hard load of /app is answered
   * before the answer exists — and bounces a signed-in operator to the login
   * screen. The guard waits on this instead.
   */
  const initialised = ref(false)

  const isAuthenticated = computed(() => user.value !== null)
  const isOperator = computed(() => user.value?.role === 'operator')

  /* ------------------------------------------------------------ demo mode */

  function readLocalSession() {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  /* ---------------------------------------------------------------- init */

  async function init() {
    if (initialised.value) return

    if (isDemoBackend) {
      user.value = readLocalSession()
      initialised.value = true
      return
    }

    const { request, readToken, writeToken } = await import('@/data/api/client')
    if (!readToken()) {
      initialised.value = true
      return
    }
    try {
      const data = await request('/auth/me')
      user.value = data.user
    } catch {
      // Expired, revoked, or signed out from another device. Clearing it here
      // is what stops a dead token being retried on every subsequent request.
      writeToken(null)
      user.value = null
    }
    initialised.value = true
  }

  /* -------------------------------------------------------------- actions */

  async function signIn(email, password) {
    if (isDemoBackend) {
      const session = {
        id: 'demo-operator',
        name: 'مدير النظام',
        email,
        role: 'operator',
        orgSlug: business.slug,
      }
      user.value = session
      try {
        localStorage.setItem(KEY, JSON.stringify(session))
      } catch {
        /* session stays in memory only */
      }
      return session
    }

    const { request, writeToken } = await import('@/data/api/client')
    const data = await request('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    })
    writeToken(data.token)
    user.value = data.user
    return data.user
  }

  async function signUp(email, password, fullName) {
    if (isDemoBackend) {
      // The demo verifies nothing, so signing up is signing in.
      await signIn(email, password)
      if (user.value) user.value.name = fullName || user.value.name
      return
    }
    const { request } = await import('@/data/api/client')
    // Role is not sent here on purpose. The server would ignore it — the
    // column is not fillable — but not sending it is the clearer statement:
    // operator access is granted server-side, never claimed at sign-up.
    await request('/auth/register', {
      method: 'POST',
      body: { email, password, fullName },
      auth: false,
    })
  }

  /**
   * Open a business: the owner's account, the business, its staff, services
   * and hours, then signed straight in as its operator.
   *
   * @param {{ fullName: string, email: string, password: string,
   *   business: { name: string, slug: string, category?: string, address?: string },
   *   staff: { name: string, role?: string }[],
   *   services: { name: string, category?: string, durationMin: number,
   *     priceMinor: number, iconKey?: string }[],
   *   hours: { weekday: number, open: string, close: string, isClosed: boolean }[] }} input
   */
  async function signUpBusiness(input) {
    if (isDemoBackend) {
      const staff = input.staff.map((m, i) => ({
        id: `r_${i + 1}_${Date.now().toString(36)}`,
        name: m.name,
        role: m.role || null,
        isActive: true,
      }))
      await repository.openBusiness({
        business: { ...input.business },
        resources: staff,
        services: input.services.map((s, i) => ({
          id: `s_${i + 1}_${Date.now().toString(36)}`,
          name: s.name,
          category: s.category || null,
          description: '',
          durationMin: s.durationMin,
          bufferMin: 10,
          priceMinor: s.priceMinor,
          resourceIds: staff.map((r) => r.id),
          iconKey: s.iconKey || 'Sparkles',
          isActive: true,
        })),
        businessHours: input.hours,
      })
      const session = {
        id: 'demo-operator',
        name: input.fullName,
        email: input.email,
        role: 'operator',
        orgSlug: input.business.slug,
      }
      user.value = session
      try {
        localStorage.setItem(KEY, JSON.stringify(session))
      } catch {
        /* session stays in memory only */
      }
      return session
    }

    const { request, writeToken } = await import('@/data/api/client')
    const data = await request('/auth/register-business', {
      method: 'POST',
      body: input,
      auth: false,
    })
    writeToken(data.token)
    user.value = data.user
    return data.user
  }

  /** Is waeda.app/b/{slug} free? Always, on the demo, unless it is the clinic's. */
  async function slugAvailable(slug) {
    if (isDemoBackend) return slug !== 'alrayhan'
    const { request } = await import('@/data/api/client')
    const r = await request(`/auth/slug-available?slug=${encodeURIComponent(slug)}`, {
      auth: false,
    })
    return r.available
  }

  /* ------------------------------------------------- forgotten password */

  const RESET_KEY = 'bookingpro:reset:v1'
  const RESET_TTL_MS = 60 * 60_000

  /**
   * Ask for a reset link. The server answers the same for any address. The
   * demo sends no mail, so it hands the link back for the page to show —
   * the same stand-in the guest page uses for its WhatsApp code.
   */
  async function requestPasswordReset(email) {
    if (isDemoBackend) {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('')
      try {
        localStorage.setItem(
          RESET_KEY,
          JSON.stringify({ email, token, expires: Date.now() + RESET_TTL_MS }),
        )
      } catch {
        /* the link below still carries everything */
      }
      return { demoLink: `/reset-password?${new URLSearchParams({ token, email })}` }
    }
    const { request } = await import('@/data/api/client')
    await request('/auth/forgot-password', { method: 'POST', body: { email }, auth: false })
    return {}
  }

  /** Set the new password from the link. Throws `{ status: 422 }` on a dead link. */
  async function resetPassword({ token, email, password }) {
    if (isDemoBackend) {
      let saved = null
      try {
        saved = JSON.parse(localStorage.getItem(RESET_KEY) ?? 'null')
      } catch {
        /* treated as no link */
      }
      if (!saved || saved.token !== token || saved.email !== email || saved.expires < Date.now())
        throw Object.assign(new Error('invalid token'), { status: 422 })
      localStorage.removeItem(RESET_KEY)
      return
    }
    const { request } = await import('@/data/api/client')
    await request('/auth/reset-password', {
      method: 'POST',
      body: { token, email, password, password_confirmation: password },
      auth: false,
    })
  }

  async function signOut() {
    const wasSignedIn = user.value !== null
    user.value = null
    if (isDemoBackend) {
      localStorage.removeItem(KEY)
      return
    }
    const { request, writeToken } = await import('@/data/api/client')
    try {
      if (wasSignedIn) await request('/auth/logout', { method: 'POST' })
    } catch {
      // The token may already be dead. Either way the client is signed out;
      // failing to revoke server-side must not leave the user stuck signed in.
    }
    writeToken(null)
  }

  return {
    user,
    initialised,
    isAuthenticated,
    isOperator,
    init,
    signIn,
    signUp,
    signUpBusiness,
    slugAvailable,
    requestPasswordReset,
    resetPassword,
    signOut,
  }
})

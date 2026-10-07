/**
 * The HTTP client for the Laravel API, or null when the app runs on local
 * storage.
 *
 * One env var decides: with VITE_API_URL set the app talks to Laravel and
 * MySQL; without it, to localStorage. Nothing else here is secret — the API
 * URL is public by definition, and every rule that protects the data lives on
 * the server, in policies and in the booking transaction. There is no key to
 * ship, which is the one thing this arrangement has over the previous one.
 */
const BASE = import.meta.env.VITE_API_URL

export const isApiConfigured = Boolean(BASE)

const TOKEN_KEY = 'bookingpro:token:v1'

export function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode — the token stays in memory for this tab only */
  }
}

/**
 * The business a guest page names in its link (/b/{slug}). Sent as X-Org so
 * the API answers for that business; cleared on every other route, so the
 * console never sends it.
 */
let publicOrg = null
export function setPublicOrg(slug) {
  publicOrg = slug || null
}

/** Thrown for any non-2xx response, carrying the status so callers can branch. */
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown, auth?: boolean }} [opts]
 */
export async function request(path, opts = {}) {
  if (!BASE) throw new Error('VITE_API_URL is not set')

  const headers = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (publicOrg) headers['X-Org'] = publicOrg

  // Guest endpoints are reachable without a session; sending a stale token
  // to them would turn a public read into a 401 for no reason.
  if (opts.auth !== false) {
    const token = readToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })

  if (res.status === 204) return null

  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(res.status, body)
  return body
}

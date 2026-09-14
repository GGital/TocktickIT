/** One error shape for the whole client, matching the API envelope (api-spec §1.2). */
export class ApiError extends Error {
  status: number
  code: string
  fields?: { field: string; message: string }[]

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: { field: string; message: string }[],
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

const unauthenticatedListeners = new Set<() => void>()

/**
 * Subscribes to "the session is gone". AuthProvider is the one subscriber: it drops the user, and the route
 * guard sends the browser to /login. Returns the unsubscribe function, so it doubles as an effect cleanup.
 */
export function onUnauthenticated(listener: () => void) {
  unauthenticatedListeners.add(listener)
  return () => void unauthenticatedListeners.delete(listener)
}

/** Turns a non-2xx response into an ApiError, reporting a lost session first. */
async function toApiError(response: Response) {
  const body = await response.json().catch(() => null)
  const code = body?.error?.code ?? 'INTERNAL_ERROR'
  const message = body?.error?.message ?? 'Something went wrong. Please try again.'

  // Only a missing or expired session redirects. A failed login is also a 401, but it is
  // INVALID_CREDENTIALS and belongs to the Login form (BR-01, FR-05).
  if (code === 'UNAUTHENTICATED') unauthenticatedListeners.forEach((listener) => listener())

  return new ApiError(response.status, code, message, body?.error?.fields)
}

/**
 * The single place every request leaves the client. Identity is the HttpOnly session cookie, which the
 * browser attaches itself; no identifier is ever added here (BR-03, BR-18).
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: 'same-origin' })
  if (!response.ok) throw await toApiError(response)

  return response.json() as Promise<T>
}

/** Binary variant for attachment bytes, downloaded through fetch so failures surface as ApiError. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin' })
  if (!response.ok) throw await toApiError(response)

  return response.blob()
}

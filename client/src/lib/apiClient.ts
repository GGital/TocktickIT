import { clearRequesterId, getRequesterId } from './requesterContext'

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

/** Attaches the simulated requester context to every request (BR-48). */
function contextHeaders(init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const requesterId = getRequesterId()
  if (requesterId !== null) headers.set('X-Requester-Id', String(requesterId))

  return headers
}

/** Turns a non-2xx response into an ApiError, invalidating a rejected context first. */
async function toApiError(response: Response) {
  const body = await response.json().catch(() => null)
  const code = body?.error?.code ?? 'INTERNAL_ERROR'
  const message = body?.error?.message ?? 'Something went wrong. Please try again.'

  // An unknown or inactive requester invalidates the stored context immediately.
  if (code === 'REQUESTER_CONTEXT_INVALID') clearRequesterId({ wasRejected: true })

  return new ApiError(response.status, code, message, body?.error?.fields)
}

/**
 * The single place that attaches the requester context to a request (BR-48) and the
 * single place that reacts to the backend rejecting it (BR-11, AC-07). Lab 3 swaps
 * the header here for an authenticated identity and every caller stays as it is.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, headers: contextHeaders(init) })
  if (!response.ok) throw await toApiError(response)

  return response.json() as Promise<T>
}

/**
 * Binary variant for attachment bytes. A plain <a href> or <img src> cannot carry
 * the context header, so every download and preview goes through fetch and an
 * object URL instead — otherwise the API answers 400 REQUESTER_CONTEXT_MISSING.
 */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const response = await fetch(`/api${path}`, { headers: contextHeaders() })
  if (!response.ok) throw await toApiError(response)

  return response.blob()
}

export type Requester = {
  id: number
  fullName: string
  email: string
  department: string
}

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

/**
 * The single place that attaches the requester context to a request (BR-48) and the
 * single place that reacts to the backend rejecting it (BR-11, AC-07). Lab 3 swaps
 * the header here for an authenticated identity and every caller stays as it is.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const requesterId = getRequesterId()
  if (requesterId !== null) headers.set('X-Requester-Id', String(requesterId))

  const response = await fetch(`/api${path}`, { ...init, headers })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const code = body?.error?.code ?? 'INTERNAL_ERROR'
    const message = body?.error?.message ?? 'Something went wrong. Please try again.'

    // An unknown or inactive requester invalidates the stored context immediately.
    if (code === 'REQUESTER_CONTEXT_INVALID') clearRequesterId({ wasRejected: true })

    throw new ApiError(response.status, code, message, body?.error?.fields)
  }

  return response.json() as Promise<T>
}

export type Requester = {
  id: number
  fullName: string
  email: string
  department: string
}

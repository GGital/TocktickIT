import { useEffect, useState } from 'react'
import { apiFetch, type Requester } from './apiClient'
import { clearRequesterId, useRequesterId } from './requesterContext'

/**
 * Resolves the selected Development Requester to a display name. The context
 * itself is only an id (BR-10); an id missing from the active list means the
 * stored context is no longer usable, so it is cleared (BR-11).
 */
export function useCurrentRequester(): Requester | null {
  const requesterId = useRequesterId()
  const [requester, setRequester] = useState<Requester | null>(null)

  useEffect(() => {
    if (requesterId === null) return

    let active = true
    apiFetch<Requester[]>('/requesters')
      .then((requesters) => {
        if (!active) return
        const match = requesters.find((candidate) => candidate.id === requesterId)
        if (match) setRequester(match)
        else clearRequesterId({ wasRejected: true })
      })
      .catch(() => active && setRequester(null))

    return () => {
      active = false
    }
  }, [requesterId])

  return requester
}

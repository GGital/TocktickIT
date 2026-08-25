import { useSyncExternalStore } from 'react'

/**
 * The Development Requester context (BR-08, BR-10, BR-48). This is a Lab 2 testing
 * mechanism, not authentication — Lab 3 replaces this one module and the header it
 * feeds with an authenticated identity, and no screen or route handler changes.
 */
export const REQUESTER_ID_KEY = 'toktickit.requesterId'

const listeners = new Set<() => void>()
// Set when the backend rejected the stored id, so the selection screen can explain why.
let rejected = false

const emit = () => listeners.forEach((listener) => listener())

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Raw stored value — the snapshot must be a stable string for useSyncExternalStore. */
const readRaw = () => localStorage.getItem(REQUESTER_ID_KEY)

export function getRequesterId(): number | null {
  const raw = readRaw()
  if (!raw || !/^\d+$/.test(raw)) return null

  const id = Number(raw)
  return id > 0 ? id : null
}

export function setRequesterId(id: number) {
  localStorage.setItem(REQUESTER_ID_KEY, String(id))
  rejected = false
  emit()
}

/** `wasRejected` marks a context the backend refused (403), not a deliberate change. */
export function clearRequesterId({ wasRejected = false } = {}) {
  localStorage.removeItem(REQUESTER_ID_KEY)
  rejected = wasRejected
  emit()
}

export const contextWasRejected = () => rejected

/** Re-renders every consumer when the context is set, cleared, or rejected (BR-12). */
export function useRequesterId(): number | null {
  useSyncExternalStore(subscribe, readRaw, () => null)
  return getRequesterId()
}

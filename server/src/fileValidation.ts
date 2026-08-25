import { randomUUID } from 'node:crypto'

/** BR-24: 5 MB per file, inclusive. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** BR-27: the extension stored on disk is normalised, never the client's spelling. */
const MIME_EXTENSION = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
} as const

export type PermittedMime = keyof typeof MIME_EXTENSION

const EXTENSION_MIME: Record<string, PermittedMime> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
}

const startsWith = (buffer: Buffer, bytes: number[], offset = 0) =>
  bytes.every((byte, index) => buffer[offset + index] === byte)

/**
 * BR-23: the type is decided by the file's own leading bytes. The client-supplied
 * Content-Type is never consulted, so renaming a PDF to .png cannot smuggle it in.
 */
export function detectMimeType(buffer: Buffer): PermittedMime | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  // RIFF....WEBP
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp'
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'

  return null
}

export const extensionOf = (filename: string) => {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot).toLowerCase()
}

/**
 * The declared extension and the signature must agree (BR-23, AC-19). Returns the
 * signature-derived type, which is what gets stored.
 */
export function resolveUploadType(filename: string, buffer: Buffer): PermittedMime | null {
  const declared = EXTENSION_MIME[extensionOf(filename)]
  if (!declared) return null

  const detected = detectMimeType(buffer)
  return detected && detected === declared ? detected : null
}

export const isWithinSizeLimit = (sizeBytes: number) => sizeBytes <= MAX_FILE_BYTES

/**
 * BR-27, AC-30: the display name may never influence a path. Anything carrying a
 * separator, a traversal sequence, or a drive letter is rejected outright rather
 * than "cleaned", and the surviving name is capped at 255 characters.
 */
export function sanitizeOriginalFilename(filename: unknown): string | null {
  if (typeof filename !== 'string') return null

  const trimmed = filename.trim()
  if (trimmed.length === 0) return null
  if (trimmed.includes('/') || trimmed.includes('\\')) return null
  if (trimmed.split('.').includes('..') || trimmed.includes('..')) return null
  if (/^[a-zA-Z]:/.test(trimmed)) return null
  if (trimmed.startsWith('.')) return null

  return trimmed.slice(0, 255)
}

/** BR-27: a server-generated UUID plus the normalised extension for the resolved type. */
export const buildStoredFilename = (mimeType: PermittedMime) =>
  `${randomUUID()}${MIME_EXTENSION[mimeType]}`

/** BR-17: removal reason is 5–200 characters after trimming. */
export function validateRemovalReason(value: unknown): { reason?: string; error?: string } {
  const reason = typeof value === 'string' ? value.trim() : ''

  return reason.length < 5 || reason.length > 200
    ? { error: 'Removal reason must be between 5 and 200 characters.' }
    : { reason }
}

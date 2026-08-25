import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Request, Response } from 'express'
import multer from 'multer'
import { sendError } from './errors.js'
import {
  MAX_FILE_BYTES,
  buildStoredFilename,
  isWithinSizeLimit,
  resolveUploadType,
  sanitizeOriginalFilename,
  validateRemovalReason,
} from './fileValidation.js'
import { prisma } from './prisma.js'

/**
 * Uploads live outside any static mount: every byte is served by the
 * ownership-checked download route (BR-27, X-01). Resolved from this file, not
 * from cwd, so the server and the test runner agree on one directory.
 */
export const UPLOADS_ROOT = path.resolve(import.meta.dirname, '..', 'uploads')

// Memory storage plus an explicit write keeps the compensating delete honest: the
// file only exists once we decided to keep it (BR-28). The parser limit sits one
// byte above the rule so the parser aborts anything larger, while the exact 5 MB
// boundary stays inclusive and is decided by the size check below (BR-24).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES + 1 },
})

const MAX_ACTIVE_ATTACHMENTS = 5

const attachmentSelect = {
  id: true,
  ticketId: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  uploadedAt: true,
  removedAt: true,
  removalReason: true,
  uploadedBy: { select: { id: true, fullName: true } },
  removedBy: { select: { id: true, fullName: true } },
} as const

type AttachmentRow = {
  id: number
  ticketId: number
  originalFilename: string
  mimeType: string
  sizeBytes: number
  uploadedAt: Date
  removedAt: Date | null
  removalReason: string | null
  uploadedBy: { id: number; fullName: string }
  removedBy: { id: number; fullName: string } | null
}

/** api-spec §2.6. storedFilename never leaves the server, and a removed row has no downloadUrl. */
export function toAttachmentShape(row: AttachmentRow) {
  const isRemoved = row.removedAt !== null

  return {
    id: row.id,
    ticketId: row.ticketId,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt,
    isRemoved,
    removedAt: row.removedAt,
    removalReason: row.removalReason,
    removedBy: row.removedBy,
    downloadUrl: isRemoved ? null : `/api/attachments/${row.id}/download`,
  }
}

const parseId = (value: string | string[] | undefined) =>
  typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null

/** Ownership is part of the lookup itself, never a comparison afterwards (BR-15). */
const findOwnedTicket = (id: number, requesterId: number) =>
  prisma.ticket.findFirst({ where: { id, requesterId }, select: { id: true } })

const findOwnedAttachment = (id: number, requesterId: number) =>
  prisma.attachment.findFirst({
    where: { id, ticket: { requesterId } },
    select: { ...attachmentSelect, storedFilename: true },
  })

const runMulter = (req: Request, res: Response) =>
  new Promise<void>((resolve, reject) => {
    upload.single('file')(req, res, (error: unknown) => (error ? reject(error) : resolve()))
  })

/** `POST /api/tickets/:id/attachments` (api-spec §3.8). One file per request (A-04). */
export async function uploadAttachment(req: Request, res: Response) {
  const ticketId = parseId(req.params.id)
  if (ticketId === null) {
    return sendError(res, 'INVALID_PATH_PARAMETER', 'The ticket id must be a positive integer.')
  }

  // Ownership is resolved before the body is read, so a non-owner never learns
  // anything about the ticket — not even that their file was too large (BR-14).
  const ticket = await findOwnedTicket(ticketId, req.requester!.id)
  if (!ticket) return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found.')

  try {
    await runMulter(req, res)
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 'FILE_TOO_LARGE', 'Each file must be 5 MB or smaller.')
    }
    throw error
  }

  const file = req.file
  if (!file) return sendError(res, 'NO_FILE_UPLOADED', 'Choose a file to upload.')

  if (!isWithinSizeLimit(file.size)) {
    return sendError(res, 'FILE_TOO_LARGE', 'Each file must be 5 MB or smaller.')
  }

  const originalFilename = sanitizeOriginalFilename(file.originalname)
  if (!originalFilename) {
    return sendError(res, 'VALIDATION_FAILED', 'That filename is not allowed.', [
      { field: 'file', message: 'The file name must not contain a path.' },
    ])
  }

  const mimeType = resolveUploadType(originalFilename, file.buffer)
  if (!mimeType) {
    return sendError(res, 'UNSUPPORTED_FILE_TYPE', 'Only JPG, PNG, WEBP, and PDF files are allowed.')
  }

  // Removed attachments do not consume a slot (BR-25, AC-22).
  const activeCount = await prisma.attachment.count({
    where: { ticketId, removedAt: null },
  })
  if (activeCount >= MAX_ACTIVE_ATTACHMENTS) {
    return sendError(
      res,
      'ATTACHMENT_LIMIT_REACHED',
      'This ticket already has five active attachments. Remove one to add another.',
    )
  }

  const storedFilename = buildStoredFilename(mimeType)
  const directory = path.join(UPLOADS_ROOT, String(ticketId))
  const storedPath = path.join(directory, storedFilename)

  await mkdir(directory, { recursive: true })
  await writeFile(storedPath, file.buffer)

  try {
    const attachment = await prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          ticketId,
          originalFilename,
          storedFilename,
          mimeType,
          sizeBytes: file.size,
          uploadedById: req.requester!.id,
        },
        select: attachmentSelect,
      })

      // An attachment change is the one thing that moves a ticket's Last Updated (BR-07).
      await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } })
      return created
    })

    res.status(201).json(toAttachmentShape(attachment))
  } catch (error) {
    // Compensating action: the row never landed, so the bytes must not survive (BR-28).
    await unlink(storedPath).catch(() => {})
    throw error
  }
}

/** `GET /api/tickets/:id/attachments` (api-spec §3.9). Active and removed alike (BR-32). */
export async function listAttachments(req: Request, res: Response) {
  const ticketId = parseId(req.params.id)
  if (ticketId === null) {
    return sendError(res, 'INVALID_PATH_PARAMETER', 'The ticket id must be a positive integer.')
  }

  const ticket = await findOwnedTicket(ticketId, req.requester!.id)
  if (!ticket) return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found.')

  const attachments = await prisma.attachment.findMany({
    where: { ticketId },
    orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
    select: attachmentSelect,
  })

  res.json(attachments.map(toAttachmentShape))
}

/** `GET /api/attachments/:id/download` (api-spec §3.10). */
export async function downloadAttachment(req: Request, res: Response) {
  const attachmentId = parseId(req.params.id)
  if (attachmentId === null) {
    return sendError(res, 'INVALID_PATH_PARAMETER', 'The attachment id must be a positive integer.')
  }

  const attachment = await findOwnedAttachment(attachmentId, req.requester!.id)
  // Ownership is answered before removal, so a non-owner never learns that an
  // attachment was removed — they see the same 404 as for an unknown id (AC-42).
  if (!attachment) return sendError(res, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.')

  if (attachment.removedAt !== null) {
    return sendError(res, 'ATTACHMENT_REMOVED', 'This attachment has been removed.')
  }

  const storedPath = path.join(UPLOADS_ROOT, String(attachment.ticketId), attachment.storedFilename)

  let bytes: Buffer
  try {
    bytes = await readFile(storedPath)
  } catch (error) {
    console.error('Attachment row has no file on disk', { id: attachment.id, error })
    return sendError(res, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
  }

  const name = encodeURIComponent(attachment.originalFilename)
  res.set({
    'Content-Type': attachment.mimeType,
    'Content-Length': String(attachment.sizeBytes),
    'Content-Disposition': `attachment; filename="${attachment.originalFilename}"; filename*=UTF-8''${name}`,
    // Nothing uploaded here may ever be re-interpreted as HTML by the browser.
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(bytes)
}

/** `DELETE /api/attachments/:id` (api-spec §3.11). Soft removal only — nothing is deleted (BR-30). */
export async function removeAttachment(req: Request, res: Response) {
  const attachmentId = parseId(req.params.id)
  if (attachmentId === null) {
    return sendError(res, 'INVALID_PATH_PARAMETER', 'The attachment id must be a positive integer.')
  }

  const attachment = await findOwnedAttachment(attachmentId, req.requester!.id)
  if (!attachment) return sendError(res, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.')

  if (attachment.removedAt !== null) {
    return sendError(res, 'ALREADY_REMOVED', 'This attachment has already been removed.')
  }

  const { reason, error } = validateRemovalReason((req.body as Record<string, unknown>)?.removalReason)
  if (error) {
    return sendError(res, 'VALIDATION_FAILED', 'A removal reason is required.', [
      { field: 'removalReason', message: error },
    ])
  }

  const removed = await prisma.$transaction(async (tx) => {
    // The three removal columns are written together, never separately, so
    // "removed" and "when/why/who" can never disagree (specification §7.4).
    const updated = await tx.attachment.update({
      where: { id: attachment.id },
      data: { removedAt: new Date(), removalReason: reason, removedById: req.requester!.id },
      select: attachmentSelect,
    })

    await tx.ticket.update({ where: { id: attachment.ticketId }, data: { updatedAt: new Date() } })
    return updated
  })

  res.json(toAttachmentShape(removed))
}

import { access, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import app from '../../src/app.js'
import { UPLOADS_ROOT } from '../../src/attachments.js'
import { prisma } from '../../src/prisma.js'

const emailA = 'attachments-a@toktickit.test'
const emailB = 'attachments-b@toktickit.test'

let requesterA: number
let requesterB: number
let ticketA: number
let ticketB: number

// Valid leading bytes plus filler, so the detector sees a real signature.
const pngBytes = (size = 64) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(Math.max(0, size - 8), 7),
  ])
const pdfBytes = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 3)])
const exeBytes = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(64, 1)])

const upload = (
  ticketId: number,
  buffer: Buffer,
  filename: string,
  requesterId: number = requesterA,
) =>
  request(app)
    .post(`/api/tickets/${ticketId}/attachments`)
    .set('X-Requester-Id', String(requesterId))
    .attach('file', buffer, filename)

const filesIn = async (ticketId: number) =>
  readdir(path.join(UPLOADS_ROOT, String(ticketId))).catch(() => [] as string[])

const exists = (target: string) =>
  access(target).then(
    () => true,
    () => false,
  )

let ticketCounter = 0

async function createTicket(requesterId: number) {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber: `TKT-TEST-ATTACH-${(ticketCounter += 1)}-${requesterId}`,
      requesterId,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary: 'Attachment fixture ticket for the API suite',
      description: 'Created by the attachment API suite so uploads have a parent ticket.',
      requestedPriority: 'MEDIUM',
    },
  })

  return ticket.id
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.requesterUser.upsert({
      where: { email: emailA },
      update: { isActive: true },
      create: { email: emailA, fullName: 'Attachment Owner A', department: 'QA' },
    }),
    prisma.requesterUser.upsert({
      where: { email: emailB },
      update: { isActive: true },
      create: { email: emailB, fullName: 'Attachment Owner B', department: 'QA' },
    }),
  ])
  requesterA = a.id
  requesterB = b.id

  ticketA = await createTicket(requesterA)
  ticketB = await createTicket(requesterB)
})

afterEach(() => vi.restoreAllMocks())

afterAll(async () => {
  const tickets = await prisma.ticket.findMany({
    where: { requesterId: { in: [requesterA, requesterB] } },
    select: { id: true },
  })

  await Promise.all(
    tickets.map((ticket) =>
      rm(path.join(UPLOADS_ROOT, String(ticket.id)), { recursive: true, force: true }),
    ),
  )

  // Attachments cascade with their ticket; the requester foreign key is Restrict.
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterA, requesterB] } } })
  await prisma.requesterUser.deleteMany({ where: { email: { in: [emailA, emailB] } } })
  await prisma.$disconnect()
})

describe('API-35 upload a valid file (AC-18, BR-26)', () => {
  it('returns complete metadata, writes the file, and refreshes the ticket', async () => {
    const ticketId = await createTicket(requesterA)
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })

    const res = await upload(ticketId, pngBytes(1024), 'screenshot.png')

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      ticketId,
      originalFilename: 'screenshot.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      isRemoved: false,
      removedAt: null,
      removalReason: null,
      removedBy: null,
      uploadedBy: { id: requesterA, fullName: 'Attachment Owner A' },
      downloadUrl: `/api/attachments/${res.body.id}/download`,
    })
    expect(res.body.uploadedAt).toEqual(expect.any(String))

    const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(await exists(path.join(UPLOADS_ROOT, String(ticketId), stored.storedFilename))).toBe(
      true,
    )

    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
  })
})

describe('API-36 stored name is server-generated (AC-30, BR-27)', () => {
  it('uses a UUID plus a normalised extension and never returns it', async () => {
    const ticketId = await createTicket(requesterA)
    const res = await upload(ticketId, pdfBytes, 'battery-report.pdf')

    expect(res.status).toBe(201)
    expect(res.body).not.toHaveProperty('storedFilename')
    expect(res.body.originalFilename).toBe('battery-report.pdf')

    const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(stored.storedFilename).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/,
    )
  })
})

describe('API-37 path traversal in the filename (AC-30, BR-27)', () => {
  it('cannot escape the upload directory with a traversal filename', async () => {
    const ticketId = await createTicket(requesterA)
    // Sent by hand: a multipart client rewrites the filename before it leaves, and
    // the rule is about what an attacker can actually put on the wire.
    const boundary = 'traversal-boundary'
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="../../evil.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      pngBytes(),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .set('X-Requester-Id', String(requesterA))
      .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
      .send(body)

    // Nothing lands outside the ticket's own directory, whatever the request claimed.
    expect(await exists(path.join(UPLOADS_ROOT, '..', '..', 'evil.png'))).toBe(false)
    expect(await exists(path.join(UPLOADS_ROOT, '..', 'evil.png'))).toBe(false)
    expect(await exists(path.join(UPLOADS_ROOT, 'evil.png'))).toBe(false)

    if (res.status === 201) {
      // The parser normalised the name away, so the request survives — but the
      // stored name is still a server-generated UUID and the display name carries
      // no path (BR-27). The rejection path itself is covered by UNIT-07.
      const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: res.body.id } })
      expect(stored.originalFilename).not.toMatch(/[\\/]|\.\./)
      expect(stored.storedFilename).toMatch(/^[0-9a-f-]{36}\.png$/)
      expect(await filesIn(ticketId)).toEqual([stored.storedFilename])
    } else {
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_FAILED')
      expect(res.body.error.fields[0].field).toBe('file')
      expect(await filesIn(ticketId)).toEqual([])
    }
  })
})

describe('API-38 unsupported types (AC-19, BR-23)', () => {
  it('rejects an executable and a PDF wearing a .png name, persisting neither', async () => {
    const ticketId = await createTicket(requesterA)
    const before = await prisma.attachment.count({ where: { ticketId } })

    const executable = await upload(ticketId, exeBytes, 'not-an-image.exe')
    const disguised = await upload(ticketId, pdfBytes, 'fake.png')

    expect(executable.status).toBe(415)
    expect(executable.body.error.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect(disguised.status).toBe(415)
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(before)
  })
})

describe('API-39 oversized file (AC-20, BR-24)', () => {
  it('rejects 6 MB with 413 and leaves the upload directory untouched', async () => {
    const ticketId = await createTicket(requesterA)
    const before = await filesIn(ticketId)

    const res = await upload(ticketId, pngBytes(6 * 1024 * 1024), 'huge.png')

    expect(res.status).toBe(413)
    expect(res.body.error.code).toBe('FILE_TOO_LARGE')
    expect(await filesIn(ticketId)).toEqual(before)
  })
})

describe('API-40 the size boundary is inclusive (BR-24)', () => {
  it('accepts a file of exactly 5 MB', async () => {
    const ticketId = await createTicket(requesterA)
    const res = await upload(ticketId, pngBytes(5 * 1024 * 1024), 'exactly-five.png')

    expect(res.status).toBe(201)
    expect(res.body.sizeBytes).toBe(5 * 1024 * 1024)
  })
})

describe('API-41 / API-42 active attachment limit (AC-21, AC-22, BR-25)', () => {
  it('rejects the sixth active file, then accepts one after a removal', async () => {
    const ticketId = await createTicket(requesterA)

    for (let index = 0; index < 5; index += 1) {
      expect((await upload(ticketId, pngBytes(), `file-${index}.png`)).status).toBe(201)
    }

    const sixth = await upload(ticketId, pngBytes(), 'sixth.png')
    expect(sixth.status).toBe(409)
    expect(sixth.body.error.code).toBe('ATTACHMENT_LIMIT_REACHED')

    const first = await prisma.attachment.findFirstOrThrow({ where: { ticketId } })
    await request(app)
      .delete(`/api/attachments/${first.id}`)
      .set('X-Requester-Id', String(requesterA))
      .send({ removalReason: 'Uploaded the wrong screenshot' })
      .expect(200)

    // A removed attachment does not consume a slot.
    expect((await upload(ticketId, pngBytes(), 'replacement.png')).status).toBe(201)
  })
})

describe('API-43 upload to a ticket owned by someone else (BR-14)', () => {
  it('answers 404 and writes nothing', async () => {
    const before = await filesIn(ticketA)

    const res = await upload(ticketA, pngBytes(), 'intruder.png', requesterB)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('TICKET_NOT_FOUND')
    expect(await filesIn(ticketA)).toEqual(before)
    expect(await prisma.attachment.count({ where: { ticketId: ticketA } })).toBe(0)
  })
})

describe('API-44 multipart request with no file part (api-spec §3.8)', () => {
  it('answers 400 NO_FILE_UPLOADED', async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketA}/attachments`)
      .set('X-Requester-Id', String(requesterA))
      .field('note', 'no file here')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('NO_FILE_UPLOADED')
  })
})

describe('API-45 download an active attachment (AC-24, BR-14)', () => {
  it('returns the original bytes with a safe disposition and nosniff', async () => {
    const ticketId = await createTicket(requesterA)
    const bytes = pngBytes(2048)
    const created = await upload(ticketId, bytes, 'battery-photo.png')

    const res = await request(app)
      .get(`/api/attachments/${created.body.id}/download`)
      .set('X-Requester-Id', String(requesterA))
      .buffer()
      .parse((response, callback) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => callback(null, Buffer.concat(chunks)))
      })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['content-disposition']).toContain('filename="battery-photo.png"')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(Buffer.compare(res.body as Buffer, bytes)).toBe(0)
  })
})

describe('API-46 – API-49 soft removal (AC-25, AC-26, AC-28, AC-29)', () => {
  it('removes softly, blocks the download, and refuses a second removal', async () => {
    const ticketId = await createTicket(requesterA)
    const created = await upload(ticketId, pngBytes(), 'wrong-screenshot.png')
    const attachmentId = created.body.id as number
    const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } })
    const storedPath = path.join(UPLOADS_ROOT, String(ticketId), stored.storedFilename)

    const remove = (removalReason?: string) =>
      request(app)
        .delete(`/api/attachments/${attachmentId}`)
        .set('X-Requester-Id', String(requesterA))
        .send(removalReason === undefined ? {} : { removalReason })

    // API-48: no reason, then a 4-character reason — the attachment stays active.
    expect((await remove()).status).toBe(400)
    const short = await remove('four')
    expect(short.status).toBe(400)
    expect(short.body.error.fields[0].field).toBe('removalReason')
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } })).removedAt)
      .toBeNull()

    // API-46: a valid removal writes all three columns and keeps row and file.
    const removed = await remove('Uploaded the wrong screenshot')
    expect(removed.status).toBe(200)
    expect(removed.body.isRemoved).toBe(true)
    expect(removed.body.downloadUrl).toBeNull()
    expect(removed.body.removalReason).toBe('Uploaded the wrong screenshot')
    expect(removed.body.removedBy).toEqual({ id: requesterA, fullName: 'Attachment Owner A' })

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } })
    expect(row.removedAt).not.toBeNull()
    expect(row.removedById).toBe(requesterA)
    expect(await exists(storedPath)).toBe(true)

    // API-47: the bytes are unreachable even though they still exist.
    const download = await request(app)
      .get(`/api/attachments/${attachmentId}/download`)
      .set('X-Requester-Id', String(requesterA))
    expect(download.status).toBe(410)
    expect(download.body.error.code).toBe('ATTACHMENT_REMOVED')

    // API-49: a second removal is refused and the original metadata survives.
    const again = await remove('A different reason entirely')
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('ALREADY_REMOVED')

    const unchanged = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } })
    expect(unchanged.removalReason).toBe('Uploaded the wrong screenshot')
    expect(unchanged.removedAt).toEqual(row.removedAt)
  })
})

describe('API-50 / API-51 cross-requester access (AC-42, BR-14)', () => {
  it('answers 404 for another requester, and 404 — not 410 — for a removed one', async () => {
    const ticketId = await createTicket(requesterA)
    const active = await upload(ticketId, pngBytes(), 'owner-only.png')
    const removed = await upload(ticketId, pngBytes(), 'owner-only-removed.png')

    await request(app)
      .delete(`/api/attachments/${removed.body.id}`)
      .set('X-Requester-Id', String(requesterA))
      .send({ removalReason: 'Removed before the ownership check' })
      .expect(200)

    const asIntruder = (id: number) =>
      request(app).get(`/api/attachments/${id}/download`).set('X-Requester-Id', String(requesterB))

    const download = await asIntruder(active.body.id)
    const removal = await request(app)
      .delete(`/api/attachments/${active.body.id}`)
      .set('X-Requester-Id', String(requesterB))
      .send({ removalReason: 'Not mine to remove' })

    expect(download.status).toBe(404)
    expect(download.body.error.code).toBe('ATTACHMENT_NOT_FOUND')
    expect(removal.status).toBe(404)
    expect(
      (await prisma.attachment.findUniqueOrThrow({ where: { id: active.body.id } })).removedAt,
    ).toBeNull()

    // A non-owner must not be able to tell a removed attachment from a missing one.
    const removedForIntruder = await asIntruder(removed.body.id)
    expect(removedForIntruder.status).toBe(404)
    expect(removedForIntruder.body).toEqual(download.body)
  })
})

describe('API-52 compensating delete (BR-28)', () => {
  it('deletes the written file when the row insert fails', async () => {
    const ticketId = await createTicket(requesterA)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(prisma, '$transaction').mockRejectedValue(new Error('insert failed'))

    const res = await upload(ticketId, pngBytes(), 'orphan.png')

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL_ERROR')
    expect(await filesIn(ticketId)).toEqual([])
    expect(await prisma.attachment.count({ where: { ticketId } })).toBe(0)
  })
})

describe('API-53 uploads are not served statically (BR-27, X-01)', () => {
  it('does not expose the storage directory over HTTP', async () => {
    const ticketId = await createTicket(requesterA)
    const created = await upload(ticketId, pngBytes(), 'never-static.png')
    const stored = await prisma.attachment.findUniqueOrThrow({ where: { id: created.body.id } })

    const direct = await request(app).get(`/uploads/${ticketId}/${stored.storedFilename}`)
    expect(direct.status).toBe(404)
    expect(direct.headers['content-type']).not.toContain('image/png')
  })
})

/**
 * Development demo data for Ticket Detail — NOT the seed.
 *
 * `prisma/seed.ts` stays reference-data only, because BR-46 requires it to create
 * no Tickets and no Attachments. This script is a separate, explicitly-invoked
 * tool for exercising the Ticket Detail screen by hand:
 *
 *   cd server && npm run seed:demo
 *
 * It is re-runnable: every demo ticket it recognises (by summary) is deleted with
 * its files first, then recreated, so ids move but nothing accumulates.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { UPLOADS_ROOT } from '../src/attachments.js'
import { bangkokYear, formatTicketNumber } from '../src/ticketNumber.js'

const prisma = new PrismaClient()

// A real 1x1 PNG and a minimal one-page PDF, so download and preview both work
// in the browser rather than returning bytes no viewer accepts.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
trailer<</Root 1 0 R>>
%%EOF
`,
  'binary',
)

type DemoAttachment = {
  originalFilename: string
  mimeType: 'image/png' | 'application/pdf'
  bytes: Buffer
  removal?: string
}

type DemoTicket = {
  /** Identifies the row on a re-run; keep these unique and stable. */
  summary: string
  description: string
  requestedPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  /** 0 = the first active seeded requester, 1 = the second, and so on. */
  owner: number
  attachments: DemoAttachment[]
}

const png = (name: string, removal?: string): DemoAttachment => ({
  originalFilename: name,
  mimeType: 'image/png',
  bytes: PNG,
  removal,
})

const pdf = (name: string): DemoAttachment => ({
  originalFilename: name,
  mimeType: 'application/pdf',
  bytes: PDF,
})

const DEMO_TICKETS: DemoTicket[] = [
  {
    // The main case: active files, an image preview, and one removed file with
    // its retained metadata (AC-24, AC-26, AC-27).
    summary: 'Laptop battery drains within thirty minutes',
    description:
      'The battery on my assigned corporate laptop drops from 100% to 15% in about half an hour, even with only a browser open. It started after the last Windows update.',
    requestedPriority: 'HIGH',
    owner: 0,
    attachments: [
      pdf('battery-report.pdf'),
      png('screenshot-error.png'),
      png('wrong-screenshot.png', 'Uploaded the wrong screenshot'),
    ],
  },
  {
    // Five active attachments: the limit state, with Add attachment disabled (AC-21).
    summary: 'Printer on the second floor jams on every duplex job',
    description:
      'Every double-sided print job jams around the third page. Single-sided printing is unaffected. Photos of the jam are attached.',
    requestedPriority: 'MEDIUM',
    owner: 0,
    attachments: [
      png('jam-one.png'),
      png('jam-two.png'),
      png('jam-three.png'),
      png('jam-four.png'),
      png('jam-five.png'),
    ],
  },
  {
    // No attachments: the empty attachment section.
    summary: 'Cannot connect to the VPN from off campus',
    description:
      'The VPN client reports a timeout whenever I connect from home. It works normally from the campus network.',
    requestedPriority: 'URGENT',
    owner: 0,
    attachments: [],
  },
  {
    // Owned by a different requester, so the cross-requester 404 can be shown by
    // opening this ticket's URL while testing as somebody else (AC-41, AC-44).
    summary: 'Grade submission app rejects my faculty login',
    description:
      'Signing in to the grade submission app returns "unknown account" even though the same credentials work everywhere else.',
    requestedPriority: 'HIGH',
    owner: 1,
    attachments: [pdf('login-error.pdf')],
  },
]

/** Same atomic statement the API uses, so demo numbers look like real ones (BR-03). */
async function nextTicketNumber(year: number) {
  const [counter] = await prisma.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "TicketNumberCounter" ("year", "lastValue")
    VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "lastValue" = "TicketNumberCounter"."lastValue" + 1
    RETURNING "lastValue"
  `

  return formatTicketNumber(year, counter.lastValue)
}

async function main() {
  const requesters = await prisma.requesterUser.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  })

  if (requesters.length < 2) {
    throw new Error('Run `npx prisma db seed` first: this script needs seeded active requesters.')
  }

  const summaries = DEMO_TICKETS.map((ticket) => ticket.summary)
  const existing = await prisma.ticket.findMany({
    where: { summary: { in: summaries } },
    select: { id: true },
  })

  // Delete first so a re-run replaces rather than duplicates. Attachments cascade
  // with the ticket; their files have to go explicitly.
  await Promise.all(
    existing.map((ticket) =>
      rm(path.join(UPLOADS_ROOT, String(ticket.id)), { recursive: true, force: true }),
    ),
  )
  await prisma.ticket.deleteMany({ where: { id: { in: existing.map((row) => row.id) } } })

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } })
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })
  const year = bangkokYear()

  for (const demo of DEMO_TICKETS) {
    const owner = requesters[demo.owner % requesters.length]

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: await nextTicketNumber(year),
        requesterId: owner.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: demo.summary,
        description: demo.description,
        requestedPriority: demo.requestedPriority,
      },
    })

    const directory = path.join(UPLOADS_ROOT, String(ticket.id))
    if (demo.attachments.length > 0) await mkdir(directory, { recursive: true })

    for (const file of demo.attachments) {
      // Stored names mirror the API's rule: a generated name, never the display one (BR-27).
      const storedFilename = `${crypto.randomUUID()}${file.mimeType === 'image/png' ? '.png' : '.pdf'}`
      await writeFile(path.join(directory, storedFilename), file.bytes)

      await prisma.attachment.create({
        data: {
          ticketId: ticket.id,
          originalFilename: file.originalFilename,
          storedFilename,
          mimeType: file.mimeType,
          sizeBytes: file.bytes.length,
          uploadedById: owner.id,
          // A removed attachment writes all three columns together (BR-30).
          ...(file.removal
            ? {
                removedAt: new Date(),
                removalReason: file.removal,
                removedById: owner.id,
              }
            : {}),
        },
      })
    }

    const active = demo.attachments.filter((file) => !file.removal).length
    const removed = demo.attachments.length - active
    console.log(
      `${ticket.ticketNumber}  /tickets/${ticket.id}  ${owner.fullName} — ${active} active, ${removed} removed`,
    )
  }

  console.log('\nSelect the matching requester on /select-requester, then open the URLs above.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

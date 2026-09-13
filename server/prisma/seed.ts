import { PrismaClient, type MessageVisibility, type RequestedPriority, type TicketStatus, type UserRole } from '@prisma/client'
import { hashPassword } from '../src/password.js'
import { bangkokYear, formatTicketNumber } from '../src/ticketNumber.js'

const prisma = new PrismaClient()

/**
 * LOCAL DEVELOPMENT ONLY. Every seeded account uses this initial password, and the Lab 3
 * migration backfills the same one into migrated Lab 2 users. Documented in README.md; never
 * used anywhere but a developer's own database (BR-12, BR-56).
 */
const LOCAL_DEV_PASSWORD = 'TokTick-Local-Dev-1'

// Order matters: these become ids 1-4 and the API returns categories in id order.
const categories = ['Account and Access', 'Hardware', 'Software', 'Network']

const relatedSystems = [
  'Email',
  'Campus Wi-Fi',
  'VPN',
  'LEB2 App',
  'Grade Submission App',
  'Printer',
  'Corporate Laptop',
]

type SeedUser = {
  email: string
  fullName: string
  department: string | null
  role: UserRole
  isActive: boolean
  /** false only for the accounts the E2E suite signs in with (spec §7.5, A-19). */
  mustChangePassword: boolean
}

// The five Lab 2 Requesters keep their emails, so a migrated database upserts them in place.
const users: SeedUser[] = [
  { email: 'napat.s@toktickit.dev', fullName: 'Napat Siriwat', department: 'Faculty of Engineering', role: 'REQUESTER', isActive: true, mustChangePassword: false },
  { email: 'pimchanok.t@toktickit.dev', fullName: 'Pimchanok Thanee', department: 'Registrar Office', role: 'REQUESTER', isActive: true, mustChangePassword: false },
  // The dedicated first-login account: E2E-03 is the only test that signs in with it.
  { email: 'kittipong.w@toktickit.dev', fullName: 'Kittipong Wong', department: 'Library Services', role: 'REQUESTER', isActive: true, mustChangePassword: true },
  { email: 'areeya.p@toktickit.dev', fullName: 'Areeya Pongsak', department: 'Finance Department', role: 'REQUESTER', isActive: true, mustChangePassword: true },
  { email: 'former.staff@toktickit.dev', fullName: 'Somchai Retired', department: 'Faculty of Science', role: 'REQUESTER', isActive: false, mustChangePassword: true },
  { email: 'thanawat.it@toktickit.dev', fullName: 'Thanawat Chaiyo', department: null, role: 'IT_STAFF', isActive: true, mustChangePassword: false },
  { email: 'malee.it@toktickit.dev', fullName: 'Malee Srisuk', department: null, role: 'IT_STAFF', isActive: true, mustChangePassword: false },
  { email: 'prasert.it@toktickit.dev', fullName: 'Prasert Boonmee', department: null, role: 'IT_STAFF', isActive: true, mustChangePassword: true },
  { email: 'former.it@toktickit.dev', fullName: 'Wichai Departed', department: null, role: 'IT_STAFF', isActive: false, mustChangePassword: true },
  { email: 'admin@toktickit.dev', fullName: 'Suda Administrator', department: null, role: 'ADMINISTRATOR', isActive: true, mustChangePassword: false },
]

type SeedMessage = { author: string; visibility: MessageVisibility; body: string; isSystem?: boolean }

type SeedTicket = {
  /** Identifies the row on a re-run; keep these unique and stable. */
  summary: string
  description: string
  requester: string
  category: string
  relatedSystem: string
  requestedPriority: RequestedPriority
  itPriority: RequestedPriority
  status: TicketStatus
  assignee: string | null
  flagged?: boolean
  daysAgo: number
  messages?: SeedMessage[]
}

// Every status, every IT Priority, owned and unowned. Seed data obeys the rules the API enforces:
// NEW is always unassigned (BR-29), work in progress has an active staff owner (BR-27, BR-30).
const tickets: SeedTicket[] = [
  {
    summary: 'Cannot sign in to campus email after password reset',
    description: 'Since resetting my password this morning, the email client rejects the new password on every device.',
    requester: 'napat.s@toktickit.dev',
    category: 'Account and Access',
    relatedSystem: 'Email',
    requestedPriority: 'URGENT',
    itPriority: 'URGENT',
    status: 'NEW',
    assignee: null,
    daysAgo: 1,
  },
  {
    summary: 'Request a second monitor for the finance workstation',
    description: 'Month-end reconciliation needs two spreadsheets side by side. Requesting a second monitor for desk F-12.',
    requester: 'areeya.p@toktickit.dev',
    category: 'Hardware',
    relatedSystem: 'Corporate Laptop',
    requestedPriority: 'MEDIUM',
    itPriority: 'LOW',
    status: 'NEW',
    assignee: null,
    daysAgo: 2,
  },
  {
    summary: 'Registrar office printer shows offline for all users',
    description: 'The shared printer in the registrar office appears offline for everyone. Restarting it did not help.',
    requester: 'pimchanok.t@toktickit.dev',
    category: 'Hardware',
    relatedSystem: 'Printer',
    requestedPriority: 'HIGH',
    itPriority: 'HIGH',
    status: 'OPEN',
    assignee: 'thanawat.it@toktickit.dev',
    daysAgo: 3,
    messages: [
      { author: 'thanawat.it@toktickit.dev', visibility: 'PUBLIC', body: 'Thanks for reporting this. I will check the print server this afternoon.' },
      { author: 'thanawat.it@toktickit.dev', visibility: 'INTERNAL', body: 'Print spooler on the server stopped after last night\'s patch. Check the service first.' },
    ],
  },
  {
    summary: 'Library catalogue kiosk freezes on search',
    description: 'The self-service catalogue kiosk near the entrance freezes whenever a search returns more than one page.',
    requester: 'kittipong.w@toktickit.dev',
    category: 'Software',
    relatedSystem: 'LEB2 App',
    requestedPriority: 'LOW',
    itPriority: 'MEDIUM',
    status: 'IN_PROGRESS',
    assignee: 'malee.it@toktickit.dev',
    daysAgo: 5,
    messages: [
      { author: 'malee.it@toktickit.dev', visibility: 'PUBLIC', body: 'I can reproduce the freeze. Working on an update for the kiosk software.' },
      { author: 'malee.it@toktickit.dev', visibility: 'INTERNAL', body: 'Kiosk runs an outdated browser build. Raised IT Priority because it blocks a public service point.' },
    ],
  },
  {
    summary: 'VPN disconnects every few minutes from home',
    description: 'The VPN connects but drops every three to five minutes, which interrupts remote grading sessions.',
    requester: 'napat.s@toktickit.dev',
    category: 'Network',
    relatedSystem: 'VPN',
    requestedPriority: 'HIGH',
    itPriority: 'MEDIUM',
    status: 'WAITING_FOR_REQUESTER',
    assignee: 'thanawat.it@toktickit.dev',
    flagged: true,
    daysAgo: 7,
    messages: [
      { author: 'thanawat.it@toktickit.dev', visibility: 'PUBLIC', body: 'Please try the updated VPN profile from the portal and let us know if the drops continue.' },
      { author: 'napat.s@toktickit.dev', visibility: 'PUBLIC', body: 'The requester reported that the problem appears resolved.', isSystem: true },
    ],
  },
  {
    summary: 'Grade submission app times out on upload',
    description: 'Uploading the final grade sheet times out after about a minute. Smaller files upload normally.',
    requester: 'pimchanok.t@toktickit.dev',
    category: 'Software',
    relatedSystem: 'Grade Submission App',
    requestedPriority: 'URGENT',
    itPriority: 'HIGH',
    status: 'RESOLVED',
    assignee: 'admin@toktickit.dev',
    daysAgo: 10,
    messages: [
      { author: 'admin@toktickit.dev', visibility: 'PUBLIC', body: 'The upload limit has been raised. Please try the upload again.' },
      { author: 'admin@toktickit.dev', visibility: 'INTERNAL', body: 'Gateway request timeout raised from 60 to 180 seconds for the grade submission route.' },
    ],
  },
  {
    summary: 'Install a PDF reader on the shared laptop',
    description: 'The shared finance laptop has no PDF reader, so invoices open in a browser tab that cannot annotate.',
    requester: 'areeya.p@toktickit.dev',
    category: 'Software',
    relatedSystem: 'Corporate Laptop',
    requestedPriority: 'LOW',
    itPriority: 'LOW',
    status: 'CLOSED',
    assignee: 'malee.it@toktickit.dev',
    daysAgo: 14,
  },
  {
    summary: 'Wi-Fi keeps disconnecting in the reading room',
    description: 'Laptops in the second-floor reading room lose Wi-Fi every few minutes. It was fixed once but has returned.',
    requester: 'kittipong.w@toktickit.dev',
    category: 'Network',
    relatedSystem: 'Campus Wi-Fi',
    requestedPriority: 'MEDIUM',
    itPriority: 'URGENT',
    status: 'REOPENED',
    assignee: 'prasert.it@toktickit.dev',
    daysAgo: 20,
    messages: [
      { author: 'prasert.it@toktickit.dev', visibility: 'INTERNAL', body: 'Access point firmware rolled back after the reboot. Schedule a site visit.' },
    ],
  },
  {
    summary: 'Duplicate request for a keyboard replacement',
    description: 'Raised twice by mistake; the other request covers the same keyboard.',
    requester: 'napat.s@toktickit.dev',
    category: 'Hardware',
    relatedSystem: 'Corporate Laptop',
    requestedPriority: 'LOW',
    itPriority: 'LOW',
    status: 'CANCELLED',
    assignee: null,
    daysAgo: 25,
  },
]

/** Same atomic statement the API uses, so seeded numbers never collide with real ones (BR-03). */
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
  // upsert keeps the seed re-runnable: existing rows keep their id instead of being duplicated.
  for (const name of categories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } })
  }

  for (const name of relatedSystems) {
    await prisma.relatedSystem.upsert({ where: { name }, update: {}, create: { name } })
  }

  const userIds = new Map<string, number>()
  for (const { email, ...user } of users) {
    // A fresh per-user salt every run; role, activation, and the password state are re-applied so a
    // manually changed account returns to its documented state (BR-09).
    const documented = { ...user, passwordHash: await hashPassword(LOCAL_DEV_PASSWORD) }
    const row = await prisma.user.upsert({ where: { email }, update: documented, create: { email, ...documented } })
    userIds.set(email, row.id)
  }

  const categoryIds = new Map((await prisma.category.findMany()).map((row) => [row.name, row.id]))
  const systemIds = new Map((await prisma.relatedSystem.findMany()).map((row) => [row.name, row.id]))
  const year = bangkokYear()

  for (const seed of tickets) {
    const requesterId = userIds.get(seed.requester)!
    const existing = await prisma.ticket.findFirst({ where: { summary: seed.summary, requesterId } })
    const workflow = {
      status: seed.status,
      itPriority: seed.itPriority,
      assigneeId: seed.assignee ? userIds.get(seed.assignee)! : null,
      // Keep the original flag time on a re-run rather than churning it.
      requesterResolvedFlaggedAt: seed.flagged ? (existing?.requesterResolvedFlaggedAt ?? new Date()) : null,
    }

    const ticket = existing
      ? await prisma.ticket.update({ where: { id: existing.id }, data: workflow })
      : await prisma.ticket.create({
          data: {
            ...workflow,
            ticketNumber: await nextTicketNumber(year),
            requesterId,
            categoryId: categoryIds.get(seed.category)!,
            relatedSystemId: systemIds.get(seed.relatedSystem)!,
            summary: seed.summary,
            description: seed.description,
            requestedPriority: seed.requestedPriority,
            createdAt: new Date(Date.now() - seed.daysAgo * 24 * 60 * 60 * 1000),
          },
        })

    for (const message of seed.messages ?? []) {
      const data = {
        ticketId: ticket.id,
        authorId: userIds.get(message.author)!,
        visibility: message.visibility,
        body: message.body,
        isSystem: message.isSystem ?? false,
      }
      // Append-only table (BR-42): a re-run adds nothing that is already there.
      if (!(await prisma.ticketMessage.findFirst({ where: data }))) await prisma.ticketMessage.create({ data })
    }
  }

  console.log(
    `Seeded ${categories.length} categories, ${relatedSystems.length} related systems, ${users.length} users, ${tickets.length} tickets`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

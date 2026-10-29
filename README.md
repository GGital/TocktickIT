# TokTickIT

IT service desk application — CPE 334 individual sprints.
React + TypeScript + Vite + Bootstrap → Express + TypeScript REST API → Prisma → PostgreSQL.

- **Lab 1** — full-stack vertical slice: health check and seeded request categories.
- **Lab 2** — Requester ticketing MVP: ticket creation with a backend-generated Ticket Number, attachments with
  soft removal, a searchable and paginated My Tickets list, a read-only Ticket Detail screen, and backend
  ownership isolation on every requester-scoped route.
- **Lab 3** — authentication and roles: sign-in with a server-side session, a mandatory first password change,
  role-based navigation and API guards, an IT Staff Ticket Queue and Ticket Detail with ownership, IT Priority,
  a status workflow, Public Comments and Internal Notes, the Requester's "Problem appears resolved" signal, and
  Administrator User Management.
- **Lab 4** — work log and dashboards: Actions Taken on every Ticket (recorded, edited, voided, never deleted, with
  follow-ups), a resolution gate the backend enforces, optimistic concurrency on every staff write, a Requester
  Dashboard and an IT Staff Dashboard whose every number opens the list it counts, and product-wide hardening.

> **Lab 3 replaced the Lab 2 Development Requester selector with real authentication.** Identity is a server-side
> session in an `HttpOnly` cookie; the selector screen, its storage key, the `X-Requester-Id` header, and
> `GET /api/requesters` no longer exist.

## Prerequisites

- Node.js 20+ (verified on v24.19 with npm 11.17)
- PostgreSQL 17 reachable on `localhost:5432`
- Docker, if you use the container below for the database

## Setup

Every command in this section was run, in this order, from a fresh clone of `lab3-staging` against a new, empty
database on 17 September 2026 (`docs/lab-03/tests.md` §6.5). Lab 4 adds one migration and more seed data; the
commands are unchanged.

```bash
git clone https://github.com/GGital/TocktickIT.git
cd TocktickIT
```

### 1. Database

```bash
docker run --name TockTickITDB -e POSTGRES_USER=YOUR_POSTGRESQL_USERNAME -e POSTGRES_PASSWORD=YOUR_POSTGRESQL_PASSWORD -v postgres_data:/var/lib/postgresql/data -p 5432:5432 -d postgres:17-alpine3.22
```

### 2. Backend

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env` and set `DATABASE_URL` to your own PostgreSQL user and password. `.env` is git-ignored —
never commit real credentials.

Generate the Prisma client, apply the schema, and seed:

```bash
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
```

`prisma generate` is listed explicitly because npm 11 no longer runs dependency install scripts unless the
package is approved. `server/package.json` approves Prisma's and esbuild's scripts in `allowScripts`, but running
`generate` yourself works on every npm version, and without it the seed fails with
`@prisma/client did not initialize yet`.

`migrate deploy` also upgrades an existing Lab 2 database in place: `RequesterUser` is renamed to `User`, so
every Ticket, Attachment, and identifier survives. Each migrated Lab 2 user becomes a Requester whose password
is the local-development initial password below and who must change it at first login.

#### Upgrading to Lab 4 — back up first

The Lab 4 migration (`20261020100000_add_actions_taken_and_workflow_fields`) is additive: it adds the
`ActionTaken` table and the Ticket columns `version`, `resolvedAt`, and `publicActivityAt`, and keeps every
existing row and id. On a database that already holds data, take a backup **before** `migrate deploy`:

```bash
pg_dump --format=custom --file=toktickit-before-lab4.dump "postgresql://USER:PASSWORD@localhost:5432/toktickit"
```

The backfill sets `version = 1`, sets `resolvedAt = updatedAt` for Tickets already `RESOLVED` or `CLOSED`
(approximate — the best evidence a Lab 3 database holds), and sets `publicActivityAt` to the latest of the Ticket's
creation, its latest Public Comment, and its latest attachment upload or removal. Internal Notes never count.

#### Recovering from the Lab 4 migration

`prisma/migrations/20261020100000_add_actions_taken_and_workflow_fields/down.sql` reverses the migration and
restores the exact Lab 3 schema. It drops every Action Taken, keeps all Lab 3 data, and removes the migration's
row from `_prisma_migrations`, so a later `migrate deploy` applies it again. `migrate deploy` never runs it.

```bash
npx prisma db execute --file prisma/migrations/20261020100000_add_actions_taken_and_workflow_fields/down.sql
```

`psql "postgresql://USER:PASSWORD@localhost:5432/toktickit" < prisma/migrations/20261020100000_add_actions_taken_and_workflow_fields/down.sql`
does the same. `prisma migrate resolve --rolled-back` is not needed and does not work here — Prisma accepts it only
for a migration that failed. If the database itself is damaged, restore the backup instead:

```bash
pg_restore --clean --if-exists --dbname="postgresql://USER:PASSWORD@localhost:5432/toktickit" toktickit-before-lab4.dump
```

#### Seed data

The seed is idempotent — running it again creates no duplicates and changes no identifiers. It seeds
**4 Categories**, **7 Related Systems**, **12 users** across the three roles, **10 Tickets** covering all eight
statuses, all four IT Priorities, assigned and unassigned ownership, one Requester-flagged Ticket, one Ticket
created today, **9 messages** (Public Comments and Internal Notes), and **11 Actions Taken**. Re-running it
returns every seeded account to the state in this table and every seeded action to its documented content.

The Actions Taken cover what the Lab 4 demonstration needs:

| Ticket | Status | Actions | Shows |
|---|---|---|---|
| Registrar office printer shows offline | Open | 1 | Ready to resolve |
| Library catalogue kiosk freezes on search | In Progress | 5 | Non-owner performer, completed follow-up, voided action, outstanding follow-up — resolution blocked |
| VPN disconnects every few minutes | Waiting for Requester | 2 | — |
| Grade submission app times out | Resolved | 1 | Resolved 2 days ago (inside the 7-day window) |
| Install a PDF reader on the shared laptop | Closed | 1 | Completed follow-up; resolved 12 days ago (outside the window) |
| Wi-Fi keeps disconnecting in the reading room | Reopened | 1 | — |
| Projector in lecture room 3 shows no signal | New | 0 | Created today (Bangkok); kept today on every re-run |

#### Local-development credentials

> **Warning — development only.** These accounts and this password exist for a developer's own local
> database. Never create them in a shared, staging, or production environment, and never reuse the
> password anywhere else.

Every seeded account signs in with the password **`TokTick-Local-Dev-1`**.

| Email | Role | Active | Must change password | Used for |
|---|---|---|---|---|
| `napat.s@toktickit.dev` | Requester | Yes | No | E2E Requester A |
| `pimchanok.t@toktickit.dev` | Requester | Yes | No | E2E Requester B |
| `kittipong.w@toktickit.dev` | Requester | Yes | Yes | First-login password change (E2E-03) |
| `areeya.p@toktickit.dev` | Requester | Yes | Yes | Manual testing |
| `former.staff@toktickit.dev` | Requester | **No** | Yes | Inactive-account login refusal |
| `thanawat.it@toktickit.dev` | IT Staff | Yes | No | E2E IT Staff |
| `malee.it@toktickit.dev` | IT Staff | Yes | No | E2E reassignment target |
| `prasert.it@toktickit.dev` | IT Staff | Yes | Yes | Manual testing |
| `former.it@toktickit.dev` | IT Staff | **No** | Yes | Inactive staff, never an eligible owner |
| `admin@toktickit.dev` | Administrator | Yes | No | E2E Administrator |
| `empty.requester@toktickit.dev` | Requester | Yes | No | All-zero Requester Dashboard (no Tickets) |
| `quiet.it@toktickit.dev` | IT Staff | Yes | No | All-zero IT Staff counts (owns nothing, no actions) |

The E2E suite re-arms `kittipong.w@` through the Administrator API before it uses it, so the account is back to
"must change password" after every run.

The seed creates **no attachments**, because those need files on disk. For attachment data to click through
by hand:

```bash
npm run seed:demo
```

That script prints the URLs it created — four tickets covering active plus removed attachments, the
five-attachment limit, an empty attachment section, and one ticket owned by a different Requester so the
cross-requester 404 can be demonstrated. It is re-runnable and replaces what it created.

### 3. Frontend

```bash
cd client
npm install
```

### 4. End-to-end tests (optional)

In the repository root:

```bash
npm install
npx playwright install chromium
```

## Running

Two terminals:

```bash
cd server && npm run dev     # http://localhost:3000
```

```bash
cd client && npm run dev     # http://localhost:5173
```

Open http://localhost:5173. Vite proxies `/api` to the backend, so the browser stays same-origin and no CORS
configuration is needed. Sign in with one of the local-development accounts listed above: every role lands on its
Dashboard — `/dashboard` for a Requester, `/staff/dashboard` for IT Staff and the Administrator.

`GET http://localhost:3000/api/health` answers `200 { "status": "ok", "database": "ok" }` when the API can run
`SELECT 1` within 2 seconds, and `503 SERVICE_UNAVAILABLE` otherwise. It needs no session and never reveals a
host, version, or connection detail.

### Demonstration script (Lab 4)

Sign in with the accounts above; each step uses seeded data only.

1. **Requester dashboard** — `napat.s@` lands on Dashboard. Click **Waiting for you**: My Tickets opens with only
   the Waiting for Requester chip pressed and "Showing: Waiting for you". `empty.requester@` shows the all-zero
   welcome state.
2. **Record work** — `thanawat.it@` opens *Registrar office printer shows offline* from the Ticket Queue, records
   an action under Actions Taken, then resolves: the confirmation states the action count and **Resolved at** fills
   in without a reload.
3. **Resolution gate** — *Library catalogue kiosk freezes on search* offers no Resolve; the workflow panel says
   "1 follow-up is still outstanding." with a link to Actions Taken. Mark the follow-up done and Resolve appears.
4. **Stale update** — open one Ticket in two tabs, change the IT Priority in one, then the status in the other:
   the second tab says the ticket changed, shows "You tried: …", and sends nothing until you choose again.
5. **Staff dashboard** — click **My follow-ups**, **Unassigned tickets**, and a **By status** row; each list opens
   with its filters visible. `quiet.it@` shows the all-zero staff counts.
6. **Administrator** — `admin@` sees the Accounts group; **Active IT Staff** opens User Management filtered by role.
7. **Requester view** — back as `napat.s@`, the Ticket shows "Work done by IT" (voided actions never appear) and
   "Resolved on {date}".

## Tests

Three suites. PostgreSQL must be running for the server and E2E suites.

```bash
cd server && npm test        # Vitest + Supertest: unit, API, authorization, migration, and performance tests
```

```bash
cd client && npm test        # Vitest + Testing Library: unit, UI component, and UI style tests
```

```bash
npm run e2e                  # Playwright: Lab 2 and Lab 3 E2E, responsive, and screenshots (starts both servers)
```

Port 5173 must be free, or held by this project's own client: Playwright reuses a server already listening there.

The server suite and the E2E suites share the database in `server/.env`. A few seed checks read every Ticket of
the seeded accounts, so leftover E2E Tickets in a long-used development database can fail them. To run on a
clean database instead, create a new one, apply the migrations and the seed to it, and point `DATABASE_URL` at it
for the run — an environment variable takes precedence over `server/.env`:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/toktickit_regression" npm test --prefix server
```

The migration, seed, and performance tests create and drop their own databases (`toktickit_lab4_seed`,
`toktickit_lab4_perf`, …), so the PostgreSQL user needs `CREATEDB`. The performance smoke test bulk-inserts
2,000 Tickets and 6,000 actions and checks the documented p95 budgets.

Everything, in the order run before a release Pull Request:

```bash
cd server && npm test && cd ../client && npm test && cd .. && npm run e2e
```

One lab at a time, or the screenshots alone:

```bash
npm run e2e:lab2
```

```bash
npm run e2e:lab3
```

The Lab 4 Playwright project (`npm run e2e:lab4`) and its screenshots arrive with issue #88.

```bash
npm run e2e:screenshots
```

The Playwright run writes 102 Lab 3 screenshots to `artifacts/lab-03/screenshots/` — 34 documented states at
1280×800, 820×1180, and 375×812 — and 48 Lab 2 screenshots (16 states) to `artifacts/lab-02/screenshots/`. The
committed Lab 2 set is that sprint's evidence; restore it with `git checkout -- artifacts/lab-02` after a run.

## Screens

| Route | Screen | Roles |
|---|---|---|
| `/login` | Sign in — where every unauthenticated visit is sent | Anyone |
| `/dashboard` | Requester Dashboard — what needs my attention, recent changes; the Requester's home | Requester |
| `/staff/dashboard` | IT Staff Dashboard — queue counts, breakdowns, my recent actions; Accounts for an Administrator | IT Staff, Administrator |
| `/change-password` | Change Password — mandatory after an initial password, voluntary otherwise | Any signed-in user |
| `/tickets` | My Tickets — server-side search, filters (status chips from the URL), sorting, and pagination | Any signed-in user (own Tickets) |
| `/tickets/new` | Create Ticket — with staged attachments | Requester |
| `/tickets/:id` | Ticket Detail — read-only, attachments, work done by IT, conversation, "Problem appears resolved" | Owner |
| `/staff/tickets` | Ticket Queue — search, filters (incl. Follow-ups), sort, paging, queue counts | IT Staff, Administrator |
| `/staff/tickets/:id` | Staff Ticket Detail — owner, IT Priority, status workflow with the resolution gate, Actions Taken, Public Comments, Internal Notes | IT Staff, Administrator |
| `/admin/users` | User Management — list, search, role filter, create, edit, new initial password | Administrator |
| `/system-check` | Lab 1 health-check page, kept reachable by direct URL but never linked | Any signed-in user |

A role that may not open a screen sees a forbidden state; its navigation never shows the link.

## API

Base path `/api`. Every route except health and login requires the `toktickit.sid` session cookie set by
`POST /api/auth/login`; without it the API answers `401 UNAUTHENTICATED`. While a password change is outstanding,
every route except `me`, `change-password`, and `logout` answers `403 PASSWORD_CHANGE_REQUIRED`. Requester routes
always act as the signed-in user — a `requesterId` in a body, query, or header is ignored. Every non-2xx response
uses one envelope: `{ "error": { "code", "message", "fields"? } }`. All `/api` responses send
`Cache-Control: no-store`. The contract is [docs/lab-04/api-spec.md](docs/lab-04/api-spec.md) on top of
[docs/lab-03/api-spec.md](docs/lab-03/api-spec.md).

Since Lab 4, the status, assignment, and priority writes require the Ticket's current `version` as
`expectedVersion`; a stale one answers `409 STALE_TICKET` and nothing changes.

| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | `/api/health` | API and database availability (`503` when the database is down) | No session |
| POST | `/api/auth/login` | Sign in; sets the session cookie | No session |
| POST | `/api/auth/logout` | End the session | Any |
| GET | `/api/auth/me` | The signed-in user | Any |
| POST | `/api/auth/change-password` | Change the password; signs out other sessions | Any |
| GET | `/api/categories` | Active Categories, id order | Any |
| GET | `/api/related-systems` | Active Related Systems, alphabetical | Any |
| POST | `/api/tickets` | Create one ticket; the server assigns `TKT-YYYY-NNNNNN`, `NEW`, and the timestamps | Requester |
| GET | `/api/tickets` | Own tickets: search, filters (repeatable `status`), sort, pagination | Any (own) |
| GET | `/api/tickets/:id/actions` | Actions Taken on an own Ticket, voided ones excluded | Any (own) |
| GET | `/api/dashboard/requester` | Requester Dashboard counts and lists | Requester |
| GET | `/api/tickets/:id` | One own ticket with its attachment metadata | Any (own) |
| GET | `/api/tickets/:id/comments` | Public Comments, oldest first | Owner, IT Staff, Administrator |
| POST | `/api/tickets/:id/comments` | Post a Public Comment | Owner, IT Staff, Administrator |
| POST | `/api/tickets/:id/appears-resolved` | Flag "Problem appears resolved"; never changes the status | Owning Requester |
| POST | `/api/tickets/:id/attachments` | Upload one permitted file (JPG, PNG, WEBP, PDF; ≤ 5 MB; ≤ 5 active) | Owner |
| GET | `/api/tickets/:id/attachments` | Attachment metadata, active and removed | Owner |
| GET | `/api/attachments/:id/download` | Download one active attachment | Owner |
| DELETE | `/api/attachments/:id` | Soft-remove one attachment with a reason; nothing is deleted | Owner |
| GET | `/api/staff/dashboard` | IT Staff Dashboard; `administration` only for an Administrator | IT Staff, Administrator |
| GET | `/api/staff/tickets` | The Ticket Queue: search, filters (incl. `followUp`), sort, paging | IT Staff, Administrator |
| GET | `/api/staff/tickets/:id` | Any Ticket's detail, with `version`, `allowedTransitions`, `resolutionBlockers` | IT Staff, Administrator |
| PATCH | `/api/staff/tickets/:id/assignment` | Claim (`"me"`), assign, reassign, or unassign (`null`) | IT Staff, Administrator |
| PATCH | `/api/staff/tickets/:id/priority` | Set IT Priority; Requested Priority is immutable | IT Staff, Administrator |
| PATCH | `/api/staff/tickets/:id/status` | Move along the transition matrix; `RESOLVED` passes the resolution gate | IT Staff, Administrator |
| GET | `/api/staff/tickets/:id/actions` | Actions Taken, voided ones included | IT Staff, Administrator |
| POST | `/api/staff/tickets/:id/actions` | Record an action; idempotent by `clientRequestId` | IT Staff, Administrator |
| PATCH | `/api/staff/tickets/:id/actions/:actionId` | Edit an action (`expectedVersion`) | Performer, Ticket Owner, Administrator |
| POST | `/api/staff/tickets/:id/actions/:actionId/complete-follow-up` | Mark its follow-up done | IT Staff, Administrator |
| POST | `/api/staff/tickets/:id/actions/:actionId/void` | Void with a reason; nothing is deleted | Performer, Ticket Owner, Administrator |
| GET | `/api/staff/tickets/:id/internal-notes` | Internal Notes, oldest first | IT Staff, Administrator |
| POST | `/api/staff/tickets/:id/internal-notes` | Post an Internal Note | IT Staff, Administrator |
| GET | `/api/staff/assignees` | Active IT Staff and Administrators, by name | IT Staff, Administrator |
| GET | `/api/admin/users` | Users: name/email search and one role filter; no paging | Administrator |
| POST | `/api/admin/users` | Create a user; the initial password is echoed once | Administrator |
| PATCH | `/api/admin/users/:id` | Edit name, email, role, activation — nothing else | Administrator |
| POST | `/api/admin/users/:id/initial-password` | Issue a new initial password; ends that user's sessions | Administrator |

A ticket belonging to another Requester answers `404`, identically to one that does not exist. A route a role may
not use answers `403 FORBIDDEN` with no data. There is no user deletion route: deactivation is the only removal.

## Structure

```
client/                        React + TypeScript + Vite + Bootstrap
  src/
    components/                Reusable UI: Button, Badge families, Callout, form fields, PasswordField,
                               Pagination, ConfirmDialog, AppShell, AuthGuard, RequireRole, ForbiddenState,
                               AttachmentSection/AttachmentList, Conversation, MessageList, MessageComposer,
                               UserFormDialog, ActionsTakenPanel, ActionTakenForm, RequesterActionsList,
                               FollowUpBadge, StaleCallout, MetricCard, MetricBreakdown, DashboardList,
                               DrilldownNotice
    lib/                       auth (AuthProvider, useCurrentUser), apiClient, roles, ticketLabels, validation,
                               actionValidation, formatBangkok (the one timestamp formatter)
    screens/                   Login, ChangePassword, CreateTicket, MyTickets, TicketDetail, TicketQueue,
                               StaffTicketDetail, UserManagement, RequesterDashboard, StaffDashboard
    styles/zen-theme.css       Zen Green tokens — the only file with colour literals
  tests/lab-01/ … lab-04/      UI, UI-style, accessibility, and unit tests per lab
server/                        Node.js + Express + TypeScript
  prisma/                      schema, migrations, seed.ts, dev-seed-tickets.ts
  src/                         app.ts (routes and middleware stack), auth.ts, password.ts, userInput.ts,
                               adminUsers.ts, tickets.ts, staffTickets.ts, statusTransition.ts, queueQuery.ts,
                               messages.ts, attachments.ts, fileValidation.ts, ticketQuery.ts, ticketNumber.ts,
                               errors.ts, actions.ts, actionInput.ts, dashboard.ts, health.ts
  tests/lab-01/ … lab-04/      API tests per lab, with unit/ for pure helpers
  uploads/                     Attachment storage — git-ignored, never served statically
e2e/lab-02/ lab-03/            Playwright specs and shared helpers
artifacts/lab-02/screenshots/  Committed Lab 2 screenshots, 3 viewports per state
artifacts/lab-03/screenshots/  Committed Lab 3 screenshots, 3 viewports per state
docs/lab-01/ … lab-04/         Documentation per lab
```

## Documentation

- [docs/lab-04/specification.md](docs/lab-04/specification.md), [api-spec.md](docs/lab-04/api-spec.md),
  [ui-spec.md](docs/lab-04/ui-spec.md), [tests.md](docs/lab-04/tests.md) — the Lab 4 contract
- [docs/lab-03/specification.md](docs/lab-03/specification.md) — scope, business rules, acceptance criteria
- [docs/lab-03/api-spec.md](docs/lab-03/api-spec.md) — wire contract, authorization, error catalogue
- [docs/lab-03/ui-spec.md](docs/lab-03/ui-spec.md) — Zen Green additions, screens, visual checklist
- [docs/lab-03/tests.md](docs/lab-03/tests.md) — test matrix, visual pass, final results
- [docs/lab-03/reviewer.md](docs/lab-03/reviewer.md) — peer reviewer, reviews received and given
- [docs/lab-03/ai-use.md](docs/lab-03/ai-use.md) — AI agent use and reflection
- [docs/lab-02/](docs/lab-02/) and [docs/lab-01/](docs/lab-01/) — earlier sprints

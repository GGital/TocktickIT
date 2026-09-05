# TokTickIT

IT service desk application — CPE 334 individual sprints.
React + TypeScript + Vite + Bootstrap → Express + TypeScript REST API → Prisma → PostgreSQL.

- **Lab 1** — full-stack vertical slice: health check and seeded request categories.
- **Lab 2** — Requester ticketing MVP: a simulated Requester context, ticket creation with a
  backend-generated Ticket Number, attachments with soft removal, a searchable and paginated My Tickets list,
  a read-only Ticket Detail screen, and backend ownership isolation on every requester-scoped route.

> **Lab 2 has no authentication.** The Development Requester selector is a testing mechanism, not a login. It
> is deliberately not a security boundary; authentication and role-based access arrive in Lab 3.

## Prerequisites

- Node.js 20+ (developed on v24)
- PostgreSQL 17 reachable on `localhost:5432`
- Docker, if you use the container below for the database

## Setup

```bash
git clone https://github.com/GGital/TocktickIT.git
cd TocktickIT
```

### 1. Database

```bash
docker run --name TockTickITDB -e POSTGRES_PASSWORD=YOUR_POSTGRESQL_PASSWORD -e POSTGRES_USERNAME=YOUR_POSTGRESQL_USERNAME -v postgres_data:/var/lib/postgresql/data -p 5432:5432 -d postgres:17-alpine3.22
```

### 2. Backend

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env` and set `DATABASE_URL` to your own PostgreSQL user and password. `.env` is git-ignored —
never commit real credentials.

Apply the schema and seed the reference data:

```bash
npx prisma migrate deploy
npx prisma db seed
```

The seed is idempotent — running it again creates no duplicates and changes no identifiers. It seeds
**4 Categories**, **7 Related Systems**, and **5 Requesters** (4 active plus 1 inactive, which exists so the
inactive-context path can be tested and must never appear in the selector).

The seed deliberately creates **no tickets and no attachments** (BR-46). For data to click through by hand:

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

```bash
npm install              # in the repository root
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
configuration is needed. Pick a Requester on `/select-requester` to begin.

## Tests

Three suites. PostgreSQL must be running for the server and E2E suites.

```bash
cd server && npm test        # Vitest + Supertest: unit and API tests
```

```bash
cd client && npm test        # Vitest + Testing Library: unit, UI component, and UI style tests
```

```bash
npx playwright test          # E2E, responsive, and screenshot capture (starts both servers itself)
```

Everything, in the order run before a release Pull Request:

```bash
cd server && npm test && cd ../client && npm test && cd .. && npx playwright test
```

The Playwright run writes 63 screenshots to `artifacts/lab-02/screenshots/` — 21 documented states at 1280×800,
820×1180, and 375×812. To capture those alone:

```bash
npm run e2e:screenshots
```

## Screens

| Route | Screen |
|---|---|
| `/select-requester` | Development Requester Selection (testing mechanism, not a login) |
| `/tickets` | My Tickets — server-side search, filters, sorting, and pagination |
| `/tickets/new` | Create Ticket — with staged attachments |
| `/tickets/:id` | Ticket Detail — read-only, with the attachment section |
| `/system-check` | Lab 1 health-check page, kept reachable |

## API

Base path `/api`. Requester-scoped routes require the header `X-Requester-Id: <positive integer>`; it is a
simulated testing context, never authentication, and `401` is never returned. Every non-2xx response uses one
envelope: `{ "error": { "code", "message", "fields"? } }`. All `/api` responses send `Cache-Control: no-store`.

| Method | Path | Purpose | Context required |
|---|---|---|---|
| GET | `/api/health` | Liveness | No |
| GET | `/api/categories` | Active Categories, id order | No |
| GET | `/api/related-systems` | Active Related Systems, alphabetical | No |
| GET | `/api/requesters` | Active Development Requesters, name order | No |
| POST | `/api/tickets` | Create one ticket; the server assigns `TKT-YYYY-NNNNNN`, `NEW`, and the timestamps | Yes |
| GET | `/api/tickets` | Owned tickets: search, filters, sort, pagination | Yes |
| GET | `/api/tickets/:id` | One owned ticket with its attachment metadata | Yes |
| POST | `/api/tickets/:id/attachments` | Upload one permitted file (JPG, PNG, WEBP, PDF; ≤ 5 MB; ≤ 5 active) | Yes |
| GET | `/api/tickets/:id/attachments` | Attachment metadata, active and removed | Yes |
| GET | `/api/attachments/:id/download` | Download one active attachment | Yes |
| DELETE | `/api/attachments/:id` | Soft-remove one attachment with a reason; nothing is deleted | Yes |

A ticket belonging to another Requester answers `404`, identically to one that does not exist, so the API never
confirms that someone else's ticket exists.

## Structure

```
client/                        React + TypeScript + Vite + Bootstrap
  src/
    components/                Reusable UI: Button, Badge, Callout, form fields,
                               Pagination, ConfirmDialog, AppShell, RequesterGuard,
                               AttachmentSection (staging), AttachmentList (detail)
    lib/                       requesterContext (localStorage), apiClient, validation
    screens/                   SelectRequester, CreateTicket, MyTickets, TicketDetail
    styles/zen-theme.css       Zen Green tokens — the only file with colour literals
  tests/lab-01/                Lab 1 UI tests
  tests/lab-02/                UI, UI-style, accessibility, and unit tests
server/                        Node.js + Express + TypeScript
  prisma/                      schema, migrations, seed.ts, dev-seed-tickets.ts
  src/                         app.ts (routes), requesterContext.ts (middleware),
                               tickets.ts, attachments.ts, fileValidation.ts,
                               ticketQuery.ts, ticketNumber.ts, errors.ts
  tests/lab-01/                Lab 1 API tests
  tests/lab-02/                API tests and unit/ for pure helpers
  uploads/                     Attachment storage — git-ignored, never served statically
e2e/lab-02/                    Playwright specs and shared helpers
artifacts/lab-02/screenshots/  Committed screenshots, 3 viewports per state
docs/lab-01/                   Lab 1 documentation
docs/lab-02/                   specification, api-spec, ui-spec, tests, reviewer, ai-use
```

## Documentation

- [docs/lab-02/specification.md](docs/lab-02/specification.md) — scope, business rules, acceptance criteria
- [docs/lab-02/api-spec.md](docs/lab-02/api-spec.md) — wire contract and error catalogue
- [docs/lab-02/ui-spec.md](docs/lab-02/ui-spec.md) — Zen Green theme, screens, visual checklist
- [docs/lab-02/tests.md](docs/lab-02/tests.md) — test matrix, manual visual pass, final results
- [docs/lab-02/reviewer.md](docs/lab-02/reviewer.md) — peer reviewer, reviews received and given
- [docs/lab-02/ai-use.md](docs/lab-02/ai-use.md) — AI agent use and reflection
- [docs/lab-01/](docs/lab-01/) — Lab 1 documentation

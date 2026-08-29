# Lab 2 Test Plan and Results

Project: TokTickIT — IT Service Desk
Sprint: Lab 2 — Requester Ticketing MVP with UI Foundation
Issue: [#13 — Sprint test plan (Test DD)](https://github.com/GGital/TocktickIT/issues/13)
Status: Planned before implementation. The **Final** column is `Pending` until the test exists and runs; it is
updated to `Pass` only from real output on `main`.
Companion documents: [specification.md](specification.md), [api-spec.md](api-spec.md), [ui-spec.md](ui-spec.md)

---

## 1. Test Strategy

### 1.1 Approach

Test DD, then TDD. Every scenario below is derived from an Acceptance Criterion (AC-nn) or a Business Rule
(BR-nn) that already exists in the approved contract — none is reconstructed afterwards from whatever the coding
agent happened to generate. For each Issue: write the failing tests first, confirm they fail **for the expected
reason**, implement the smallest correct behaviour, then refactor with the tests green.

A test that has never failed has proven nothing. Each new test is run against the unimplemented code once and the
failure message is checked before implementation starts.

### 1.2 Levels and tooling

| Level | Tool | Location | What it proves |
|---|---|---|---|
| Unit | Vitest | `server/tests/lab-02/unit/`, `client/tests/lab-02/unit/` | Pure logic: ticket-number formatting, file-signature detection, query-parameter parsing, client validation rules |
| API / integration | Vitest + Supertest, real PostgreSQL | `server/tests/lab-02/*.api.test.ts` | HTTP contract, statuses, error envelope, ownership, persistence |
| UI component | Vitest + Testing Library + jsdom | `client/tests/lab-02/*.test.tsx` | Rendering, states, validation placement, busy/disabled behaviour, keyboard access |
| UI style | Vitest + Testing Library | `client/tests/lab-02/ZenGreenStyle.test.tsx` | Required classes, tokens, asterisks, read-only vs editable, badge classes |
| Responsive | Playwright, three viewports | `e2e/lab-02/responsive.spec.ts` | No horizontal overflow, no clipping/overlap, mobile card vs desktop table |
| E2E | Playwright, real client + server + database | `e2e/lab-02/*.spec.ts` | Whole flows across requesters, including screenshot evidence |

Rationale for the split: API tests hit a real database rather than a mocked Prisma client — Lab 1 set that
precedent, and an ownership rule mocked at the ORM boundary proves nothing about the query that actually runs.
Client tests stub `fetch` (`vi.spyOn(globalThis, 'fetch')`) exactly as Lab 1 did, so no new mocking dependency is
introduced.

### 1.3 Test data

| Concern | Approach |
|---|---|
| Reference data | The idempotent seed (`npx prisma db seed`) provides 4 Categories, 7 Related Systems, 4+ active Requesters, 1 inactive Requester (BR-46) |
| Requester fixtures | `REQUESTER_A`, `REQUESTER_B` (both active) and `REQUESTER_INACTIVE`, resolved by email so tests never hard-code ids |
| Tickets | Created through the API inside each suite, never inserted by raw SQL — a fixture that bypasses the endpoint would not prove the endpoint works |
| Isolation | Each API suite deletes only the Tickets it created (`afterEach`), by id. The seed rows are never deleted, so a failed run cannot leave the database unusable |
| File fixtures | `tests/fixtures/`: `sample.png` (~40 KB), `sample.jpg`, `sample.webp`, `sample.pdf` (~120 KB), `not-an-image.exe`, and `fake.png` (a PDF renamed to `.png`, for the magic-byte check). The 6 MB oversize file is **generated at run time** (`Buffer.alloc`) and never committed |
| Upload directory | Each API suite uses a temporary `UPLOAD_DIR` under the OS temp folder so tests never write into `server/uploads/` |
| Clock-dependent rules | The 60-second duplicate window (BR-19) is tested by issuing two requests back to back — no fake timers, because the rule is a database query over `createdAt`, not a timer |

### 1.4 Failure simulation

| Scenario | How it is simulated |
|---|---|
| Backend unavailable (AC-05, AC-16, AC-40) | Client tests: `fetch` rejects with a `TypeError`. E2E: Playwright route interception aborts `/api/**` |
| Server error `500` | Route interception returns `500` with the documented envelope |
| Inactive/unknown requester context (AC-07) | Request sent with `X-Requester-Id` of the seeded inactive Requester, and with an id that does not exist |
| Cross-requester access (AC-41, AC-42) | Ticket created as `REQUESTER_A`, then requested with `REQUESTER_B`'s header |
| Client validation bypass (AC-13) | Supertest posts an invalid payload directly, with no browser involved |

### 1.5 Definition of a passing suite

All tests green from the documented commands (§5) on the final `main` branch; nothing skipped, `.only`,
`.todo`, or commented out; every AC in §3 mapped to at least one test with a real file path.

---

## 2. Planned Tests

Legend for **Final**: `Pending` = planned, not yet implemented. Updated to `Pass` / `Fail` from real output.

### 2.1 Unit tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-03, AC-09 | Ticket-number formatter with counter value 41, year 2026 | Returns `TKT-2026-000041` (6-digit zero pad) | `server/tests/lab-02/unit/ticket-number.unit.test.ts` | Pass |
| UNIT-02 | Unit | BR-03 | Formatter boundaries: 1 and 999999 | `TKT-2026-000001`, `TKT-2026-999999` | `server/tests/lab-02/unit/ticket-number.unit.test.ts` | Pass |
| UNIT-03 | Unit | BR-03, A-10 | Year resolution uses `Asia/Bangkok`, not UTC, for a UTC instant of 31 Dec 17:30Z | Year is the following year | `server/tests/lab-02/unit/ticket-number.unit.test.ts` | Pass |
| UNIT-04 | Unit | BR-23 | Magic-byte detector on real JPEG/PNG/WEBP/PDF buffers | Returns the matching MIME type for each | `server/tests/lab-02/unit/file-validation.unit.test.ts` | Pass |
| UNIT-05 | Unit | BR-23, AC-19 | Detector on a PDF renamed `.png` and on an EXE buffer | Rejected — declared extension and signature must agree | `server/tests/lab-02/unit/file-validation.unit.test.ts` | Pass |
| UNIT-06 | Unit | BR-24 | Size guard at 5 MB exactly and 5 MB + 1 byte | Accepted / rejected respectively | `server/tests/lab-02/unit/file-validation.unit.test.ts` | Pass |
| UNIT-07 | Unit | BR-27, AC-30 | Filename sanitiser on `../../etc/passwd`, `C:\x\y.png`, a 300-character name | Traversal rejected; length capped at 255 | `server/tests/lab-02/unit/file-validation.unit.test.ts` | Pass |
| UNIT-08 | Unit | BR-27 | Stored-name generator | UUID v4 + normalised extension; two calls never collide | `server/tests/lab-02/unit/file-validation.unit.test.ts` | Pass |
| UNIT-09 | Unit | BR-38, BR-39 | Query parser defaults with an empty query | `page=1, pageSize=10, sortBy=createdAt, sortOrder=desc` | `server/tests/lab-02/unit/query-params.unit.test.ts` | Pass |
| UNIT-10 | Unit | BR-39, AC-39 | Query parser on `pageSize=999`, `page=abc`, `sortBy=secret`, `requestedPriority=CRITICAL` | Throws a parameter error naming the offending parameter — never coerces | `server/tests/lab-02/unit/query-params.unit.test.ts` | Pass |
| UNIT-11 | Unit | BR-16, BR-17, AC-12 | Client validators: trim-then-measure at 9/10 and 19/20 characters, whitespace-only input | Boundary messages exactly as specified; whitespace-only counts as missing | `client/tests/lab-02/unit/validation.unit.test.ts` | Pass |
| UNIT-12 | Unit | BR-17, AC-28 | Removal-reason validator at 4, 5, 200, 201 characters | Rejected / accepted / accepted / rejected | `server/tests/lab-02/unit/file-validation.unit.test.ts` | Pass |

### 2.2 API tests — reference data and requester context

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-10, BR-45 | `GET /api/categories` | `200`; four seeded categories in id order; inactive rows absent | `server/tests/lab-02/reference-data.api.test.ts` | Pass |
| API-02 | API | AC-10, BR-45 | `GET /api/related-systems` | `200`; ≥ 7 systems, alphabetical, active only | `server/tests/lab-02/reference-data.api.test.ts` | Pass |
| API-03 | API | AC-01, BR-09, BR-47 | `GET /api/requesters` | `200`; ≥ 4 active requesters; the seeded inactive requester is absent; no `isActive` field leaked | `server/tests/lab-02/requesters.api.test.ts` | Pass |
| API-04 | API | BR-46 | Seed run twice, then requesters and categories re-queried | Same row count and same ids — idempotent | `server/tests/lab-02/seed.api.test.ts` | Pass |
| API-05 | API | BR-11 | Requester-scoped route with no `X-Requester-Id` | `400` `REQUESTER_CONTEXT_MISSING` | `server/tests/lab-02/requester-context.api.test.ts` | Pass |
| API-06 | API | BR-11 | Header `X-Requester-Id: abc` and `X-Requester-Id: -1` | `400` `REQUESTER_CONTEXT_MISSING` for both | `server/tests/lab-02/requester-context.api.test.ts` | Pass |
| API-07 | API | AC-07, BR-47 | Header with an unknown id, then with the inactive requester's id | `403` `REQUESTER_CONTEXT_INVALID` for both | `server/tests/lab-02/requester-context.api.test.ts` | Pass |
| API-08 | API | BR-08, BR-50 | No Lab 2 endpoint ever answers `401`, across the whole failure matrix | No response has status `401` | `server/tests/lab-02/requester-context.api.test.ts` | Pass |

### 2.3 API tests — Create Ticket

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-09 | API | AC-08, AC-09 | Create a valid ticket | `201`; one saved Ticket; `ticketNumber` matches `/^TKT-\d{4}-\d{6}$/`; `status` `NEW`; `requesterId` = header context; `Location` header set | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-10 | API | BR-01, BR-03 | Two consecutive creations | Ticket numbers are unique and strictly increasing within the year | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-11 | API | BR-01, BR-04 | Payload attempting to set `ticketNumber`, `status`, `createdAt` | Client values ignored; server values used | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-12 | API | AC-17, BR-05 | Payload carrying a foreign `requesterId` | Saved Ticket belongs to the header-context Requester | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-13 | API | AC-13, BR-18 | Empty body posted | `400` `VALIDATION_FAILED`; `fields` names **all five** required fields, not just the first; nothing persisted | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-14 | API | AC-12, BR-17 | Summary at 9 and 10 characters; Description at 19 and 20 | `400` at 9/19, `201` at 10/20 | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-15 | API | BR-16 | Summary of 120 valid characters padded with surrounding whitespace | `201`; stored value trimmed | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-16 | API | BR-17, BR-45 | Unknown `categoryId`, and an id that exists but is inactive | `400` `VALIDATION_FAILED` with the identical message for both | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-17 | API | BR-06 | Missing `requestedPriority`, and `requestedPriority: "CRITICAL"` | `400` — the server never defaults a missing priority | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-18 | API | AC-15, BR-19 | Identical summary + description posted twice in a row by the same Requester | Second call `409` `DUPLICATE_SUBMISSION`; exactly one Ticket exists | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-19 | API | BR-19 | The same identical payload posted by a **different** Requester | `201` — the window is per-requester | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |
| API-20 | API | BR-22 | Forced database failure during creation | `500` `INTERNAL_ERROR`; body contains no stack trace, SQL, path, or the word `prisma` | `server/tests/lab-02/create-ticket.api.test.ts` | Pass |

### 2.4 API tests — My Tickets list

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-21 | API | AC-31, BR-15 | Requester A and B each own tickets; A lists | Only A's tickets returned; none of B's ids present | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-22 | API | AC-36, BR-38 | 12 owned tickets, default page size, then `page=2` | Page 1 has 10 items, `totalItems: 12`, `totalPages: 2`; page 2 has the remaining 2 | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-23 | API | BR-40 | `page=99` with 12 tickets | `200`, `data: []`, meta still correct | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-24 | API | AC-34, BR-35 | `search` matching a ticket-number fragment, a summary fragment, and a description fragment, in upper and lower case | Matching tickets returned in every case | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-25 | API | AC-35, BR-36 | `categoryId` + `requestedPriority` together, then combined with `search` | Only tickets matching every criterion (AND) | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-26 | API | AC-37, BR-37 | `sortBy=createdAt&sortOrder=asc`, requested twice | Oldest first; identical order on both calls (stable secondary sort) | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-27 | API | BR-37 | `sortBy=requestedPriority&sortOrder=desc` | Order is `URGENT, HIGH, MEDIUM, LOW` — severity, not alphabetical | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-28 | API | AC-39, BR-39 | `pageSize=999`, `page=abc`, `sortBy=secret`, `sortOrder=sideways`, `requestedPriority=CRITICAL` | `400` `INVALID_QUERY_PARAMETER` each time, message naming the parameter | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |
| API-29 | API | BR-25, §2.4 api-spec | A ticket with 2 active and 1 removed attachment appears in the list | `attachmentCount` is `2` — removed files are not counted | `server/tests/lab-02/my-tickets.api.test.ts` | Pass |

### 2.5 API tests — Ticket Detail and ownership

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-30 | API | AC-43 | Owner fetches an owned ticket | `200` with ticket number, date, requester, category, related system, priority, status, summary, description, attachments | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-31 | API | AC-41, BR-13 | Requester B fetches Requester A's ticket | `404` `TICKET_NOT_FOUND` | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-32 | API | AC-44, BR-13 | Non-existent ticket id vs another Requester's ticket id | Both responses byte-identical (same status, same body) | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-33 | API | api-spec §1 | `GET /api/tickets/abc` and `/api/tickets/0` | `400` `INVALID_PATH_PARAMETER` | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-34 | API | AC-27, BR-32 | Detail of a ticket holding one active and one removed attachment | Both listed; removed one has `isRemoved: true`, reason, timestamp, and `downloadUrl: null` | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |

### 2.6 API tests — Attachments

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-35 | API | AC-18, BR-26 | Upload a valid PNG to an owned ticket | `201`; metadata complete; file exists on disk; parent ticket `updatedAt` refreshed | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-36 | API | AC-30, BR-27 | Inspect the stored name after upload | UUID + normalised extension; `originalFilename` preserved as metadata; `storedFilename` never returned in the response | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-37 | API | AC-30, BR-27 | Upload with filename `../../evil.png` | `400` `VALIDATION_FAILED`; nothing written outside the upload directory | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-38 | API | AC-19, BR-23 | Upload `not-an-image.exe`, then `fake.png` (PDF bytes with a `.png` name) | `415` `UNSUPPORTED_FILE_TYPE` for both; nothing persisted | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-39 | API | AC-20, BR-24 | Upload a 6 MB file | `413` `FILE_TOO_LARGE`; no row created; upload directory unchanged | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-40 | API | BR-24 | Upload a file of exactly 5 MB | `201` — the boundary is inclusive | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-41 | API | AC-21, BR-25 | Sixth upload to a ticket already holding five active attachments | `409` `ATTACHMENT_LIMIT_REACHED` | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-42 | API | AC-22, BR-25 | Five attachments, one soft-removed, then a new upload | `201` — removed files do not consume a slot | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-43 | API | BR-14 | Requester B uploads to Requester A's ticket | `404` `TICKET_NOT_FOUND`; nothing written | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-44 | API | api-spec §3.8 | Multipart request with no `file` part | `400` `NO_FILE_UPLOADED` | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-45 | API | AC-24, BR-14 | Owner downloads an active attachment | `200`; bytes match the uploaded file; `Content-Disposition` carries the original filename; `Content-Type` matches; `X-Content-Type-Options: nosniff` | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-46 | API | AC-25, BR-30 | Soft-remove with a valid reason | `200`; `removedAt`, `removalReason`, `removedById` set; **row still present**; file still on disk; `downloadUrl: null` | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-47 | API | AC-26, BR-32 | Download a removed attachment | `410` `ATTACHMENT_REMOVED`; no bytes returned | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-48 | API | AC-28, BR-17 | Remove with no reason, and with a 4-character reason | `400` `VALIDATION_FAILED`; attachment stays active | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-49 | API | AC-29, BR-32 | Remove an already-removed attachment | `409` `ALREADY_REMOVED`; original removal metadata unchanged | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-50 | API | AC-42, BR-14 | Requester B downloads and then removes Requester A's attachment | `404` `ATTACHMENT_NOT_FOUND` for both; the attachment remains active | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-51 | API | api-spec §3.10 | Requester B requests A's **removed** attachment | `404`, not `410` — a non-owner never learns it was removed | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-52 | API | BR-28 | Row insert forced to fail after a successful file write | Written file deleted; `500` returned; no orphan file left behind | `server/tests/lab-02/attachments.api.test.ts` | Pass |
| API-53 | API | BR-27, X-01 | `GET /uploads/<stored name>` requested directly | Not served — the upload directory is not static | `server/tests/lab-02/attachments.api.test.ts` | Pass |

### 2.7 UI component tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI | AC-01, AC-50 | Requester Selection renders | Dropdown lists active requesters only; visible text states it is a Lab 2 testing mechanism, not login, and that authentication arrives in Lab 3 | `client/tests/lab-02/RequesterSelection.test.tsx` | Pass |
| UI-02 | UI | AC-05 | Requesters fetch rejects | Error callout with a **Try again** action; nothing written to `localStorage` | `client/tests/lab-02/RequesterSelection.test.tsx` | Pass |
| UI-03 | UI | AC-06 | Requesters endpoint returns `[]` | Distinct empty state; Continue disabled/hidden — not the error state | `client/tests/lab-02/RequesterSelection.test.tsx` | Pass |
| UI-04 | UI | AC-02, FR-05 | My Tickets, Create Ticket, and `/tickets/1` rendered with no stored context | Requester Selection shown instead in all three cases | `client/tests/lab-02/RequesterGuard.test.tsx` | Pass |
| UI-05 | UI | AC-03 | Shell after selection | Requester name displayed with the "Testing as" label; Change Requester present; active nav item marked `aria-current` | `client/tests/lab-02/AppShell.test.tsx` | Pass |
| UI-06 | UI | AC-07 | A requester-scoped call returns `403 REQUESTER_CONTEXT_INVALID` | Stored id cleared; Requester Selection shown with the "no longer available" warning | `client/tests/lab-02/RequesterGuard.test.tsx` | Pass |
| UI-07 | UI | AC-10 | Create Ticket mounts | Category and Related System options rendered from the API response, not from a hard-coded list | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-08 | UI | AC-11, BR-18 | Submit with an empty Summary | Message below the Summary field; summary callout with the field count; focus on Summary; **no** POST issued | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-09 | UI | AC-12 | Summary of 9 characters, then 10 | Boundary message at 9; submission proceeds at 10 | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-10 | UI | AC-14, BR-19 | Submit clicked twice while the request is in flight | Button disabled with a busy label and `aria-busy`; exactly one POST issued | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-11 | UI | AC-08, FR-11 | Successful creation | Success card shows the backend `ticketNumber` and offers View Ticket / Create Another / My Tickets | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-12 | UI | AC-16, BR-20 | POST rejects (backend down) | Error callout; every typed value and every staged file still present; Submit re-enabled | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-13 | UI | AC-15 | POST returns `409 DUPLICATE_SUBMISSION` | Non-destructive warning; form not cleared | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-14 | UI | AC-19, BR-23 | A `.exe` and a 6 MB file selected | Both rows marked invalid with the specific reason; neither is uploaded; the rest of the form is unaffected | `client/tests/lab-02/AttachmentSection.test.tsx` | Pass |
| UI-15 | UI | AC-23, BR-29 | Ticket created but one attachment upload fails | Ticket number still shown; per-file outcome listed; retry offered | `client/tests/lab-02/CreateTicket.test.tsx` | Pass |
| UI-16 | UI | AC-32, AC-33, BR-42 | Empty list vs a search returning nothing | Two different states: Create Ticket action vs Clear filters action; clearing restores the list | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-17 | UI | AC-38, BR-41 | On page 2, a filter is changed | Next request carries `page=1` | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-18 | UI | AC-40 | List request fails | Failure callout with retry; no stale rows shown as current | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-19 | UI | AC-04, BR-12 | Requester switched while a filtered list is displayed | Previous requester's rows disappear before the new data resolves; page and filters reset | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-20 | UI | AC-43, BR-44 | Ticket Detail rendered for an owned ticket | All nine fields displayed read-only; no input, select, or textarea bound to ticket data; no status control | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pending |
| UI-21 | UI | AC-44, BR-13 | Detail responds `404` | Safe not-found card; wording identical for a non-existent id and another requester's ticket | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pending |
| UI-22 | UI | AC-27, AC-26 | Attachment list holding one active and one removed file | Removed row shows the badge, reason, and timestamp, and renders **no** download, preview, or remove control | `client/tests/lab-02/AttachmentSection.test.tsx` | Pending |
| UI-23 | UI | AC-25, BR-31 | Remove clicked on an active attachment | Confirmation dialog appears; Remove stays disabled until the reason reaches 5 characters; DELETE is sent only after confirmation | `client/tests/lab-02/AttachmentSection.test.tsx` | Pending |
| UI-24 | UI | AC-21, BR-25 | Ticket already at five active attachments | Add attachment disabled with the limit explanation | `client/tests/lab-02/AttachmentSection.test.tsx` | Pending |
| UI-25 | UI | AC-47 | Keyboard-only pass over Requester Selection and Create Ticket | Every control reachable in visual order; the form submits without a mouse; the dialog traps and restores focus | `client/tests/lab-02/Accessibility.test.tsx` | Pass |

### 2.8 UI style tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| STYLE-01 | UI style | AC-46, ui-spec §1.1 | Theme tokens resolve | `--zen-primary` is `#006B3C`, `--zen-secondary` `#0B7A46`, `--zen-pale` `#EAF6EF`, `--zen-page-bg` `#F5F7F6` | `client/tests/lab-02/ZenGreenStyle.test.tsx` | Pass |
| STYLE-02 | UI style | AC-46 | Read-only vs editable fields on Create Ticket | Ticket Number, Ticket Date, Requester, Status carry the read-only class and the `readonly` attribute; editable fields do not | `client/tests/lab-02/ZenGreenStyle.test.tsx` | Pass |
| STYLE-03 | UI style | ui-spec §2.2 | Required-field marking | Every required control has a visible asterisk **and** `aria-required="true"`; the "Fields marked * are required" legend appears exactly once | `client/tests/lab-02/ZenGreenStyle.test.tsx` | Pass |
| STYLE-04 | UI style | BR-18 | Validation message placement | Each message is a sibling of its own field and is referenced by that field's `aria-describedby` | `client/tests/lab-02/ZenGreenStyle.test.tsx` | Pass |
| STYLE-05 | UI style | ui-spec §2.3 | Button hierarchy | Submit is primary, Cancel secondary, Remove attachment destructive; each uses the documented class | `client/tests/lab-02/ZenGreenStyle.test.tsx` | Pass |
| STYLE-06 | UI style | ui-spec §2.1 | Disabled and busy controls | Disabled controls carry the `disabled` attribute and cannot be activated; the busy button carries `aria-busy="true"` and a spinner | `client/tests/lab-02/ZenGreenStyle.test.tsx` | Pass |
| STYLE-07 | UI style | AC-48 | Priority and status badges for all five values | Each renders its own text and the documented class; text alone identifies the value with colour removed | `client/tests/lab-02/ZenGreenStyle.test.tsx` | Pass |
| STYLE-08 | UI style | AC-46 | No hard-coded colours | No component source file outside `zen-theme.css` contains a hex colour literal | `client/tests/lab-02/ZenGreenStyle.test.tsx` | Pass |

### 2.9 Responsive tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| RESP-01 | Responsive | AC-45, FR-32 | All four screens at 1280×800, 820×1180, 375×812 | `document.scrollWidth <= clientWidth` at every viewport — no horizontal page scroll | `e2e/lab-02/responsive.spec.ts` | Pending |
| RESP-02 | Responsive | AC-45 | Create Ticket labels and messages at 375 px | No label clipped; no message overlapping another element (bounding-box comparison) | `e2e/lab-02/responsive.spec.ts` | Pending |
| RESP-03 | Responsive | ui-spec §6.3 | My Tickets at 1280 px vs 375 px | Table visible on desktop; ticket cards visible on mobile; the other is absent | `e2e/lab-02/responsive.spec.ts` | Pending |
| RESP-04 | Responsive | ui-spec §3 | Navigation at 375 px | Hamburger toggle present with an accessible name; nav links reachable after expanding | `e2e/lab-02/responsive.spec.ts` | Pending |
| RESP-05 | Responsive | AC-45 | Filters, pagination, and attachment controls at 375 px | All are reachable and clickable; touch targets ≥ 44 px | `e2e/lab-02/responsive.spec.ts` | Pending |
| RESP-06 | Responsive | AC-49 | A 90-character attachment filename at 375 px | Rendered width stays within its container; the full name is present in the `title` attribute | `e2e/lab-02/responsive.spec.ts` | Pending |
| RESP-07 | Visual | ui-spec §12, DoD | Screenshot capture at three viewports for every documented state | All files written under `artifacts/lab-02/screenshots/` | `e2e/lab-02/screenshots.spec.ts` | Pending |

### 2.10 E2E tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-01 – AC-03, AC-08, AC-09 | Select a requester, create a ticket, land on the success state | Ticket Number displayed; the same number is then visible in My Tickets and on Ticket Detail | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| E2E-02 | E2E | AC-11, AC-12, AC-16 | Submit an invalid form, correct it, then submit while the API is intercepted as failing, then succeed | Field messages appear; values survive the failure; retry succeeds | `e2e/lab-02/create-ticket.spec.ts` | Pending |
| E2E-03 | E2E | AC-18, AC-19, AC-23 | Stage one valid and one invalid attachment and submit | Ticket created; the valid file uploads; the invalid one is reported individually and never uploaded | `e2e/lab-02/create-ticket.spec.ts` | Pending |
| E2E-04 | E2E | AC-31, AC-04, AC-41 | Requester A creates a ticket, then the user switches to Requester B | A's ticket is absent from B's list; opening A's ticket URL as B shows the safe not-found state | `e2e/lab-02/ownership.spec.ts` | Pending |
| E2E-05 | E2E | AC-32 – AC-39 | Search, filter, sort, page size, pagination, and Clear filters across a seeded set of 12 tickets | Each control changes the result set as documented; empty and no-results states differ; paging works both ways | `e2e/lab-02/my-tickets.spec.ts` | Pending |
| E2E-06 | E2E | AC-24 – AC-27 | Add an attachment on Ticket Detail, download it, then soft-remove it with a reason | Download succeeds; after removal the metadata remains with its reason and the download control is gone | `e2e/lab-02/attachments.spec.ts` | Pending |
| E2E-07 | E2E | AC-26 | The removed attachment's download URL is opened directly in the browser | `410`; no file downloaded | `e2e/lab-02/attachments.spec.ts` | Pending |
| E2E-08 | E2E | AC-02, AC-05 | `localStorage` cleared mid-session, then a ticket URL opened | Redirected to Requester Selection; no ticket data rendered | `e2e/lab-02/ownership.spec.ts` | Pending |

**Totals:** 12 unit · 53 API · 25 UI component · 8 UI style · 7 responsive/visual · 8 E2E = **113 planned tests**.

---

## 3. Acceptance-Criterion Traceability

### 3.1 AC → tests

Every AC maps to at least one automated test. No AC is proven by a screenshot alone.

| AC | Covered by |
|---|---|
| AC-01 | API-03, UI-01, E2E-01 |
| AC-02 | UI-04, E2E-08 |
| AC-03 | UI-05, E2E-01 |
| AC-04 | UI-19, E2E-04 |
| AC-05 | UI-02, E2E-08 |
| AC-06 | UI-03 |
| AC-07 | API-07, UI-06 |
| AC-08 | API-09, UI-11, E2E-01 |
| AC-09 | UNIT-01, UNIT-02, UNIT-03, API-09, API-10 |
| AC-10 | API-01, API-02, UI-07 |
| AC-11 | UI-08, E2E-02 |
| AC-12 | UNIT-11, API-14, UI-09, E2E-02 |
| AC-13 | API-13 |
| AC-14 | UI-10 |
| AC-15 | API-18, API-19, UI-13 |
| AC-16 | UI-12, E2E-02 |
| AC-17 | API-12 |
| AC-18 | API-35, E2E-03 |
| AC-19 | UNIT-05, API-38, UI-14, E2E-03 |
| AC-20 | UNIT-06, API-39, API-40 |
| AC-21 | API-41, UI-24 |
| AC-22 | API-42 |
| AC-23 | UI-15, E2E-03 |
| AC-24 | API-45, E2E-06 |
| AC-25 | API-46, UI-23, E2E-06 |
| AC-26 | API-47, API-51, UI-22, E2E-07 |
| AC-27 | API-34, UI-22, E2E-06 |
| AC-28 | UNIT-12, API-48 |
| AC-29 | API-49 |
| AC-30 | UNIT-07, UNIT-08, API-36, API-37 |
| AC-31 | API-21, E2E-04 |
| AC-32 | UI-16, E2E-05 |
| AC-33 | UI-16, E2E-05 |
| AC-34 | API-24, E2E-05 |
| AC-35 | API-25, E2E-05 |
| AC-36 | API-22, API-23, E2E-05 |
| AC-37 | API-26, API-27, E2E-05 |
| AC-38 | UI-17, E2E-05 |
| AC-39 | UNIT-10, API-28 |
| AC-40 | UI-18 |
| AC-41 | API-31, E2E-04 |
| AC-42 | API-50, API-51 |
| AC-43 | API-30, UI-20 |
| AC-44 | API-32, UI-21, E2E-04 |
| AC-45 | RESP-01, RESP-02, RESP-05 |
| AC-46 | STYLE-01, STYLE-02, STYLE-03, STYLE-08 |
| AC-47 | UI-25 |
| AC-48 | STYLE-07 |
| AC-49 | RESP-06 |
| AC-50 | UI-01 |

### 3.2 Business rules with dedicated coverage

Rules whose failure would not be caught by the AC tests alone:

| BR | Covered by |
|---|---|
| BR-03 (number format, year, uniqueness) | UNIT-01 – UNIT-03, API-10 |
| BR-06 (no silent priority default) | API-17 |
| BR-08 / BR-50 (never authentication) | API-08, UI-01 |
| BR-11 (context missing/malformed) | API-05, API-06 |
| BR-13 (indistinguishable 404) | API-32, API-51 |
| BR-16 (trim then validate) | UNIT-11, API-15 |
| BR-19 (per-requester duplicate window) | API-18, API-19 |
| BR-22 (no leaked internals) | API-20 |
| BR-24 (5 MB boundary inclusive) | API-40 |
| BR-25 (removed files free a slot) | API-29, API-42 |
| BR-27 (safe storage, not static) | API-36, API-37, API-53 |
| BR-28 (compensating delete) | API-52 |
| BR-30 (row and file survive removal) | API-46 |
| BR-37 (priority sorted by severity) | API-27 |
| BR-40 (page past the end) | API-23 |
| BR-45 (inactive reference data) | API-01, API-02, API-16 |
| BR-46 (idempotent seed) | API-04 |
| BR-47 (inactive requester rejected) | API-03, API-07 |

---

## 4. Responsive and Visual Checklist

Automated coverage is RESP-01 – RESP-07. The manual pass below is completed against the captured screenshots,
not from memory, and mirrors [ui-spec.md §11](ui-spec.md).

### 4.1 Manual visual pass

| # | Check | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| V-01 | Header, primary buttons, and emphasis use `#006B3C` | ☐ | ☐ | ☐ |
| V-02 | Active nav, links, and focus accents use `#0B7A46` | ☐ | ☐ | ☐ |
| V-03 | Page background `#F5F7F6`; cards white with one border and one shadow level | ☐ | ☐ | ☐ |
| V-04 | Read-only fields visibly distinct from editable fields and still readable | ☐ | ☐ | ☐ |
| V-05 | All single-line inputs share one height; Description taller and resizable | ☐ | ☐ | ☐ |
| V-06 | Required asterisks present; legend appears once | ☐ | ☐ | ☐ |
| V-07 | Validation messages sit below their own field, never only at the top | ☐ | ☐ | ☐ |
| V-08 | Button hierarchy obvious; disabled and busy states distinct | ☐ | ☐ | ☐ |
| V-09 | Priority and status badges match the documented colours and carry text | ☐ | ☐ | ☐ |
| V-10 | Removed attachments show metadata with no download or preview control | ☐ | ☐ | ☐ |
| V-11 | Empty and no-results states visibly different with the right primary action | ☐ | ☐ | ☐ |
| V-12 | No clipped label, no overlap, no unintended horizontal scrolling | ☐ | ☐ | ☐ |
| V-13 | Long attachment filenames truncate and expose the full name in `title` | ☐ | ☐ | ☐ |
| V-14 | Filters, pagination, and attachment controls usable at 375 px | ☐ | ☐ | ☐ |
| V-15 | Focus ring visible on every control, including selects and file inputs | ☐ | ☐ | ☐ |
| V-16 | Selector text states it is a Lab 2 testing mechanism, not authentication | ☐ | ☐ | ☐ |

### 4.2 Screenshot inventory

Captured by RESP-07 at 1280×800, 820×1180, and 375×812, named `<state>.<viewport>.png`.

| Directory | States |
|---|---|
| `artifacts/lab-02/screenshots/requester-selection/` | `loading`, `loaded`, `empty`, `error` |
| `artifacts/lab-02/screenshots/create-ticket/` | `initial`, `validation-failure`, `submitting`, `success`, `api-failure`, `invalid-attachment` |
| `artifacts/lab-02/screenshots/my-tickets/` | `loaded`, `empty`, `no-results`, `filtered`, `page-2`, `error` |
| `artifacts/lab-02/screenshots/ticket-detail/` | `loaded`, `attachment-active`, `attachment-removed`, `remove-dialog`, `not-found` |

---

## 5. Test Commands

Prerequisites: PostgreSQL running, `server/.env` configured, migrations applied, seed executed.

```bash
cd server && npx prisma migrate deploy && npx prisma db seed
```

Server unit and API tests:

```bash
cd server && npm test
```

Client unit, UI component, and UI style tests:

```bash
cd client && npm test
```

E2E, responsive, and screenshot capture (Playwright starts the client and server itself):

```bash
npx playwright test
```

Everything, as run before the release Pull Request:

```bash
cd server && npm test && cd ../client && npm test && cd .. && npx playwright test
```

---

## 6. Final Results

To be filled from real output on `main` before the release Pull Request. Claimed results without pasted output
are not accepted (handout §11.2).

### 6.1 Server (unit + API)

```text
(paste `cd server && npm test` output here)
```

### 6.2 Client (unit + UI + UI style)

```text
(paste `cd client && npm test` output here)
```

### 6.3 E2E, responsive, and screenshots

```text
(paste `npx playwright test` output here)
```

### 6.4 Summary

| Level | Planned | Implemented | Passing | Skipped |
|---|---|---|---|---|
| Unit | 12 | — | — | — |
| API | 53 | — | — | — |
| UI component | 25 | — | — | — |
| UI style | 8 | — | — | — |
| Responsive / visual | 7 | — | — | — |
| E2E | 8 | — | — | — |
| **Total** | **113** | — | — | — |

Skipped, `.only`, `.todo`, and commented-out tests must all be zero (Definition of Done §10.1).

---

## 7. Known Limitations and Deferred Tests

| # | Limitation | Why | When it becomes relevant |
|---|---|---|---|
| L-01 | Concurrency of the Ticket Number counter is not load-tested — only sequential uniqueness is asserted (API-10) | The atomic `ON CONFLICT … RETURNING` statement is correct by construction; a meaningful race test needs parallel connections and would be flaky at lab scale | If duplicate ticket numbers ever appear in practice |
| L-02 | The 60-second duplicate window is tested only at "immediately after", not at "61 seconds later" | A real 61-second wait would make the suite unacceptably slow, and faking the clock would not exercise the actual `createdAt` query | If the window becomes configurable |
| L-03 | Ticket Number year rollover is unit-tested (UNIT-03) but not tested end to end | Would require controlling the server clock | If the counter is ever changed to a different reset period |
| L-04 | Contrast ratios are documented and checked manually, not asserted automatically | An automated contrast audit needs an accessibility-testing dependency that Lab 2 does not otherwise require | If the palette changes, or when an axe-based audit is added in a later lab |
| L-05 | No visual regression (pixel-diff) baseline — screenshots are captured as evidence and inspected, not compared | Pixel baselines are brittle across machines and fonts, and the handout asks for inspection against `ui-spec.md` | If the UI stabilises and drift becomes a real problem |
| L-06 | Browser coverage is Chromium only | Course scope; the stack uses no browser-specific API | If a cross-browser defect is reported |
| L-07 | Screen-reader behaviour is asserted through roles and ARIA attributes, not with a real screen reader | Out of scope for automated tests | If accessibility becomes a graded deliverable in a later lab |
| L-08 | Load, rate-limiting, and security-penetration testing are excluded | Lab 2 has no authentication and no rate limiting by design (api-spec §5) | Lab 3, once real identities exist |

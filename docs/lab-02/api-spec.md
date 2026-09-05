# Lab 2 REST API Specification

Project: TokTickIT — IT Service Desk
Sprint: Lab 2 — Requester Ticketing MVP
Status: Draft for student review and approval (must be approved before implementation begins)
Companion documents: [specification.md](specification.md), [ui-spec.md](ui-spec.md), [tests.md](tests.md)

This document is the authoritative wire contract. Where a rule is stated here it must match the business rule
(BR-nn) and acceptance criterion (AC-nn) it references in `specification.md`; if they ever disagree,
`specification.md` wins and this file is corrected.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api` |
| Transport | HTTP/1.1, same-origin in development through the Vite proxy (`/api` → `http://localhost:3000`) |
| Request body | `application/json; charset=utf-8`, except attachment upload which is `multipart/form-data` |
| Response body | `application/json; charset=utf-8`, except attachment download which is the binary file |
| Character handling | All string inputs are trimmed before validation and stored trimmed (BR-16) |
| Timestamps | ISO-8601 with `Z` (UTC) in every payload; the client renders them in `Asia/Bangkok` (A-10) |
| Identifiers | Integers. `:id` path parameters must be a positive integer; anything else is `400 INVALID_PATH_PARAMETER` |
| Unknown body fields | Ignored, never echoed back. A `requesterId` in a body is explicitly ignored (BR-05, AC-17) |
| Caching | All `/api` responses send `Cache-Control: no-store`; the browser must never serve one Requester's data to another |
| Static file serving | `server/uploads/` is **not** exposed as a static directory. Every byte is delivered through the ownership-checked download endpoint (BR-27) |

### 1.1 Requester context header

Every **requester-scoped** route requires the header:

```
X-Requester-Id: <positive integer>
```

Resolution is performed by one middleware (`requesterContext`) before any route handler runs (BR-48).

| Condition | Result |
|---|---|
| Header absent, empty, non-numeric, or ≤ 0 | `400` `REQUESTER_CONTEXT_MISSING` |
| Header numeric but no such `RequesterUser` | `403` `REQUESTER_CONTEXT_INVALID` |
| Header refers to a Requester with `isActive = false` | `403` `REQUESTER_CONTEXT_INVALID` (BR-47) |
| Otherwise | `req.requester` is set and the handler runs |

The header is a **simulated testing context, not authentication** (BR-08, BR-50). `401` is never returned by any
Lab 2 endpoint — see §6.2.

Requester-scoped routes: endpoints 5–11 in §3. Public (context-free) routes: endpoints 1–4.

### 1.2 Error envelope

Every non-2xx response uses exactly this shape (A-14):

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The ticket could not be created because some fields are invalid.",
    "fields": [
      { "field": "summary", "message": "Summary must be between 10 and 120 characters." },
      { "field": "categoryId", "message": "Category is required." }
    ]
  }
}
```

- `code` — stable, uppercase, snake-case. Clients branch on `code`, never on `message`.
- `message` — safe, human-readable, no stack trace, no SQL, no file-system path, no Prisma internals (BR-22).
- `fields` — present **only** for `VALIDATION_FAILED`; one entry per offending field, `field` matching the request
  body key or query-parameter name.

The Lab 1 endpoints migrate from `{ "error": "text" }` to this envelope so the client has one parser (A-14).

### 1.3 Error code catalogue

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | One or more body fields failed validation (BR-17, BR-18) |
| `INVALID_QUERY_PARAMETER` | 400 | An unsupported or malformed query parameter (BR-39) |
| `INVALID_PATH_PARAMETER` | 400 | `:id` is not a positive integer |
| `REQUESTER_CONTEXT_MISSING` | 400 | `X-Requester-Id` absent or malformed (BR-11) |
| `NO_FILE_UPLOADED` | 400 | Multipart request carried no `file` part |
| `REQUESTER_CONTEXT_INVALID` | 403 | `X-Requester-Id` is unknown or inactive (BR-11, BR-47) |
| `TICKET_NOT_FOUND` | 404 | Ticket does not exist **or** belongs to another Requester (BR-13) |
| `ATTACHMENT_NOT_FOUND` | 404 | Attachment does not exist **or** its Ticket belongs to another Requester (BR-14) |
| `DUPLICATE_SUBMISSION` | 409 | Identical Ticket by the same Requester within 60 seconds (BR-19) |
| `ATTACHMENT_LIMIT_REACHED` | 409 | Ticket already has five active attachments (BR-25) |
| `ALREADY_REMOVED` | 409 | Attachment is already soft-removed (BR-32) |
| `ATTACHMENT_REMOVED` | 410 | Download requested for a soft-removed attachment (BR-32) |
| `FILE_TOO_LARGE` | 413 | File exceeds 5 MB (BR-24) |
| `UNSUPPORTED_FILE_TYPE` | 415 | File type outside the allowlist (BR-23) |
| `INTERNAL_ERROR` | 500 | Unexpected server error, details logged server-side only (BR-22) |

---

## 2. Shared resource shapes

### 2.1 `Category`

```json
{ "id": 1, "name": "Account and Access" }
```

### 2.2 `RelatedSystem`

```json
{ "id": 3, "name": "VPN" }
```

### 2.3 `Requester` (public projection)

```json
{ "id": 2, "fullName": "Nadia Charoen", "email": "nadia.charoen@toktickit.test", "department": "Registrar Office" }
```

`isActive` is never returned: the endpoint only ever emits active Requesters, so exposing the flag would be dead
weight (BR-09).

### 2.4 `TicketSummary` (list item)

```json
{
  "id": 41,
  "ticketNumber": "TKT-2026-000041",
  "summary": "Laptop battery drains within thirty minutes",
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
  "requestedPriority": "HIGH",
  "status": "NEW",
  "attachmentCount": 2,
  "createdAt": "2026-08-22T03:11:04.512Z",
  "updatedAt": "2026-08-22T03:19:47.980Z"
}
```

`attachmentCount` counts **active** attachments only (BR-25) and lets My Tickets show an attachment indicator
without a second request.

### 2.5 `Ticket` (detail)

`TicketSummary` plus `description`, `requester`, and `attachments`:

```json
{
  "id": 41,
  "ticketNumber": "TKT-2026-000041",
  "summary": "Laptop battery drains within thirty minutes",
  "description": "The battery on my assigned corporate laptop drops from 100% to 15% in about half an hour ...",
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
  "requester": { "id": 2, "fullName": "Nadia Charoen", "email": "nadia.charoen@toktickit.test", "department": "Registrar Office" },
  "requestedPriority": "HIGH",
  "status": "NEW",
  "createdAt": "2026-08-22T03:11:04.512Z",
  "updatedAt": "2026-08-22T03:19:47.980Z",
  "attachments": [ /* Attachment objects, see 2.6 */ ]
}
```

### 2.6 `Attachment`

Active:

```json
{
  "id": 88,
  "ticketId": 41,
  "originalFilename": "battery-report.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 254118,
  "uploadedBy": { "id": 2, "fullName": "Nadia Charoen" },
  "uploadedAt": "2026-08-22T03:19:47.980Z",
  "isRemoved": false,
  "removedAt": null,
  "removalReason": null,
  "removedBy": null,
  "downloadUrl": "/api/attachments/88/download"
}
```

Removed (BR-30, BR-32):

```json
{
  "id": 87,
  "ticketId": 41,
  "originalFilename": "wrong-screenshot.png",
  "mimeType": "image/png",
  "sizeBytes": 812004,
  "uploadedBy": { "id": 2, "fullName": "Nadia Charoen" },
  "uploadedAt": "2026-08-22T03:14:02.001Z",
  "isRemoved": true,
  "removedAt": "2026-08-22T03:22:10.774Z",
  "removalReason": "Uploaded the wrong screenshot",
  "removedBy": { "id": 2, "fullName": "Nadia Charoen" },
  "downloadUrl": null
}
```

Rules for this shape:

- `storedFilename` is **never** returned — it is an internal storage detail (BR-27).
- `isRemoved` is a derived convenience field (`removedAt !== null`); `removedAt` remains the source of truth
  (§7.4 of `specification.md`).
- `downloadUrl` is `null` for removed attachments so no client can accidentally render a download or preview
  control for one (BR-32, AC-26).
- Attachments are ordered `uploadedAt` ascending, `id` ascending.

### 2.7 `PageMeta`

```json
{ "page": 1, "pageSize": 10, "totalItems": 12, "totalPages": 2, "sortBy": "createdAt", "sortOrder": "desc" }
```

`totalPages` is `Math.ceil(totalItems / pageSize)`, and `0` when `totalItems` is `0`.

---

## 3. Endpoints

### 3.1 `GET /api/health`

Liveness check carried over from Lab 1. No requester context.

**Response `200`**

```json
{ "status": "ok", "service": "TokTickIT API" }
```

| Failure | Status | Code |
|---|---|---|
| Unexpected error | 500 | `INTERNAL_ERROR` |

---

### 3.2 `GET /api/categories`

Active Categories for the Create Ticket classification controls. No requester context.

Ordered by `id` ascending, preserving the Lab 1 contract (A-18). Returns only rows with `isActive = true`
(BR-45).

**Response `200`**

```json
[
  { "id": 1, "name": "Account and Access" },
  { "id": 2, "name": "Hardware" },
  { "id": 3, "name": "Software" },
  { "id": 4, "name": "Network" }
]
```

| Failure | Status | Code |
|---|---|---|
| Database unavailable | 500 | `INTERNAL_ERROR` |

Traceability: FR-07, BR-45, AC-10.

---

### 3.3 `GET /api/related-systems`

Active Related Systems. No requester context. Ordered by `name` ascending — this list is longer than Categories
and is chosen from a dropdown, so alphabetical order is what a user can scan.

**Response `200`**

```json
[
  { "id": 2, "name": "Campus Wi-Fi" },
  { "id": 7, "name": "Corporate Laptop" },
  { "id": 1, "name": "Email" },
  { "id": 5, "name": "Grade Submission App" },
  { "id": 4, "name": "LEB2 App" },
  { "id": 6, "name": "Printer" },
  { "id": 3, "name": "VPN" }
]
```

| Failure | Status | Code |
|---|---|---|
| Database unavailable | 500 | `INTERNAL_ERROR` |

Traceability: FR-07, BR-45, AC-10.

---

### 3.4 `GET /api/requesters`

Active Development Requesters for the temporary selection screen. No requester context — this endpoint is what
*establishes* the context.

Ordered by `fullName` ascending. Returns **only** `isActive = true` rows; the seeded inactive Requester must never
appear (BR-09, BR-47, AC-01).

**Response `200`**

```json
[
  { "id": 1, "fullName": "Anucha Pimwan", "email": "anucha.pimwan@toktickit.test", "department": "Faculty of Engineering" },
  { "id": 2, "fullName": "Nadia Charoen", "email": "nadia.charoen@toktickit.test", "department": "Registrar Office" },
  { "id": 3, "fullName": "Pornchai Suk", "email": "pornchai.suk@toktickit.test", "department": "Library" },
  { "id": 4, "fullName": "Siriporn Wattana", "email": "siriporn.wattana@toktickit.test", "department": "Student Affairs" }
]
```

An empty array is a valid `200` response and drives the selection screen's empty state (AC-06) — it is not an
error.

| Failure | Status | Code |
|---|---|---|
| Database unavailable | 500 | `INTERNAL_ERROR` |

Traceability: FR-01, BR-09, BR-47, AC-01, AC-05, AC-06.

---

### 3.5 `POST /api/tickets`

Create exactly one validated Ticket for the current Requester. **JSON only — this endpoint never carries files**
(BR-29, A-04).

**Headers**: `X-Requester-Id` required, `Content-Type: application/json`.

**Request body**

```json
{
  "summary": "Laptop battery drains within thirty minutes",
  "description": "The battery on my assigned corporate laptop drops from 100% to 15% in about half an hour, even with only a browser open. It started after the last Windows update.",
  "categoryId": 2,
  "relatedSystemId": 7,
  "requestedPriority": "HIGH"
}
```

**Field rules** (server-authoritative, mirrored on the client — BR-17)

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `summary` | string | Yes | Trimmed length 10–120 | "Summary must be between 10 and 120 characters." |
| `description` | string | Yes | Trimmed length 20–2000 | "Description must be between 20 and 2000 characters." |
| `categoryId` | integer | Yes | Must be an existing **active** Category | "Select a valid category." |
| `relatedSystemId` | integer | Yes | Must be an existing **active** Related System | "Select a valid related system." |
| `requestedPriority` | string | Yes | One of `LOW`, `MEDIUM`, `HIGH`, `URGENT` | "Select a requested priority." |

Server-assigned values, never accepted from the client: `ticketNumber` (BR-01, BR-03), `status = NEW` (BR-02),
`createdAt` / `updatedAt` (BR-04), `requesterId` from the header context (BR-05, AC-17).

**Response `201`** — the full `Ticket` detail shape (§2.5) with `attachments: []`.

```json
{
  "id": 41,
  "ticketNumber": "TKT-2026-000041",
  "summary": "Laptop battery drains within thirty minutes",
  "description": "The battery on my assigned corporate laptop drops ...",
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
  "requester": { "id": 2, "fullName": "Nadia Charoen", "email": "nadia.charoen@toktickit.test", "department": "Registrar Office" },
  "requestedPriority": "HIGH",
  "status": "NEW",
  "createdAt": "2026-08-22T03:11:04.512Z",
  "updatedAt": "2026-08-22T03:11:04.512Z",
  "attachments": []
}
```

`Location: /api/tickets/41` is also set.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| Any field rule violated | 400 | `VALIDATION_FAILED` | `fields` lists every offending field in one response, not just the first (BR-18, AC-13) |
| `categoryId` / `relatedSystemId` exists but is inactive | 400 | `VALIDATION_FAILED` | Same message as "not found" — reference data state is not enumerable |
| Missing / malformed header | 400 | `REQUESTER_CONTEXT_MISSING` | |
| Unknown or inactive Requester | 403 | `REQUESTER_CONTEXT_INVALID` | AC-07 |
| Same `requesterId` + `summary` + `description` created < 60 s ago | 409 | `DUPLICATE_SUBMISSION` | Message: "A ticket with the same summary and description was submitted moments ago." The client keeps the form intact (BR-19, AC-15) |
| Unexpected error | 500 | `INTERNAL_ERROR` | Nothing is persisted (BR-21) |

**Ticket Number generation** (BR-03) runs inside the same transaction as the ticket insert:

```sql
INSERT INTO "TicketNumberCounter" ("year", "lastValue")
VALUES ($1, 1)
ON CONFLICT ("year") DO UPDATE SET "lastValue" = "TicketNumberCounter"."lastValue" + 1
RETURNING "lastValue";
```

The returned value is formatted as `TKT-${year}-${String(lastValue).padStart(6, '0')}`. The year is the current
year in `Asia/Bangkok` (A-10). If the transaction rolls back, the consumed number is not reused and the gap is
accepted.

Traceability: FR-09, FR-10, BR-01 – BR-06, BR-17 – BR-21, AC-08, AC-09, AC-11 – AC-17.

---

### 3.6 `GET /api/tickets`

The current Requester's own Tickets, searched, filtered, sorted, and paginated **server-side** (BR-34).

**Headers**: `X-Requester-Id` required.

**Query parameters**

| Parameter | Type | Accepted values | Default | Rule |
|---|---|---|---|---|
| `search` | string | Free text, trimmed | none | Case-insensitive substring match against `ticketNumber`, `summary`, `description` (BR-35). Empty after trim ⇒ no search |
| `categoryId` | integer | Existing Category id | none | BR-36 |
| `relatedSystemId` | integer | Existing Related System id | none | BR-36 |
| `requestedPriority` | string | `LOW` \| `MEDIUM` \| `HIGH` \| `URGENT` | none | BR-36 |
| `status` | string | `NEW` | none | BR-36 |
| `sortBy` | string | `createdAt` \| `updatedAt` \| `ticketNumber` \| `requestedPriority` | `createdAt` | BR-37 |
| `sortOrder` | string | `asc` \| `desc` | `desc` | BR-37 |
| `page` | integer | ≥ 1 | `1` | BR-38 |
| `pageSize` | integer | `10` \| `20` \| `50` | `10` | BR-38 |

Additional rules:

- All present filters combine with `AND`, and combine with `search` using `AND` (BR-36).
- Every query is scoped by `requesterId` **inside** the `where` clause, never filtered afterwards (BR-15).
- Secondary sort is always `id desc`, so pages are stable when the primary key values tie (BR-37, AC-37).
- `requestedPriority` sorting is by severity (`URGENT > HIGH > MEDIUM > LOW`), not alphabetically — sorting a
  priority alphabetically would be meaningless to a user. Implemented with an explicit ordering expression.
- An unknown parameter name is ignored; an unsupported **value** is rejected (BR-39).
- `page` beyond the last page returns `200` with `data: []` and correct meta (BR-40, AC-36).

**Example**

```
GET /api/tickets?search=laptop&categoryId=2&requestedPriority=HIGH&sortBy=createdAt&sortOrder=desc&page=1&pageSize=10
X-Requester-Id: 2
```

**Response `200`**

```json
{
  "data": [ /* TicketSummary objects, §2.4 */ ],
  "meta": { "page": 1, "pageSize": 10, "totalItems": 12, "totalPages": 2, "sortBy": "createdAt", "sortOrder": "desc" }
}
```

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `pageSize=999`, `page=abc`, `sortBy=secret`, `requestedPriority=CRITICAL`, `sortOrder=sideways` | 400 | `INVALID_QUERY_PARAMETER` | `message` names the offending parameter, e.g. "pageSize must be one of 10, 20, 50." Never silently coerced (BR-39, AC-39) |
| Missing / malformed header | 400 | `REQUESTER_CONTEXT_MISSING` | |
| Unknown or inactive Requester | 403 | `REQUESTER_CONTEXT_INVALID` | |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-21 – FR-27, BR-34 – BR-41, AC-31 – AC-40.

---

### 3.7 `GET /api/tickets/:id`

One Ticket owned by the current Requester, including all attachment metadata.

**Headers**: `X-Requester-Id` required.

**Response `200`** — the `Ticket` detail shape (§2.5), `attachments` containing both active and removed entries
(BR-32, AC-27).

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| Ticket does not exist | 404 | `TICKET_NOT_FOUND` | |
| Ticket exists but belongs to another Requester | 404 | `TICKET_NOT_FOUND` | **Byte-identical** to the previous row — no timing- or message-based way to tell them apart (BR-13, AC-41, AC-44) |
| Missing / malformed header | 400 | `REQUESTER_CONTEXT_MISSING` | |
| Unknown or inactive Requester | 403 | `REQUESTER_CONTEXT_INVALID` | |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Implementation note: the lookup is `findFirst({ where: { id, requesterId } })`. There is no "fetch then compare"
step, so the not-owned case cannot accidentally leak data through a partially rendered response (BR-15).

Traceability: FR-28 – FR-30, BR-13 – BR-15, BR-43, BR-44, AC-41, AC-43, AC-44.

---

### 3.8 `POST /api/tickets/:id/attachments`

Upload **one** permitted file to an owned Ticket. Used both by the Create Ticket flow (immediately after the
ticket is created) and by Ticket Detail (BR-29, FR-14, FR-15).

**Headers**: `X-Requester-Id` required, `Content-Type: multipart/form-data`.

**Body**: exactly one part named `file`. Additional parts are ignored. Multiple files require multiple requests —
this is what makes per-file success and failure reportable (A-04, AC-23).

**Validation order** (fail fast, cheapest check first):

1. `:id` is a positive integer → else `400 INVALID_PATH_PARAMETER`.
2. Requester context resolves → else `400` / `403`.
3. Ticket exists **and** is owned → else `404 TICKET_NOT_FOUND` (BR-14).
4. A `file` part is present → else `400 NO_FILE_UPLOADED`.
5. Size ≤ 5 MB — enforced by the multipart parser limit so the request is aborted rather than fully buffered →
   else `413 FILE_TOO_LARGE` (BR-24, AC-20).
6. Extension is in `{.jpg, .jpeg, .png, .webp, .pdf}` **and** the leading magic bytes match one of the permitted
   types → else `415 UNSUPPORTED_FILE_TYPE` (BR-23, AC-19).
7. Active attachment count for the Ticket < 5 → else `409 ATTACHMENT_LIMIT_REACHED` (BR-25, AC-21, AC-22).

**Magic-byte signatures accepted** (the client `Content-Type` is never trusted — BR-23):

| Type | Leading bytes |
|---|---|
| JPEG | `FF D8 FF` |
| PNG | `89 50 4E 47 0D 0A 1A 0A` |
| WEBP | `52 49 46 46 ?? ?? ?? ?? 57 45 42 50` (`RIFF....WEBP`) |
| PDF | `25 50 44 46 2D` (`%PDF-`) |

The stored `mimeType` is the type derived from the signature, not the header value.

**Storage** (BR-27, BR-28):

- Path `server/uploads/<ticketId>/<uuidv4><normalisedExtension>`; the directory is created if missing.
- `originalFilename` is stored for display only, capped at 255 characters, and any path separator or `..`
  sequence causes rejection with `400 VALIDATION_FAILED` (`field: "file"`) — it is never used to build a path
  (AC-30).
- Write the file first, then insert the row. If the insert fails, delete the written file before returning the
  error, so no orphan file survives (BR-28).
- If the write fails, no row is created and `500 INTERNAL_ERROR` is returned.

**Response `201`** — the `Attachment` shape (§2.6). The parent Ticket's `updatedAt` is refreshed (BR-07).

**Failures**

| Condition | Status | Code |
|---|---|---|
| Bad `:id` | 400 | `INVALID_PATH_PARAMETER` |
| No `file` part | 400 | `NO_FILE_UPLOADED` |
| Unsafe `originalFilename` | 400 | `VALIDATION_FAILED` |
| Missing / malformed header | 400 | `REQUESTER_CONTEXT_MISSING` |
| Unknown or inactive Requester | 403 | `REQUESTER_CONTEXT_INVALID` |
| Ticket unknown or not owned | 404 | `TICKET_NOT_FOUND` |
| Sixth active attachment | 409 | `ATTACHMENT_LIMIT_REACHED` |
| File > 5 MB | 413 | `FILE_TOO_LARGE` |
| Type not permitted | 415 | `UNSUPPORTED_FILE_TYPE` |
| Write or insert failure | 500 | `INTERNAL_ERROR` |

Traceability: FR-14 – FR-16, BR-23 – BR-29, AC-18 – AC-23, AC-30.

---

### 3.9 `GET /api/tickets/:id/attachments`

Attachment metadata for an owned Ticket, active **and** removed (BR-32, AC-27). Exists so Ticket Detail can
refresh the attachment section after an upload or a removal without re-fetching the whole ticket.

**Headers**: `X-Requester-Id` required.

**Response `200`** — an array of `Attachment` objects (§2.6), ordered `uploadedAt` ascending.

**Failures**: identical to §3.7 (`INVALID_PATH_PARAMETER`, `REQUESTER_CONTEXT_MISSING`,
`REQUESTER_CONTEXT_INVALID`, `TICKET_NOT_FOUND`, `INTERNAL_ERROR`).

Traceability: FR-17, BR-14, BR-26, BR-32, AC-27.

---

### 3.10 `GET /api/attachments/:id/download`

Download one **active** attachment belonging to an owned Ticket.

**Headers**: `X-Requester-Id` required.

**Response `200`** — the raw file bytes with:

```
Content-Type: <stored mimeType>
Content-Length: <sizeBytes>
Content-Disposition: attachment; filename="battery-report.pdf"; filename*=UTF-8''battery-report.pdf
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

`filename` uses the sanitised `originalFilename`; `filename*` carries the UTF-8 form so non-ASCII names survive
(AC-24). `nosniff` prevents a browser from re-interpreting an uploaded file as HTML.

**Ownership resolution**: the attachment is looked up joined to its Ticket with `ticket.requesterId = context`,
in one query. There is no separate ownership branch to forget (BR-15).

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| Attachment unknown, or its Ticket belongs to another Requester | 404 | `ATTACHMENT_NOT_FOUND` | Indistinguishable cases (BR-14, AC-42) |
| Attachment is soft-removed | 410 | `ATTACHMENT_REMOVED` | No bytes are sent; the file still exists on disk but is unreachable (BR-32, AC-26) |
| Missing / malformed header | 400 | `REQUESTER_CONTEXT_MISSING` | |
| Unknown or inactive Requester | 403 | `REQUESTER_CONTEXT_INVALID` | |
| Row exists but the file is missing from disk | 500 | `INTERNAL_ERROR` | Logged as a storage inconsistency |

Ordering note: ownership (`404`) is checked **before** removal (`410`). A non-owner must never learn that an
attachment was removed — they get the same `404` as for a non-existent id.

Traceability: FR-18, FR-20, BR-14, BR-27, BR-32, AC-24, AC-26, AC-42.

---

### 3.11 `DELETE /api/attachments/:id`

Soft-remove one active attachment of an owned Ticket. Despite the HTTP verb, **nothing is deleted** — the row and
the file both survive (BR-30).

**Headers**: `X-Requester-Id` required, `Content-Type: application/json`.

**Request body**

```json
{ "removalReason": "Uploaded the wrong screenshot" }
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `removalReason` | string | Yes | Trimmed length 5–200 | "Removal reason must be between 5 and 200 characters." |

The UI must collect this in an explicit confirmation step before sending (BR-31, AC-25).

**Effect**: one update writing `removedAt = now()`, `removalReason`, and `removedById = context.id` together —
never separately (§7.4 of `specification.md`). The parent Ticket's `updatedAt` is refreshed (BR-07).

**Response `200`** — the updated `Attachment` in its removed form (§2.6), with `downloadUrl: null`.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| Missing or too-short `removalReason` | 400 | `VALIDATION_FAILED` | Attachment stays active (AC-28) |
| Missing / malformed header | 400 | `REQUESTER_CONTEXT_MISSING` | |
| Unknown or inactive Requester | 403 | `REQUESTER_CONTEXT_INVALID` | |
| Attachment unknown or not owned | 404 | `ATTACHMENT_NOT_FOUND` | Nothing is modified (AC-42) |
| Attachment already removed | 409 | `ALREADY_REMOVED` | No restore path exists in Lab 2 (BR-32, AC-29) |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Check order: path parameter → context → ownership (`404`) → already-removed (`409`) → body validation (`400`).
Ownership is resolved before anything else can leak state.

Traceability: FR-19, FR-20, BR-17, BR-30 – BR-33, AC-25, AC-28, AC-29, AC-42.

---

## 4. Client call sequences

### 4.1 Requester selection

```
GET /api/requesters                     → 200 [ ... ]      (no context header)
  store selected id in localStorage under "toktickit.requesterId"   (BR-10)
  every later call attaches X-Requester-Id
```

On `403 REQUESTER_CONTEXT_INVALID` from **any** later call, the client clears the stored id and returns to
`/select-requester` (BR-11, AC-07).

### 4.2 Create Ticket with attachments

```
GET  /api/categories                    → 200
GET  /api/related-systems               → 200
POST /api/tickets                       → 201  { id, ticketNumber, ... }
  for each staged file, sequentially:
    POST /api/tickets/{id}/attachments  → 201 | 413 | 415 | 409
  render the success state with ticketNumber and one line per file result
```

The Ticket is never rolled back when a file fails; the failed file is reported individually and can be retried
from Ticket Detail (BR-29, AC-23). Files are uploaded sequentially, not in parallel, so the five-active-attachment
limit (BR-25) is evaluated against a settled count rather than five concurrent racing checks.

### 4.3 My Tickets

```
GET /api/tickets?page=1&pageSize=10                     → 200 { data, meta }
  filter / search / sort change → reset page to 1 (BR-41) and re-request
  row click → navigate to /tickets/{id}
```

### 4.4 Ticket Detail with attachment management

```
GET    /api/tickets/{id}                → 200 (includes attachments)
POST   /api/tickets/{id}/attachments    → 201, then refresh via GET /api/tickets/{id}/attachments
GET    /api/attachments/{aid}/download  → 200 binary
DELETE /api/attachments/{aid}           → 200, then refresh the attachment section
```

---

## 5. Security and safety notes (Lab 2 scope)

These are engineering safeguards, **not** authentication (X-01, BR-08, BR-50):

| Concern | Handling |
|---|---|
| Ownership | Enforced in the database query of every requester-scoped route (BR-15); never in the client, never post-filtered |
| Existence disclosure | Not-owned and not-found are the same `404` with the same body (BR-13) |
| Path traversal | Stored names are server-generated UUIDs; client filenames containing separators or `..` are rejected (BR-27, AC-30) |
| Content-type spoofing | Magic-byte validation plus an extension allowlist; `X-Content-Type-Options: nosniff` on download (BR-23) |
| Upload flooding | 5 MB per file, five active files per Ticket, one file per request (BR-24, BR-25) |
| Information leakage in errors | Fixed envelope with a safe message; stack traces, SQL, and paths are logged server-side only (BR-22) |
| Cross-Requester caching | `Cache-Control: no-store` on all `/api` responses |
| Orphan files | Compensating delete when a row insert fails after a successful write (BR-28) |

Explicitly **not** implemented in Lab 2: rate limiting, CSRF tokens, virus scanning, signed download URLs,
encryption at rest. Each becomes relevant once Lab 3 introduces real identities.

---

## 6. Status-code policy

### 6.1 Status codes in use

| Status | Used for |
|---|---|
| `200` | Successful retrieval, successful download, successful soft removal |
| `201` | Ticket created, attachment uploaded (with `Location` for tickets) |
| `400` | Body validation failure, invalid query parameter, invalid path parameter, missing or malformed `X-Requester-Id`, missing file part |
| `403` | `X-Requester-Id` refers to an unknown or inactive Requester |
| `404` | Ticket or Attachment unknown **or** owned by another Requester — deliberately indistinguishable |
| `409` | Duplicate submission, attachment limit reached, attachment already removed |
| `410` | Download requested for a soft-removed attachment |
| `413` | File larger than 5 MB |
| `415` | File type outside the allowlist |
| `500` | Unexpected server error, safe message only |

### 6.2 Status codes deliberately not used

| Status | Why not |
|---|---|
| `401 Unauthorized` | Lab 2 has no authentication. Returning `401` would present the Development Requester selector as an auth mechanism, which the handout forbids (BR-08, BR-50). Lab 3 introduces `401` together with real identities |
| `403` for ownership | Reserved for an invalid requester **context**. Ownership failures return `404` so the existence of another Requester's ticket is never confirmed (BR-13, A-02) |
| `422` | `400 VALIDATION_FAILED` with a `fields` array already carries the semantics; two validation statuses would give the client two code paths for one situation |
| `204` | Soft removal returns the updated resource so the client can re-render from the response instead of guessing the new state |

---

## 7. Traceability

| Endpoint | Functional requirements | Business rules | Acceptance criteria | Planned test file |
|---|---|---|---|---|
| `GET /api/health` | — | — | — | `server/tests/lab-01/API-01.health.test.ts` |
| `GET /api/categories` | FR-07 | BR-45 | AC-10 | `server/tests/lab-02/reference-data.api.test.ts` |
| `GET /api/related-systems` | FR-07 | BR-45 | AC-10 | `server/tests/lab-02/reference-data.api.test.ts` |
| `GET /api/requesters` | FR-01 | BR-09, BR-47 | AC-01, AC-05, AC-06 | `server/tests/lab-02/requesters.api.test.ts` |
| `POST /api/tickets` | FR-06, FR-09, FR-10, FR-13 | BR-01 – BR-06, BR-17 – BR-21 | AC-08, AC-09, AC-13 – AC-17 | `server/tests/lab-02/create-ticket.api.test.ts` |
| `GET /api/tickets` | FR-21 – FR-27 | BR-34 – BR-41 | AC-31 – AC-40 | `server/tests/lab-02/my-tickets.api.test.ts` |
| `GET /api/tickets/:id` | FR-28 – FR-30 | BR-13 – BR-15, BR-43, BR-44 | AC-41, AC-43, AC-44 | `server/tests/lab-02/ticket-detail.api.test.ts` |
| `POST /api/tickets/:id/attachments` | FR-14 – FR-16 | BR-23 – BR-29 | AC-18 – AC-23, AC-30 | `server/tests/lab-02/attachments.api.test.ts` |
| `GET /api/tickets/:id/attachments` | FR-17 | BR-14, BR-26, BR-32 | AC-27 | `server/tests/lab-02/attachments.api.test.ts` |
| `GET /api/attachments/:id/download` | FR-18, FR-20 | BR-14, BR-27, BR-32 | AC-24, AC-26, AC-42 | `server/tests/lab-02/attachments.api.test.ts` |
| `DELETE /api/attachments/:id` | FR-19, FR-20 | BR-17, BR-30 – BR-33 | AC-25, AC-28, AC-29, AC-42 | `server/tests/lab-02/attachments.api.test.ts` |

The full test plan, including UI, responsive, and E2E coverage, lives in [tests.md](tests.md).

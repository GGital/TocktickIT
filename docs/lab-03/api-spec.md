# Lab 3 REST API Specification

Project: TokTickIT — IT Service Desk
Sprint: Lab 3 — Authentication, Roles, IT Staff Ticketing, and Administrator User Management
Status: Draft for student review and approval (must be approved before implementation begins)
Companion documents: [specification.md](specification.md), [ui-spec.md](ui-spec.md), [tests.md](tests.md)

This document is the authoritative wire contract. Where a rule is stated here it must match the business rule
(BR-nn) and acceptance criterion (AC-nn) it references in `specification.md`; if they ever disagree,
`specification.md` wins and this file is corrected. Lab 2 endpoints whose behaviour is unchanged are not
restated — §3.5 lists them and names exactly what changed.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api` |
| Content type | `application/json` in and out, except attachment upload (`multipart/form-data`) and download (binary) |
| Identity | The `toktickit.sid` session cookie, resolved by one middleware (§1.1). The Lab 2 `X-Requester-Id` header is gone and is ignored if sent (BR-57) |
| Caching | `Cache-Control: no-store` on every `/api` response, unchanged from Lab 2 |
| Timestamps | ISO-8601 UTC on the wire; the client renders `Asia/Bangkok` |
| Mutations | Every state-changing route is `POST`, `PATCH`, or `DELETE` with a JSON body; no state changes on `GET` |

### 1.1 Authentication and the session cookie

`POST /api/auth/login` sets, and `POST /api/auth/logout` clears:

```
Set-Cookie: toktickit.sid=<32 random bytes, base64url>; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800
            [; Secure when NODE_ENV=production]
```

| Condition | Result |
|---|---|
| Cookie absent, malformed, unknown, or expired | `401` `UNAUTHENTICATED`; an expired row is deleted when encountered (BR-04) |
| Cookie valid, `mustChangePassword` is `true`, route is not `/api/auth/me`, `/api/auth/change-password`, or `/api/auth/logout` | `403` `PASSWORD_CHANGE_REQUIRED` (BR-15) |
| Cookie valid, role not permitted for the route | `403` `FORBIDDEN`, with no protected payload (BR-24) |
| Cookie valid and permitted | The session `User` is attached to the request and is the only identity any handler may use (BR-18) |

The session identifier is never returned in a response body, never placed in a URL, and never written to
`localStorage` or `sessionStorage` (BR-03, BR-12).

**CSRF.** `SameSite=Lax` stops a cross-site form or link from carrying the cookie on any `POST`, `PATCH`, or
`DELETE`. Every mutating route additionally requires `Content-Type: application/json` (or `multipart/form-data`
for upload, which is same-origin-only in this deployment because the browser must first read the ticket id from
an authenticated response). The client and the API are same-origin through the existing Vite dev proxy, so no
separate CSRF token is introduced (A-03).

### 1.2 Error envelope

Unchanged from Lab 2. Every non-2xx response is:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "safe human message",
    "fields": [{ "field": "email", "message": "Enter a valid email address." }]
  }
}
```

- `code` is stable and machine-readable; the client branches on it, never on `message`.
- `message` is safe human text only. No stack trace, SQL, Prisma internal, file-system path, password hash, or
  session identifier ever appears in it (BR-65).
- `fields` appears only for `VALIDATION_FAILED` and names every offending field, not just the first.

### 1.3 Error code catalogue

Lab 2 codes retained with their Lab 2 meaning: `VALIDATION_FAILED`, `INVALID_QUERY_PARAMETER`,
`INVALID_PATH_PARAMETER`, `NO_FILE_UPLOADED`, `TICKET_NOT_FOUND`, `ATTACHMENT_NOT_FOUND`,
`DUPLICATE_SUBMISSION`, `ATTACHMENT_LIMIT_REACHED`, `ALREADY_REMOVED`, `ATTACHMENT_REMOVED`, `FILE_TOO_LARGE`,
`UNSUPPORTED_FILE_TYPE`, `INTERNAL_ERROR`.

Retired: `REQUESTER_CONTEXT_MISSING` and `REQUESTER_CONTEXT_INVALID` — the header they described no longer
exists (BR-57). Their cases are now `UNAUTHENTICATED` or, at login, `INVALID_CREDENTIALS`.

Added in Lab 3:

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session (BR-04, BR-05) |
| `INVALID_CREDENTIALS` | 401 | Login failed — unknown email, wrong password, or inactive account, indistinguishably (BR-01) |
| `PASSWORD_CHANGE_REQUIRED` | 403 | A password change is outstanding (BR-15) |
| `FORBIDDEN` | 403 | The authenticated role may not perform this operation (BR-23) |
| `USER_NOT_FOUND` | 404 | An Administrator addressed a user id that does not exist |
| `EMAIL_ALREADY_EXISTS` | 409 | Case-insensitive email collision (BR-49) |
| `INVALID_ASSIGNEE` | 409 | Proposed Ticket Owner is unknown, inactive, or a Requester (BR-27) |
| `INVALID_STATUS_TRANSITION` | 409 | Transition outside the matrix, including status-to-itself (BR-36) |
| `ALREADY_FLAGGED` | 409 | Appears-resolved repeated on an already-flagged Ticket (BR-46) |
| `SELF_DEACTIVATION_FORBIDDEN` | 409 | An Administrator targeted their own activation state or role (BR-51) |
| `LAST_ACTIVE_ADMINISTRATOR` | 409 | The change would leave no active Administrator (BR-52) |
| `TOO_MANY_ATTEMPTS` | 429 | The login throttle window is open (BR-08) |

### 1.4 Middleware order

One ordered stack, mounted on prefixes so that a route added later cannot forget its guard (A-16):

```
express.json()                        every request
no-store cache header                 /api
resolveSession                        /api  (skipped for POST /api/auth/login)
requireAuth                           everything except POST /api/auth/login
requirePasswordChangeComplete         everything except /api/auth/me, /change-password, /logout
requireRole('IT_STAFF','ADMINISTRATOR')   /api/staff
requireRole('ADMINISTRATOR')              /api/admin
route handlers
handleUnexpectedError                 terminal
```

A handler therefore never performs its own authentication or role check; it performs only its ownership check,
and that check lives inside the query (BR-20).

---

## 2. Shared resource shapes

### 2.1 `AuthenticatedUser`

```json
{
  "id": 7,
  "fullName": "Ada Chaiyawat",
  "email": "ada.chaiyawat@kmutt.ac.th",
  "role": "IT_STAFF",
  "mustChangePassword": false
}
```

`passwordHash`, `isActive`, and every session field are deliberately absent. `isActive` is not returned because
an authenticated user is active by definition (BR-01).

### 2.2 `UserSummary` (Administrator projection)

```json
{
  "id": 12,
  "fullName": "Nara Sukjai",
  "email": "nara.sukjai@kmutt.ac.th",
  "role": "REQUESTER",
  "isActive": true,
  "mustChangePassword": true,
  "createdAt": "2026-09-02T04:11:09.000Z"
}
```

Returned only to an Administrator. It never contains `passwordHash` (BR-12).

### 2.3 `AssigneeOption`

```json
{ "id": 7, "fullName": "Ada Chaiyawat", "role": "IT_STAFF" }
```

Only active users whose role is `IT_STAFF` or `ADMINISTRATOR` are ever returned (BR-27).

### 2.4 `TicketSummary` (Requester list item)

The Lab 2 shape plus `itPriority` and `requesterResolvedFlagged`. `requester` is not included — on a Requester
list every row belongs to the caller.

### 2.5 `QueueTicketSummary` (staff list item)

```json
{
  "id": 41,
  "ticketNumber": "TKT-2026-000041",
  "summary": "VPN disconnects every few minutes",
  "category": { "id": 2, "name": "Network" },
  "relatedSystem": { "id": 3, "name": "VPN" },
  "requester": { "id": 12, "fullName": "Nara Sukjai" },
  "assignee": { "id": 7, "fullName": "Ada Chaiyawat" },
  "requestedPriority": "HIGH",
  "itPriority": "URGENT",
  "status": "IN_PROGRESS",
  "requesterResolvedFlagged": false,
  "createdAt": "2026-09-04T02:20:00.000Z",
  "updatedAt": "2026-09-09T08:02:31.000Z"
}
```

`assignee` is `null` when the Ticket is unassigned. The Requester's email is **not** included: the Queue is a
triage list, and a name is enough to recognise a person (§5).

### 2.6 `Ticket` (detail)

The Lab 2 detail shape plus `itPriority`, `assignee`, and `requesterResolvedFlaggedAt`, and with the widened
`status` enum. `attachments` keeps its Lab 2 shape exactly. Comments and Internal Notes are **not** embedded —
they are separate, separately authorized reads (§3.6, §3.14).

### 2.7 `TicketMessage`

```json
{
  "id": 88,
  "visibility": "PUBLIC",
  "body": "We have replaced the VPN profile. Please try again.",
  "isSystem": false,
  "author": { "id": 7, "fullName": "Ada Chaiyawat", "role": "IT_STAFF" },
  "createdAt": "2026-09-09T08:02:31.000Z"
}
```

A response returned to a Requester contains only `visibility: "PUBLIC"` entries, because the visibility is part
of the query predicate rather than a filter applied afterwards (BR-40).

### 2.8 `PageMeta`

Unchanged from Lab 2: `{ "page", "pageSize", "totalItems", "totalPages", "sortBy", "sortOrder" }`.

---

## 3. Endpoints

### 3.1 `POST /api/auth/login`

Authenticate and open a session. The only route reachable without a session.

**Headers**: `Content-Type: application/json`. No session required.

**Request body**

```json
{ "email": "ada.chaiyawat@kmutt.ac.th", "password": "correct horse battery staple" }
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `email` | string | Yes | Trimmed, lower-cased, must look like an email address | "Enter a valid email address." |
| `password` | string | Yes | Present and not whitespace-only; not length-validated here | "Enter your password." |

**Validation order** (fail fast, cheapest check first):

1. Body shape and field presence → else `400` `VALIDATION_FAILED`
2. Throttle window open for this email plus client address → else `429` `TOO_MANY_ATTEMPTS`
3. Find the user by normalised email; if absent, perform a dummy `scrypt` verification anyway (BR-10)
4. Verify the password with `timingSafeEqual`
5. Confirm `isActive`
6. Steps 3–5 failing in any combination → `401` `INVALID_CREDENTIALS`, one identical message (BR-01)

**Effect**: one `Session` row is created with a 32-byte random id and an expiry 8 hours ahead; the throttle
counter for that email and address is cleared.

**Response `200`** — the `AuthenticatedUser` (§2.1), with the session cookie in `Set-Cookie`.

```json
{ "id": 7, "fullName": "Ada Chaiyawat", "email": "ada.chaiyawat@kmutt.ac.th", "role": "IT_STAFF", "mustChangePassword": false }
```

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| Missing or malformed fields | 400 | `VALIDATION_FAILED` | |
| Unknown email, wrong password, or inactive account | 401 | `INVALID_CREDENTIALS` | One message for all three; no session created (AC-02) |
| Throttle window open | 429 | `TOO_MANY_ATTEMPTS` | Self-expiring; no account is locked (BR-08, AC-08) |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

The response body never contains the session identifier or the password hash (BR-12).

Traceability: FR-01, FR-02, FR-06, BR-01 – BR-03, BR-08 – BR-10, AC-01, AC-02, AC-08, AC-09.

---

### 3.2 `POST /api/auth/logout`

Invalidate the current session.

**Headers**: session cookie required.

**Effect**: the `Session` row is deleted and the cookie is cleared with an expired `Set-Cookie`. Replaying the
same identifier afterwards is `401` (BR-05).

**Response `204`** — no body.

**Failures**

| Failure | Status | Code |
|---|---|---|
| No valid session | 401 | `UNAUTHENTICATED` |
| Unexpected error | 500 | `INTERNAL_ERROR` |

Logout is permitted while a password change is outstanding — a user must always be able to leave (BR-15).

Traceability: FR-04, BR-05, AC-05, AC-06.

---

### 3.3 `GET /api/auth/me`

Return the current authenticated user. The client calls this once at start-up to restore a session and to
decide whether the mandatory Change Password screen is required.

**Headers**: session cookie required.

**Response `200`** — the `AuthenticatedUser` (§2.1).

**Failures**

| Failure | Status | Code |
|---|---|---|
| No valid session | 401 | `UNAUTHENTICATED` |
| Unexpected error | 500 | `INTERNAL_ERROR` |

Reachable while a password change is outstanding — the client needs this answer precisely in order to enforce
the gate on its side (BR-17).

Traceability: FR-03, FR-05, BR-04, AC-03, AC-04.

---

### 3.4 `POST /api/auth/change-password`

Change the authenticated user's password. The same endpoint serves the mandatory first-login change and a
voluntary change later; there is no separate "initial password" route, because the rules are identical.

**Headers**: session cookie required, `Content-Type: application/json`.

**Request body**

```json
{ "currentPassword": "Issued-2026-09", "newPassword": "seven blue lanterns", "confirmPassword": "seven blue lanterns" }
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `currentPassword` | string | Yes | Must verify against the stored hash | "Your current password is incorrect." |
| `newPassword` | string | Yes | 10–128 characters, not whitespace-only, different from `currentPassword`, not equal to the email address or its local part (BR-11) | "Choose a password of at least 10 characters that you have not used here before." |
| `confirmPassword` | string | Yes | Must equal `newPassword` | "The two passwords do not match." |

**Validation order**:

1. Body shape → else `400` `VALIDATION_FAILED`
2. `newPassword` rules and confirmation match → else `400` `VALIDATION_FAILED` with per-field messages
3. `currentPassword` verification → else `400` `VALIDATION_FAILED` on `currentPassword`

Step 3 is last so that an attacker holding a stolen session learns nothing cheaper than they already know, and
it is a `400` rather than a `401` because the session itself is valid.

**Effect**: the password hash is replaced, `mustChangePassword` becomes `false`, and every **other** session for
this user is deleted; the calling session survives (BR-06, BR-14).

**Response `200`** — the updated `AuthenticatedUser`, now with `mustChangePassword: false`.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| Malformed body, rule violation, mismatch, or wrong current password | 400 | `VALIDATION_FAILED` | `fields` names each offender (AC-12) |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-07 – FR-09, BR-06, BR-09 – BR-14, AC-10, AC-12 – AC-14.

---

### 3.5 Reference data and the Lab 2 Requester endpoints

These endpoints keep their Lab 2 request shapes, response shapes, validation, and error codes exactly. Only
two things change, and they change identically for all of them:

1. Identity comes from the session instead of the `X-Requester-Id` header (BR-18). The ownership predicate is
   the same predicate with a different source for the identifier.
2. The missing-identity response is `401` `UNAUTHENTICATED` instead of `400` `REQUESTER_CONTEXT_MISSING` /
   `403` `REQUESTER_CONTEXT_INVALID`.

| Endpoint | Role permitted | Notes |
|---|---|---|
| `GET /api/categories` | Any authenticated role | Active Categories, Lab 2 shape |
| `GET /api/related-systems` | Any authenticated role | Active Related Systems, Lab 2 shape |
| `POST /api/tickets` | `REQUESTER` only — `403` `FORBIDDEN` for staff and administrators | Sets `itPriority = requestedPriority` and `status = NEW` (BR-32, BR-38) |
| `GET /api/tickets` | Any authenticated role, scoped to the caller's own Tickets | Lab 2 query contract unchanged; each row gains `itPriority` and `requesterResolvedFlagged` |
| `GET /api/tickets/:id` | Any authenticated role, own Ticket only | Foreign Ticket → `404` `TICKET_NOT_FOUND` (BR-19) |
| `POST /api/tickets/:id/attachments` | Owner only | Lab 2 rules unchanged: `409`, `413`, `415` |
| `GET /api/tickets/:id/attachments` | Owner only | |
| `GET /api/attachments/:id/download` | Owner only | Removed attachment → `410` `ATTACHMENT_REMOVED` |
| `DELETE /api/attachments/:id` | Owner only | Soft removal, Lab 2 rules unchanged |

`GET /api/requesters` is **removed**. A request to it returns the API's standard `404` for an unknown route
(BR-57, AC-26).

Traceability: FR-14 – FR-16, BR-18 – BR-21, BR-57, AC-22 – AC-27.

---

### 3.6 `GET /api/tickets/:id/comments`

Public Comments for one Ticket, oldest first — a conversation reads forward.

**Headers**: session cookie required.

**Authorization**: a Requester may read only their own Ticket's comments (foreign Ticket → `404`); IT Staff and
Administrators may read any Ticket's comments (BR-21).

**Response `200`** — an array of `TicketMessage` (§2.7), every entry `visibility: "PUBLIC"`. The query
predicate includes `visibility: 'PUBLIC'` for every caller of this route, whatever their role, so this endpoint
cannot return an Internal Note even to a user who is entitled to read notes elsewhere (BR-40).

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Password change outstanding | 403 | `PASSWORD_CHANGE_REQUIRED` | |
| Ticket unknown, or not owned by a Requester caller | 404 | `TICKET_NOT_FOUND` | Indistinguishable (BR-19) |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-17, FR-30, BR-39 – BR-41, AC-45 – AC-47.

---

### 3.7 `POST /api/tickets/:id/comments`

Append one Public Comment.

**Headers**: session cookie required, `Content-Type: application/json`.

**Request body**

```json
{ "body": "I restarted the laptop and the problem came back after ten minutes." }
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `body` | string | Yes | 1–2000 characters after trim; whitespace-only rejected (BR-44) | "Enter a comment of up to 2000 characters." |

`author` and `createdAt` are **not** accepted. A body containing either is rejected as a validation failure
rather than ignored, so a client bug cannot silently mis-attribute a comment (BR-43).

**Authorization**: the owning Requester, IT Staff, or an Administrator.

**Effect**: one `TicketMessage` with `visibility: 'PUBLIC'`, `isSystem: false`, the session user as author, and
the backend clock as `createdAt`. The parent Ticket's `updatedAt` is refreshed.

**Response `201`** — the created `TicketMessage`.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| Empty, whitespace-only, or over-length body, or an author/timestamp field present | 400 | `VALIDATION_FAILED` | Nothing stored (AC-49) |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Password change outstanding | 403 | `PASSWORD_CHANGE_REQUIRED` | |
| Ticket unknown, or not owned by a Requester caller | 404 | `TICKET_NOT_FOUND` | |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-30, FR-32, FR-33, BR-42 – BR-45, AC-45, AC-46, AC-49.

---

### 3.8 `POST /api/tickets/:id/appears-resolved`

The Requester signals that the problem appears resolved. This is **not** a status change (BR-05 of the
handout, BR-46 here).

**Headers**: session cookie required, `Content-Type: application/json`.

**Request body**: optional.

```json
{ "note": "It has been stable since yesterday afternoon." }
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `note` | string | No | When present, 1–2000 characters after trim | "Enter a note of up to 2000 characters." |

**Authorization**: the owning Requester only. IT Staff and Administrators get `403` `FORBIDDEN` — they resolve
Tickets properly, through §3.13.

**Effect**, in one transaction: `requesterResolvedFlaggedAt` is set to now, and one `TicketMessage` is appended
with `visibility: 'PUBLIC'`, `isSystem: true`, the Requester as author, and a body recording that the Requester
reported the problem resolved, followed by their optional note.

**Response `200`** — the updated `Ticket` detail shape, whose `status` is demonstrably unchanged.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| Over-length note | 400 | `VALIDATION_FAILED` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is IT Staff or an Administrator | 403 | `FORBIDDEN` | |
| Ticket unknown or not owned | 404 | `TICKET_NOT_FOUND` | |
| Already flagged | 409 | `ALREADY_FLAGGED` | Nothing is written a second time (AC-50) |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-34, BR-46, AC-50.

---

### 3.9 `GET /api/staff/tickets`

The IT Staff Ticket Queue: every Requester's Tickets, searched, filtered, sorted, and paginated server-side.

**Headers**: session cookie required. Role: `IT_STAFF` or `ADMINISTRATOR`.

**Query parameters**

| Parameter | Type | Accepted values | Default | Rule |
|---|---|---|---|---|
| `search` | string | Free text, trimmed | none | Case-insensitive substring over `ticketNumber`, `summary`, and the requester's `fullName` (BR-59) |
| `status` | enum, repeatable | Any of the eight `TicketStatus` values | none | Repeated values combine with OR; the set combines with AND against every other filter (BR-60) |
| `itPriority` | enum | `LOW` \| `MEDIUM` \| `HIGH` \| `URGENT` | none | |
| `requestedPriority` | enum | Same four values | none | |
| `categoryId`, `relatedSystemId` | integer | Positive integer | none | |
| `assignee` | string | A positive integer id, `unassigned`, or `me` | none | `me` resolves to the session user; `unassigned` means `assigneeId IS NULL` |
| `flaggedResolved` | boolean | `true` \| `false` | none | `true` selects Tickets whose `requesterResolvedFlaggedAt` is set |
| `sortBy` | enum | `itPriority` \| `createdAt` \| `updatedAt` \| `ticketNumber` \| `status` | `itPriority` | |
| `sortOrder` | enum | `asc` \| `desc` | `desc` | |
| `page` | integer | ≥ 1 | `1` | |
| `pageSize` | integer | `10` \| `20` \| `50` | `20` | |

Additional rules:

- The default ordering is `itPriority desc, createdAt asc, id asc` — most urgent first, and within one urgency
  the Ticket that has waited longest (BR-61). When `sortBy` is supplied, `id asc` remains the final tiebreaker
  so paging is stable.
- `itPriority` and `status` sort by their documented severity and lifecycle order, not alphabetically.
- Anything outside the accepted values — an unknown sort field, a page size of 999, a non-numeric page, an
  unknown enum member, an unknown `assignee` sentinel — is `400` `INVALID_QUERY_PARAMETER` naming the parameter.
  Nothing is silently coerced (BR-63).
- A page past the end is `200` with `data: []` and correct metadata (BR-62).

**Example**

```
GET /api/staff/tickets?status=NEW&status=OPEN&assignee=unassigned&pageSize=20&page=1
```

**Response `200`**

```json
{
  "data": [ /* QueueTicketSummary (§2.5) */ ],
  "meta": { "page": 1, "pageSize": 20, "totalItems": 25, "totalPages": 2, "sortBy": "itPriority", "sortOrder": "desc" }
}
```

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| Invalid query parameter | 400 | `INVALID_QUERY_PARAMETER` | Names the parameter (AC-34) |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Password change outstanding | 403 | `PASSWORD_CHANGE_REQUIRED` | |
| Caller is a Requester | 403 | `FORBIDDEN` | No Ticket data and no count returned (AC-17, AC-19) |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-18 – FR-23, BR-59 – BR-63, AC-28 – AC-35.

---

### 3.10 `GET /api/staff/tickets/:id`

One Ticket for IT Staff operations, regardless of which Requester owns it (BR-21).

**Headers**: session cookie required. Role: `IT_STAFF` or `ADMINISTRATOR`.

**Response `200`** — the `Ticket` detail shape (§2.6) including the requester, the assignee, both priorities,
the status, `requesterResolvedFlaggedAt`, and the Lab 2 attachment array. Comments and Internal Notes are
fetched separately (§3.6, §3.14) so that each read carries its own authorization rather than inheriting one
umbrella decision.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is a Requester | 403 | `FORBIDDEN` | The route, not the resource, is forbidden (AC-19) |
| Ticket does not exist | 404 | `TICKET_NOT_FOUND` | |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-24, FR-29, BR-21, BR-23, AC-17, AC-19.

---

### 3.11 `PATCH /api/staff/tickets/:id/assignment`

Claim, assign, reassign, or unassign a Ticket.

**Headers**: session cookie required, `Content-Type: application/json`. Role: `IT_STAFF` or `ADMINISTRATOR`.

**Request body**

```json
{ "assigneeId": "me" }
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `assigneeId` | integer \| `"me"` \| `null` | Yes | A user id, the literal `"me"` for self-assignment, or `null` to unassign. The key must be present — an absent key is a validation failure, so "unassign" is never expressed by omission | "Choose who should own this ticket." |

**Validation order**:

1. Path parameter → else `400` `INVALID_PATH_PARAMETER`
2. Body shape → else `400` `VALIDATION_FAILED`
3. Ticket exists → else `404` `TICKET_NOT_FOUND`
4. Target user exists, is active, and has role `IT_STAFF` or `ADMINISTRATOR` → else `409` `INVALID_ASSIGNEE`

**Effect**, in one transaction: `assigneeId` is written, and if the Ticket's status was `NEW` and the new value
is not `null`, the status also becomes `OPEN` (BR-29). Unassigning never changes the status.

**Response `200`** — the updated `Ticket` detail shape.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| `assigneeId` key absent or malformed | 400 | `VALIDATION_FAILED` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is a Requester | 403 | `FORBIDDEN` | |
| Ticket does not exist | 404 | `TICKET_NOT_FOUND` | |
| Target unknown, inactive, or a Requester | 409 | `INVALID_ASSIGNEE` | Owner unchanged (AC-38) |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-25, BR-26 – BR-29, AC-36 – AC-38.

---

### 3.12 `PATCH /api/staff/tickets/:id/priority`

Set the IT Priority. Requested Priority is never touched by this or any other endpoint (BR-31).

**Headers**: session cookie required, `Content-Type: application/json`. Role: `IT_STAFF` or `ADMINISTRATOR`.

**Request body**

```json
{ "itPriority": "URGENT" }
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `itPriority` | enum | Yes | One of `LOW`, `MEDIUM`, `HIGH`, `URGENT` | "Choose an IT priority." |

A body containing `requestedPriority` is rejected `400` `VALIDATION_FAILED` rather than ignored, so an attempt
to change an immutable field fails loudly.

**Response `200`** — the updated `Ticket` detail shape, showing both priorities.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| Missing or unknown priority, or `requestedPriority` present | 400 | `VALIDATION_FAILED` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is a Requester | 403 | `FORBIDDEN` | Nothing changes (AC-40) |
| Ticket does not exist | 404 | `TICKET_NOT_FOUND` | |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-26, BR-31, BR-32, AC-39, AC-40.

---

### 3.13 `PATCH /api/staff/tickets/:id/status`

Move a Ticket through its permitted workflow.

**Headers**: session cookie required, `Content-Type: application/json`. Role: `IT_STAFF` or `ADMINISTRATOR`.

**Request body**

```json
{ "status": "RESOLVED" }
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `status` | enum | Yes | One of the eight `TicketStatus` values, **and** permitted from the Ticket's current status by the matrix (BR-35) | "This ticket cannot move from {current} to {requested}." |

**Validation order**:

1. Path parameter → else `400` `INVALID_PATH_PARAMETER`
2. `status` is a known enum member → else `400` `VALIDATION_FAILED`
3. Ticket exists → else `404` `TICKET_NOT_FOUND`
4. Transition permitted from the current status, including the self-transition case → else `409`
   `INVALID_STATUS_TRANSITION`
5. If the Ticket is unassigned, the only permitted targets are `OPEN` and `CANCELLED` → else `409`
   `INVALID_STATUS_TRANSITION` (BR-30)

An unknown enum value is `400` while a known-but-not-permitted value is `409`: the first is a malformed
request, the second is a well-formed request that conflicts with the Ticket's current state.

**Effect**: the status is written; a transition to `RESOLVED`, `CLOSED`, or `REOPENED` also clears
`requesterResolvedFlaggedAt` (BR-46). No confirmation token is required — the confirmation is a UI obligation
(BR-37) and the matrix is the backend's protection.

**Response `200`** — the updated `Ticket` detail shape.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| Unknown status value | 400 | `VALIDATION_FAILED` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is a Requester | 403 | `FORBIDDEN` | Including an attempt to set `RESOLVED` (AC-40) |
| Ticket does not exist | 404 | `TICKET_NOT_FOUND` | |
| Transition not in the matrix, or status unchanged | 409 | `INVALID_STATUS_TRANSITION` | Message names both statuses; Ticket unchanged (AC-42) |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-27, FR-28, BR-30, BR-33 – BR-38, BR-46, AC-41 – AC-44.

---

### 3.14 `GET /api/staff/tickets/:id/internal-notes`

Internal Notes for one Ticket, oldest first.

**Headers**: session cookie required. Role: `IT_STAFF` or `ADMINISTRATOR`.

**Response `200`** — an array of `TicketMessage`, every entry `visibility: "INTERNAL"`. The predicate is
`{ ticketId, visibility: 'INTERNAL' }` (BR-40).

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is a Requester | 403 | `FORBIDDEN` | **No note body, no author, and no count** in the response (BR-24, AC-16) |
| Ticket does not exist | 404 | `TICKET_NOT_FOUND` | |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

The role check runs before the Ticket lookup, so a Requester probing this route learns nothing about which
Ticket ids exist.

Traceability: FR-31, BR-23, BR-24, BR-39 – BR-41, AC-16, AC-48.

---

### 3.15 `POST /api/staff/tickets/:id/internal-notes`

Append one Internal Note.

**Headers**: session cookie required, `Content-Type: application/json`. Role: `IT_STAFF` or `ADMINISTRATOR`.

**Request body**

```json
{ "body": "Vendor case 118822 open; firmware rollback scheduled for Friday." }
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `body` | string | Yes | 1–2000 characters after trim; whitespace-only rejected (BR-44) | "Enter a note of up to 2000 characters." |

**Effect**: one `TicketMessage` with `visibility: 'INTERNAL'`, `isSystem: false`, the session user as author,
and the backend clock as `createdAt`. The parent Ticket's `updatedAt` is refreshed.

**Response `201`** — the created `TicketMessage`.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| Empty, whitespace-only, or over-length body | 400 | `VALIDATION_FAILED` | Nothing stored (AC-49) |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is a Requester | 403 | `FORBIDDEN` | |
| Ticket does not exist | 404 | `TICKET_NOT_FOUND` | |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-31 – FR-33, BR-42 – BR-45, AC-48, AC-49.

---

### 3.16 `GET /api/staff/assignees`

The users eligible to own a Ticket, for the assignment control.

**Headers**: session cookie required. Role: `IT_STAFF` or `ADMINISTRATOR`.

Ordered by `fullName` ascending — this is a dropdown that gets scanned, so alphabetical order is what a user
can use.

**Response `200`** — an array of `AssigneeOption` (§2.3), active `IT_STAFF` and `ADMINISTRATOR` users only.
Inactive users are absent, which is what makes `409 INVALID_ASSIGNEE` an edge case rather than a routine one
(BR-27).

**Failures**

| Failure | Status | Code |
|---|---|---|
| No valid session | 401 | `UNAUTHENTICATED` |
| Caller is a Requester | 403 | `FORBIDDEN` |
| Unexpected error | 500 | `INTERNAL_ERROR` |

Traceability: FR-25, BR-27, AC-37, AC-38.

---

### 3.17 `GET /api/admin/users`

The user list for User Management, with search and an optional role filter.

**Headers**: session cookie required. Role: `ADMINISTRATOR`.

**Query parameters**

| Parameter | Type | Accepted values | Default | Rule |
|---|---|---|---|---|
| `search` | string | Free text, trimmed | none | Case-insensitive substring over `fullName` and `email` (FR-36) |
| `role` | enum | `REQUESTER` \| `IT_STAFF` \| `ADMINISTRATOR` | none | Single value only |

No pagination and no sort parameter: the handout excludes both for the user list (X-12). The response is a
plain array ordered by `fullName` ascending, with no `meta` object — a page shape would imply a paging
contract that does not exist.

**Response `200`** — an array of `UserSummary` (§2.2), active and inactive alike, because managing an inactive
account is the point of the screen.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| Unknown `role` value | 400 | `INVALID_QUERY_PARAMETER` | Names the parameter |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is a Requester or IT Staff | 403 | `FORBIDDEN` | No user data and no count (AC-17, AC-18) |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-35, FR-36, BR-22, BR-25, AC-17, AC-18, AC-51, AC-52.

---

### 3.18 `POST /api/admin/users`

Create one user with exactly one role and an initial password.

**Headers**: session cookie required, `Content-Type: application/json`. Role: `ADMINISTRATOR`.

**Request body**

```json
{
  "fullName": "Nara Sukjai",
  "email": "Nara.Sukjai@kmutt.ac.th",
  "role": "IT_STAFF",
  "isActive": true,
  "initialPassword": "first-login-2026"
}
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `fullName` | string | Yes | 2–120 characters after trim | "Enter the user's full name." |
| `email` | string | Yes | Valid address, trimmed, stored lower-cased, unique case-insensitively (BR-49) | "Enter a valid email address." |
| `role` | enum | Yes | Exactly one of `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR` (BR-50) | "Choose one role." |
| `isActive` | boolean | Yes | Explicit — not defaulted, so the Administrator states their intent | "Choose whether the account is active." |
| `initialPassword` | string | Yes | 10–128 characters, same rules as any password except the "differs from current" clause (BR-11) | "Enter an initial password of at least 10 characters." |

`mustChangePassword` is not accepted: a created account always requires a change (BR-47).

**Validation order**: body shape → field rules → email uniqueness (`409`). Uniqueness is checked last because
it is the only check needing a query.

**Response `201`** — the created `UserSummary`, plus the initial password echoed exactly once so the
Administrator can hand it over (BR-13):

```json
{ "user": { "id": 12, "fullName": "Nara Sukjai", "email": "nara.sukjai@kmutt.ac.th", "role": "IT_STAFF", "isActive": true, "mustChangePassword": true, "createdAt": "2026-09-12T09:15:00.000Z" },
  "initialPassword": "first-login-2026" }
```

This is the only response in the whole API that contains a password, it contains the plaintext the
Administrator just supplied rather than anything derived from storage, and it is never retrievable again.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| Missing or malformed fields, unknown role, weak initial password | 400 | `VALIDATION_FAILED` | `fields` names each offender (AC-55) |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is not an Administrator | 403 | `FORBIDDEN` | |
| Email already used, in any letter case | 409 | `EMAIL_ALREADY_EXISTS` | Nothing written (AC-54) |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-37, FR-39, BR-13, BR-47, BR-49, BR-50, AC-53 – AC-55.

---

### 3.19 `PATCH /api/admin/users/:id`

Edit a user's basic account information. Exactly four fields are editable (BR-48).

**Headers**: session cookie required, `Content-Type: application/json`. Role: `ADMINISTRATOR`.

**Request body** — any subset of the four; at least one required.

```json
{ "fullName": "Nara Sukjai", "email": "nara.sukjai@kmutt.ac.th", "role": "IT_STAFF", "isActive": false }
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `fullName` | string | No | 2–120 characters after trim | "Enter the user's full name." |
| `email` | string | No | Valid, unique case-insensitively | "Enter a valid email address." |
| `role` | enum | No | One permitted role | "Choose one role." |
| `isActive` | boolean | No | | "Choose whether the account is active." |

Any other key — `passwordHash`, `mustChangePassword`, `department`, `createdAt` — is rejected `400`
`VALIDATION_FAILED`, never ignored (BR-48).

**Validation order**:

1. Path parameter → else `400` `INVALID_PATH_PARAMETER`
2. Body shape, unknown keys, field rules → else `400` `VALIDATION_FAILED`
3. Target user exists → else `404` `USER_NOT_FOUND`
4. Self-targeting of `isActive` or `role` → else `409` `SELF_DEACTIVATION_FORBIDDEN` (BR-51)
5. Would this leave zero active Administrators? → else `409` `LAST_ACTIVE_ADMINISTRATOR` (BR-52)
6. Email uniqueness → else `409` `EMAIL_ALREADY_EXISTS`

Steps 4–6 and the update run in **one transaction**, so two concurrent requests cannot each observe a second
active Administrator and both deactivate.

**Effect**: the supplied fields are written. If `isActive` became `false`, or `role` changed, every session
belonging to that user is deleted in the same transaction (BR-07).

**Response `200`** — the updated `UserSummary`.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| Bad path parameter | 400 | `INVALID_PATH_PARAMETER` | |
| Empty body, unknown key, or field rule violation | 400 | `VALIDATION_FAILED` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is not an Administrator | 403 | `FORBIDDEN` | |
| Unknown user | 404 | `USER_NOT_FOUND` | |
| Administrator targeting their own `isActive` or `role` | 409 | `SELF_DEACTIVATION_FORBIDDEN` | Nothing changes (AC-58) |
| Change would leave no active Administrator | 409 | `LAST_ACTIVE_ADMINISTRATOR` | Nothing changes (AC-59) |
| Email already used | 409 | `EMAIL_ALREADY_EXISTS` | |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

There is no `DELETE /api/admin/users/:id`. Deactivation is the only removal mechanism (BR-53).

Traceability: FR-38, FR-39, FR-41, BR-07, BR-48 – BR-53, AC-54, AC-56 – AC-59.

---

### 3.20 `POST /api/admin/users/:id/initial-password`

Issue a new initial password that the target user must change at their next login.

**Headers**: session cookie required, `Content-Type: application/json`. Role: `ADMINISTRATOR`.

**Request body**

```json
{ "initialPassword": "temporary-2026-09" }
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `initialPassword` | string | Yes | 10–128 characters, not whitespace-only, not equal to the target's email address or its local part | "Enter an initial password of at least 10 characters." |

**Effect**, in one transaction: the password hash is replaced, `mustChangePassword` becomes `true`, and every
session belonging to that user is deleted (BR-54). An Administrator may do this for any account including their
own, in which case their own session is deleted too and their next request is `401` — a documented and tested
consequence, not an accident.

**Response `200`**

```json
{ "user": { "id": 12, "…": "UserSummary" }, "initialPassword": "temporary-2026-09" }
```

Echoed exactly once, as in §3.18 (BR-13).

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| Bad path parameter | 400 | `INVALID_PATH_PARAMETER` | |
| Missing or weak password | 400 | `VALIDATION_FAILED` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is not an Administrator | 403 | `FORBIDDEN` | |
| Unknown user | 404 | `USER_NOT_FOUND` | |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-40, BR-07, BR-13, BR-14, BR-54, AC-57, AC-60.

---

## 4. Client call sequences

### 4.1 Application start-up and session restore

```
GET  /api/auth/me                       → 200  { …, mustChangePassword: false }  → render the role's home route
                                        → 200  { …, mustChangePassword: true  }  → force /change-password
                                        → 401                                     → redirect to /login
```

One call decides all three outcomes, so the client never guesses at a stored flag and never renders an
application screen before the server has confirmed who is asking.

### 4.2 Login with a mandatory password change

```
POST /api/auth/login             → 200  Set-Cookie, mustChangePassword: true
  navigate to /change-password (every other route refuses to render)
POST /api/auth/change-password   → 200  mustChangePassword: false
  other sessions for this user are now invalid
  navigate to the role's home route
```

### 4.3 IT Staff triage

```
GET   /api/staff/tickets?status=NEW&assignee=unassigned      → 200  { data, meta }
  open one row:
GET   /api/staff/tickets/{id}                                → 200  ticket detail
GET   /api/tickets/{id}/comments                             → 200  public comments
GET   /api/staff/tickets/{id}/internal-notes                 → 200  internal notes
GET   /api/staff/assignees                                   → 200  assignment options
  act:
PATCH /api/staff/tickets/{id}/assignment  { assigneeId: "me" } → 200  status NEW becomes OPEN
PATCH /api/staff/tickets/{id}/priority    { itPriority: "URGENT" } → 200
POST  /api/staff/tickets/{id}/internal-notes                 → 201
POST  /api/tickets/{id}/comments                             → 201
PATCH /api/staff/tickets/{id}/status      { status: "RESOLVED" } → 200 | 409
```

The three reads are separate requests rather than one embedded payload because each carries its own
authorization: a role that may open the Ticket but not read notes gets `403` on exactly one of them, and
nothing else on the screen has to be rebuilt to express that.

### 4.4 Administrator issues access

```
GET  /api/admin/users?search=nara            → 200  [ UserSummary ]
POST /api/admin/users                        → 201  { user, initialPassword }   ← shown once
  …later…
POST /api/admin/users/{id}/initial-password  → 200  { user, initialPassword }   ← shown once; sessions revoked
PATCH /api/admin/users/{id} { isActive:false } → 200 | 409 SELF_DEACTIVATION_FORBIDDEN
                                                     | 409 LAST_ACTIVE_ADMINISTRATOR
```

---

## 5. Security and safety notes

| Concern | Handling |
|---|---|
| Password storage | `scrypt` from `node:crypto`, per-user 16-byte salt, parameters encoded in the stored string (BR-09, A-04). No plaintext anywhere |
| Password comparison | `crypto.timingSafeEqual`; a login for an unknown address still performs a dummy verification so timing does not enumerate accounts (BR-10) |
| Account enumeration | One code and one message for unknown email, wrong password, and inactive account (BR-01). The login throttle keys on email plus client address and never reveals which of the two triggered it |
| Session theft | `HttpOnly` keeps the cookie away from every script, so an XSS bug cannot exfiltrate the credential; `SameSite=Lax` blocks cross-site use; `Secure` in production keeps it off plaintext transport |
| Session invalidation | Logout, password change, role change, deactivation, and a new initial password all delete rows (BR-05 – BR-07, BR-54). There is no "valid until it expires" window after a privilege change |
| CSRF | `SameSite=Lax` plus JSON-only mutating routes plus same-origin hosting (§1.1). No token is introduced because none of the three would be load-bearing on its own here and all three hold |
| Privilege escalation | Role comes only from the session user, is never read from a body or header, and is re-read from the database on every request rather than trusted from the cookie |
| Internal Note leakage | Visibility is a query predicate, not a post-filter (BR-40); the Requester comment route hard-codes `PUBLIC` for every caller; the role check on the note route runs before the Ticket lookup, so a `403` reveals no note count, no body, and no Ticket existence |
| Ownership leakage | Unchanged from Lab 2: a foreign Ticket or Attachment is `404`, never `403`, and never a message confirming existence (BR-19) |
| `403` versus `404` | A forbidden **route** is `403` because no specific resource is named; a forbidden **resource** on a permitted route is `404` because naming it would confirm it exists (BR-23) |
| Secrets | No authentication secret is needed by client code; nothing secret is committed; `.env` stays git-ignored |
| Log hygiene | Passwords, hashes, and session identifiers never reach a log line; unexpected errors are logged server-side and answered with `INTERNAL_ERROR` (BR-65) |

---

## 6. Status-code policy

### 6.1 Status codes in use

| Status | Used for |
|---|---|
| `200` | Successful retrieval, update, login, password change, download, soft removal |
| `201` | Ticket, attachment, comment, note, or user created |
| `204` | Logout |
| `400` | Validation failure, invalid query parameter, invalid path parameter, missing file |
| `401` | No valid session (`UNAUTHENTICATED`) or failed login (`INVALID_CREDENTIALS`) |
| `403` | Role not permitted (`FORBIDDEN`) or a password change outstanding (`PASSWORD_CHANGE_REQUIRED`) |
| `404` | Ticket or Attachment unknown **or owned by another Requester**, deliberately indistinguishable; unknown user on an Administrator route |
| `409` | Duplicate submission, attachment limit, already removed, email collision, invalid assignee, invalid transition, already flagged, self-deactivation, last active Administrator |
| `410` | Download of a soft-removed attachment (Lab 2, unchanged) |
| `413`, `415` | Attachment too large, attachment type not permitted (Lab 2, unchanged) |
| `429` | Login throttle window open |
| `500` | Unexpected server error, safe message only |

### 6.2 Status codes deliberately not used

| Status | Why not |
|---|---|
| `422` | `400` already carries a field-level `fields` array; two codes for one meaning would force every client branch to handle both |
| `423 Locked` | Accounts are never locked — locking without unlocking would be a state with no exit (X-11) |
| `202` | Every operation in Lab 3 completes before its response; nothing is queued |
| `301` / `302` on the API | Redirects are a client-router concern; the API answers `401` and the client decides where to send the user |

### 6.3 Lab 2 promises discharged

Lab 2's `api-spec.md` §6.2 recorded that `401` was deliberately unused because Lab 2 had no authentication, and
that Lab 3 would introduce `401` together with a real `403`. This document discharges that promise: `401` now
means "no valid session", `403` now means "authenticated, but not permitted", and the Lab 2 stand-ins
`REQUESTER_CONTEXT_MISSING` and `REQUESTER_CONTEXT_INVALID` are retired (§1.3). The Lab 2 documents are left as
they were — they were accurate when approved.

---

## 7. Traceability

| Endpoint | Functional requirements | Business rules | Acceptance criteria | Planned test file |
|---|---|---|---|---|
| `POST /api/auth/login` | FR-01, FR-02, FR-06 | BR-01 – BR-03, BR-08 – BR-10 | AC-01, AC-02, AC-08, AC-09 | `server/tests/lab-03/auth.api.test.ts` |
| `POST /api/auth/logout` | FR-04 | BR-05 | AC-05, AC-06 | `server/tests/lab-03/auth.api.test.ts` |
| `GET /api/auth/me` | FR-03, FR-05 | BR-04 | AC-03, AC-04 | `server/tests/lab-03/auth.api.test.ts` |
| `POST /api/auth/change-password` | FR-07 – FR-09 | BR-06, BR-09 – BR-17 | AC-10 – AC-14 | `server/tests/lab-03/auth.api.test.ts` |
| Lab 2 Requester endpoints (§3.5) | FR-14 – FR-16 | BR-18 – BR-21, BR-57 | AC-22 – AC-27 | `server/tests/lab-03/migration.api.test.ts` |
| `GET`/`POST /api/tickets/:id/comments` | FR-17, FR-30, FR-32, FR-33 | BR-39 – BR-45 | AC-45 – AC-47, AC-49 | `server/tests/lab-03/comments-notes.api.test.ts` |
| `POST /api/tickets/:id/appears-resolved` | FR-34 | BR-46 | AC-50 | `server/tests/lab-03/comments-notes.api.test.ts` |
| `GET /api/staff/tickets` | FR-18 – FR-23 | BR-59 – BR-63 | AC-28 – AC-35 | `server/tests/lab-03/staff-queue.api.test.ts` |
| `GET /api/staff/tickets/:id` | FR-24, FR-29 | BR-21, BR-23 | AC-17, AC-19 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` |
| `PATCH …/assignment` | FR-25 | BR-26 – BR-29 | AC-36 – AC-38 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` |
| `PATCH …/priority` | FR-26 | BR-31, BR-32 | AC-39, AC-40 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` |
| `PATCH …/status` | FR-27, FR-28 | BR-30, BR-33 – BR-38 | AC-41 – AC-44 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` |
| `GET`/`POST …/internal-notes` | FR-31 – FR-33 | BR-23, BR-24, BR-39 – BR-45 | AC-16, AC-48, AC-49 | `server/tests/lab-03/comments-notes.api.test.ts` |
| `GET /api/staff/assignees` | FR-25 | BR-27 | AC-37, AC-38 | `server/tests/lab-03/staff-ticket-detail.api.test.ts` |
| `GET /api/admin/users` | FR-35, FR-36 | BR-22, BR-25 | AC-51, AC-52 | `server/tests/lab-03/users-admin.api.test.ts` |
| `POST /api/admin/users` | FR-37, FR-39 | BR-13, BR-47, BR-49, BR-50 | AC-53 – AC-55 | `server/tests/lab-03/users-admin.api.test.ts` |
| `PATCH /api/admin/users/:id` | FR-38, FR-39, FR-41 | BR-07, BR-48 – BR-53 | AC-54, AC-56 – AC-59 | `server/tests/lab-03/users-admin.api.test.ts` |
| `POST /api/admin/users/:id/initial-password` | FR-40 | BR-07, BR-13, BR-14, BR-54 | AC-57, AC-60 | `server/tests/lab-03/users-admin.api.test.ts` |
| Every protected route, wrong role | FR-12 | BR-23 – BR-25 | AC-16 – AC-21 | `server/tests/lab-03/authorization.api.test.ts` |

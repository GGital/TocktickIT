# Lab 4 REST API Specification

Project: TokTickIT — IT Service Desk
Sprint: Lab 4 — Actions Taken, Ticket Resolution Workflow, Role Dashboards, and Final Regression
Status: Draft for student review and approval (must be approved before implementation begins)
Companion documents: [specification.md](specification.md), [ui-spec.md](ui-spec.md), [tests.md](tests.md)

This document is the authoritative wire contract for Sprint 4. Every rule here must match the business rule
(BR-nn) and acceptance criterion (AC-nn) it cites in `specification.md`; if they disagree, `specification.md`
wins and this file is corrected. Lab 2 and Lab 3 endpoints whose behaviour is unchanged are not restated — §3.15
lists them.

---

## 1. Conventions

Unchanged from Lab 3 `api-spec.md` §1: base path `/api`, JSON in and out, the `toktickit.sid` session cookie,
`Cache-Control: no-store`, ISO-8601 UTC timestamps rendered in `Asia/Bangkok`, and no state change on `GET`.

| Topic | Lab 4 addition |
|---|---|
| Optimistic concurrency | Ticket workflow writes and Action edits carry `expectedVersion` in the JSON body (§1.5) |
| Idempotent create | `POST …/actions` carries a client-generated `clientRequestId` UUID (§3.3) |
| Unknown body fields | Every Lab 4 write rejects a field it does not list with `400 VALIDATION_FAILED` naming it (BR-03) |
| Dashboard time | Dashboard responses carry `generatedAt` and `timeZone: "Asia/Bangkok"` (BR-49) |

### 1.1 Authentication

Unchanged. Every Lab 4 route except `GET /api/health` requires a valid session and a completed password change
(Lab 3 BR-15).

### 1.2 Error envelope

Unchanged shape. One additive member exists, only on `RESOLUTION_BLOCKED`:

```json
{
  "error": {
    "code": "RESOLUTION_BLOCKED",
    "message": "This ticket cannot be resolved yet.",
    "blockers": ["NO_ACTIONS", "OUTSTANDING_FOLLOW_UPS"]
  }
}
```

`blockers` values: `UNASSIGNED`, `NO_ACTIONS`, `OUTSTANDING_FOLLOW_UPS` (BR-35). Every failed condition is listed,
in that order. No other code carries `blockers`.

### 1.3 Error code catalogue

All Lab 2 and Lab 3 codes are retained with their meaning. Added in Lab 4:

| Code | Status | Meaning |
|---|---|---|
| `ACTION_NOT_FOUND` | 404 | Unknown action id, or an action that belongs to a different Ticket than `:id` (BR-01) |
| `TICKET_NOT_ACTIONABLE` | 409 | Ticket is `NEW`, `RESOLVED`, `CLOSED`, `CANCELLED`, or unassigned (BR-14) |
| `FOLLOW_UP_NOT_OUTSTANDING` | 409 | Completing a follow-up that is not outstanding, or editing frozen follow-up fields (BR-16, BR-17) |
| `ACTION_ALREADY_VOIDED` | 409 | Any write to a voided action (BR-20) |
| `STALE_ACTION` | 409 | `expectedVersion` does not match the action's `version` (BR-25) |
| `STALE_TICKET` | 409 | `expectedVersion` does not match the Ticket's `version` (BR-28) |
| `RESOLUTION_BLOCKED` | 409 | Resolution gate failed; carries `blockers` (BR-35) |
| `SERVICE_UNAVAILABLE` | 503 | Health check cannot reach the database (BR-84) |

Reused: `DUPLICATE_SUBMISSION` (409) for a `clientRequestId` replayed by a different user (BR-24); `FORBIDDEN`
(403) for a staff member who is not performer, Ticket Owner, or Administrator (BR-18).

### 1.4 Middleware order

Unchanged from Lab 3 §1.4. Lab 4 mounts:

```
GET /api/health                                   before resolveSession (public)
resolveSession → requireAuth → requirePasswordChangeComplete      /api
requireRole('IT_STAFF','ADMINISTRATOR')           /api/staff   (covers every …/actions write and /staff/dashboard)
requireRole('REQUESTER')                          /api/dashboard
```

The performer/owner/Administrator rule (BR-18) is checked in the handler after the action is loaded, because it
depends on the action's data.

### 1.5 Optimistic concurrency

| Resource | Field | Incremented by | Required on |
|---|---|---|---|
| `Ticket` | `version` | status, assignment, IT Priority writes; every Action Taken write (BR-26, BR-29) | `PATCH …/status`, `…/assignment`, `…/priority` |
| `ActionTaken` | `version` | edit, void, complete follow-up (BR-25) | `PATCH …/actions/:actionId`, `…/void`, `…/complete-follow-up` |

Each write is one conditional `UPDATE … WHERE id = :id AND version = :expectedVersion` that also sets
`version = version + 1`. Zero rows affected after the resource is known to exist → `409 STALE_TICKET` or
`409 STALE_ACTION`. `expectedVersion` must be a positive integer; missing or malformed → `400 VALIDATION_FAILED`.
The client never retries a stale response automatically (BR-30).

---

## 2. Shared resource shapes

### 2.1 `ActionTaken` (staff projection)

```json
{
  "id": 214,
  "ticketId": 41,
  "actionAt": "2026-10-19T03:15:00.000Z",
  "description": "Replaced the VPN client profile and cleared cached credentials.",
  "result": "Connection stable for 30 minutes in testing.",
  "followUpRequired": true,
  "followUpNote": "Confirm with the requester after Monday's peak usage.",
  "followUpCompletedAt": null,
  "followUpCompletedBy": null,
  "followUpOutstanding": true,
  "attachmentNotes": "See vpn-log-2026-10-19.txt in Attachments.",
  "performedBy": { "id": 9, "fullName": "Malee Srisuk", "role": "IT_STAFF" },
  "lastEditedBy": null,
  "voided": false,
  "voidedAt": null,
  "voidedBy": null,
  "voidReason": null,
  "version": 1,
  "createdAt": "2026-10-19T03:20:41.000Z",
  "updatedAt": "2026-10-19T03:20:41.000Z",
  "canEdit": true
}
```

- `followUpOutstanding` is computed by the backend with BR-15, so the client never re-derives the rule.
- `canEdit` is `true` when the caller is the performer, the current Ticket Owner, or an Administrator **and** the
  action is not voided (BR-18, BR-20). It is a UI hint; the backend re-checks on write.
- `clientRequestId` is never returned.

### 2.2 `RequesterActionTaken` (Requester projection)

```json
{
  "id": 214,
  "actionAt": "2026-10-19T03:15:00.000Z",
  "description": "Replaced the VPN client profile and cleared cached credentials.",
  "result": "Connection stable for 30 minutes in testing.",
  "followUpRequired": true,
  "followUpNote": "Confirm with the requester after Monday's peak usage.",
  "followUpCompleted": false,
  "attachmentNotes": "See vpn-log-2026-10-19.txt in Attachments.",
  "performedBy": { "fullName": "Malee Srisuk", "role": "IT_STAFF" },
  "createdAt": "2026-10-19T03:20:41.000Z",
  "edited": false,
  "updatedAt": "2026-10-19T03:20:41.000Z"
}
```

No `version`, `clientRequestId`, `voided*`, `canEdit`, user ids, or editor identity (BR-43). Only non-voided
actions are ever selected (BR-42).

### 2.3 Staff `Ticket` detail — additions

The Lab 3 staff detail shape plus:

```json
{
  "version": 7,
  "resolvedAt": null,
  "publicActivityAt": "2026-10-19T03:20:41.000Z",
  "actionSummary": { "total": 4, "voided": 1, "outstandingFollowUps": 1 },
  "allowedTransitions": ["OPEN", "WAITING_FOR_REQUESTER", "CANCELLED"],
  "resolutionBlockers": ["OUTSTANDING_FOLLOW_UPS"]
}
```

- `allowedTransitions` = matrix targets from the current status whose owner condition and gate pass now (BR-40).
- `resolutionBlockers` is `[]` when `RESOLVED` is not a matrix target from the current status or the gate passes.
- The Requester detail shape gains only `resolvedAt`. It never includes `version`, `actionSummary`, or blockers.

### 2.4 `DashboardTicketItem`

```json
{
  "id": 41,
  "ticketNumber": "TKT-2026-000041",
  "summary": "VPN disconnects every few minutes",
  "status": "IN_PROGRESS",
  "itPriority": "URGENT",
  "at": "2026-10-19T03:20:41.000Z"
}
```

`at` is the timestamp the list is ordered by (`publicActivityAt`, `resolvedAt`, or `updatedAt`, per list). No
description, requester email, comment, note, or attachment is ever included (BR-52). The Requester variant omits
`itPriority` (Requesters see their Requested Priority on detail; IT Priority is a staff triage value on the
dashboard).

### 2.5 `DashboardActionItem`

```json
{
  "id": 214,
  "ticketId": 41,
  "ticketNumber": "TKT-2026-000041",
  "actionAt": "2026-10-19T03:15:00.000Z",
  "description": "Replaced the VPN client profile and cleared cached…",
  "followUpOutstanding": true,
  "createdAt": "2026-10-19T03:20:41.000Z"
}
```

`description` is truncated server-side to 80 characters with an ellipsis.

### 2.6 `MetricLink`

Every count is returned with the query string of its drill-down so the client never constructs filters itself:

```json
{ "count": 3, "href": "/staff/tickets?assignee=unassigned&status=NEW&status=OPEN&status=IN_PROGRESS&status=WAITING_FOR_REQUESTER&status=REOPENED" }
```

`href` is a client-route path, never an API path. It is `null` only where no list exists (none in Lab 4).

---

## 3. Endpoints

### 3.1 `GET /api/tickets/:id/actions`

Non-voided Actions Taken on one of the caller's own Tickets, oldest `actionAt` first.

**Headers**: session cookie required. Any authenticated role; always scoped to the caller's own Tickets
(Lab 3 BR-21).

**Query predicate**: `{ ticket: { id, requesterId: session user }, voidedAt: null }`, ordered
`[{ actionAt: 'asc' }, { id: 'asc' }]` (BR-23, BR-42).

**Response `200`** — `RequesterActionTaken[]`, possibly `[]`.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Ticket does not exist **or belongs to another Requester** | 404 | `TICKET_NOT_FOUND` | Indistinguishable (AC-17) |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-05, BR-42, BR-43, AC-16, AC-17.

---

### 3.2 `GET /api/staff/tickets/:id/actions`

All Actions Taken on any Ticket, including voided, in the same order.

**Headers**: session cookie required. Role: `IT_STAFF` or `ADMINISTRATOR`.

**Response `200`** — `ActionTaken[]` (§2.1), possibly `[]`.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is a Requester | 403 | `FORBIDDEN` | Checked before the Ticket lookup (BR-72, AC-18) |
| Ticket does not exist | 404 | `TICKET_NOT_FOUND` | |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-04, BR-22, BR-23, AC-07, AC-14.

---

### 3.3 `POST /api/staff/tickets/:id/actions`

Record one Action Taken. Idempotent by `clientRequestId`.

**Headers**: session cookie required, `Content-Type: application/json`. Role: `IT_STAFF` or `ADMINISTRATOR`.

**Request body**

```json
{
  "clientRequestId": "6f1c2d7e-9a4b-4c1e-8d2f-0b7a3e5c9d11",
  "actionAt": "2026-10-19T10:15:00+07:00",
  "description": "Replaced the VPN client profile and cleared cached credentials.",
  "result": "Connection stable for 30 minutes in testing.",
  "followUpRequired": true,
  "followUpNote": "Confirm with the requester after Monday's peak usage.",
  "attachmentNotes": "See vpn-log-2026-10-19.txt in Attachments."
}
```

| Field | Type | Required | Rule | Error message |
|---|---|---|---|---|
| `clientRequestId` | string | Yes | UUID (any version), canonical lower-case form | "A request identifier is required." |
| `actionAt` | string | Yes | ISO-8601 with offset; `≥ ticket.createdAt`; `≤ now + 5 min` (BR-06) | "Enter when the action was performed." / "The action time cannot be before the ticket was created." / "The action time cannot be in the future." |
| `description` | string | Yes | 1–2000 after trim (BR-07) | "Describe the action in up to 2000 characters." |
| `result` | string | Yes | 1–1000 after trim (BR-08) | "Enter the result in up to 1000 characters." |
| `followUpRequired` | boolean | Yes | `true` or `false` (BR-09) | "Choose whether follow-up is required." |
| `followUpNote` | string \| null | Conditional | Required, 1–1000 after trim, when `followUpRequired` is `true`; absent / `null` / empty when `false` (BR-10) | "Describe the follow-up that is needed." / "Remove the follow-up note or mark follow-up as required." |
| `attachmentNotes` | string \| null | No | 0–500 after trim; empty → `null` (BR-11) | "Attachment notes can be up to 500 characters." |
| *any other key* | — | Forbidden | Includes `performedById`, `performedBy`, `createdAt`, `ticketId`, `version` (BR-03) | "Performed by is recorded automatically." for performer keys; "This value cannot be set." otherwise |

**Validation order**:

1. Path parameter → else `400 INVALID_PATH_PARAMETER`
2. Body field validation, **all fields reported together** (BR-13) → else `400 VALIDATION_FAILED`
3. Ticket exists → else `404 TICKET_NOT_FOUND`
4. Existing action with this `clientRequestId`:
   - same performer and same Ticket → `200` with that action; nothing written (BR-24)
   - otherwise → `409 DUPLICATE_SUBMISSION`
5. `actionAt ≥ ticket.createdAt` → else `400 VALIDATION_FAILED` on `actionAt`
6. Ticket actionable (BR-14) → else `409 TICKET_NOT_ACTIONABLE`

**Effect** (one transaction): insert the action with `performedById` = session user, `version = 1`; set
`Ticket.version = version + 1` and `Ticket.publicActivityAt = now()`. A unique-constraint race on
`clientRequestId` between two concurrent identical requests is caught and answered as step 4.

**Response `201`** — the created `ActionTaken`. **`200`** on idempotent replay — the original `ActionTaken`.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| `:id` not a positive integer | 400 | `INVALID_PATH_PARAMETER` | |
| Field invalid, conditional note rule broken, or forbidden key present | 400 | `VALIDATION_FAILED` | Every field listed (AC-02 – AC-04) |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is a Requester | 403 | `FORBIDDEN` | AC-18 |
| Ticket does not exist | 404 | `TICKET_NOT_FOUND` | |
| `clientRequestId` used by another user or Ticket | 409 | `DUPLICATE_SUBMISSION` | |
| Ticket `NEW`, unassigned, `RESOLVED`, `CLOSED`, or `CANCELLED` | 409 | `TICKET_NOT_ACTIONABLE` | Message names the reason (AC-06) |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-01 – FR-03, FR-09, FR-17, BR-02 – BR-14, BR-24, BR-26, AC-01 – AC-06, AC-08.

---

### 3.4 `PATCH /api/staff/tickets/:id/actions/:actionId`

Edit an Action Taken.

**Headers**: session cookie required, `Content-Type: application/json`. Role: `IT_STAFF` or `ADMINISTRATOR`;
handler additionally requires performer, current Ticket Owner, or Administrator (BR-18).

**Request body** — `expectedVersion` plus any subset of the editable fields:

```json
{ "expectedVersion": 2, "result": "Stable for a full working day.", "attachmentNotes": null }
```

| Field | Rule |
|---|---|
| `expectedVersion` | Required positive integer (BR-25) |
| `actionAt`, `description`, `result`, `followUpRequired`, `followUpNote`, `attachmentNotes` | Optional; each validated exactly as §3.3. The BR-10 pairing is validated on the **resulting** action, so setting `followUpRequired: false` requires the request to clear `followUpNote` in the same body |
| any other key | `400 VALIDATION_FAILED`, as §3.3 |

At least one editable field must be present → else `400 VALIDATION_FAILED` "Change at least one field."

**Validation order**:

1. Path parameters → `400 INVALID_PATH_PARAMETER`
2. Body validation → `400 VALIDATION_FAILED`
3. Ticket exists → `404 TICKET_NOT_FOUND`; action exists **on that Ticket** → `404 ACTION_NOT_FOUND`
4. Caller is performer, current owner, or Administrator → `403 FORBIDDEN`
5. Action not voided → `409 ACTION_ALREADY_VOIDED`
6. Follow-up fields unchanged if follow-up completed → `409 FOLLOW_UP_NOT_OUTSTANDING`
7. Ticket actionable → `409 TICKET_NOT_ACTIONABLE`
8. Conditional write on `version` → `409 STALE_ACTION`

**Effect** (one transaction): update fields, `lastEditedById` = session user, `version + 1`; Ticket `version + 1`
and `publicActivityAt = now()`.

**Response `200`** — the updated `ActionTaken`.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| Path parameter invalid | 400 | `INVALID_PATH_PARAMETER` | |
| Invalid field, missing `expectedVersion`, no editable field, forbidden key | 400 | `VALIDATION_FAILED` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Requester, or staff who is not performer / owner / Administrator | 403 | `FORBIDDEN` | AC-10 |
| Ticket or action not found, or action on another Ticket | 404 | `TICKET_NOT_FOUND` / `ACTION_NOT_FOUND` | |
| Action voided | 409 | `ACTION_ALREADY_VOIDED` | AC-14 |
| Follow-up completed and follow-up fields changed | 409 | `FOLLOW_UP_NOT_OUTSTANDING` | AC-13 |
| Ticket not actionable | 409 | `TICKET_NOT_ACTIONABLE` | |
| Version mismatch | 409 | `STALE_ACTION` | AC-11 |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-06, FR-16, BR-17 – BR-19, BR-25, BR-26, AC-09 – AC-11, AC-13.

---

### 3.5 `POST /api/staff/tickets/:id/actions/:actionId/complete-follow-up`

Mark an outstanding follow-up as completed.

**Headers**: session cookie required, `Content-Type: application/json`. Role: `IT_STAFF` or `ADMINISTRATOR`
(any staff member — BR-16).

**Request body**

```json
{ "expectedVersion": 1 }
```

**Validation order**: path → body → Ticket and action found → not voided (`409 ACTION_ALREADY_VOIDED`) →
outstanding (`409 FOLLOW_UP_NOT_OUTSTANDING`) → Ticket actionable (`409 TICKET_NOT_ACTIONABLE`) → version
(`409 STALE_ACTION`).

**Effect**: `followUpCompletedAt = now()`, `followUpCompletedById` = session user, action `version + 1`, Ticket
`version + 1`, `publicActivityAt = now()`.

**Response `200`** — the updated `ActionTaken` with `followUpOutstanding: false`.

**Failures**: as §3.4 except no `403` for non-performer staff.

Traceability: FR-07, BR-15, BR-16, AC-12, AC-22.

---

### 3.6 `POST /api/staff/tickets/:id/actions/:actionId/void`

Void an Action Taken. Irreversible.

**Headers**: session cookie required, `Content-Type: application/json`. Role: `IT_STAFF` or `ADMINISTRATOR`;
performer, current owner, or Administrator (BR-18).

**Request body**

```json
{ "expectedVersion": 2, "reason": "Recorded on the wrong ticket; see TKT-2026-000044." }
```

| Field | Rule | Error message |
|---|---|---|
| `expectedVersion` | Required positive integer | "Reload the action and try again." |
| `reason` | Required, 1–500 after trim | "Explain why this action is being voided (up to 500 characters)." |

**Validation order**: as §3.4 steps 1–5, then Ticket actionable, then version.

**Effect**: `voidedAt = now()`, `voidedById`, `voidReason`, action `version + 1`, Ticket `version + 1`,
`publicActivityAt = now()`. The action leaves the Requester read and the gate immediately (BR-22).

**Response `200`** — the updated `ActionTaken` with `voided: true`.

**Failures**: as §3.4; repeating a void is `409 ACTION_ALREADY_VOIDED`.

Traceability: FR-08, BR-20 – BR-22, AC-14, AC-21.

---

### 3.7 `PATCH /api/staff/tickets/:id/status` — changed

**Request body**

```json
{ "status": "RESOLVED", "expectedVersion": 7 }
```

| Field | Type | Required | Rule |
|---|---|---|---|
| `status` | enum | Yes | One of the eight statuses (Lab 3) |
| `expectedVersion` | integer | Yes | Positive integer (BR-28, BR-78) |

**Validation order**:

1. Path parameter → `400 INVALID_PATH_PARAMETER`
2. `status` known and `expectedVersion` valid → `400 VALIDATION_FAILED`
3. Ticket exists → `404 TICKET_NOT_FOUND`
4. `version = expectedVersion` → else `409 STALE_TICKET`
5. Pair in the matrix (BR-33), including self-transition → else `409 INVALID_STATUS_TRANSITION`
6. Owner condition → else `409 INVALID_STATUS_TRANSITION` ("… until it has an owner")
7. If target is `RESOLVED`: resolution gate (BR-35) → else `409 RESOLUTION_BLOCKED` with `blockers`

Steps 4–7 and the write run in **one transaction**. The write is
`UPDATE "Ticket" SET status, version = version + 1, … WHERE id = :id AND version = :expectedVersion`; zero rows →
`409 STALE_TICKET`. Because every Action write increments the Ticket version, an action committed between the
gate counts and the write makes this `UPDATE` match zero rows (AC-27).

**Effect**: status written; `version + 1`; `publicActivityAt = now()`; to `RESOLVED` sets `resolvedAt = now()`;
to `REOPENED` sets `resolvedAt = null`; to `RESOLVED`, `CLOSED`, or `REOPENED` clears
`requesterResolvedFlaggedAt` (BR-38, BR-39).

**Response `200`** — the staff `Ticket` detail (§2.3) with the new `version`, `allowedTransitions`, and
`resolutionBlockers`.

**Failures**

| Condition | Status | Code | Notes |
|---|---|---|---|
| Path parameter invalid | 400 | `INVALID_PATH_PARAMETER` | |
| Unknown status, missing or invalid `expectedVersion` | 400 | `VALIDATION_FAILED` | |
| No valid session | 401 | `UNAUTHENTICATED` | |
| Caller is a Requester | 403 | `FORBIDDEN` | AC-25 |
| Ticket not found | 404 | `TICKET_NOT_FOUND` | |
| Version mismatch | 409 | `STALE_TICKET` | AC-26, AC-27 |
| Pair outside the matrix, or owner condition failed | 409 | `INVALID_STATUS_TRANSITION` | AC-19 |
| Gate failed | 409 | `RESOLUTION_BLOCKED` | `blockers` lists every failure (AC-20 – AC-23) |
| Unexpected error | 500 | `INTERNAL_ERROR` | |

Traceability: FR-10, FR-11, FR-14, FR-15, BR-27 – BR-41, AC-19 – AC-28.

---

### 3.8 `PATCH /api/staff/tickets/:id/assignment` and `/priority` — changed

Bodies gain a required `expectedVersion`:

```json
{ "assigneeId": "me", "expectedVersion": 3 }
{ "itPriority": "URGENT", "expectedVersion": 4 }
```

Every Lab 3 rule stands (Lab 3 BR-26 – BR-32), including `409 INVALID_ASSIGNEE` for an inactive, Requester, or
unknown assignee. Added: `400 VALIDATION_FAILED` when `expectedVersion` is missing; `409 STALE_TICKET` on mismatch.
The claim-on-`NEW` move to `OPEN` and the assignment happen in one conditional write, incrementing `version` once
(BR-41). Assignment and priority changes do **not** touch `publicActivityAt` (BR-45).

The Lab 3 `readField` rule — any other key is rejected — now permits exactly two keys: the field and
`expectedVersion`.

Traceability: FR-15, BR-28, BR-41, BR-78, AC-26.

---

### 3.9 `GET /api/staff/tickets/:id` — changed

Returns the staff `Ticket` detail with the §2.3 additions. `allowedTransitions` and `resolutionBlockers` are
computed from the same function the status endpoint uses, so the UI and the backend cannot disagree.

Traceability: FR-12, BR-40, AC-28.

---

### 3.10 `GET /api/staff/tickets` — changed

One new parameter, validated like every Lab 3 Queue parameter (Lab 3 BR-63):

| Parameter | Values | Predicate |
|---|---|---|
| `followUp` | `outstanding` | Tickets with ≥ 1 action whose follow-up is outstanding (BR-15), status ≠ `CANCELLED` |
| | `mine` | As `outstanding`, restricted to actions with `performedById` = session user (BR-62) |

Any other value → `400 INVALID_QUERY_PARAMETER` naming `followUp`. Combines with every other filter by AND.

`QueueTicketSummary` gains `outstandingFollowUps` (integer) so the row can show a follow-up badge.

Traceability: FR-23, BR-62, AC-30, AC-37.

---

### 3.11 `GET /api/tickets` — changed

`status` now accepts all eight `TicketStatus` values and may be repeated, with the Lab 3 Queue semantics (OR within
status, AND with every other filter). Any unknown value → `400 INVALID_QUERY_PARAMETER`. Every other Lab 2
behaviour, default, and page size is unchanged. `TicketSummary` gains `resolvedAt`.

Traceability: FR-23, BR-53 – BR-57, AC-37.

---

### 3.12 `GET /api/health` — changed

No session required.

| Condition | Status | Body |
|---|---|---|
| `SELECT 1` succeeds within 2 s | 200 | `{ "status": "ok", "service": "TokTickIT API", "database": "ok" }` |
| Database unreachable or slower than 2 s | 503 | `{ "error": { "code": "SERVICE_UNAVAILABLE", "message": "The service is temporarily unavailable." }, "status": "degraded", "database": "unavailable" }` |

No version string, host name, driver message, or connection string is ever returned (BR-84, AC-48).

---

### 3.13 `GET /api/dashboard/requester`

**Headers**: session cookie required. Role: `REQUESTER` only.

**Response `200`**

```json
{
  "generatedAt": "2026-10-20T04:00:00.000Z",
  "timeZone": "Asia/Bangkok",
  "windows": { "recentDays": 7 },
  "metrics": {
    "waitingForMe":            { "count": 1, "href": "/tickets?status=WAITING_FOR_REQUESTER" },
    "openTickets":             { "count": 3, "href": "/tickets?status=NEW&status=OPEN&status=IN_PROGRESS&status=WAITING_FOR_REQUESTER&status=REOPENED" },
    "resolvedAwaitingClosure": { "count": 1, "href": "/tickets?status=RESOLVED" },
    "recentlyResolved":        { "count": 2, "href": "/tickets?status=RESOLVED&status=CLOSED&sortBy=updatedAt&sortOrder=desc" }
  },
  "recentlyUpdated": [
    { "id": 41, "ticketNumber": "TKT-2026-000041", "summary": "VPN disconnects every few minutes", "status": "WAITING_FOR_REQUESTER", "at": "2026-10-19T03:20:41.000Z" }
  ],
  "recentlyResolved": [
    { "id": 38, "ticketNumber": "TKT-2026-000038", "summary": "Printer jams on tray 2", "status": "RESOLVED", "at": "2026-10-18T09:02:00.000Z" }
  ]
}
```

| Key | Definition |
|---|---|
| `metrics.waitingForMe` | BR-54 |
| `metrics.openTickets` | BR-53 |
| `metrics.resolvedAwaitingClosure` | BR-55 |
| `metrics.recentlyResolved.count` | BR-57, full count in the 7-day window |
| `recentlyUpdated` | BR-56, ≤ 5, `at` = `publicActivityAt` |
| `recentlyResolved` | BR-57, ≤ 5, `at` = `resolvedAt` |

Every predicate starts with `requesterId = session user` (AC-29). All keys are always present (BR-51).

**Failures**

| Condition | Status | Code |
|---|---|---|
| No valid session | 401 | `UNAUTHENTICATED` |
| Caller is IT Staff or Administrator | 403 | `FORBIDDEN` (AC-36) |
| Unexpected error | 500 | `INTERNAL_ERROR` |

Traceability: FR-18, FR-21, BR-47 – BR-57, AC-29, AC-31, AC-33, AC-34.

---

### 3.14 `GET /api/staff/dashboard`

**Headers**: session cookie required. Role: `IT_STAFF` or `ADMINISTRATOR`.

**Response `200`** (Administrator example; IT Staff omits `administration`)

```json
{
  "generatedAt": "2026-10-20T04:00:00.000Z",
  "timeZone": "Asia/Bangkok",
  "windows": { "todayStartsAt": "2026-10-19T17:00:00.000Z" },
  "metrics": {
    "unassigned":             { "count": 3, "href": "/staff/tickets?assignee=unassigned&status=NEW&status=OPEN&status=IN_PROGRESS&status=WAITING_FOR_REQUESTER&status=REOPENED" },
    "myOpen":                 { "count": 5, "href": "/staff/tickets?assignee=me&status=NEW&status=OPEN&status=IN_PROGRESS&status=WAITING_FOR_REQUESTER&status=REOPENED" },
    "urgentActive":           { "count": 2, "href": "/staff/tickets?itPriority=URGENT&status=NEW&status=OPEN&status=IN_PROGRESS&status=WAITING_FOR_REQUESTER&status=REOPENED" },
    "requesterFlagged":       { "count": 1, "href": "/staff/tickets?flaggedResolved=true" },
    "myOutstandingFollowUps": { "count": 1, "href": "/staff/tickets?followUp=mine" },
    "newToday":               { "count": 4, "href": "/staff/tickets?sortBy=createdAt&sortOrder=desc" }
  },
  "byStatus": {
    "NEW":                   { "count": 2, "href": "/staff/tickets?status=NEW" },
    "OPEN":                  { "count": 3, "href": "/staff/tickets?status=OPEN" },
    "IN_PROGRESS":           { "count": 4, "href": "/staff/tickets?status=IN_PROGRESS" },
    "WAITING_FOR_REQUESTER": { "count": 1, "href": "/staff/tickets?status=WAITING_FOR_REQUESTER" },
    "RESOLVED":              { "count": 2, "href": "/staff/tickets?status=RESOLVED" },
    "CLOSED":                { "count": 6, "href": "/staff/tickets?status=CLOSED" },
    "REOPENED":              { "count": 1, "href": "/staff/tickets?status=REOPENED" },
    "CANCELLED":             { "count": 1, "href": "/staff/tickets?status=CANCELLED" }
  },
  "byItPriority": {
    "URGENT": { "count": 2, "href": "/staff/tickets?itPriority=URGENT&status=NEW&status=OPEN&status=IN_PROGRESS&status=WAITING_FOR_REQUESTER&status=REOPENED" },
    "HIGH":   { "count": 3, "href": "…" },
    "MEDIUM": { "count": 4, "href": "…" },
    "LOW":    { "count": 2, "href": "…" }
  },
  "recentlyUpdated": [
    { "id": 41, "ticketNumber": "TKT-2026-000041", "summary": "VPN disconnects every few minutes", "status": "IN_PROGRESS", "itPriority": "URGENT", "at": "2026-10-19T03:20:41.000Z" }
  ],
  "myRecentActions": [
    { "id": 214, "ticketId": 41, "ticketNumber": "TKT-2026-000041", "actionAt": "2026-10-19T03:15:00.000Z", "description": "Replaced the VPN client profile and cleared cached…", "followUpOutstanding": true, "createdAt": "2026-10-19T03:20:41.000Z" }
  ],
  "administration": {
    "users": {
      "activeByRole": {
        "REQUESTER":     { "count": 5, "href": "/admin/users?role=REQUESTER" },
        "IT_STAFF":      { "count": 4, "href": "/admin/users?role=IT_STAFF" },
        "ADMINISTRATOR": { "count": 1, "href": "/admin/users?role=ADMINISTRATOR" }
      },
      "inactive":           { "count": 2, "href": "/admin/users" },
      "mustChangePassword": { "count": 4, "href": "/admin/users" }
    }
  }
}
```

| Key | Definition |
|---|---|
| `metrics.*` | BR-58 – BR-63 |
| `byStatus` | BR-64 — all 8 keys, all Tickets |
| `byItPriority` | BR-65 — all 4 keys, active Tickets only |
| `recentlyUpdated` | BR-66, ≤ 8, `at` = `updatedAt` |
| `myRecentActions` | BR-67, ≤ 5, non-voided |
| `administration` | BR-68 – BR-70 — present only for an Administrator |

`windows.todayStartsAt` is the UTC instant of 00:00 in `Asia/Bangkok` used for `newToday`, so a reviewer can check
the boundary (AC-32).

**Implementation constraint**: all counts and lists are issued as independent queries inside one
`prisma.$transaction` (A-21); `byStatus` and `byItPriority` use `groupBy`, and the missing keys are filled with `0`
(BR-51).

**Failures**

| Condition | Status | Code |
|---|---|---|
| No valid session | 401 | `UNAUTHENTICATED` |
| Caller is a Requester | 403 | `FORBIDDEN` (AC-36) |
| Unexpected error | 500 | `INTERNAL_ERROR` |

Traceability: FR-19 – FR-22, BR-47 – BR-52, BR-58 – BR-71, AC-30 – AC-32, AC-35, AC-36.

---

### 3.15 Unchanged Lab 2 and Lab 3 endpoints

Authentication (`/api/auth/*`), reference data, `POST /api/tickets`, `GET /api/tickets/:id` (plus `resolvedAt`),
the four attachment routes, Public Comments, appears-resolved, Internal Notes, `GET /api/staff/assignees`, and the
four `/api/admin/users` routes keep their Lab 3 contract. Two side-effects are added, neither visible in a
response shape:

- Public Comment posts, the appears-resolved flag, and attachment upload/removal set `publicActivityAt = now()`
  (BR-45). Internal Note posts do not.
- None of them change `Ticket.version` (BR-29).

`GET /api/admin/users` already accepts `role`; the client now reads it from the URL on load so `/admin/users?role=…`
drill-downs work (FR-23).

---

## 4. Client call sequences

### 4.1 Login to dashboard

```
POST /api/auth/login            → 200 AuthenticatedUser
  role REQUESTER                → navigate /dashboard        → GET /api/dashboard/requester
  role IT_STAFF | ADMINISTRATOR → navigate /staff/dashboard  → GET /api/staff/dashboard
card activation                 → navigate metric.href       → GET /api/tickets?… | /api/staff/tickets?… | /api/admin/users?…
```

### 4.2 Record work and resolve

```
GET  /api/staff/tickets/41                              → version 7, allowedTransitions, blockers [NO_ACTIONS]
GET  /api/staff/tickets/41/actions                      → []
POST /api/staff/tickets/41/actions  {clientRequestId…}  → 201 (Ticket version now 8)
     (network retry with the same clientRequestId)      → 200, same action
GET  /api/staff/tickets/41                              → version 8, RESOLVED now in allowedTransitions
PATCH /api/staff/tickets/41/status {RESOLVED, 8}        → confirm dialog first → 200, resolvedAt set
```

### 4.3 Stale update recovery

```
PATCH …/status {RESOLVED, expectedVersion: 7}   → 409 STALE_TICKET
GET   /api/staff/tickets/41                     → version 9, latest status and blockers
UI shows "This ticket changed since you opened it" with the latest values; user re-selects knowingly
PATCH …/status {RESOLVED, expectedVersion: 9}   → 200 or 409 RESOLUTION_BLOCKED
```

### 4.4 Requester views work

```
GET /api/tickets/41           → Ticket (own) or 404
GET /api/tickets/41/actions   → RequesterActionTaken[] (non-voided)
GET /api/tickets/41/comments  → Public Comments (Lab 3)
```

---

## 5. Security and safety notes

| Concern | Control |
|---|---|
| Forged performer | `performedBy*` keys are rejected `400`; the value comes from the session (BR-03) |
| Requester sees voided or internal content | `voidedAt: null` and ownership are inside the Requester query predicate (BR-42); Internal Notes remain a separate staff route (Lab 3 BR-40) |
| Internal activity leaks via ordering | Requester "recently updated" uses `publicActivityAt` (BR-45) |
| Ticket-id probing via staff action routes | Role guard on `/api/staff` runs before any lookup (BR-72) |
| Action addressed through the wrong Ticket | `{ id: actionId, ticketId: id }` is the lookup predicate → `404 ACTION_NOT_FOUND` (BR-01) |
| Lost update | `expectedVersion` conditional writes (§1.5) |
| Duplicate submission | `clientRequestId` unique constraint (BR-24) |
| Dashboard over-exposure | Fixed summary projections only (§2.4, §2.5); no free-form filter parameters on dashboard routes |
| Stored XSS in action text | Plain text only; React escaping; `white-space: pre-wrap` (BR-12) |
| Health information disclosure | Fixed body; no version, host, or driver text (BR-84) |
| Denial of service by large lists | Dashboard lists capped (BR-52); action lists are per-Ticket and bounded by human entry |

---

## 6. Status-code policy

### 6.1 Status codes in use

| Status | Used for |
|---|---|
| `200` | Retrieval, update, idempotent create replay, follow-up completion, void, health OK |
| `201` | Action created (plus Lab 2–3 creations) |
| `204` | Logout (Lab 3) |
| `400` | Validation, invalid query or path parameter, missing `expectedVersion`, forbidden body key |
| `401` | No valid session |
| `403` | Role not permitted; staff editing or voiding an action they neither performed nor own; password change outstanding |
| `404` | Ticket unknown or another Requester's; action unknown or on another Ticket |
| `409` | Lab 2–3 conflicts plus `TICKET_NOT_ACTIONABLE`, `FOLLOW_UP_NOT_OUTSTANDING`, `ACTION_ALREADY_VOIDED`, `STALE_ACTION`, `STALE_TICKET`, `RESOLUTION_BLOCKED`, `DUPLICATE_SUBMISSION` (foreign replay) |
| `410`, `413`, `415`, `429` | Unchanged from Lab 2–3 |
| `500` | Unexpected error, safe message |
| `503` | Health check only, database unavailable |

### 6.2 Status codes deliberately not used

| Status | Why not |
|---|---|
| `412` / `428` | Concurrency uses a body field and a `409`, matching every other state conflict in the product; `If-Match` headers would need ETag plumbing for one benefit the body field already gives |
| `422` | `400` already carries `fields` (Lab 3 §6.2) |
| `204` on void / complete | The client needs the new `version` and state to continue editing; returning the action avoids a second read |
| `DELETE` | No action deletion exists (BR-21) |

---

## 7. Traceability

| Endpoint | Functional requirements | Business rules | Acceptance criteria | Planned test file |
|---|---|---|---|---|
| `GET /api/tickets/:id/actions` | FR-05 | BR-42, BR-43 | AC-16, AC-17 | `server/tests/lab-04/actions-taken.api.test.ts` |
| `GET /api/staff/tickets/:id/actions` | FR-04 | BR-22, BR-23 | AC-07, AC-14 | `server/tests/lab-04/actions-taken.api.test.ts` |
| `POST /api/staff/tickets/:id/actions` | FR-01 – FR-03, FR-09, FR-17 | BR-01 – BR-14, BR-24, BR-26 | AC-01 – AC-06, AC-08 | `server/tests/lab-04/actions-taken.api.test.ts` |
| `PATCH …/actions/:actionId` | FR-06, FR-16 | BR-17 – BR-19, BR-25 | AC-09 – AC-11, AC-13 | `server/tests/lab-04/actions-taken.api.test.ts` |
| `POST …/complete-follow-up` | FR-07 | BR-15, BR-16 | AC-12 | `server/tests/lab-04/actions-taken.api.test.ts` |
| `POST …/void` | FR-08 | BR-20 – BR-22 | AC-14 | `server/tests/lab-04/actions-taken.api.test.ts` |
| `PATCH …/status` | FR-10, FR-11, FR-14, FR-15 | BR-27 – BR-41 | AC-19 – AC-27 | `server/tests/lab-04/ticket-workflow.api.test.ts` |
| `PATCH …/assignment`, `…/priority` | FR-15 | BR-28, BR-41, BR-78 | AC-26 | `server/tests/lab-04/ticket-workflow.api.test.ts` |
| `GET /api/staff/tickets/:id` | FR-12 | BR-40 | AC-28 | `server/tests/lab-04/ticket-workflow.api.test.ts` |
| `GET /api/staff/tickets` (`followUp`) | FR-23 | BR-62 | AC-30, AC-37 | `server/tests/lab-04/staff-dashboard.api.test.ts` |
| `GET /api/tickets` (statuses) | FR-23 | BR-53 – BR-57 | AC-37 | `server/tests/lab-04/requester-dashboard.api.test.ts` |
| `GET /api/dashboard/requester` | FR-18, FR-21, FR-22 | BR-47 – BR-57 | AC-29, AC-31, AC-33, AC-34, AC-36 | `server/tests/lab-04/requester-dashboard.api.test.ts` |
| `GET /api/staff/dashboard` | FR-19 – FR-22 | BR-47 – BR-52, BR-58 – BR-71 | AC-30 – AC-32, AC-35, AC-36 | `server/tests/lab-04/staff-dashboard.api.test.ts` |
| `GET /api/health` | FR-30 | BR-84 | AC-48 | `server/tests/lab-04/hardening.api.test.ts` |
| Every Lab 4 route, wrong role | FR-26 | BR-18, BR-72 | AC-10, AC-18, AC-25, AC-36 | `server/tests/lab-04/authorization.api.test.ts` |
| Migration and seed | — | BR-73 – BR-77 | AC-41, AC-42 | `server/tests/lab-04/migration.api.test.ts` |

# Lab 4 Sprint Engineering Specification

Project: TokTickIT — IT Service Desk
Sprint: Lab 4 — Actions Taken, Ticket Resolution Workflow, Role Dashboards, and Final Regression
Status: Draft for student review and approval (must be approved before implementation begins)
Companion documents: [ui-spec.md](ui-spec.md), [api-spec.md](api-spec.md), [tests.md](tests.md)

This document is the authoritative Sprint 4 contract. It extends the approved Lab 2 and Lab 3 contracts; where an
earlier rule is still in force it is cited as `Lab 3 BR-nn` or `Lab 2 BR-nn` rather than restated. Lab 4
identifiers (`FR-nn`, `BR-nn`, `AC-nn`, `A-nn`, `X-nn`) restart at `01` and always mean the Lab 4 series unless
prefixed with "Lab 2" or "Lab 3".

---

## 1. Sprint Goal

Turn TokTickIT from a system that *receives and discusses* Tickets into one that *records and proves the work*.
After this sprint IT Staff and Administrators record every piece of work done on a Ticket as an **Action Taken** —
when it happened, what was done, what the result was, who did it, whether follow-up is needed, and where the
supporting evidence is. The Ticket Owner still coordinates the Ticket, but any IT Staff member may record an
action on it. A Ticket can be formally resolved only when its recorded work supports that: at least one valid
action exists and no follow-up is outstanding, enforced by the backend even when the screen is bypassed. Each role
gets a concise dashboard whose every number is calculated by the backend and opens the detailed list it
summarises. Finally, every Lab 1–3 feature is regression-tested and polished so the product is demonstrable as one
coherent Zen Green application.

---

## 2. Stakeholder Request Interpretation

In our own words, the stakeholder is asking for four things.

1. **A work log under each Ticket.** Comments say what people *told each other*; Actions Taken say what IT *did*.
   Each action is a structured, timestamped line belonging to exactly one Ticket. The performer is never typed —
   it is the authenticated user who records it — so the log is trustworthy without a review step.
2. **Resolution must be earned, not declared.** A Requester saying "it seems fixed" is useful information, but it
   is advisory. IT Staff must review the work and formally move the Ticket to `RESOLVED`, and the backend refuses
   that move when the work log does not support it (no recorded action, or a follow-up still open).
3. **Dashboards as a starting point, not a second application.** Each card is one number with one definition and
   one destination. Dashboards never return whole Ticket collections, never compute anything in the browser, and
   never show a Requester anything outside their own Tickets.
4. **A finished product.** Every earlier screen still works for the right role, every failure looks the same way
   everywhere, double clicks and network retries cannot create duplicates, and nothing unfinished is left on
   screen.

Interpretation decisions worth stating up front:

- **"Performed by (auto)"** means the backend sets `performedBy` from the session on create and never accepts it
  from the client. There is no separate Action assignee: the stakeholder named exactly one person field and made
  it automatic (A-01). Assigning *people to the Ticket* remains the Lab 3 Ticket Owner operation, with its
  inactive-assignee rejection (Lab 3 BR-27), unchanged.
- **"Action Date/Time"** is when the work was *performed*, entered by the staff member (defaulting to now), and is
  distinct from the record's creation time, which the backend stamps. Both are displayed (A-02).
- **"Attachment Notes (what file to look for…)"** is a short free-text pointer, such as "see `router-log.png`
  uploaded 12 Oct". It is not an upload control; files stay in the Lab 2 attachment area (A-03).
- **"Follow-up Required?"** is the hook for the resolution gate. A follow-up stays *outstanding* until a staff
  member explicitly marks it completed; an outstanding follow-up blocks resolution (A-04).
- **"Requesters will see all Actions Taken items"** means every *valid* action on their own Ticket, read-only. An
  action that staff voided because it was recorded in error is excluded from the Requester's view (A-05).
- **"Create and update"** is honoured with an edit operation, but actions are never deleted. A mistaken action is
  *voided* with a reason, so the history stays auditable (A-06).

---

## 3. Scope

### Included

| # | Included work |
|---|---|
| S-01 | Actions Taken: data model, create, edit, complete follow-up, void, list for staff, read-only list for the owning Requester |
| S-02 | Resolution gate: `RESOLVED` requires an owner, at least one non-voided action, and no outstanding follow-up — enforced server-side |
| S-03 | Final Ticket status-transition matrix with roles, gates, side-effects, and server-computed allowed transitions |
| S-04 | Optimistic concurrency for Ticket workflow writes and Action edits, with explicit stale-update responses |
| S-05 | Idempotent Action creation so a double click or a network retry never creates two rows |
| S-06 | Requester Dashboard and IT Staff Dashboard (the Administrator reuses the staff dashboard plus account counts), each metric backend-calculated with a defined query, empty behaviour, and drill-down |
| S-07 | Drill-down support: My Tickets accepts every status and repeated statuses; the Queue gains a follow-up filter; User Management reads its role filter from the URL |
| S-08 | Data increment: `ActionTaken`, `Ticket.version`, `Ticket.resolvedAt`, `Ticket.publicActivityAt`, indexes, one additive migration with backfill, documented recovery, extended idempotent seed |
| S-09 | Zen Green extensions: Dashboard navigation, metric cards, Actions Taken panel and form, follow-up and voided badges, resolution-blocker guidance |
| S-10 | Final hardening: consistent feedback states, duplicate-action prevention, form preservation, health check, console-clean screens, removal of temporary UI, current README |
| S-11 | Full Labs 1–3 regression plus Lab 4 tests at every required level, responsive screenshots, and the `docs/lab-04/` document set |

### Excluded

| # | Explicitly excluded — must not be implemented in Lab 4 |
|---|---|
| X-01 | Automatic SLA clocks, escalation engines, on-call scheduling, and breach notifications |
| X-02 | Email, SMS, LINE, push, or any other external notification service |
| X-03 | Inventory consumption, spare parts, purchasing, and cost accounting |
| X-04 | Time-sheet billing, payroll, labour-cost or duration fields on an action |
| X-05 | Multi-level approval workflows and electronic signatures, including Requester sign-off on resolution |
| X-06 | Business-intelligence tools, custom report builders, charts beyond simple counts, CSV/Excel export, and data warehouses |
| X-07 | Multi-tenant organisations and production-scale cloud operations |
| X-08 | Hard deletion of an Action Taken, an action revision-history table, and a general audit-event log |
| X-09 | Uploading files from the Action form, or linking an action to an attachment by id (Attachment Notes is text) |
| X-10 | A separate assignee, due date, or status on an individual Action Taken |
| X-11 | Automatic status changes triggered by recording an action or by a Requester comment |
| X-12 | Any new product feature not listed in this contract |

---

## 4. Functional Requirements

### Actions Taken

- **FR-01** The system shall allow IT Staff and Administrators to create an Action Taken on a Ticket with Action
  Date/Time, Action Description, Result, Follow-Up Required, Follow-up Note, and Attachment Notes.
- **FR-02** The backend shall set the performer of every new Action Taken to the authenticated user and shall
  stamp its creation time from the server clock; neither is accepted from the client.
- **FR-03** The system shall require a Follow-up Note when Follow-Up Required is yes, and shall store no
  Follow-up Note when it is no.
- **FR-04** The system shall list a Ticket's Actions Taken in a stable chronological order for IT Staff and
  Administrators, including voided actions marked as voided.
- **FR-05** The system shall show the owning Requester every non-voided Action Taken on their Ticket, read-only,
  with all of its fields.
- **FR-06** The system shall allow the performer, the current Ticket Owner, or an Administrator to edit an Action
  Taken's Date/Time, Description, Result, follow-up fields, and Attachment Notes, recording who last edited it and
  when.
- **FR-07** The system shall allow any IT Staff member or Administrator to mark an outstanding follow-up as
  completed, recording who completed it and when.
- **FR-08** The system shall allow the performer, the current Ticket Owner, or an Administrator to void an Action
  Taken with a reason; voided actions are retained, never deleted.
- **FR-09** The system shall accept Action Taken writes only while the Ticket is in an actionable status and has a
  Ticket Owner.

### Ticket workflow and resolution

- **FR-10** The system shall enforce the final status-transition matrix in Section 5 on every status change,
  regardless of the client used.
- **FR-11** The system shall refuse a transition to `RESOLVED` unless the Ticket has an owner, at least one
  non-voided Action Taken, and no outstanding follow-up, and shall name every unmet condition.
- **FR-12** The staff Ticket detail response shall include the transitions currently permitted and any resolution
  blockers, so the UI offers only permitted transitions.
- **FR-13** The system shall continue to accept the Requester "Problem Appears Resolved" indication as advisory
  only; it shall never change status and shall be prominently surfaced to staff for review.
- **FR-14** The system shall record when a Ticket was last resolved and clear that record when it is reopened.

### Concurrency and duplicate prevention

- **FR-15** The system shall detect a stale workflow write — a status, owner, or IT Priority change made against
  an outdated Ticket — and refuse it without changing the Ticket.
- **FR-16** The system shall detect a stale edit, void, or follow-up completion of an Action Taken and refuse it
  without changing the action.
- **FR-17** The system shall treat a repeated Action Taken creation carrying the same client request identifier as
  the same request and return the original action instead of storing a second one.

### Dashboards

- **FR-18** The system shall provide a Requester Dashboard summarising only the authenticated Requester's Tickets:
  open Tickets, Tickets waiting for the Requester, Tickets resolved and awaiting closure, recently updated Tickets,
  and recently resolved Tickets.
- **FR-19** The system shall provide an IT Staff Dashboard with unassigned Tickets, Tickets owned by the current
  user, urgent active Tickets, Requester-flagged Tickets, the current user's outstanding follow-ups, Tickets
  created today, counts by status, counts by IT Priority, recently updated Tickets, and the current user's recent
  Actions Taken.
- **FR-20** The system shall show an Administrator the IT Staff Dashboard plus concise user-account counts.
- **FR-21** Every dashboard metric shall be calculated by the backend from authoritative data, and every count
  shall open the detailed list it summarises where a matching filter exists.
- **FR-22** Dashboards shall present distinct loading, loaded, all-zero, forbidden, and safe-failure states, and
  each card or list shall have its own empty presentation.
- **FR-23** My Tickets shall accept every Ticket status as a filter, repeatable, and the Ticket Queue shall accept
  a follow-up filter, so dashboard drill-downs open correctly filtered lists.

### Navigation and shell

- **FR-24** The application shell shall add a Dashboard destination for every role and shall make it the role's
  home screen after login.
- **FR-25** The shell shall keep a clear active-page indication across Dashboard, list, detail, and administration
  screens.

### Final hardening and regression

- **FR-26** Every Lab 2 and Lab 3 screen and operation shall remain available to, and only to, its permitted roles
  with unchanged behaviour except where this contract changes it explicitly.
- **FR-27** Every remote operation shall present the same family of loading, validation, success, empty,
  no-results, forbidden, conflict, not-found, and safe-failure feedback.
- **FR-28** Every important form — Create Ticket, Action Taken, Void, Comment, Internal Note, User create/edit —
  shall keep the entered values after a recoverable failure.
- **FR-29** Every submit control shall prevent repeated submission while a request is in flight.
- **FR-30** The health endpoint shall report API and database availability.
- **FR-31** The final application shall contain no console errors during the E2E suite, no broken links, no
  placeholder text, no unfinished control, and no temporary or duplicate UI left from earlier labs.
- **FR-32** `README.md` shall document current setup, migrate, seed, test, screenshot, and demonstration steps.

### Cross-cutting UI

- **FR-33** All Lab 4 screens shall be usable at desktop (≥ 992 px), tablet (768–991 px), and mobile (< 768 px)
  without horizontal page scrolling, clipped content, overlapping controls, or hidden primary actions.
- **FR-34** All Lab 4 screens shall reuse the Zen Green tokens and the existing components; Lab 4 adds no new
  colour value.

---

## 5. Business Rules

### Actions Taken — structure and ownership

- **BR-01** An Action Taken belongs to exactly one Ticket, fixed at creation. It can never be moved to another
  Ticket, and an action addressed through a Ticket it does not belong to is `404 ACTION_NOT_FOUND`.
- **BR-02** The Ticket Owner coordinates the Ticket, but an Action Taken may be performed by a different IT Staff
  member or an Administrator. Recording an action does not change the Ticket Owner.
- **BR-03** `performedBy` is the authenticated user at creation and is immutable. A `performedById`,
  `performedBy`, `createdAt`, `ticketId`, `version`, or any other unlisted field in a request body is rejected
  `400 VALIDATION_FAILED` naming the field — never silently ignored, so a client can never believe it set the
  performer.
- **BR-04** A user who is later deactivated or changes role remains the performer of their past actions; the name
  still displays (Lab 3 BR-53).
- **BR-05** A Ticket may contain any number of Actions Taken, including zero.

### Actions Taken — fields and validation

- **BR-06** **Action Date/Time** (`actionAt`) is required, supplied as ISO-8601 with an offset, stored in UTC, and
  shown in `Asia/Bangkok`. It must not be earlier than the Ticket's creation time and must not be more than 5
  minutes after the server's current time (clock-skew allowance). The form defaults it to the current Bangkok time.
- **BR-07** **Action Description** is required, 1–2000 characters after trimming, plain text (Lab 3 BR-44,
  BR-45 conventions).
- **BR-08** **Result** is required, 1–1000 characters after trimming, plain text.
- **BR-09** **Follow-Up Required?** is a required boolean.
- **BR-10** **Follow-up Note** is required, 1–1000 characters after trimming, when Follow-Up Required is `true`.
  When it is `false`, the note must be absent, `null`, or empty and is stored `null`; a non-empty note with
  `false` is `400 VALIDATION_FAILED` so text is never discarded silently.
- **BR-11** **Attachment Notes** is optional, 0–500 characters after trimming, plain text; empty is stored `null`.
  It is a pointer to evidence, not a file, and is never rendered as a link.
- **BR-12** All Action Taken text is stored and rendered as plain text with line breaks preserved by CSS; no
  Markdown or HTML is interpreted (Lab 3 BR-45).
- **BR-13** Validation reports every invalid field at once in the `fields` array, not only the first.

### Actions Taken — lifecycle

- **BR-14** Action Taken writes (create, edit, complete follow-up, void) are permitted only when the Ticket status
  is `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED` **and** the Ticket has an owner. Otherwise the
  write is `409 TICKET_NOT_ACTIONABLE` naming the reason ("Claim or assign this ticket first" or "Reopen this
  ticket to record more work"). `NEW` is excluded because claiming moves it to `OPEN` (Lab 3 BR-29); `RESOLVED`,
  `CLOSED`, and `CANCELLED` are excluded so the record that justified resolution cannot change underneath it.
- **BR-15** A follow-up is **outstanding** when `followUpRequired = true`, `followUpCompletedAt IS NULL`, and
  `voidedAt IS NULL`.
- **BR-16** Completing a follow-up sets `followUpCompletedAt` and `followUpCompletedById` from the server clock and
  session. Completing one that is not outstanding is `409 FOLLOW_UP_NOT_OUTSTANDING`. Completion is permitted to
  any IT Staff member or Administrator, because follow-up work is often done by someone other than the original
  performer.
- **BR-17** Once a follow-up is completed, `followUpRequired` and `followUpNote` are frozen; an edit that changes
  either is `409 FOLLOW_UP_NOT_OUTSTANDING`. The remaining fields stay editable.
- **BR-18** Edit and void are permitted to the action's performer, the Ticket's **current** owner, and any
  Administrator. Any other IT Staff member receives `403 FORBIDDEN`. This keeps the record accountable without
  blocking the coordinator from correcting it.
- **BR-19** An edit records `lastEditedById` and `updatedAt`; the display shows "Edited by {name}, {time}". The
  original `performedBy` and `createdAt` never change.
- **BR-20** Voiding requires a reason of 1–500 characters, sets `voidedAt`, `voidedById`, and `voidReason`, and is
  irreversible. A voided action cannot be edited, completed, or voided again: `409 ACTION_ALREADY_VOIDED`.
- **BR-21** Actions Taken are never deleted. There is no `DELETE` route (X-08).
- **BR-22** A voided action is excluded from the resolution gate, from every dashboard metric, and — inside the
  query predicate — from every Requester read (A-05, Lab 3 BR-40 pattern).

### Actions Taken — ordering, idempotency, and concurrency

- **BR-23** Lists are ordered by `actionAt` ascending, then `id` ascending. The `id` tiebreaker makes the order
  stable when two actions share a timestamp, and repeated reads return identical order.
- **BR-24** Every create request carries a client-generated `clientRequestId` (UUID). It is unique across all
  actions. A second create with the same `clientRequestId` by the same user returns `200` with the originally
  created action and stores nothing; the same key from a different user is `409 DUPLICATE_SUBMISSION`.
- **BR-25** Each Action Taken carries an integer `version`, starting at `1` and incremented by every edit, void, or
  follow-up completion. Those three requests must carry `expectedVersion`; a mismatch is `409 STALE_ACTION` and
  nothing changes.
- **BR-26** Every Action Taken write (create, edit, void, complete follow-up) also increments the parent Ticket's
  `version` in the same transaction (BR-29), so a resolution decision made against an outdated work log is
  detected.

### Ticket concurrency

- **BR-27** Each Ticket carries an integer `version`, starting at `1`.
- **BR-28** Status, assignment (claim, assign, reassign, unassign), and IT Priority changes must carry
  `expectedVersion`. The update is executed as a single conditional write `WHERE id = :id AND version =
  :expectedVersion`; zero affected rows is `409 STALE_TICKET` and nothing changes. A successful write increments
  `version` by 1.
- **BR-29** Ticket `version` is incremented by BR-28 writes and by Action Taken writes (BR-26). It is **not**
  incremented by Public Comments, Internal Notes, attachments, or the Requester flag, so conversation never blocks
  a staff member's workflow change.
- **BR-30** The client never retries a `409 STALE_TICKET` or `409 STALE_ACTION` automatically. It shows what
  changed and lets the user re-apply their change knowingly (ui-spec §6.6).

### Ticket status and the transition matrix

- **BR-31** The statuses remain `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`,
  `REOPENED`, and `CANCELLED` (Lab 3 BR-33).
- **BR-32** Only IT Staff and Administrators change status; a Requester attempting any status change is
  `403 FORBIDDEN` (Lab 3 BR-34).
- **BR-33** The final permitted transition matrix:

  | From | To | Additional condition (beyond role) | Side-effect |
  |---|---|---|---|
  | `NEW` | `OPEN` | — | — |
  | `NEW` | `IN_PROGRESS` | Owner present | — |
  | `NEW` | `CANCELLED` | — | — |
  | `OPEN` | `IN_PROGRESS` | Owner present | — |
  | `OPEN` | `WAITING_FOR_REQUESTER` | Owner present | — |
  | `OPEN` | `RESOLVED` | **Resolution gate** (BR-35) | Sets `resolvedAt`; clears Requester flag |
  | `OPEN` | `CANCELLED` | — | — |
  | `IN_PROGRESS` | `OPEN` | — | — |
  | `IN_PROGRESS` | `WAITING_FOR_REQUESTER` | Owner present | — |
  | `IN_PROGRESS` | `RESOLVED` | **Resolution gate** | Sets `resolvedAt`; clears flag |
  | `IN_PROGRESS` | `CANCELLED` | — | — |
  | `WAITING_FOR_REQUESTER` | `IN_PROGRESS` | Owner present | — |
  | `WAITING_FOR_REQUESTER` | `RESOLVED` | **Resolution gate** | Sets `resolvedAt`; clears flag |
  | `WAITING_FOR_REQUESTER` | `CANCELLED` | — | — |
  | `RESOLVED` | `CLOSED` | — | Clears flag; `resolvedAt` kept |
  | `RESOLVED` | `REOPENED` | — | Clears `resolvedAt` and flag |
  | `CLOSED` | `REOPENED` | — | Clears `resolvedAt` and flag |
  | `REOPENED` | `IN_PROGRESS` | Owner present | — |
  | `REOPENED` | `WAITING_FOR_REQUESTER` | Owner present | — |
  | `REOPENED` | `RESOLVED` | **Resolution gate** | Sets `resolvedAt`; clears flag |
  | `REOPENED` | `CANCELLED` | — | — |
  | `CANCELLED` | — | Terminal | — |

  The pairs are exactly the Lab 3 matrix (Lab 3 BR-35); Lab 4 adds the gate column and the `resolvedAt`
  side-effects. "Owner present" restates Lab 3 BR-30 for every work-in-progress target, not only from `NEW`.
- **BR-34** Any pair not in the matrix, including status-to-itself, is `409 INVALID_STATUS_TRANSITION` naming both
  statuses (Lab 3 BR-36). A pair in the matrix whose owner condition fails is the same code with the reason "until
  it has an owner".
- **BR-35** **Resolution gate.** A transition to `RESOLVED` additionally requires, evaluated inside the same
  transaction as the write:
  1. the Ticket has an owner;
  2. at least one Action Taken on the Ticket has `voidedAt IS NULL`;
  3. no Action Taken on the Ticket has an outstanding follow-up (BR-15).

  Failure is `409 RESOLUTION_BLOCKED` with a `blockers` array containing every failed condition as
  `UNASSIGNED`, `NO_ACTIONS`, or `OUTSTANDING_FOLLOW_UPS`. The Ticket is unchanged.
- **BR-36** The gate is enforced only by the backend status endpoint. No other endpoint can set `RESOLVED`, the
  create endpoint never accepts a status (Lab 3 BR-38), and the UI's hiding of the Resolve option is feedback only.
- **BR-37** Transitions to `RESOLVED`, `CLOSED`, and `CANCELLED` still require a UI confirmation (Lab 3 BR-37).
  `CANCELLED` is not gated by Actions Taken: a duplicate or withdrawn Ticket may be cancelled with no work
  recorded, and its outstanding follow-ups stop counting anywhere (BR-50).
- **BR-38** `resolvedAt` is set to the server time on every transition into `RESOLVED`, retained through `CLOSED`,
  and set to `null` on `REOPENED`.
- **BR-39** The Requester "Problem Appears Resolved" flag (Lab 3 BR-46) is advisory. It neither changes status nor
  bypasses the gate. It is cleared by a transition to `RESOLVED`, `CLOSED`, or `REOPENED`, unchanged from Lab 3.
- **BR-40** The staff Ticket detail returns `allowedTransitions`: the matrix targets from the current status
  whose owner condition and gate currently pass, plus `resolutionBlockers` when `RESOLVED` is a matrix target but
  the gate fails. The UI renders only `allowedTransitions` (FR-12); the backend re-evaluates on write.
- **BR-41** Claiming or assigning a `NEW` Ticket still moves it to `OPEN` in the same transaction (Lab 3 BR-29) and
  increments `version` once. Recording an action never changes status (X-11).

### Requester visibility

- **BR-42** A Requester reads Actions Taken only through the Requester route for their own Ticket. Ownership and
  `voidedAt IS NULL` are both inside the query predicate; a foreign Ticket is `404` (Lab 3 BR-19, BR-20).
- **BR-43** The Requester projection includes Action Date/Time, Description, Result, performer name and role
  label, Follow-Up Required, Follow-up Note, follow-up completion state, Attachment Notes, created time, and
  edited time. It excludes `version`, `clientRequestId`, and every `voided*` field.
- **BR-44** Because Requesters see Actions Taken, the staff Action form carries a permanent label "Visible to the
  Requester" (ui-spec §6.3). Private context belongs in Internal Notes (Lab 3 BR-41).

### Activity timestamps

- **BR-45** `Ticket.publicActivityAt` records the last change a Requester can see: Ticket creation, status change,
  Public Comment, Requester flag, attachment upload or removal, and any Action Taken write. Internal Notes,
  assignment, and IT Priority changes do **not** touch it, so a Requester's "recently updated" list never reveals
  internal activity.
- **BR-46** `Ticket.updatedAt` keeps its Lab 3 meaning (every change, including Internal Notes) and is used only on
  staff surfaces.

### Dashboard calculations

Common rules:

- **BR-47** Every metric is computed by the backend in the database at request time from authoritative tables.
  Nothing is cached, pre-aggregated, or computed in the client.
- **BR-48** **Active statuses** are `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, and `REOPENED`.
- **BR-49** **Time.** All timestamps are UTC in storage. "Today" is the calendar day in `Asia/Bangkok` (UTC+07:00,
  no daylight saving): `[today 00:00 +07:00, now]`. "Recent" windows are rolling: `[now − 7 × 24 h, now]`. The
  response carries `generatedAt` and `timeZone: "Asia/Bangkok"` so the numbers can be verified.
- **BR-50** Outstanding follow-ups on a `CANCELLED` Ticket are excluded from every metric.
- **BR-51** Every count is an integer `≥ 0` and is always present; an empty result is `0`, never `null` or an
  omitted key. Every list is an array, possibly empty, capped at its documented length.
- **BR-52** Lists return only summary fields (id, number, summary, status, IT Priority, relevant timestamp) — never
  descriptions, comments, notes, or attachments (handout §6.2).

Requester Dashboard — every predicate begins with `requesterId = session user`:

| ID | Metric | Definition | Drill-down |
|---|---|---|---|
| **BR-53** | `openTickets` | Count with status in active statuses (BR-48) | `/tickets?status=NEW&status=OPEN&status=IN_PROGRESS&status=WAITING_FOR_REQUESTER&status=REOPENED` |
| **BR-54** | `waitingForMe` | Count with status `WAITING_FOR_REQUESTER` | `/tickets?status=WAITING_FOR_REQUESTER` |
| **BR-55** | `resolvedAwaitingClosure` | Count with status `RESOLVED` | `/tickets?status=RESOLVED` |
| **BR-56** | `recentlyUpdated` | Up to 5 Tickets, any status, ordered `publicActivityAt` desc, `id` desc | Each row → `/tickets/:id` |
| **BR-57** | `recentlyResolved` | Up to 5 Tickets with status `RESOLVED` or `CLOSED` and `resolvedAt` in the last 7 days, ordered `resolvedAt` desc, `id` desc; `recentlyResolvedCount` is the full count in the window | Each row → `/tickets/:id`; count → `/tickets?status=RESOLVED&status=CLOSED&sortBy=updatedAt&sortOrder=desc` |

IT Staff Dashboard — across all Tickets:

| ID | Metric | Definition | Drill-down |
|---|---|---|---|
| **BR-58** | `unassigned` | Active and `assigneeId IS NULL` | `/staff/tickets?assignee=unassigned&status=<active…>` |
| **BR-59** | `myOpen` | Active and `assigneeId = session user` | `/staff/tickets?assignee=me&status=<active…>` |
| **BR-60** | `urgentActive` | Active and `itPriority = URGENT` | `/staff/tickets?itPriority=URGENT&status=<active…>` |
| **BR-61** | `requesterFlagged` | Active and `requesterResolvedFlaggedAt IS NOT NULL` | `/staff/tickets?flaggedResolved=true` |
| **BR-62** | `myOutstandingFollowUps` | Count of non-cancelled **Tickets** having at least one action with `performedById = session user` and an outstanding follow-up (BR-15). Tickets, not actions, so the number matches the list it opens | `/staff/tickets?followUp=mine` |
| **BR-63** | `newToday` | Tickets with `createdAt ≥ today 00:00 Asia/Bangkok` (BR-49) | `/staff/tickets?sortBy=createdAt&sortOrder=desc` — newest first; documented as an ordered, not filtered, destination (A-14) |
| **BR-64** | `byStatus` | Count per each of the 8 statuses across all Tickets; all 8 keys always present | `/staff/tickets?status=<that status>` |
| **BR-65** | `byItPriority` | Count per each of the 4 IT Priorities among **active** Tickets; all 4 keys always present | `/staff/tickets?itPriority=<p>&status=<active…>` |
| **BR-66** | `recentlyUpdated` | Up to 8 Tickets, any status, ordered `updatedAt` desc, `id` desc | Each row → `/staff/tickets/:id` |
| **BR-67** | `myRecentActions` | Up to 5 non-voided actions with `performedById = session user`, ordered `createdAt` desc, `id` desc, with Ticket number | Each row → `/staff/tickets/:id#actions` |

Administrator additions:

| ID | Metric | Definition | Drill-down |
|---|---|---|---|
| **BR-68** | `users.activeByRole` | Count of active users per role; all 3 keys always present | `/admin/users?role=<role>` |
| **BR-69** | `users.inactive` / `users.mustChangePassword` | Count of inactive users; count of active users with `mustChangePassword = true` | `/admin/users` (no single filter matches — A-14) |

- **BR-70** The `administration` block is present only when the caller is an Administrator; for IT Staff the key is
  absent rather than `null`, and no user count is computed.
- **BR-71** The sum of `byStatus` equals the total Ticket count, and the counts reconcile with the drill-down
  list's `meta.totalItems` for the same filter. This reconciliation is tested (AC-30).

### Authorization matrix (Lab 4 additions)

`✅` permitted · `✅ own` only the caller's own Ticket · `✅ p/o/a` performer, current Ticket Owner, or
Administrator · `❌ 403` forbidden · `❌ 404` indistinguishable from not found.

| Operation | Requester | IT Staff | Administrator | Unauthenticated |
|---|---|---|---|---|
| Read Actions Taken via Requester route (non-voided) | ✅ own | ✅ own | ✅ own | ❌ 401 |
| Another Requester's Ticket's actions via Requester route | ❌ 404 | ❌ 404 | ❌ 404 | ❌ 401 |
| Read Actions Taken via staff route (incl. voided) | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Create an Action Taken | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Edit an Action Taken | ❌ 403 | ✅ p/o/a, else ❌ 403 | ✅ | ❌ 401 |
| Void an Action Taken | ❌ 403 | ✅ p/o/a, else ❌ 403 | ✅ | ❌ 401 |
| Complete a follow-up | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Delete an Action Taken | ❌ — no such endpoint | ❌ — no such endpoint | ❌ — no such endpoint | ❌ 401 |
| Status change (incl. resolution) | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Requester Dashboard | ✅ own data | ❌ 403 | ❌ 403 | ❌ 401 |
| IT Staff Dashboard | ❌ 403 | ✅ | ✅ + `administration` | ❌ 401 |
| Health check | ✅ | ✅ | ✅ | ✅ |

Every Lab 3 matrix row (Lab 3 §5) remains in force unchanged.

- **BR-72** The role check for staff Action routes runs before the Ticket lookup, so a Requester probing them learns
  nothing about which Ticket ids exist (Lab 3 api-spec §3.14 pattern). The performer/owner/admin check runs after
  the action lookup and returns `403` only to staff, who may already read the action.

### Migration, seed, and regression

- **BR-73** The Lab 4 migration is additive only. No existing table, column, row, or identifier is dropped,
  renamed, or renumbered. Every Lab 3 User, Session, Ticket, Attachment, Public Comment, and Internal Note
  survives with its identifiers.
- **BR-74** Backfill: `Ticket.version = 1` for every row; `resolvedAt = updatedAt` for Tickets currently
  `RESOLVED` or `CLOSED` (the best available evidence, documented as approximate), otherwise `null`;
  `publicActivityAt = GREATEST(createdAt, latest PUBLIC message createdAt, latest attachment uploadedAt or
  removedAt)`.
- **BR-75** Legacy Tickets have zero Actions Taken. They remain valid in every status they already hold —
  including `RESOLVED` and `CLOSED` — because the gate applies only to new transitions into `RESOLVED`. A legacy
  active Ticket must have an action recorded before it can be resolved; a legacy `CLOSED` Ticket that is reopened
  must likewise earn its next resolution.
- **BR-76** Recovery: before migrating, a `pg_dump` backup is taken (README command). The migration ships with a
  reviewed `down.sql` that drops `ActionTaken` with its indexes and constraints, the new Ticket indexes, and the
  three new Ticket columns, restoring
  the exact Lab 3 schema. Both directions are tested against a database holding Lab 3 data (AC-41).
- **BR-77** The seed stays idempotent: actions are upserted by a fixed `clientRequestId`, so repeated runs create
  no duplicates and change no identifier (Lab 2 BR-46).
- **BR-78** Lab 3 requests to the assignment, priority, and status endpoints must now include `expectedVersion`.
  Lab 3 tests that called them are updated to send it — replaced by their Lab 4 equivalent, not deleted
  (Lab 3 BR-58 pattern). A request without it is `400 VALIDATION_FAILED` on `expectedVersion`.
- **BR-79** The login home route changes from My Tickets / Ticket Queue to the role's Dashboard. Lab 3 navigation
  tests that asserted the old home are updated the same way.

### Failure behaviour and hardening

- **BR-80** Error envelope, codes, and safe-message rules are unchanged (Lab 3 BR-64, BR-65); Lab 4 adds only the
  codes in Section 8.3.
- **BR-81** No input is discarded on failure: the Action form, the Void dialog, and every Lab 2–3 form keep their
  values after a `400`, `409`, `500`, or network failure and allow retry (Lab 3 BR-66).
- **BR-82** Every submit button is disabled with the busy state while its request is in flight; the Action form
  additionally reuses one `clientRequestId` for every retry of the same unsaved form and generates a new one only
  after a successful create (BR-24).
- **BR-83** A dashboard card whose backend call fails does not blank the page: the dashboard is one request, and on
  failure the whole grid shows one safe-failure callout with **Try again** while navigation remains usable.
- **BR-84** `GET /api/health` returns `200 { status: "ok", database: "ok" }` when a `SELECT 1` succeeds within 2
  seconds, and `503 SERVICE_UNAVAILABLE { status: "degraded", database: "unavailable" }` otherwise. It requires no
  session and exposes no version, host, or connection detail.

---

## 6. UI Specification Summary

Full anatomy, wireframes, and the visual checklist live in [ui-spec.md](ui-spec.md). This section is binding. The
Zen Green tokens are carried forward **unchanged**; Lab 4 adds no new colour value.

### 6.1 Screens and required states

| Screen | Route | Roles | Required states |
|---|---|---|---|
| Requester Dashboard | `/dashboard` | Requester | loading, loaded, all-zero (welcome), per-list empty, forbidden, failure |
| IT Staff Dashboard | `/staff/dashboard` | IT Staff, Administrator | loading, loaded, all-zero, per-list empty, forbidden, failure; Administrator adds the Accounts card group |
| Staff Ticket Detail — Actions Taken panel | `/staff/tickets/:id` | IT Staff, Administrator | loading, empty, list, create form, edit form, saving, validation, duplicate-replayed, not actionable, stale action, complete-follow-up confirm, void dialog, forbidden edit, failure |
| Staff Ticket Detail — Workflow panel | `/staff/tickets/:id` | IT Staff, Administrator | allowed transitions only, resolution blockers, confirm, stale ticket, invalid transition, success refresh |
| Requester Ticket Detail — Actions Taken | `/tickets/:id` | owning Requester | loading, empty, read-only list, failure |
| My Tickets (drill-down) | `/tickets?status=…` | Requester | Lab 2 states with multi-status filter chips pre-applied from the URL |
| Ticket Queue (drill-down) | `/staff/tickets?…` | IT Staff, Administrator | Lab 3 states with the follow-up filter |
| All Lab 2–3 screens | unchanged | unchanged | Lab 2–3 states, regression-tested |

### 6.2 Navigation (binding)

- Requester: **Dashboard**, My Tickets, Create Ticket. IT Staff: **Dashboard**, Ticket Queue. Administrator:
  **Dashboard**, Ticket Queue, User Management. Dashboard is first and is the post-login home (BR-79).
- The active destination carries the Lab 2 active indication plus `aria-current="page"`; detail routes highlight
  their parent list.

### 6.3 Dashboard cards (binding)

- A metric card is: a label, a large number, a one-line definition in muted text, and the whole card as one link to
  its drill-down with an accessible name such as "Open tickets: 4. View list". Zero renders as `0`, and the link
  remains (it opens an empty list, which is the honest answer).
- Cards are ordered by urgency of attention: for staff `unassigned`, `myOpen`, `urgentActive`,
  `requesterFlagged`, `myOutstandingFollowUps`, `newToday`; for Requesters `waitingForMe`, `openTickets`,
  `resolvedAwaitingClosure`.
- Status and IT-Priority breakdowns render as compact labelled rows using the existing badges, not charts (X-06).
- Desktop: cards in a 3-column grid (staff 3 × 2), lists in two columns below. Tablet: 2-column grid. Mobile: one
  column, cards before lists. No horizontal scroll at any size.

### 6.4 Actions Taken panel (binding)

- Sits on Staff Ticket Detail between the ticket information and Public Comments, as a landmark region "Actions
  Taken", with a count in its heading and a **Record action** primary button (hidden, with a reason line, when
  BR-14 refuses writes).
- Desktop renders a table: Date/Time, Description, Result, Performed by, Follow-up, Attachment Notes, Actions;
  tablet and mobile render one card per action. Long text is clamped to 3 lines with a "Show more" toggle.
- Follow-up status is a badge with text: "Follow-up outstanding" (warning), "Follow-up done" (success),
  "No follow-up" (neutral). Voided actions render collapsed with a "Voided" neutral badge and the reason — the
  state is carried by text, never by strikethrough or colour alone.
- Create and edit use one form (dialog on desktop and tablet, full-screen on mobile) with the permanent label
  "Visible to the Requester". The Follow-up Note field appears only when Follow-Up Required is "Yes" and is then
  marked required. Performed by is displayed read-only ("You") and never editable.
- The Requester sees the same list read-only, without voided items, without any action buttons.

### 6.5 Workflow panel (binding)

- The status select lists only `allowedTransitions` (BR-40). When `RESOLVED` is blocked, a warning callout under
  the select lists each blocker in words ("No action has been recorded", "1 follow-up is outstanding") with a link
  to the Actions Taken panel.
- A Requester flag renders a success-tinted callout at the top of the workflow panel: "The Requester says this
  problem appears resolved. Review Actions Taken before resolving."
- After any successful workflow or action write, the ticket summary badges, `allowedTransitions`, and blockers
  refresh from the response.

---

## 7. Data Changes

PostgreSQL through Prisma. One versioned, additive migration; no manual SQL against a database holding Lab 3 data.

### 7.1 New model `ActionTaken`

| Field | Type | Notes |
|---|---|---|
| `id` | `Int` | PK, autoincrement |
| `ticketId` | `Int` | FK → `Ticket.id`, `onDelete: Cascade` (BR-01) |
| `clientRequestId` | `String` `@db.Uuid` | `@unique` (BR-24) |
| `actionAt` | `DateTime` | Action Date/Time, UTC (BR-06) |
| `description` | `String` `@db.Text` | 1–2000 (BR-07) |
| `result` | `String` `@db.VarChar(1000)` | 1–1000 (BR-08) |
| `followUpRequired` | `Boolean` | (BR-09) |
| `followUpNote` | `String?` `@db.VarChar(1000)` | Non-null iff `followUpRequired` (BR-10) |
| `followUpCompletedAt` | `DateTime?` | (BR-16) |
| `followUpCompletedById` | `Int?` | FK → `User.id`, `Restrict` |
| `attachmentNotes` | `String?` `@db.VarChar(500)` | (BR-11) |
| `performedById` | `Int` | FK → `User.id`, `Restrict`; immutable (BR-03) |
| `lastEditedById` | `Int?` | FK → `User.id`, `Restrict` (BR-19) |
| `voidedAt` | `DateTime?` | Null means valid (BR-20) |
| `voidedById` | `Int?` | FK → `User.id`, `Restrict` |
| `voidReason` | `String?` `@db.VarChar(500)` | |
| `version` | `Int` | `@default(1)` (BR-25) |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

Database `CHECK` constraints (raw SQL inside the Prisma migration, because Prisma cannot declare them):

- `followUpRequired = (followUpNote IS NOT NULL)` — the BR-10 pairing cannot be violated by any code path.
- `followUpCompletedAt IS NULL OR followUpRequired` — only a required follow-up can be completed.
- `(voidedAt IS NULL) = (voidedById IS NULL) AND (voidedAt IS NULL) = (voidReason IS NULL)`.

### 7.2 Changed model `Ticket`

| Field | Type | Notes |
|---|---|---|
| `version` | `Int` | **New**, `@default(1)` (BR-27) |
| `resolvedAt` | `DateTime?` | **New** (BR-38) |
| `publicActivityAt` | `DateTime` | **New**, `@default(now())` after backfill (BR-45) |
| `actions` | `ActionTaken[]` | **New** relation |

`User` gains four named back-relations (`performedActions`, `editedActions`, `completedFollowUps`,
`voidedActions`) following the Lab 2 `uploadedBy` / `removedBy` pattern. No column is added to `User`.

### 7.3 Relationships

- `Ticket 1 — n ActionTaken`, cascading, so no action outlives its Ticket (Tickets are never deleted in practice).
- `User 1 — n ActionTaken` four times (performer, last editor, follow-up completer, voider), all `Restrict`, so a
  referenced user can never be removed (Lab 3 BR-53).

### 7.4 Indexes

| Object | Reason |
|---|---|
| `ActionTaken @@index([ticketId, actionAt, id])` | The list read and its stable order (BR-23) in one index |
| `ActionTaken @@index([ticketId, voidedAt, followUpRequired, followUpCompletedAt])` | The resolution gate's two counts (BR-35) |
| `ActionTaken @@index([performedById, createdAt])` | `myRecentActions` and `myOutstandingFollowUps` (BR-62, BR-67) |
| `ActionTaken.clientRequestId` unique | Idempotent create (BR-24) |
| `Ticket @@index([requesterId, status])` | Every Requester count (BR-53 – BR-55) |
| `Ticket @@index([requesterId, publicActivityAt])` | Requester recently updated (BR-56) |
| `Ticket @@index([resolvedAt])` | Recently resolved (BR-57) |
| `Ticket @@index([updatedAt])` | Staff recently updated (BR-66) |
| `Ticket @@index([createdAt])` | New today (BR-63) |
| Lab 3 `Ticket @@index([status, itPriority, createdAt])`, `@@index([assigneeId, status])` | Reused by the staff counts (BR-58 – BR-60, BR-64, BR-65) |

**Justified design decision 1 — optimistic `version` columns instead of row locks or last-writer-wins.** Staff
work in parallel on the same Ticket from different screens that stay open for minutes. Pessimistic locks cannot be
held across a human's think time, and last-writer-wins is exactly the silent overwrite the handout forbids. An
integer version compared in the `WHERE` clause of a single `UPDATE` costs one column, needs no extra round trip,
and makes the conflict explicit (`409`). Bumping the Ticket version on every Action write (BR-26) reuses the same
mechanism to close the only real race in the gate: an action added between "check gate" and "write `RESOLVED`"
changes the version, so the resolve fails instead of resolving against stale evidence.

**Justified design decision 2 — a separate `publicActivityAt` rather than reusing `updatedAt`.** Lab 3 refreshes
`Ticket.updatedAt` when an Internal Note is posted. Ordering a Requester's "recently updated" list by it would
reveal *that* staff wrote something private, and when. A column touched only by Requester-visible events
(BR-45) keeps the Requester dashboard leak-free without changing Lab 3's staff semantics.

**Justified design decision 3 — void instead of delete, with no revision table.** Deleting work records destroys
the evidence the resolution gate depends on. A revision table would answer "what did it say before?" but nothing in
scope asks that question (X-08). `lastEditedBy`, `updatedAt`, `version`, and an irreversible void with a reason are
the smallest set that keeps the record accountable.

### 7.5 Migration

One migration, `20261020100000_add_actions_taken_and_workflow_fields`, reviewable as one file:

1. `ALTER TABLE "Ticket" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1` — a constant default is safe on a
   non-empty table.
2. Add `resolvedAt` nullable; `UPDATE "Ticket" SET "resolvedAt" = "updatedAt" WHERE "status" IN ('RESOLVED',
   'CLOSED')`.
3. Add `publicActivityAt` **nullable**; backfill with the BR-74 `GREATEST(...)` expression using correlated
   sub-selects over `TicketMessage` (`visibility = 'PUBLIC'`) and `Attachment`; then `SET NOT NULL` and
   `SET DEFAULT now()` (Lab 3 three-step pattern).
4. Create `ActionTaken`, its foreign keys, `CHECK` constraints, and indexes.
5. Create the new `Ticket` indexes.

`down.sql` (stored beside the migration, applied only by the documented recovery command) reverses steps 5 → 1.
README documents `pg_dump` before `prisma migrate deploy` and `psql < down.sql` plus `prisma migrate resolve
--rolled-back` for recovery (BR-76).

### 7.6 Seed decisions

The seed remains idempotent (BR-77) and adds:

- Tickets with **zero**, **one**, and **many (≥ 4)** Actions Taken;
- at least one action performed by an IT Staff member who is **not** the Ticket Owner (BR-02);
- one outstanding follow-up (blocks resolution on that Ticket), one completed follow-up, and one voided action;
- one active Ticket whose actions pass the gate (ready to resolve) and one that fails it, for the demonstration;
- `RESOLVED` and `CLOSED` Tickets with `resolvedAt` both inside and outside the 7-day window;
- at least one Ticket created "today" in Bangkok time, computed at seed time;
- a Requester account `empty.requester@toktickit.dev` with no Tickets, and an IT Staff account
  `quiet.it@toktickit.dev` with no owned Tickets and no actions — both `mustChangePassword = false` — so the
  all-zero dashboard states are demonstrable from a clean database;
- Lab 3 seed data unchanged, every status, both priorities, assigned and unassigned ownership, comments and notes.

Seed credentials remain local-development only, documented in README with the Lab 3 warning.

---

## 8. API Contract

Complete shapes, validation order, and examples live in [api-spec.md](api-spec.md). This section is binding.

### 8.1 Conventions

Unchanged from Lab 3 (session cookie, middleware stack, error envelope, `no-store`, ISO-8601 UTC). New staff routes
live under `/api/staff/…` and inherit its role guard; the Requester dashboard route is guarded by
`requireRole('REQUESTER')` at mount (Lab 3 A-16).

### 8.2 Endpoint summary

| # | Method and path | Purpose | Success | Main failures |
|---|---|---|---|---|
| 1 | `GET /api/tickets/:id/actions` | Non-voided actions on the caller's own Ticket | `200` array | `400`, `401`, `404`, `500` |
| 2 | `GET /api/staff/tickets/:id/actions` | All actions on any Ticket, including voided | `200` array | `400`, `401`, `403`, `404`, `500` |
| 3 | `POST /api/staff/tickets/:id/actions` | Create an action (idempotent by `clientRequestId`) | `201`, or `200` on replay | `400`, `401`, `403`, `404`, `409`, `500` |
| 4 | `PATCH /api/staff/tickets/:id/actions/:actionId` | Edit an action | `200` | `400`, `401`, `403`, `404`, `409`, `500` |
| 5 | `POST /api/staff/tickets/:id/actions/:actionId/complete-follow-up` | Complete an outstanding follow-up | `200` | `400`, `401`, `403`, `404`, `409`, `500` |
| 6 | `POST /api/staff/tickets/:id/actions/:actionId/void` | Void an action with a reason | `200` | `400`, `401`, `403`, `404`, `409`, `500` |
| 7 | `PATCH /api/staff/tickets/:id/status` | **Changed**: `expectedVersion`, resolution gate, `resolvedAt` | `200` | `400`, `401`, `403`, `404`, `409`, `500` |
| 8 | `PATCH /api/staff/tickets/:id/assignment` | **Changed**: `expectedVersion` | `200` | `400`, `401`, `403`, `404`, `409`, `500` |
| 9 | `PATCH /api/staff/tickets/:id/priority` | **Changed**: `expectedVersion` | `200` | `400`, `401`, `403`, `404`, `409`, `500` |
| 10 | `GET /api/staff/tickets/:id` | **Changed**: adds `version`, `resolvedAt`, `actionSummary`, `allowedTransitions`, `resolutionBlockers` | `200` | `400`, `401`, `403`, `404`, `500` |
| 11 | `GET /api/staff/tickets` | **Changed**: adds `followUp=outstanding\|mine` filter | `200` `{ data, meta }` | `400`, `401`, `403`, `500` |
| 12 | `GET /api/tickets` | **Changed**: `status` accepts all 8 values and may repeat | `200` `{ data, meta }` | `400`, `401`, `500` |
| 13 | `GET /api/dashboard/requester` | Requester Dashboard | `200` | `401`, `403`, `500` |
| 14 | `GET /api/staff/dashboard` | IT Staff Dashboard (+ `administration` for Administrators) | `200` | `401`, `403`, `500` |
| 15 | `GET /api/health` | **Changed**: database check | `200` / `503` | — |

Every other Lab 2 and Lab 3 endpoint is unchanged. There is no `DELETE` for actions (BR-21).

### 8.3 Error code catalogue additions

| Code | Status | Meaning |
|---|---|---|
| `ACTION_NOT_FOUND` | 404 | Unknown action id, or the action belongs to another Ticket (BR-01) |
| `TICKET_NOT_ACTIONABLE` | 409 | Ticket status or ownership refuses action writes (BR-14) |
| `FOLLOW_UP_NOT_OUTSTANDING` | 409 | Completing, or changing follow-up fields of, a follow-up that is not outstanding (BR-16, BR-17) |
| `ACTION_ALREADY_VOIDED` | 409 | Writing to a voided action (BR-20) |
| `STALE_ACTION` | 409 | `expectedVersion` does not match the action (BR-25) |
| `STALE_TICKET` | 409 | `expectedVersion` does not match the Ticket (BR-28) |
| `RESOLUTION_BLOCKED` | 409 | Resolution gate failed; the error carries `blockers` (BR-35) |
| `SERVICE_UNAVAILABLE` | 503 | Health check cannot reach the database (BR-84) |

`DUPLICATE_SUBMISSION` (Lab 2) is reused for a `clientRequestId` replayed by another user (BR-24). `FORBIDDEN` is
reused for a staff member who is not performer, owner, or Administrator (BR-18).

### 8.4 HTTP status policy changes

`200` now also covers an idempotent create replay (BR-24). `409` gains six codes above. `503` is introduced for the
health check only. `428 Precondition Required` and `412 Precondition Failed` are deliberately **not** used: a
missing `expectedVersion` is ordinary field validation (`400`), and a mismatch is a state conflict like every other
Lab 3 conflict (`409`), so the client keeps one branch per meaning (api-spec §6.2).

---

## 9. Acceptance Criteria

Every criterion maps to at least one planned test in [tests.md](tests.md).

### Actions Taken

- **AC-01** Given a permitted IT Staff user and valid data on an owned `IN_PROGRESS` Ticket, when an Action Taken
  is created, then it is saved under that Ticket with `performedBy` = the authenticated user, a server `createdAt`,
  `version = 1`, and the Ticket's `version` and `publicActivityAt` advance.
- **AC-02** Given a create request containing `performedById`, `createdAt`, or `ticketId`, when it is sent, then
  the API responds `400 VALIDATION_FAILED` naming each such field and nothing is stored.
- **AC-03** Given Follow-Up Required `true` and no note, or `false` with a non-empty note, when an action is
  created, then the API responds `400 VALIDATION_FAILED` on `followUpNote` and nothing is stored.
- **AC-04** Given empty or whitespace-only Description or Result, Description of 2001 characters, Result of 1001,
  Attachment Notes of 501, or an `actionAt` before the Ticket's creation or more than 5 minutes in the future,
  when an action is created, then every offending field is named in one `400` response.
- **AC-05** Given an IT Staff user who is not the Ticket Owner, when they record an action, then it is saved with
  them as performer and the Ticket Owner is unchanged.
- **AC-06** Given a Ticket in `NEW`, an unassigned `OPEN` Ticket, or a Ticket in `RESOLVED`, `CLOSED`, or
  `CANCELLED`, when any action write is attempted, then the API responds `409 TICKET_NOT_ACTIONABLE` with the
  matching reason and nothing changes.
- **AC-07** Given a Ticket with actions whose `actionAt` values are out of insertion order and two sharing a
  timestamp, when the list is read twice, then both reads return the same order: `actionAt` ascending, then `id`.
- **AC-08** Given the same create request sent twice with one `clientRequestId`, when both complete, then exactly
  one action exists, the first response is `201`, and the second is `200` with the same action id.
- **AC-09** Given an action's performer, the Ticket Owner, and an Administrator, when each edits it with the
  current `expectedVersion`, then each edit succeeds, `version` increments, `lastEditedBy` is the editor, and
  `performedBy` and `createdAt` are unchanged.
- **AC-10** Given an IT Staff user who is neither performer nor Ticket Owner, when they edit or void the action,
  then the API responds `403 FORBIDDEN` and nothing changes.
- **AC-11** Given two users editing the same action from version 3, when both submit, then the first succeeds and
  the second receives `409 STALE_ACTION` and the first user's values remain.
- **AC-12** Given an outstanding follow-up, when any IT Staff user completes it, then completion time and user are
  recorded, it is no longer outstanding, and a second completion responds `409 FOLLOW_UP_NOT_OUTSTANDING`.
- **AC-13** Given a completed follow-up, when an edit changes `followUpRequired` or `followUpNote`, then the API
  responds `409 FOLLOW_UP_NOT_OUTSTANDING`; an edit of Result alone succeeds.
- **AC-14** Given a valid action, when it is voided with a reason, then it remains in the staff list marked voided
  with the reason, disappears from the Requester list, and any further edit, completion, or void responds
  `409 ACTION_ALREADY_VOIDED`.
- **AC-15** Given any role, when `DELETE` is sent to any action path, then no route matches and no action is
  removed.

### Requester visibility

- **AC-16** Given an owning Requester, when they read their Ticket's actions, then every non-voided action is
  returned with all Requester-projection fields and no `version`, `clientRequestId`, or `voided*` field.
- **AC-17** Given Requester B, when Requester A's Ticket's actions are requested through the Requester route, then
  the response is `404`, identical to a non-existent Ticket.
- **AC-18** Given a Requester, when any staff Action route is called directly — read, create, edit, complete, or
  void — then the API responds `403 FORBIDDEN` with no action data.

### Ticket workflow and resolution

- **AC-19** Given every (from, to) pair of the 8 statuses, when a transition is attempted by IT Staff on a
  qualifying Ticket, then exactly the BR-33 pairs succeed and every other pair responds
  `409 INVALID_STATUS_TRANSITION`.
- **AC-20** Given an owned Ticket with zero actions, when it is moved to `RESOLVED`, then the API responds
  `409 RESOLUTION_BLOCKED` with `blockers: ["NO_ACTIONS"]` and the status is unchanged.
- **AC-21** Given an owned Ticket whose only actions are voided, when it is moved to `RESOLVED`, then it is
  blocked with `NO_ACTIONS`.
- **AC-22** Given an owned Ticket with one outstanding follow-up, when it is moved to `RESOLVED`, then it is
  blocked with `OUTSTANDING_FOLLOW_UPS`; after the follow-up is completed the same transition succeeds and
  `resolvedAt` is set.
- **AC-23** Given a Requester-flagged Ticket that fails the gate, when staff attempt `RESOLVED`, then it is blocked
  and the flag remains; the Requester flag itself never changes status.
- **AC-24** Given a `RESOLVED` Ticket, when it is reopened, then `resolvedAt` becomes `null`, the flag is cleared,
  and action writes are permitted again.
- **AC-25** Given a Requester, when they call the status endpoint with `RESOLVED` directly, then the API responds
  `403 FORBIDDEN` and nothing changes.
- **AC-26** Given two staff users holding Ticket version 5, when one changes IT Priority and the other then changes
  status with `expectedVersion: 5`, then the second receives `409 STALE_TICKET` and the status is unchanged.
- **AC-27** Given a resolve request with the current version, when another user creates an action on that Ticket
  before the resolve commits, then the resolve responds `409 STALE_TICKET` rather than resolving against the
  older work log.
- **AC-28** Given the staff Ticket detail, when it is read, then `allowedTransitions` equals the matrix targets
  whose conditions pass now, and `resolutionBlockers` lists each failed gate condition when `RESOLVED` is a matrix
  target.

### Dashboards

- **AC-29** Given an authenticated Requester, when dashboard data is retrieved, then only metrics and recent
  Tickets owned by that Requester are returned, and Tickets of other Requesters change no number.
- **AC-30** Given the seeded database, when the IT Staff dashboard is retrieved, then each count equals an
  independent `prisma.ticket.count` with the BR-58 – BR-65 predicate, and every filtered count (all except
  `newToday`, A-14) equals `meta.totalItems` of its drill-down list request.
- **AC-31** Given a Requester with no Tickets and an IT Staff user with no owned Tickets and no actions, when each
  dashboard loads, then every count is `0`, every list is `[]`, no key is missing, and the UI shows the all-zero
  state.
- **AC-32** Given a Ticket created at 23:30 Bangkok yesterday and one at 00:10 Bangkok today, when `newToday` is
  computed, then only the second is counted.
- **AC-33** Given Tickets resolved 6 days 23 hours ago and 7 days 1 hour ago, when `recentlyResolved` is computed,
  then only the first is included.
- **AC-34** Given a Ticket that received only an Internal Note, when its Requester's dashboard is retrieved, then
  its position in `recentlyUpdated` is unchanged.
- **AC-35** Given IT Staff, when the dashboard is retrieved, then no `administration` key exists; given an
  Administrator, `administration.users` is present with all role keys.
- **AC-36** Given an IT Staff user calling the Requester dashboard, or a Requester calling the staff dashboard,
  then the API responds `403 FORBIDDEN` with no metric.
- **AC-37** Given any dashboard card, when it is activated by mouse or keyboard, then the drill-down list opens
  with the documented filter applied and visible in its controls.
- **AC-38** Given the dashboard API failing, when the dashboard renders, then one safe-failure callout with
  **Try again** appears and navigation remains usable.

### UI behaviour

- **AC-39** Given the Actions Taken form, when Follow-Up Required is switched to "Yes", then the Follow-up Note
  field appears and is required; switching to "No" hides it and its text is not submitted.
- **AC-40** Given a staff user on Ticket Detail, when the status select renders, then it lists only
  `allowedTransitions`; when resolution is blocked, the blockers are listed in words with a link to the Actions
  Taken panel; after a successful change the summary status badge refreshes without a page reload.

### Migration and regression

- **AC-41** Given a database holding Lab 3 data, when the Lab 4 migration is applied, then every User, Session,
  Ticket, Attachment, and TicketMessage survives with its id; `version = 1`; `resolvedAt` follows BR-74; and when
  `down.sql` is applied and the migration re-applied, the data is still intact.
- **AC-42** Given the seed run twice, when actions are counted, then the count is unchanged and no id changed.
- **AC-43** Given the complete Lab 2 and Lab 3 automated suites (updated only as BR-78, BR-79 state), when run on
  the final `main`, then every test passes.
- **AC-44** Given a Requester, IT Staff user, and Administrator, when each signs in, then each lands on their
  Dashboard and their navigation shows exactly the BR destinations of §6.2.
- **AC-45** Given repeated rapid clicks on Record action, Save status, Post comment, and Create ticket, when the
  network is slow, then exactly one write occurs per intended submission.
- **AC-46** Given a server `500` or network failure while saving an action, a ticket, a comment, or a user, when
  the error is shown, then every entered value is still present and the form can be resubmitted.
- **AC-47** Given the full E2E run, when browser console output is collected, then there is no error-level message
  and no request to a missing route.
- **AC-48** Given the database is stopped, when `/api/health` is called, then it responds `503` with
  `database: "unavailable"` and no internal detail.

### UI, responsive, and accessibility

- **AC-49** Given the Requester Dashboard, IT Staff Dashboard, Staff Ticket Detail with Actions Taken, the Action
  form, and the Requester Ticket Detail at 1280×800, 820×1180, and 375×812, when rendered, then there is no
  horizontal page scroll, clipped label, overlapping control, or hidden primary action.
- **AC-50** Given any Lab 4 screen, when inspected, then every colour resolves to a Zen Green token and read-only
  fields (Performed by, Created) are visually distinct from editable ones.
- **AC-51** Given a keyboard-only user, when they operate the dashboards, the Action form (including the
  conditional field), the void dialog, and the status select, then every control is reachable, focus is visible,
  dialogs trap and return focus, and each task completes without a mouse.
- **AC-52** Given follow-up, voided, status, and priority badges, when rendered in greyscale, then each is
  distinguishable by its text alone.

---

## 10. Definition of Done

### 10.1 Part 1 — Product Definition of Done

The AI coding agent may report completion only when **every** box below is true.

**Scope and behaviour**
- [ ] FR-01 – FR-34 are implemented, and nothing from the Excluded table (X-01 – X-12) exists in the code.
- [ ] BR-01 – BR-84 are implemented and demonstrable, including failure, boundary, concurrency, and safety rules.
- [ ] AC-01 – AC-52 pass by observation and by automated test.
- [ ] The Lab 4 authorization matrix and every Lab 3 matrix row are implemented exactly, including `403` vs `404`.
- [ ] The resolution gate is proven by direct API calls, not by a hidden UI option.

**Data integrity and concurrency**
- [ ] `performedBy`, `createdAt`, and `ticketId` of an action can never be set or changed by a client.
- [ ] Stale Ticket and Action writes are refused with `409` and change nothing; the gate-versus-new-action race is
      proven by AC-27.
- [ ] Repeated create requests never produce duplicate actions (AC-08, AC-45).
- [ ] The `CHECK` constraints of §7.1 exist in the migration and reject invalid rows inserted directly.

**Security**
- [ ] Voided actions never reach a Requester; ownership and voided filters are query predicates.
- [ ] Dashboards return only the caller's permitted data; the Requester dashboard is scoped in its `WHERE` clause.
- [ ] No response leaks a stack trace, SQL, file path, hash, session id, or internal detail (health included).
- [ ] No secret is committed; `.env` stays git-ignored.

**Tests**
- [ ] Tests exist at every required level: unit, API/integration, UI component, UI style, responsive,
      authorization, workflow, migration/regression, performance-smoke, and E2E.
- [ ] Every AC maps to at least one test in `tests.md`; every planned test names its real file path.
- [ ] All Lab 1 – Lab 4 tests pass from the documented commands on the final `main`.
- [ ] No test is skipped, `.only`, commented out, or assertion-free.
- [ ] Failure paths are covered: `400`, `401`, `403`, `404`, `409` (every new code), `500`, `503`, backend-down,
      empty, all-zero, no-results, forbidden, and stale states.

**Data**
- [ ] The Prisma schema matches §7; the migration applies to an empty database and to a Lab 3 database; `down.sql`
      restores the Lab 3 schema.
- [ ] `npx prisma db seed` runs twice with no duplicates; the §7.6 seed mix exists, including zero/one/many-action
      Tickets and both all-zero accounts.
- [ ] Every documented index and constraint exists in the migration.

**API**
- [ ] Every endpoint in §8.2 exists with the documented method, path, body, statuses, and error envelope.
- [ ] No `DELETE` route exists for actions.
- [ ] Dashboard responses contain summary fields only and match api-spec §3.13 – §3.14 shapes.

**UI**
- [ ] Zen Green tokens only; no hard-coded colour added in Lab 4.
- [ ] Every screen implements its full state set from §6.1.
- [ ] Desktop, tablet, and mobile screenshots exist under `artifacts/lab-04/screenshots/` for `staff-dashboard/`,
      `requester-dashboard/`, `actions-taken/`, and `ticket-workflow/`.
- [ ] The `ui-spec.md` visual and accessibility checklist is completed against those screenshots, not from memory.
- [ ] No placeholder text, unfinished control, duplicate control, or obsolete Lab 1–3 screen remains;
      `placeholders.tsx` contains only the real not-found state.

**Documentation**
- [ ] `specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md`, `reviewer.md`, and `ai-use.md` are present and
      current under `docs/lab-04/`.
- [ ] `README.md` setup, migrate, backup/recovery, seed, test, screenshot, and demonstration steps are verified from
      a clean clone.
- [ ] Any deviation from this specification is recorded in §11 before merge.

**Demonstration**
- [ ] The student can demonstrate live: dashboards for all three roles with accurate counts and drill-downs; the
      all-zero states; recording several actions by different staff on one Ticket; validation and the conditional
      follow-up note; edit, stale edit, complete follow-up, void, and a forbidden edit; a blocked and then
      successful resolution; close, reopen, and cancel; Ticket Owner assignment including inactive-assignee
      rejection; a Requester viewing actions read-only; and the Labs 1–3 regression path (login, My Tickets,
      Ticket Detail, attachments, comments, Internal Notes, user management).

### 10.2 Part 2 — Course Delivery Requirements

- [ ] `lab4-staging` created from `main`; no direct commits to `main` or `lab4-staging`.
- [ ] Every Issue implemented on its own feature branch and merged into `lab4-staging` through a peer-reviewed
      Pull Request.
- [ ] One release Pull Request from `lab4-staging` to `main` after integration testing.
- [ ] The GitHub Project Kanban shows every Issue in Done.
- [ ] `reviewer.md` records reviewer identity, PR links, comments, responses, and approvals.
- [ ] `ai-use.md` records the LLM used, 6–10 key prompts, and a brief "My Reflection".
- [ ] Evidence proves `specification.md` existed before the main implementation PRs were completed.
- [ ] The single submission PDF uses "Answer Part 1" – "Answer Part 9" with working links and readable screenshots.

---

## 11. Assumptions and Decisions

| # | Assumption or decision | Rationale |
|---|---|---|
| A-01 | An Action Taken has a performer set automatically and **no** separate assignee, due date, or status | The stakeholder listed exactly one person field and marked it "(auto)". Assigning people to work stays the Ticket Owner operation, which already has its inactive-assignee rule (Lab 3 BR-27). Adding an action assignee would create a second ownership concept the request never asked for |
| A-02 | Action Date/Time is user-entered (default now, not future, not before the Ticket) and separate from the server `createdAt` | Staff often record work after doing it. Keeping both makes late entry visible instead of falsifying when the record was made |
| A-03 | Attachment Notes is a 500-character text pointer, not an upload or attachment link | The request says "what file to look for". Files already have one home with its own validation (Lab 2); a second upload path would duplicate it |
| A-04 | A follow-up is outstanding until explicitly completed, and an outstanding follow-up blocks resolution | "Follow-Up Required" is the only field that says work is unfinished; using it as the gate makes the rule meaningful without inventing an action status |
| A-05 | Voided actions are hidden from Requesters; non-voided actions are shown in full | "Requesters will see all Actions Taken items" is honoured for valid items. A voided action is typically one recorded on the wrong Ticket and may describe another person's problem |
| A-06 | Actions are edited in place (with `lastEditedBy`, `version`) and voided instead of deleted | Meets "create and update" while keeping the evidence behind a resolution; no revision table (X-08) |
| A-07 | Edit/void is limited to performer, current Ticket Owner, or Administrator; completing a follow-up is open to all staff | Accountability for what a record says, without blocking whoever actually did the follow-up work |
| A-08 | Action writes require an owned Ticket in `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, or `REOPENED` | Work has an owner (Lab 3 BR-30), and the record that justified resolution must not change while resolved; reopening is the explicit path back |
| A-09 | Resolution gate = owner + ≥ 1 non-voided action + 0 outstanding follow-ups; `CANCELLED` is not gated | Matches "IT Staff must review the work and formally update". Cancelling a duplicate must not require fake work |
| A-10 | Optimistic concurrency via integer `version`; `expectedVersion` required on Ticket workflow writes and Action edits | Explicit, cheap, testable; the handout requires detecting stale overwrites. Making it required (not optional) means no client can opt out of the protection |
| A-11 | Idempotent create via `clientRequestId` UUID returning the original on replay | Handles both double-click and network retry; a content-based 60-second window (Lab 2 BR-19) would wrongly block two genuinely identical actions such as "Rebooted router" |
| A-12 | Dashboard home: Requester `/dashboard`, staff and Administrator `/staff/dashboard` | The handout calls the dashboard the "operational starting point"; one route per guard prefix keeps Lab 3 A-16 |
| A-13 | `publicActivityAt` drives Requester "recently updated"; `updatedAt` drives staff | Prevents Internal Note timing leaking to Requesters (§7.4 decision 2) |
| A-14 | `newToday` and the account inactive/must-change counts link to an ordered or unfiltered list rather than adding new filters | "Where practical": adding a date filter to the Queue and two filters to User Management for one card each is scope the request does not need. The definition text on the card states exactly what is counted |
| A-15 | Recent windows are rolling 7 days; "today" is the Bangkok calendar day | Rolling windows have no midnight edge for users; "today" needs a calendar day and Bangkok is the only operating time zone (Lab 2) |
| A-16 | List caps: Requester 5 + 5, staff recently updated 8, my recent actions 5 | Dashboards must be concise; the full lists are one click away |
| A-17 | Recording an action never changes status automatically | Lab 3 allowed exactly one automatic transition (claim); a second hidden one would make status changes harder to explain and audit (X-11) |
| A-18 | `resolvedAt` backfill uses `updatedAt` for legacy `RESOLVED`/`CLOSED` Tickets | No earlier resolution timestamp exists; documented as approximate and only affects the 7-day list for legacy rows |
| A-19 | Requester dashboard is Requester-only; staff do not get a personal "my requests" dashboard | Staff cannot create Tickets (Lab 3 matrix), so the dashboard would always be empty for them |
| A-20 | The handout's grading words "assign / complete / cancel / inactive-assignee" for Actions Taken map to: Ticket Owner assignment with inactive-assignee rejection (Lab 3, same screen), follow-up completion, and void | Keeps the stakeholder's field list authoritative while giving every graded behaviour a defined, testable meaning |
| A-21 | Dashboard counts and lists come from one request per dashboard, executed as one `prisma.$transaction` of independent queries | One loading state, one failure state, a consistent snapshot, and a single performance budget (tests.md PERF-01) |

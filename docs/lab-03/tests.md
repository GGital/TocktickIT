# Lab 3 Test Plan and Results

Project: TokTickIT — IT Service Desk
Sprint: Lab 3 — Authentication, Roles, IT Staff Ticketing, and Administrator User Management
Status: Planned before implementation. The **Final** column is `Pending` until the test exists and runs; it is
updated to `Pass` only from real output on `main`.
Companion documents: [specification.md](specification.md), [api-spec.md](api-spec.md), [ui-spec.md](ui-spec.md)

This plan is written before or alongside implementation and is not reconstructed afterwards from whatever the
coding agent produced. Every Acceptance Criterion in `specification.md` §9 maps to at least one row here, and
§3.1 is the closure proof.

---

## 1. Test Strategy

### 1.1 Approach

Spec DD first, then Test DD, then TDD. Each Lab 3 Issue carries the rows from §2 it must make pass; a Pull
Request that adds behaviour without its planned test is not reviewable.

The governing rule for this sprint is the stakeholder's own: **hiding a button is not authorization**. Every
protected operation therefore has an **API-level** test that calls the endpoint directly with the wrong role,
the wrong owner, or no session at all. A UI test asserting that a control is absent is recorded as feedback
coverage, never as the proof that the operation is protected — §2.2 exists precisely so that the `403` and
`404` behaviour cannot be satisfied by a hidden button.

### 1.2 Levels and tooling

| Level | Tooling | Location |
|---|---|---|
| Unit | Vitest | `server/tests/lab-03/unit/`, `client/tests/lab-03/unit/` |
| API / integration | Vitest + Supertest against a real PostgreSQL test database | `server/tests/lab-03/` |
| Security / authorization | Vitest + Supertest, one dedicated file | `server/tests/lab-03/authorization.api.test.ts` |
| Migration / regression | Vitest + Supertest against a database seeded with Lab 2 data | `server/tests/lab-03/migration.api.test.ts` |
| UI component | Vitest + Testing Library + jsdom | `client/tests/lab-03/` |
| UI style | Vitest + Testing Library, computed-style assertions | `client/tests/lab-03/ZenGreenLab3Style.test.tsx` |
| Responsive / visual | Playwright at 1280×800, 820×1180, 375×812 | `e2e/lab-03/responsive.spec.ts`, `screenshots.spec.ts` |
| E2E | Playwright against the running stack | `e2e/lab-03/` |

### 1.3 Test data

- API and E2E runs start from the idempotent seed (`specification.md` §7.5): four active Requesters, one
  inactive Requester, three active IT Staff, one inactive IT Staff, one active Administrator, and Tickets
  spread across all eight statuses, both assigned and unassigned, including one Requester-flagged Ticket.
- E2E sign-in accounts are seeded with `mustChangePassword = false`, and **one** dedicated account is seeded
  with `true` so the mandatory-change path has a subject without every other scenario paying a password-change
  detour (A-19). E2E-03 is the only test that uses it.
- The migration file runs against a database first populated with Lab 2 Tickets and Attachments, then migrated,
  so BR-55 is proven against real prior data rather than an empty schema.
- No real personal password and no production secret appears in a fixture (BR-12). Test passwords are literal
  strings clearly marked as fixtures.

### 1.4 Failure simulation

- `401` and `403` are produced by calling endpoints with no cookie, with a wrong-role session, and with a
  password-change-outstanding session — not by mocking a guard.
- Session expiry is produced by writing an `expiresAt` in the past, not by waiting.
- The login throttle is driven by six real requests inside the window.
- Backend-down states are produced by intercepting `fetch` in component tests and by stopping the API in E2E.
- Concurrency for BR-52 is exercised by two overlapping deactivation requests against the last two active
  Administrators.

### 1.5 Definition of a passing suite

Every planned row implemented and green; no test skipped, disabled, marked `.only`, or commented out; no test
that asserts nothing; every Acceptance Criterion present in §3.1 with at least one covering test; and the
commands in §5 run clean from a clean clone on `main`.

---

## 2. Planned Tests

Legend for **Final**: `Pending` = planned, not yet implemented. Updated to `Pass` / `Fail` from real output.

### 2.1 Unit tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-09, AC-09 | Hash encoding for a known password | Returns `scrypt$32768$8$1$<salt>$<hash>`; the plaintext appears nowhere in the string | `server/tests/lab-03/unit/password.unit.test.ts` | Pending |
| UNIT-02 | Unit | BR-10 | Verify the correct password against its hash | `true` | `server/tests/lab-03/unit/password.unit.test.ts` | Pending |
| UNIT-03 | Unit | BR-10 | Verify a wrong password, and a hash with tampered parameters | `false` in both cases; comparison uses `timingSafeEqual`, never `===` | `server/tests/lab-03/unit/password.unit.test.ts` | Pending |
| UNIT-04 | Unit | BR-09 | Hash the same password twice | Two different strings — a per-user random salt is applied | `server/tests/lab-03/unit/password.unit.test.ts` | Pending |
| UNIT-05 | Unit | BR-11, AC-12 | Password rule boundaries at 9, 10, 128, and 129 characters | 9 and 129 rejected; 10 and 128 accepted | `server/tests/lab-03/unit/password.unit.test.ts` | Pending |
| UNIT-06 | Unit | BR-11 | Whitespace-only, equal-to-current, and equal-to-email-local-part candidates | All three rejected with their own message | `server/tests/lab-03/unit/password.unit.test.ts` | Pending |
| UNIT-07 | Unit | BR-35, AC-42 | Every pair in the transition matrix | Each documented pair permitted; every undocumented pair refused | `server/tests/lab-03/unit/status-transition.unit.test.ts` | Pending |
| UNIT-08 | Unit | BR-36 | A status transitioning to itself | Refused — a no-op is a conflict, not a success | `server/tests/lab-03/unit/status-transition.unit.test.ts` | Pending |
| UNIT-09 | Unit | BR-30 | An unassigned Ticket in `NEW` moving to `IN_PROGRESS` | Refused; `OPEN` and `CANCELLED` permitted | `server/tests/lab-03/unit/status-transition.unit.test.ts` | Pending |
| UNIT-10 | Unit | BR-61, BR-62 | Queue query parser with no parameters | Defaults to `itPriority desc`, `createdAt asc`, `id asc`, page 1, page size 20 | `server/tests/lab-03/unit/queue-params.unit.test.ts` | Pending |
| UNIT-11 | Unit | BR-63, AC-34 | `pageSize=999`, `page=abc`, `sortBy=secret`, `status=NONSENSE`, `assignee=nobody` | Each rejected, naming the offending parameter; none coerced | `server/tests/lab-03/unit/queue-params.unit.test.ts` | Pending |
| UNIT-12 | Unit | BR-60 | Repeated `status` values and the `me` / `unassigned` sentinels | Statuses collect into an OR set; `me` resolves to the session user; `unassigned` becomes an `IS NULL` predicate | `server/tests/lab-03/unit/queue-params.unit.test.ts` | Pending |
| UNIT-13 | Unit | BR-49 | Email normaliser with `  Ada@KMUTT.ac.th  ` | Returns `ada@kmutt.ac.th`; comparison is therefore case-insensitive | `server/tests/lab-03/unit/user-input.unit.test.ts` | Pending |
| UNIT-14 | Unit | BR-44, AC-49 | Client message validator at 0, 1, 2000, 2001 characters and whitespace-only | 0, 2001, and whitespace-only rejected; 1 and 2000 accepted | `client/tests/lab-03/unit/messageValidation.unit.test.ts` | Pending |

### 2.2 API tests — authentication and session

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-01 | Valid login by an active user | `200`; `Set-Cookie` is `HttpOnly` and `SameSite=Lax`; body carries id, name, email, role, `mustChangePassword` and **no** hash or session id | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-02 | API | AC-02, BR-01 | Login with a wrong password | `401` `INVALID_CREDENTIALS`; no session row created | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-03 | API | AC-02, BR-01 | Login with an unknown email address | `401` with a body **byte-identical** to API-02 | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-04 | API | AC-02, BR-01 | Login by the seeded inactive account with its correct password | `401` with a body byte-identical to API-02 and API-03 | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-05 | API | BR-01 | Login with a missing email or missing password | `400` `VALIDATION_FAILED`; `fields` names each missing field | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-06 | API | BR-49 | Login using the account's email in mixed case | `200` — the address is normalised before lookup | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-07 | API | AC-08, BR-08 | Six failed logins for one email and client inside the window | The sixth returns `429` `TOO_MANY_ATTEMPTS`; no account is marked locked | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-08 | API | BR-08 | A successful login after four failures | Succeeds and clears the counter; a later failure starts from one | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-09 | API | AC-03 | `GET /api/auth/me` with a valid session | `200` with the `AuthenticatedUser` shape and nothing else | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-10 | API | AC-04 | `GET /api/auth/me` with no cookie | `401` `UNAUTHENTICATED` | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-11 | API | AC-04 | A malformed and an unknown session identifier | `401` `UNAUTHENTICATED` in both cases | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-12 | API | AC-05, BR-05 | Logout, then replay the same cookie on a protected route | Logout `204`; the replay is `401` `UNAUTHENTICATED`; the row is gone | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-13 | API | AC-07, BR-04 | A session whose `expiresAt` is in the past | `401` `UNAUTHENTICATED`; the expired row is deleted | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-14 | API | AC-13 | A valid password change | `200` with `mustChangePassword: false`; the old password no longer authenticates and the new one does | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-15 | API | AC-12, BR-11 | New password of 9 characters, a mismatched confirmation, and a new password equal to the current one | `400` `VALIDATION_FAILED` each time with the offending field named; the password is unchanged | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-16 | API | BR-11 | Password change with a wrong current password | `400` on `currentPassword`, not `401` — the session is valid | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-17 | API | AC-14, BR-06 | Two sessions for one user; password changed on the first | The second session's next protected request is `401`; the first still works | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-18 | API | AC-09, BR-12 | The stored row and the login response for a known password | `passwordHash` starts `scrypt$`, never equals the plaintext; no response body or captured log line contains a hash or a session id | `server/tests/lab-03/auth.api.test.ts` | Pending |

### 2.3 API tests — authorization (the "hiding a button is not authorization" suite)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-19 | API | AC-17, AC-19 | Requester session calls `GET /api/staff/tickets` | `403` `FORBIDDEN` — not `404`; body carries no Ticket data and no count | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-20 | API | AC-19 | Requester session calls `GET /api/staff/tickets/:id` for their **own** Ticket | `403` — the route is forbidden to the role regardless of ownership | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-21 | API | AC-40, BR-32, BR-34 | Requester session calls the assignment, priority, and status endpoints | `403` on all three; the Ticket row is byte-identical afterwards | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-22 | API | AC-16, BR-24 | Requester session calls `GET …/internal-notes` on a Ticket holding three notes | `403`; **no note body, no author, and no count** anywhere in the response | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-23 | API | AC-16 | Requester session posts an Internal Note | `403`; no `TicketMessage` row is created | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-24 | API | AC-17 | Requester session calls every `/api/admin/users` route | `403` on each; no user data returned | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-25 | API | AC-18 | IT Staff session calls every `/api/admin/users` route | `403` on each; no user data returned | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-26 | API | BR-25, matrix | IT Staff and Administrator sessions call `POST /api/tickets` | `403` — creating a Ticket is a Requester operation | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-27 | API | AC-20, BR-19 | Requester B requests Requester A's Ticket through `GET /api/tickets/:id` | `404`, with a body identical to the response for an id that does not exist | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-28 | API | A-01, BR-25 | Administrator session calls queue, staff detail, assignment, priority, status, and internal notes | `200`/`201` on all — the documented superset | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-29 | API | AC-11, BR-15 | A session whose user has `mustChangePassword: true` calls the queue, a Ticket route, and an admin route | `403` `PASSWORD_CHANGE_REQUIRED` on each; nothing is performed | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-30 | API | AC-11, BR-15 | The same session calls `/api/auth/me`, `/api/auth/change-password`, and `/api/auth/logout` | All three reachable — the gate leaves exactly one way forward and one way out | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-31 | API | AC-04 | Every protected route called with no cookie, enumerated from `api-spec.md` §3 | `401` `UNAUTHENTICATED` on every one; the list is asserted to be complete | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-32 | API | BR-24 | Every `403` body produced above | None contains a Ticket, a note, a user record, a count, or a resource identifier | `server/tests/lab-03/authorization.api.test.ts` | Pending |

### 2.4 API tests — migration and Lab 2 regression

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-33 | API | AC-61, BR-55 | The three migrations applied to a database holding Lab 2 Tickets and Attachments | Every Ticket, Attachment, Category, and Related System row survives with its original id and its original `requesterId` | `server/tests/lab-03/migration.api.test.ts` | Pending |
| API-34 | API | AC-62, BR-56 | A migrated Requester row | Role `REQUESTER`, non-null `passwordHash`, `mustChangePassword: true`, original `isActive` preserved | `server/tests/lab-03/migration.api.test.ts` | Pending |
| API-35 | API | AC-63 | A migrated Ticket row | `itPriority` equals `requestedPriority`; `status` unchanged; `assigneeId` null | `server/tests/lab-03/migration.api.test.ts` | Pending |
| API-36 | API | AC-26, BR-57 | `GET /api/requesters` | The route does not exist; the API answers its standard unknown-route `404` | `server/tests/lab-03/migration.api.test.ts` | Pending |
| API-37 | API | AC-27, BR-18 | A request carrying `X-Requester-Id` naming another user | The header is ignored; the session identity is used; no error is raised for sending it | `server/tests/lab-03/migration.api.test.ts` | Pending |
| API-38 | API | AC-22, BR-18 | `POST /api/tickets` whose body contains another `requesterId` | The created Ticket belongs to the session user | `server/tests/lab-03/migration.api.test.ts` | Pending |
| API-39 | API | AC-23 | `GET /api/tickets` with Lab 2 search, filter, sort, and pagination parameters | Only the session user's Tickets; every Lab 2 query behaviour and `meta` shape unchanged | `server/tests/lab-03/migration.api.test.ts` | Pending |
| API-40 | API | AC-24 | Creating a Ticket as an authenticated Requester | Ticket Number matches `TKT-YYYY-NNNNNN`, status `NEW`, Ticket Date server-set, `itPriority` copied | `server/tests/lab-03/migration.api.test.ts` | Pending |
| API-41 | API | AC-25 | Upload, list, download, and soft-remove an attachment under authentication | Lab 2 rules intact, including `409` on the sixth active file, `413`, `415`, and `410` on a removed download | `server/tests/lab-03/migration.api.test.ts` | Pending |
| API-42 | API | BR-56, DoD | The seed run twice | No duplicates and no identifier churn; the documented role mix exists, including the inactive Requester and the inactive IT Staff account | `server/tests/lab-03/migration.api.test.ts` | Pending |

### 2.5 API tests — IT Staff Ticket Queue

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-43 | API | AC-28 | An IT Staff session loads the queue | Tickets belonging to several different Requesters are returned | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-44 | API | AC-29, BR-61 | The default ordering, requested twice | `itPriority` descending, then `createdAt` ascending, then `id` ascending; the two responses are identical | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-45 | API | AC-30 | `search` by a full Ticket Number | Exactly that Ticket | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-46 | API | AC-30, BR-59 | `search` by a Summary fragment in the opposite letter case | The matching Tickets are returned | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-47 | API | AC-30, BR-59 | `search` by a Requester's name fragment | That Requester's Tickets are returned | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-48 | API | AC-31, BR-60 | `status=NEW&status=OPEN&itPriority=HIGH` | Tickets whose status is `NEW` **or** `OPEN` **and** whose IT Priority is `HIGH`; nothing else | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-49 | API | AC-32 | `assignee=unassigned` | Only Tickets whose `assigneeId` is null | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-50 | API | AC-32 | `assignee=me` | Only Tickets owned by the calling session user | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-51 | API | BR-46, FR-20 | `flaggedResolved=true` | Only Tickets whose `requesterResolvedFlaggedAt` is set | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-52 | API | AC-33, BR-62 | 25 Tickets at the default page size | 20 rows, `totalItems: 25`, `totalPages: 2`; page 2 returns the remaining 5 | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-53 | API | AC-34, BR-63 | `pageSize=999`, `page=abc`, `sortBy=secret`, `status=NONSENSE`, `assignee=nobody` | `400` `INVALID_QUERY_PARAMETER` naming the parameter in each case | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-54 | API | AC-35, BR-62 | A page number past the last page | `200` with `data: []` and correct metadata | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |

### 2.6 API tests — ownership, IT Priority, and status

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-55 | API | AC-28, BR-21 | An IT Staff session opens a Ticket belonging to any Requester | `200` with the detail shape including both priorities, owner, and the resolution flag | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-56 | API | AC-36, BR-29 | Claiming an unassigned Ticket in `NEW` | `200`; the caller is the owner **and** the status is `OPEN` in the same response | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-57 | API | AC-37, BR-28 | Reassigning an owned Ticket to a third active staff user | `200`; the new owner is stored | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-58 | API | BR-28 | Unassigning an owned Ticket | `200`; `assignee` is null and the status is unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-59 | API | AC-38, BR-27 | Assigning a Requester, an inactive staff user, and an unknown id | `409` `INVALID_ASSIGNEE` each time; the owner is unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-60 | API | api-spec §3.11 | An assignment body with the `assigneeId` key absent | `400` `VALIDATION_FAILED` — unassigning is never expressed by omission | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-61 | API | AC-39, BR-31 | Setting IT Priority to `URGENT` | `200`; `itPriority` changes, `requestedPriority` is untouched | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-62 | API | BR-31 | A priority body containing `requestedPriority` | `400` `VALIDATION_FAILED` — an immutable field fails loudly rather than being ignored | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-63 | API | AC-41, BR-35 | `OPEN` → `IN_PROGRESS` on an assigned Ticket | `200`; the status is stored and returned | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-64 | API | AC-42, BR-36 | `NEW` → `CLOSED` | `409` `INVALID_STATUS_TRANSITION` naming both statuses; the Ticket is unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-65 | API | BR-36 | Setting a Ticket to the status it already holds | `409` `INVALID_STATUS_TRANSITION` | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-66 | API | AC-43, BR-46 | `RESOLVED` → `REOPENED` on a Requester-flagged Ticket | `200`; the status changes and `requesterResolvedFlaggedAt` is cleared | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-67 | API | BR-30 | An unassigned Ticket in `NEW` moved to `IN_PROGRESS` | `409` `INVALID_STATUS_TRANSITION`; `OPEN` and `CANCELLED` still succeed | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |

### 2.7 API tests — Public Comments, Internal Notes, and the resolution flag

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-68 | API | AC-45, BR-43 | The owning Requester posts a Public Comment | `201`; author is the session user and `createdAt` comes from the backend, not the body | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-69 | API | AC-46 | IT Staff posts a Public Comment, then the Requester reads comments | The Requester's response contains the staff comment | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-70 | API | AC-47, BR-40 | A Ticket holding two Public Comments and three Internal Notes, read by its Requester | Exactly two entries, both `PUBLIC`; **no internal body, author, id, or count** appears anywhere in the payload | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-71 | API | AC-48 | The same Ticket's Internal Notes read by IT Staff | All three notes with their authors and timestamps | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-72 | API | AC-49, BR-44 | Empty, whitespace-only, and 2001-character bodies posted to both the comment and the note route | `400` `VALIDATION_FAILED` in all six cases; nothing stored | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-73 | API | BR-43 | A comment body containing `author` or `createdAt` | `400` `VALIDATION_FAILED` — a client cannot mis-attribute a message | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-74 | API | BR-19 | Requester B reads comments on Requester A's Ticket | `404` `TICKET_NOT_FOUND`, identical to an unknown id | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-75 | API | AC-50, BR-46 | The owning Requester flags "Problem Appears Resolved" | `200`; the flag and its timestamp are set, one `isSystem` Public Comment is appended, and the status is **unchanged** | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-76 | API | AC-50 | The same flag sent a second time | `409` `ALREADY_FLAGGED`; no second comment is written | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-77 | API | BR-46, matrix | IT Staff and an Administrator send the appears-resolved flag | `403` `FORBIDDEN` — staff resolve through the status endpoint | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-78 | API | BR-42 | `PATCH` and `DELETE` attempted against a message id | No such route exists; nothing is mutated — Comments and Notes are append-only | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |

### 2.8 API tests — Administrator user management

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-79 | API | AC-51 | An Administrator loads the user list | Active and inactive users, each with id, name, email, role, status; **no** `passwordHash` on any row | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-80 | API | AC-52 | `search` by a name fragment in the opposite letter case | Only matching users | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-81 | API | AC-52 | `search` by an email fragment | Only matching users | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-82 | API | AC-52 | `search` combined with `role=IT_STAFF` | Only users matching both | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-83 | API | BR-50 | `role=SUPERUSER` | `400` `INVALID_QUERY_PARAMETER` naming `role` | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-84 | API | AC-53, BR-47 | Creating a user with one role and an initial password | `201`; the role is stored, `isActive` is as chosen, `mustChangePassword` is `true`, and the initial password is echoed once | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-85 | API | AC-53, AC-60 | The created user logs in with that initial password | `200`, then every other endpoint answers `403` `PASSWORD_CHANGE_REQUIRED` until the change | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-86 | API | AC-54, BR-49 | Creating a user with an email already used in different letter case | `409` `EMAIL_ALREADY_EXISTS`; no row is written | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-87 | API | AC-55 | Creating a user with an unknown role, an empty name, and a 9-character password | `400` `VALIDATION_FAILED` naming each offending field | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-88 | API | AC-56, BR-48 | Editing name, email, role, and activation state together | `200`; all four change and no other column does | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-89 | API | BR-48 | An edit body containing `passwordHash`, `mustChangePassword`, or `department` | `400` `VALIDATION_FAILED` — rejected, not silently ignored | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-90 | API | AC-54 | Editing a user's email to one another account already holds | `409` `EMAIL_ALREADY_EXISTS`; nothing written | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-91 | API | AC-57, BR-07 | Deactivating a user who holds an active session | That user's next protected request is `401` `UNAUTHENTICATED` | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-92 | API | AC-57, BR-07 | Changing a user's role while they hold a session | Their sessions are deleted; the next request is `401` | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-93 | API | AC-58, BR-51 | An Administrator deactivating themselves, and changing their own role | `409` `SELF_DEACTIVATION_FORBIDDEN` both times; nothing changes; editing their own name still succeeds | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-94 | API | AC-59, BR-52 | Deactivating, and separately demoting, the only active Administrator — including two overlapping requests against the last two | `409` `LAST_ACTIVE_ADMINISTRATOR`; at least one active Administrator always remains | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-95 | API | AC-60, BR-54 | Setting a new initial password for a user holding a session | `200`; the hash changes, `mustChangePassword` becomes `true`, their sessions are deleted, the password is echoed once, and the next login is gated | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-96 | API | BR-53 | `DELETE /api/admin/users/:id` | No such route exists; the user row survives | `server/tests/lab-03/users-admin.api.test.ts` | Pending |

### 2.9 UI component tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI | FR-01 | The Login screen renders | Labelled email and password fields and a submit button, inside a real `<form>` | `client/tests/lab-03/Login.test.tsx` | Pending |
| UI-02 | UI | FR-01 | Submit with an empty email and password | Field-level messages; **no** request is issued | `client/tests/lab-03/Login.test.tsx` | Pending |
| UI-03 | UI | AC-02 | The API answers `401 INVALID_CREDENTIALS` | One error callout with the single documented message; the email value is preserved and the password field is cleared and refocused | `client/tests/lab-03/Login.test.tsx` | Pending |
| UI-04 | UI | FR-43 | A submission in flight | The button shows the busy state and is disabled; a second click issues no second request | `client/tests/lab-03/Login.test.tsx` | Pending |
| UI-05 | UI | AC-67, ui-spec §2.1 | The reveal toggle | Switches the input `type`, updates its accessible name between "Show password" and "Hide password", and exposes `aria-pressed` | `client/tests/lab-03/Login.test.tsx` | Pending |
| UI-06 | UI | ui-spec §5.2 | The Change Password screen before any typing | The password rules are already visible as helper text | `client/tests/lab-03/ChangePassword.test.tsx` | Pending |
| UI-07 | UI | AC-12 | A mismatched confirmation | Message below Confirm; focus moves there; no request is issued | `client/tests/lab-03/ChangePassword.test.tsx` | Pending |
| UI-08 | UI | AC-12 | A new password of 9 characters and one equal to the current password | A boundary message in each case; accepted at 10 characters | `client/tests/lab-03/ChangePassword.test.tsx` | Pending |
| UI-09 | UI | AC-14 | A successful change | Navigates to the role's home route and states that other sessions were signed out | `client/tests/lab-03/ChangePassword.test.tsx` | Pending |
| UI-10 | UI | AC-10, BR-17 | Mandatory mode | No Cancel and no Back control exists; only Save and Log out; the shell is absent | `client/tests/lab-03/ChangePassword.test.tsx` | Pending |
| UI-11 | UI | AC-15 | A Requester session in the shell | My Tickets and Create Ticket only; no Queue and no User Management link in the DOM | `client/tests/lab-03/RoleNavigation.test.tsx` | Pending |
| UI-12 | UI | AC-15 | An IT Staff session | Ticket Queue present; User Management absent | `client/tests/lab-03/RoleNavigation.test.tsx` | Pending |
| UI-13 | UI | AC-15 | An Administrator session | Ticket Queue and User Management present | `client/tests/lab-03/RoleNavigation.test.tsx` | Pending |
| UI-14 | UI | FR-11, ui-spec §3 | The shell identity cluster | Shows the authenticated name and the role badge; Logout is present and reachable at the mobile width | `client/tests/lab-03/RoleNavigation.test.tsx` | Pending |
| UI-15 | UI | AC-47 | Requester Ticket Detail for a Ticket holding Internal Notes | Public Comments render; **no** Internal Notes panel, placeholder, or hidden-message count exists in the DOM | `client/tests/lab-03/RequesterTicketDetailLab3.test.tsx` | Pending |
| UI-16 | UI | BR-44, BR-66 | The comment composer | Post is disabled while empty or whitespace-only; the counter appears past 1800; the entered text survives a failed post | `client/tests/lab-03/RequesterTicketDetailLab3.test.tsx` | Pending |
| UI-17 | UI | AC-50 | "Problem Appears Resolved" | Opens a confirmation; after flagging, the button is replaced by the badge and date and cannot be triggered again | `client/tests/lab-03/RequesterTicketDetailLab3.test.tsx` | Pending |
| UI-18 | UI | ui-spec §7.1 | The Queue table | Exactly the documented columns, with status, both priorities, and owner rendered as documented | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pending |
| UI-19 | UI | AC-35 | Zero Tickets versus a filter that matches nothing | Two different messages and two different primary actions; the empty state offers no Clear filters | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pending |
| UI-20 | UI | BR-62, ui-spec §7.4 | Changing the search term, a filter, or the page size while on page 2 | The request is re-issued with `page=1` | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pending |
| UI-21 | UI | AC-17, AC-21 | The API answers `403` | The shared forbidden state renders, naming the role but not the screen's contents | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pending |
| UI-22 | UI | AC-67, ui-spec §11 | A sortable column header | It is a button, toggles ascending and descending, and exposes `aria-sort` | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pending |
| UI-23 | UI | FR-29 | Staff Ticket Detail field rendering | Ticket Number, date, requester, summary, description, category, related system, and Requested Priority have no editable control; the operations panel does | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pending |
| UI-24 | UI | BR-35 | The status select for a Ticket in `OPEN` | Lists only `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED` | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pending |
| UI-25 | UI | AC-44, BR-37 | Saving `RESOLVED`, `CLOSED`, or `CANCELLED` | A confirmation dialog naming the Ticket and the target status; cancelling issues no request and leaves the select on the current status | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pending |
| UI-26 | UI | AC-66, FR-46 | The Internal Notes panel | Carries its landmark name, the "not visible to the Requester" heading suffix, and the permanent composer label | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pending |
| UI-27 | UI | ui-spec §8.2 | The assignment controls | Claim is hidden when the caller already owns the Ticket; Unassign is hidden when it is unassigned; the select offers only active staff | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pending |
| UI-28 | UI | AC-51 | The user list | Name, Email, Role, Status, and Edit render; **no** Delete control exists anywhere on the screen | `client/tests/lab-03/UserManagement.test.tsx` | Pending |
| UI-29 | UI | BR-22 | The create dialog's role control | A single-choice control with three options; no multi-select control is present | `client/tests/lab-03/UserManagement.test.tsx` | Pending |
| UI-30 | UI | AC-54 | The API answers `409 EMAIL_ALREADY_EXISTS` | Message below the Email field; every other entered value is preserved | `client/tests/lab-03/UserManagement.test.tsx` | Pending |
| UI-31 | UI | AC-58 | The API answers `409 SELF_DEACTIVATION_FORBIDDEN` | Warning callout in the dialog; the controls reset to their stored values | `client/tests/lab-03/UserManagement.test.tsx` | Pending |
| UI-32 | UI | AC-59 | The API answers `409 LAST_ACTIVE_ADMINISTRATOR` | Warning callout naming the rule; the controls reset | `client/tests/lab-03/UserManagement.test.tsx` | Pending |
| UI-33 | UI | BR-13 | A created user, and a new initial password | The one-time panel shows the password with a copy action; dismissing it and reopening the user offers no way to see it again | `client/tests/lab-03/UserManagement.test.tsx` | Pending |
| UI-34 | UI | X-12 | The user list at 40 seeded users | No pagination control, no page-size control, and no second sort control is rendered | `client/tests/lab-03/UserManagement.test.tsx` | Pending |
| UI-35 | UI | AC-21, ui-spec §2.5 | The forbidden state component | One heading, one action back to the role's home route, and no resource identifier, title, or count | `client/tests/lab-03/Accessibility.test.tsx` | Pending |
| UI-36 | UI | AC-67 | Announcements and links | The login error callout has `role="alert"`; Queue rows expose the Ticket Number as a real link, not a clickable `div` | `client/tests/lab-03/Accessibility.test.tsx` | Pending |

### 2.10 UI style tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| STYLE-01 | UI style | AC-65 | Computed colours across the Lab 3 screens | Every colour resolves to a Zen Green custom property; no literal hex value introduced in Lab 3 | `client/tests/lab-03/ZenGreenLab3Style.test.tsx` | Pending |
| STYLE-02 | UI style | AC-68, ui-spec §1.2 | All eight status badges | Each renders its documented background, text colour, and label | `client/tests/lab-03/ZenGreenLab3Style.test.tsx` | Pending |
| STYLE-03 | UI style | AC-68 | Both priority badge families | Every Requested badge is prefixed "Requested:" and every IT badge "IT:", so the two are separable without colour | `client/tests/lab-03/ZenGreenLab3Style.test.tsx` | Pending |
| STYLE-04 | UI style | AC-68 | The three role badges | Each renders its documented treatment and its role name as text | `client/tests/lab-03/ZenGreenLab3Style.test.tsx` | Pending |
| STYLE-05 | UI style | AC-66 | The Internal Notes panel | Its border and heading resolve to `--zen-warning`, distinct from the Public panel's border | `client/tests/lab-03/ZenGreenLab3Style.test.tsx` | Pending |
| STYLE-06 | UI style | AC-65 | Staff Ticket Detail fields | Read-only fields use `--zen-readonly-bg`; editable operations controls use `--zen-field-bg` | `client/tests/lab-03/ZenGreenLab3Style.test.tsx` | Pending |
| STYLE-07 | UI style | AC-67 | Focus styling on the new controls | A visible focus indicator on the password fields, reveal toggles, Queue headers, and dialog actions; no `outline: none` without a replacement | `client/tests/lab-03/ZenGreenLab3Style.test.tsx` | Pending |
| STYLE-08 | UI style | AC-68 | Every badge family together | Each badge's accessible text conveys its meaning with colour removed | `client/tests/lab-03/ZenGreenLab3Style.test.tsx` | Pending |

### 2.11 Responsive and visual tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| RESP-01 | Responsive | AC-64, FR-44 | Login, Change Password, Queue, Staff Ticket Detail, and User Management at 1280×800, 820×1180, 375×812 | `document.scrollWidth <= clientWidth` at every viewport — no horizontal page scroll | `e2e/lab-03/responsive.spec.ts` | Pending |
| RESP-02 | Responsive | ui-spec §7.3 | The Queue below 768 px | Renders as cards; the filter disclosure shows the active-filter count; the table is absent | `e2e/lab-03/responsive.spec.ts` | Pending |
| RESP-03 | Responsive | ui-spec §9.1 | User Management below 768 px | Renders as cards with a full-width Edit action per user | `e2e/lab-03/responsive.spec.ts` | Pending |
| RESP-04 | Responsive | ui-spec §8.1 | Staff Ticket Detail below 768 px | The operations panel appears above the descriptive fields; Claim is reachable without scrolling past the description | `e2e/lab-03/responsive.spec.ts` | Pending |
| RESP-05 | Responsive | ui-spec §10 | Every dialog below 768 px | Full-screen with its actions reachable; no clipped label and no overlapping message | `e2e/lab-03/responsive.spec.ts` | Pending |
| RESP-06 | Visual | DoD, ui-spec §14 | Screenshot capture | Every state named in `ui-spec.md` §14 exists at all three viewports under `artifacts/lab-03/screenshots/` | `e2e/lab-03/screenshots.spec.ts` | Pending |

### 2.12 E2E tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-01, AC-05, AC-06 | Sign in, work, sign out, then navigate directly to an application URL | The role's home screen opens on sign-in; after logout the Login screen is shown and no previous data is visible | `e2e/lab-03/authentication.spec.ts` | Pending |
| E2E-02 | E2E | AC-02 | A wrong password, an unknown address, and the inactive seeded account | All three show the identical safe message and busy-then-failure feedback; nothing distinguishes them on screen | `e2e/lab-03/authentication.spec.ts` | Pending |
| E2E-03 | E2E | AC-10, AC-13 | Initial-password login and change | The application opens only after a valid new password is saved; a direct URL before that returns to Change Password; the old password then fails | `e2e/lab-03/authentication.spec.ts` | Pending |
| E2E-04 | E2E | AC-28 – AC-35 | Queue search, filters, sort, and paging, then open a Ticket | Realistic data narrows correctly, the ordering is as documented, paging works, and the row opens Ticket Detail | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pending |
| E2E-05 | E2E | AC-36, AC-39, AC-41, AC-44 | Claim a `NEW` Ticket, set IT Priority, advance the status, resolve with confirmation | Status becomes `OPEN` on claim; both priorities stay visible and distinct; the resolve confirmation is required | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pending |
| E2E-06 | E2E | AC-46, AC-47 | Staff post a Public Comment and an Internal Note, then the Requester opens their Ticket | The Requester sees the comment and, in the rendered page and in the network responses, no trace of the note | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pending |
| E2E-07 | E2E | AC-50 | A Requester flags "Problem Appears Resolved", then staff open the Queue | The flag appears on the Queue row and on Ticket Detail; the status is unchanged; the Requester cannot flag twice | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pending |
| E2E-08 | E2E | AC-53, AC-60 | An Administrator creates a user, then that user signs in | The initial password is shown once; the new user is forced through Change Password and then reaches their role's home screen | `e2e/lab-03/user-administration.spec.ts` | Pending |
| E2E-09 | E2E | AC-54, AC-58, AC-59 | Duplicate email, self-deactivation, and last-active-Administrator attempts | Each is refused with its own message and nothing changes; the list is unaffected | `e2e/lab-03/user-administration.spec.ts` | Pending |
| E2E-10 | E2E | AC-21 | A Requester navigates directly to `/admin/users` and `/staff/tickets` | The forbidden state renders on both, and the underlying API calls answer `403` | `e2e/lab-03/user-administration.spec.ts` | Pending |

**Totals:** 14 unit · 96 API · 36 UI component · 8 UI style · 6 responsive/visual · 10 E2E =
**170 planned tests**.

---

## 3. Acceptance-Criterion Traceability

### 3.1 AC → tests

Every AC maps to at least one automated test. No AC is proven by a screenshot alone, and no authorization AC is
proven by a UI-only test.

| AC | Covered by |
|---|---|
| AC-01 | API-01, E2E-01 |
| AC-02 | API-02, API-03, API-04, UI-03, E2E-02 |
| AC-03 | API-09 |
| AC-04 | API-10, API-11, API-31 |
| AC-05 | API-12, E2E-01 |
| AC-06 | E2E-01 |
| AC-07 | API-13 |
| AC-08 | API-07 |
| AC-09 | UNIT-01, API-18 |
| AC-10 | API-29, UI-10, E2E-03 |
| AC-11 | API-29, API-30 |
| AC-12 | UNIT-05, UNIT-06, API-15, UI-07, UI-08 |
| AC-13 | API-14, E2E-03 |
| AC-14 | API-17, UI-09 |
| AC-15 | UI-11, UI-12, UI-13, UI-14 |
| AC-16 | API-22, API-23, API-32 |
| AC-17 | API-19, API-24, UI-21 |
| AC-18 | API-25 |
| AC-19 | API-19, API-20 |
| AC-20 | API-27 |
| AC-21 | UI-21, UI-35, E2E-10 |
| AC-22 | API-38 |
| AC-23 | API-39 |
| AC-24 | API-40 |
| AC-25 | API-41 |
| AC-26 | API-36 |
| AC-27 | API-37 |
| AC-28 | API-43, API-55 |
| AC-29 | API-44 |
| AC-30 | API-45, API-46, API-47 |
| AC-31 | API-48 |
| AC-32 | API-49, API-50 |
| AC-33 | API-52 |
| AC-34 | UNIT-11, API-53 |
| AC-35 | API-54, UI-19 |
| AC-36 | API-56, E2E-05 |
| AC-37 | API-57 |
| AC-38 | API-59 |
| AC-39 | API-61, E2E-05 |
| AC-40 | API-21 |
| AC-41 | API-63, E2E-05 |
| AC-42 | UNIT-07, UNIT-08, API-64 |
| AC-43 | API-66 |
| AC-44 | UI-25, E2E-05 |
| AC-45 | API-68 |
| AC-46 | API-69, E2E-06 |
| AC-47 | API-70, UI-15, E2E-06 |
| AC-48 | API-71 |
| AC-49 | UNIT-14, API-72 |
| AC-50 | API-75, API-76, UI-17, E2E-07 |
| AC-51 | API-79, UI-28 |
| AC-52 | API-80, API-81, API-82 |
| AC-53 | API-84, API-85, E2E-08 |
| AC-54 | API-86, API-90, UI-30, E2E-09 |
| AC-55 | API-87 |
| AC-56 | API-88 |
| AC-57 | API-91, API-92 |
| AC-58 | API-93, UI-31, E2E-09 |
| AC-59 | API-94, UI-32, E2E-09 |
| AC-60 | API-95, E2E-08 |
| AC-61 | API-33 |
| AC-62 | API-34 |
| AC-63 | API-35 |
| AC-64 | RESP-01 |
| AC-65 | STYLE-01, STYLE-06 |
| AC-66 | UI-26, STYLE-05 |
| AC-67 | UI-05, UI-36, STYLE-07 |
| AC-68 | STYLE-02, STYLE-03, STYLE-04, STYLE-08 |

### 3.2 Business rules with dedicated coverage

Rules whose failure would not be caught by the AC tests alone:

| BR | Covered by |
|---|---|
| BR-01 (indistinguishable login failure) | API-02, API-03, API-04 |
| BR-06 / BR-07 (session revocation on change, deactivation, role change, new initial password) | API-17, API-91, API-92, API-95 |
| BR-09 / BR-10 (scrypt, salting, timing-safe comparison) | UNIT-01 – UNIT-04 |
| BR-12 (no hash or session id ever returned or logged) | API-18, API-79 |
| BR-15 / BR-16 (the gate is middleware, not per-route) | API-29, API-30 |
| BR-18 (client-supplied identity ignored) | API-37, API-38 |
| BR-24 (a `403` leaks nothing, not even a count) | API-22, API-32, UI-15 |
| BR-27 (assignee eligibility) | API-59 |
| BR-30 (unassigned Tickets cannot start work) | UNIT-09, API-67 |
| BR-31 (Requested Priority immutable) | API-61, API-62 |
| BR-36 (self-transition is a conflict) | UNIT-08, API-65 |
| BR-40 (visibility is a query predicate, not a post-filter) | API-70, E2E-06 |
| BR-42 (append-only) | API-78 |
| BR-43 (author and timestamp are server-owned) | API-68, API-73 |
| BR-48 (only four fields editable) | API-89 |
| BR-49 (case-insensitive email uniqueness) | UNIT-13, API-06, API-86 |
| BR-52 (last active Administrator, including concurrently) | API-94 |
| BR-53 (no deletion path exists) | API-96, UI-28 |
| BR-55 – BR-57 (migration preserves data; the selector is gone) | API-33 – API-37 |
| BR-63 (invalid query parameters are never coerced) | UNIT-11, API-53 |

---

## 4. Responsive and Visual Checklist

### 4.1 Manual visual pass

Completed against the captured screenshots, not from memory. Key: ✅ verified · ⚠ verified with a deviation
(see below) · 🔍 not visible in a still image, verified by the named automated test.

| # | Check | Desktop | Tablet | Mobile |
|---|---|---|---|---|
| V-01 | Login and Change Password match the Lab 2 card treatment | | | |
| V-02 | The shell shows the authenticated name and role badge | | | |
| V-03 | Each role sees only its permitted destinations | | | |
| V-04 | Logout is reachable without opening a menu | | | |
| V-05 | Password rules are visible before typing | | | |
| V-06 | The login failure message is identical for wrong password and inactive account | | | |
| V-07 | The Queue's documented columns render without clipping | | | |
| V-08 | All eight status badges are legible | | | |
| V-09 | Requested and IT priority are separable by label alone | | | |
| V-10 | The Requester-resolution flag appears on the row and on detail | | | |
| V-11 | Staff Ticket Detail keeps read-only fields visually distinct | | | |
| V-12 | The Internal Notes panel is unmistakable, including in greyscale | | | |
| V-13 | Both composers show their permanent visibility label | | | |
| V-14 | The user list shows exactly four columns plus Edit, and no Delete | | | |
| V-15 | The one-time initial-password panel is clear about being shown once | | | |
| V-16 | No horizontal page scroll, clipped label, or overlapping message | | | |
| V-17 | Focus is visible on every new control | | | |
| V-18 | The forbidden state names no protected content | | | |

### 4.2 Deviations found during this pass

_To be completed during the visual inspection, and mirrored into `ui-spec.md` §13.1._

| # | Deviation | Verdict |
|---|---|---|
| | | |

### 4.3 Screenshot inventory

| Directory | States |
|---|---|
| `artifacts/lab-03/screenshots/authentication/` | `login-initial`, `login-invalid`, `login-inactive`, `login-submitting`, `change-password-mandatory`, `change-password-validation`, `shell-signed-in`, `logged-out` |
| `artifacts/lab-03/screenshots/staff-queue/` | `loading`, `loaded`, `filtered`, `no-results`, `empty`, `forbidden`, `failure`, `page-2` |
| `artifacts/lab-03/screenshots/staff-ticket-detail/` | `loaded`, `claim`, `priority`, `status-confirm`, `invalid-transition`, `public-comment`, `internal-note`, `forbidden` |
| `artifacts/lab-03/screenshots/user-management/` | `list`, `search`, `role-filter`, `create`, `created-password`, `edit`, `duplicate-email`, `self-deactivation`, `last-administrator`, `forbidden` |

Every state is captured at `desktop`, `tablet`, and `mobile`, using the Lab 2 naming convention
`<state>.<viewport>.png`.

---

## 5. Test Commands

Prerequisites: PostgreSQL running, `server/.env` present, migrations applied, and the seed run once.

Server unit, API, authorization, and migration tests:

```bash
cd server && npm test
```

Client unit, UI component, and UI style tests:

```bash
cd client && npm test
```

End-to-end and responsive tests:

```bash
npm run e2e
```

Screenshot capture only:

```bash
npm run e2e:screenshots
```

---

## 6. Final Results

_Recorded from real output on `main` after implementation. Every block below is pasted from a real run, not
summarised from memory._

### 6.1 Server (unit + API + authorization + migration)

```text
pending
```

### 6.2 Client (unit + UI component + UI style)

```text
pending
```

### 6.3 E2E, responsive, and screenshots

```text
pending
```

### 6.4 Summary

| Level | Planned | Implemented | Recorded Pass | Skipped |
|---|---|---|---|---|
| Unit | 14 | | | |
| API / integration | 96 | | | |
| UI component | 36 | | | |
| UI style | 8 | | | |
| Responsive / visual | 6 | | | |
| E2E | 10 | | | |
| **Total** | **170** | | | |

### 6.5 Capture notes

_To be completed: the date, the branch, the commit, and anything about the environment that a reader would need
in order to reproduce the run._

---

## 7. Known Limitations and Deferred Tests

| # | Limitation | Why | When it becomes relevant |
|---|---|---|---|
| L-01 | The login throttle is per process and resets on restart, so the throttle test is not meaningful against a multi-instance deployment | Account locking is out of scope, and a shared store would be infrastructure Lab 3 does not have (A-07) | The first time the API runs behind more than one process |
| L-02 | Session expiry is tested by writing a past `expiresAt`, not by elapsing real time | An eight-hour test is not runnable in CI | Only if the expiry mechanism changes from an absolute timestamp |
| L-03 | Password-hash cost parameters are not benchmarked | Lab-scale data on lab hardware; the parameters are recorded in each hash so they can be raised later | When real login latency is measurable |
| L-04 | No test proves resistance to a genuine timing attack; API-18 proves only that `timingSafeEqual` is used and that unknown accounts still perform a verification | Statistical timing analysis is not a unit test | If the product is ever exposed publicly |
| L-05 | CSRF is argued from `SameSite=Lax` plus same-origin hosting rather than proven by a cross-origin test | Playwright cannot serve a genuine attacker origin in this setup | If the client is ever hosted on a different origin from the API |
| L-06 | Concurrency for BR-52 is tested with two overlapping requests, which is suggestive rather than exhaustive | A full serialisation proof needs a load harness | If administration is ever performed by more than a handful of people |
| L-07 | Accessibility coverage is rule-based (roles, names, focus, `aria-sort`), not a full audit | No automated tool replaces a manual audit | Before any external release |
| L-08 | Actions Taken, SLA, escalation, and notification behaviour are untested | Explicitly out of scope (X-04, X-05) | Lab 4 |

# Lab 4 Test Plan and Results

Project: TokTickIT — IT Service Desk
Sprint: Lab 4 — Actions Taken, Ticket Resolution Workflow, Role Dashboards, and Final Regression
Status: Planned before implementation. Every **Final** value is `Pending` until set to `Pass` / `Fail` from real
output pasted in §6.
Companion documents: [specification.md](specification.md), [api-spec.md](api-spec.md), [ui-spec.md](ui-spec.md)

This plan is written before implementation and is not reconstructed afterwards from what the coding agent
produced. Every Acceptance Criterion in `specification.md` §9 maps to at least one row here; §3.1 is the closure
proof.

---

## 1. Test Strategy

### 1.1 Approach

Spec DD → Test DD → TDD. Each Lab 4 Issue carries the rows it must make pass; a Pull Request that adds behaviour
without its planned test is not reviewable.

Three rules govern this sprint:

1. **The backend is the authority.** The resolution gate, every role restriction, and every stale-update refusal
   is proven by a direct API call. A UI test that a control is hidden is feedback coverage only.
2. **Every dashboard number is checked against the database.** Each metric test computes the expected value with
   an independent Prisma query written in the test, not by calling the code under test, and checks that the
   drill-down list returns the same total.
3. **Regression is a suite, not a sample.** The complete Lab 1–3 automated suites run unchanged on the final
   `main`, except the requests BR-78 and BR-79 explicitly change, which are updated — never deleted.

### 1.2 Levels and tooling

| Level | Tooling | Location |
|---|---|---|
| Unit | Vitest | `server/tests/lab-04/unit/`, `client/tests/lab-04/unit/` |
| API / integration | Vitest + Supertest, real PostgreSQL test database | `server/tests/lab-04/` |
| Authorization | Vitest + Supertest, one dedicated file | `server/tests/lab-04/authorization.api.test.ts` |
| Workflow | Vitest + Supertest | `server/tests/lab-04/ticket-workflow.api.test.ts` |
| Migration / regression | Vitest + Supertest on a database holding Lab 3 data; plus the full Lab 2–3 suites | `server/tests/lab-04/migration.api.test.ts`, `server/tests/lab-02/`, `server/tests/lab-03/` |
| Performance smoke | Vitest, wall-clock timing against a bulk-seeded database | `server/tests/lab-04/performance.smoke.test.ts` |
| UI component | Vitest + Testing Library + jsdom | `client/tests/lab-04/` |
| UI style | Vitest + Testing Library, computed styles and stylesheet scan | `client/tests/lab-04/ZenGreenLab4Style.test.tsx` |
| Accessibility | Vitest + Testing Library (roles, names, focus) and Playwright keyboard runs | `client/tests/lab-04/Accessibility.test.tsx`, `e2e/lab-04/regression.spec.ts` |
| Responsive / visual | Playwright at 1280×800, 820×1180, 375×812 | `e2e/lab-04/responsive.spec.ts`, `e2e/lab-04/screenshots.spec.ts` |
| E2E | Playwright against the running stack | `e2e/lab-04/` |

### 1.3 Test data

- API and E2E runs start from the idempotent seed (`specification.md` §7.6): Tickets with zero, one, and four or
  more actions; an action by a non-owner; one outstanding, one completed, and one voided follow-up/action; one
  ready-to-resolve and one blocked Ticket; resolved Tickets inside and outside the 7-day window; one Ticket created
  today; the all-zero accounts `empty.requester@toktickit.dev` and `quiet.it@toktickit.dev`.
- Dashboard API tests create their own Tickets with explicit `createdAt` / `resolvedAt` values so boundaries
  (AC-32, AC-33) are deterministic. The server clock is fixed with `vi.setSystemTime` for those files.
- The migration test restores a Lab 3 database snapshot (`server/tests/lab-04/fixtures/lab3-snapshot.sql`, produced
  by running the Lab 3 migrations and seed), applies the Lab 4 migration, then `down.sql`, then the migration
  again.
- The performance smoke file bulk-inserts 2,000 Tickets and 6,000 actions with `createMany` in `beforeAll` into an
  isolated schema and drops it in `afterAll`.
- No real password or production secret appears in any fixture.

### 1.4 Failure and concurrency simulation

- Stale writes: two Supertest agents read the same `version`, one writes, the other writes with the old version.
- Gate race (AC-27): a test-only seam `testHooks.beforeStatusWrite` (exported from `server/src/statusTransition.ts`,
  `undefined` outside `NODE_ENV=test`) inserts an action after the gate counts and before the conditional write.
  The test asserts `409 STALE_TICKET` and that the Ticket is not `RESOLVED`.
- Idempotent create: `Promise.all` of two identical requests with one `clientRequestId`.
- Backend-down: `fetch` interception in component tests; Playwright `page.route('**/api/**', abort)` in E2E.
- Database-down health: the health handler's probe is pointed at an unreachable database URL through a dedicated
  Prisma client in the test.
- Double click: Testing Library `user.dblClick` with a delayed mock response; Playwright `click({ clickCount: 3 })`
  with a throttled route.

### 1.5 Definition of a passing suite

Every planned row implemented and green; no test skipped, `.only`, commented out, or assertion-free; every AC
present in §3.1; the Lab 1–3 suites green; and the commands in §5 clean from a clean clone on `main`.

---

## 2. Planned Tests

Legend for **Final**: `Pending` = planned, not yet run. Updated to `Pass` / `Fail` from real output only.

### 2.1 Unit tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-33, BR-34, AC-19 | All 64 (from, to) status pairs with an owner present | Exactly the 21 BR-33 pairs permitted; every other pair, including self-transitions, refused | `server/tests/lab-04/unit/workflow.unit.test.ts` | Pending |
| UNIT-02 | Unit | BR-33 | Owner condition on every work-in-progress target | `IN_PROGRESS` and `WAITING_FOR_REQUESTER` targets refused when unassigned; `OPEN`, `CANCELLED`, `CLOSED`, `REOPENED` unaffected | `server/tests/lab-04/unit/workflow.unit.test.ts` | Pending |
| UNIT-03 | Unit | BR-35, BR-40, AC-28 | `allowedTransitions` / `resolutionBlockers` for: no actions; only voided; outstanding follow-up; unassigned; passing gate; `RESOLVED` current status | Blockers listed in documented order; `RESOLVED` present only when the gate passes; blockers `[]` when `RESOLVED` is not a matrix target | `server/tests/lab-04/unit/workflow.unit.test.ts` | Pending |
| UNIT-04 | Unit | BR-07, BR-08, BR-11, AC-04 | Action text bounds: description 0/1/2000/2001, result 0/1/1000/1001, attachment notes 500/501, whitespace-only | Out-of-range and whitespace-only rejected; in-range accepted; every failing field reported together | `server/tests/lab-04/unit/action-input.unit.test.ts` | Pending |
| UNIT-05 | Unit | BR-10, AC-03 | Follow-up pairing: `true`+note, `true`+none, `false`+none, `false`+`""`, `false`+text | Only `true`+none and `false`+text rejected; `false`+`""` normalised to `null` | `server/tests/lab-04/unit/action-input.unit.test.ts` | Pending |
| UNIT-06 | Unit | BR-06, AC-04 | `actionAt`: missing offset, before Ticket creation, now+4 min, now+6 min | No offset, before creation, and +6 min rejected; +4 min accepted | `server/tests/lab-04/unit/action-input.unit.test.ts` | Pending |
| UNIT-07 | Unit | BR-03, AC-02 | Body with `performedById`, `performedBy`, `createdAt`, `ticketId`, `version`, `foo` | Each rejected by name; performer keys carry "Performed by is recorded automatically." | `server/tests/lab-04/unit/action-input.unit.test.ts` | Pending |
| UNIT-08 | Unit | BR-49, AC-32 | Bangkok start-of-day for `2026-10-19T16:59:59Z`, `…17:00:00Z`, `…17:00:01Z` | `2026-10-18T17:00:00Z`, `2026-10-19T17:00:00Z`, `2026-10-19T17:00:00Z` | `server/tests/lab-04/unit/dashboard-time.unit.test.ts` | Pending |
| UNIT-09 | Unit | BR-49, AC-33 | Rolling 7-day window start | `now − 604800000 ms` exactly | `server/tests/lab-04/unit/dashboard-time.unit.test.ts` | Pending |
| UNIT-10 | Unit | FR-23, BR-62 | Queue `followUp` parse: `outstanding`, `mine`, `""`, `all`, repeated | First two parsed; empty ignored; `all` and repeated rejected naming `followUp` | `server/tests/lab-04/unit/query-params.unit.test.ts` | Pending |
| UNIT-11 | Unit | FR-23 | My Tickets `status`: each of 8 values, repeated values, `NONSENSE` | All 8 accepted; repeats form a de-duplicated set; unknown rejected naming `status` | `server/tests/lab-04/unit/query-params.unit.test.ts` | Pending |
| UNIT-12 | Unit | ui-spec §9 | `formatBangkok` for `2026-10-19T17:15:00Z` | "20 Oct 2026 00:15" regardless of the test machine's time zone | `client/tests/lab-04/unit/formatBangkok.unit.test.ts` | Pending |
| UNIT-13 | Unit | AC-39, BR-10 | Client action validator mirrors the server bounds and the follow-up pairing | Same accept/reject set as UNIT-04 – UNIT-06 | `client/tests/lab-04/unit/actionValidation.unit.test.ts` | Pending |

### 2.2 API tests — Actions Taken

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-01 | API | AC-01 | Create a valid action on an owned `IN_PROGRESS` Ticket | `201`; saved under the correct Ticket; `performedBy` = caller; `version: 1`; Ticket `version` +1 and `publicActivityAt` advanced | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-02 | API | AC-05, BR-02 | Staff member who is not the Ticket Owner records an action | `201`; performer is that member; `assigneeId` unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-03 | API | AC-02, BR-03 | Create with `performedById`, `createdAt`, `ticketId` | `400 VALIDATION_FAILED` naming all three; no row | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-04 | API | AC-03 | `followUpRequired: true` without note; `false` with note | `400` on `followUpNote` in both; no row | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-05 | API | AC-04, BR-13 | One request breaking description, result, attachment notes, and `actionAt` bounds | One `400` whose `fields` names all four | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-06 | API | AC-06 | Create on a `NEW` Ticket | `409 TICKET_NOT_ACTIONABLE`, "Claim or assign this ticket first" | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-07 | API | AC-06 | Create on an unassigned `OPEN` Ticket | `409 TICKET_NOT_ACTIONABLE` | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-08 | API | AC-06, BR-14 | Create, edit, complete, and void on `RESOLVED`, `CLOSED`, `CANCELLED` | `409 TICKET_NOT_ACTIONABLE` for all 12 combinations; nothing changes | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-09 | API | AC-07, BR-23 | Five actions inserted out of `actionAt` order, two sharing a timestamp; list read twice | Both reads identical; `actionAt` asc then `id` asc | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-10 | API | AC-08, BR-24 | Same create sent twice sequentially | First `201`, second `200` with the same id; one row | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-11 | API | AC-08 | Same create sent twice concurrently | Exactly one row; responses `{201, 200}` with one id | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-12 | API | BR-24 | Another user replays a used `clientRequestId` | `409 DUPLICATE_SUBMISSION`; no row | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-13 | API | AC-09, BR-19 | Edits by performer, Ticket Owner, and Administrator in turn | Each `200`; `version` 2→3→4; `lastEditedBy` is each editor; `performedBy`, `createdAt` unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-14 | API | AC-10, BR-18 | Edit by staff who is neither performer nor owner | `403 FORBIDDEN`; unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-15 | API | AC-10 | Void by the same staff member | `403 FORBIDDEN`; not voided | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-16 | API | AC-11, BR-25 | Two editors from version 3 | First `200`; second `409 STALE_ACTION`; first values persist | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-17 | API | AC-12, BR-16 | Complete an outstanding follow-up by a non-performer, then again | `200` with completer and time; second `409 FOLLOW_UP_NOT_OUTSTANDING` | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-18 | API | AC-13, BR-17 | After completion: edit `followUpNote`; edit `result` only | First `409 FOLLOW_UP_NOT_OUTSTANDING`; second `200` | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-19 | API | AC-14, BR-20, BR-22 | Void with reason, then read both lists, then edit / complete / void again | Staff list shows `voided: true` + reason; Requester list omits it; the three writes `409 ACTION_ALREADY_VOIDED` | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-20 | API | AC-15, BR-21 | `DELETE` on the action, staff action, and Requester action paths as Administrator | `404` route-not-found for each; row count unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-21 | API | AC-16, BR-43 | Owning Requester reads actions | Non-voided rows with the §2.2 keys exactly; no `version`, `clientRequestId`, `voided*`, `canEdit`, or user ids | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-22 | API | AC-17 | Requester B reads Requester A's Ticket's actions; and a non-existent Ticket | Both `404 TICKET_NOT_FOUND`, identical bodies | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-23 | API | BR-01 | Edit action 214 through Ticket 99 it does not belong to | `404 ACTION_NOT_FOUND`; unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-24 | API | §7.1, DoD | Direct SQL inserts violating each `CHECK` constraint | Each rejected by PostgreSQL | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-25 | API | BR-26, BR-29, BR-45 | Ticket `version` / `publicActivityAt` after action create, edit, void, complete; after Public Comment and Internal Note | Action writes bump both; Public Comment bumps only `publicActivityAt`; Internal Note bumps neither | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |

### 2.3 API tests — Ticket workflow and resolution

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-26 | Workflow | AC-19, BR-33 | Every (from, to) pair through the API on qualifying Tickets | 21 pairs `200`; all others `409 INVALID_STATUS_TRANSITION` naming both statuses | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-27 | Workflow | AC-19, BR-34 | `REOPENED → IN_PROGRESS` on an unassigned Ticket | `409 INVALID_STATUS_TRANSITION` "… until it has an owner" | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-28 | Workflow | AC-20 | Resolve an owned Ticket with zero actions | `409 RESOLUTION_BLOCKED`, `blockers: ["NO_ACTIONS"]`; status unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-29 | Workflow | AC-21 | Resolve with only voided actions | Blocked with `NO_ACTIONS` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-30 | Workflow | AC-22, BR-38 | Resolve with an outstanding follow-up; complete it; resolve again | First blocked `OUTSTANDING_FOLLOW_UPS`; then `200`, `resolvedAt` set | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-31 | Workflow | BR-35 | Unassigned `OPEN` Ticket, no actions, resolve | `blockers: ["UNASSIGNED", "NO_ACTIONS"]` in that order | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-32 | Workflow | AC-23, BR-39 | Requester-flagged Ticket failing the gate | Blocked; flag still set; status unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-33 | Workflow | AC-24 | Reopen a `RESOLVED` Ticket, then record an action | `resolvedAt: null`, flag cleared, action `201` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-34 | Workflow | BR-38 | `RESOLVED → CLOSED` | `resolvedAt` unchanged; flag cleared | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-35 | Authorization | AC-25 | Requester `PATCH …/status` with `RESOLVED` | `403 FORBIDDEN`; unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-36 | Concurrency | AC-26, BR-28 | Agent A changes IT Priority from v5; agent B changes status with v5 | B `409 STALE_TICKET`; status unchanged; priority = A's value | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-37 | Concurrency | AC-27, BR-26 | Action inserted through `testHooks.beforeStatusWrite` during a resolve | `409 STALE_TICKET`; Ticket not `RESOLVED` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-38 | Workflow | AC-28, BR-40 | Staff detail across the UNIT-03 scenarios | `allowedTransitions` and `resolutionBlockers` match UNIT-03 exactly | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-39 | Regression | BR-78 | Assignment, priority, status without `expectedVersion` | Each `400 VALIDATION_FAILED` on `expectedVersion` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-40 | Workflow | BR-37 | Cancel an `OPEN` Ticket with no actions and one with an outstanding follow-up | Both `200` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-41 | Workflow | BR-41 | Claim a `NEW` Ticket | Status `OPEN`, owner = caller, `version` +1 exactly | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-42 | Regression | Lab 3 BR-27, A-20 | Assign an inactive IT Staff user with a correct `expectedVersion` | `409 INVALID_ASSIGNEE`; owner and `version` unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |

### 2.4 API tests — Requester Dashboard

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-43 | API | AC-29 | Requester A's dashboard before and after Requester B gains 3 Tickets | Identical numbers and lists; no B Ticket id anywhere | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-44 | API | BR-53 – BR-55 | Counts vs independent `prisma.ticket.count` per predicate | Equal for all four counts | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-45 | API | AC-34, BR-45, BR-56 | Ticket X gets an Internal Note; Ticket Y gets a Public Comment | Y moves to the top of `recentlyUpdated`; X's position unchanged | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-46 | API | AC-33, BR-57 | `resolvedAt` at now − 6 d 23 h and now − 7 d 1 h | Only the first in `recentlyResolved` and its count | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-47 | API | AC-31, BR-51 | `empty.requester` dashboard | Every count `0`, every list `[]`, every key present | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-48 | Authorization | AC-36 | IT Staff and Administrator call the Requester dashboard | `403 FORBIDDEN`, no metric keys | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-49 | API | AC-37, FR-23 | Each metric `href` replayed against `GET /api/tickets` | `meta.totalItems` equals the metric count (`recentlyResolved` excluded, A-14) | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-50 | Security | BR-52 | Shape of list items | Exactly `id`, `ticketNumber`, `summary`, `status`, `at` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |

### 2.5 API tests — IT Staff Dashboard

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-51 | API | AC-30 | Every metric vs an independent Prisma count | Equal for all six metrics | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-52 | API | AC-30, BR-71 | Each filtered metric `href` replayed against `GET /api/staff/tickets` | `meta.totalItems` equals the count (`newToday` excluded) | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-53 | API | BR-64, BR-71 | `byStatus` | 8 keys; sum = total Tickets; each equals its `?status=` total | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-54 | API | BR-65 | `byItPriority` with a `CLOSED` `URGENT` Ticket present | 4 keys; the closed Ticket not counted | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-55 | API | AC-32 | Tickets at 23:30 Bangkok yesterday and 00:10 today (fixed clock) | `newToday` counts only the second; `todayStartsAt` = 17:00Z previous UTC day | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-56 | API | BR-62 | Two of my actions with outstanding follow-ups on one Ticket, one on another; one on a cancelled Ticket | `myOutstandingFollowUps = 2`; `?followUp=mine` returns those two Tickets | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-57 | API | AC-31 | `quiet.it` dashboard on an empty-of-mine database | `myOpen`, `myOutstandingFollowUps` `0`; `myRecentActions` `[]`; all keys present | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-58 | API | AC-35, BR-70 | IT Staff response | No `administration` key | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-59 | API | AC-35, BR-68, BR-69 | Administrator response | `administration.users` with 3 role keys, `inactive`, `mustChangePassword`; counts match Prisma | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-60 | Authorization | AC-36 | Requester calls the staff dashboard | `403 FORBIDDEN`, no metric | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-61 | API | BR-22 | Voided action with an outstanding follow-up; voided action as my most recent | Excluded from `myOutstandingFollowUps` and `myRecentActions` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-62 | API | BR-50 | Outstanding follow-up on a `CANCELLED` Ticket | Not counted; not in `?followUp=outstanding` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-63 | API | BR-63 (Lab 3), FR-23 | `?followUp=all` | `400 INVALID_QUERY_PARAMETER` naming `followUp` | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |

### 2.6 API tests — authorization (every Lab 4 route)

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-64 | Authorization | AC-18 | Requester calls the five staff action routes (list, create, edit, complete, void) | `403 FORBIDDEN` each; no action data; nothing written | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| API-65 | Authorization | FR-26 | No cookie on every Lab 4 route except health | `401 UNAUTHENTICATED` each | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| API-66 | Authorization | Lab 3 BR-15 | `mustChangePassword` session on every Lab 4 route | `403 PASSWORD_CHANGE_REQUIRED` each | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| API-67 | Security | Lab 3 BR-24 | Bodies of every Lab 4 `403` | Only the error envelope; no ids, counts, or text | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| API-68 | Security | BR-72 | Requester calls a staff action route for a non-existent Ticket id | `403`, not `404` — no existence signal | `server/tests/lab-04/authorization.api.test.ts` | Pending |

### 2.7 API tests — migration, seed, and hardening

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-69 | Migration | AC-41, BR-73 | Apply the Lab 4 migration to the Lab 3 snapshot | Row counts and ids of User, Session, Ticket, Attachment, TicketMessage identical before and after | `server/tests/lab-04/migration.api.test.ts` | Pending |
| API-70 | Migration | BR-74 | Backfilled values | `version = 1` everywhere; `resolvedAt = updatedAt` only for `RESOLVED`/`CLOSED`; `publicActivityAt` = documented `GREATEST` | `server/tests/lab-04/migration.api.test.ts` | Pending |
| API-71 | Migration | BR-75 | Legacy `CLOSED` Ticket readable; legacy active Ticket resolve | Closed Ticket `200`; active resolve `409 RESOLUTION_BLOCKED` `NO_ACTIONS` | `server/tests/lab-04/migration.api.test.ts` | Pending |
| API-72 | Migration | AC-41, BR-76 | Apply `down.sql`, compare schema to Lab 3, re-apply migration | Schema equals Lab 3; data intact after both directions | `server/tests/lab-04/migration.api.test.ts` | Pending |
| API-73 | Seed | AC-42, BR-77 | Run the seed twice | Action, Ticket, and User counts and ids unchanged | `server/tests/lab-04/migration.api.test.ts` | Pending |
| API-74 | Seed | §7.6 | Seed mix | Tickets with 0, 1, ≥ 4 actions; non-owner performer; outstanding, completed, voided; both all-zero accounts | `server/tests/lab-04/migration.api.test.ts` | Pending |
| API-75 | Hardening | AC-48, BR-84 | Health with database up | `200 { status: "ok", database: "ok" }` | `server/tests/lab-04/hardening.api.test.ts` | Pending |
| API-76 | Hardening | AC-48 | Health with database unreachable | `503 SERVICE_UNAVAILABLE`, `database: "unavailable"`; no host, driver, or stack text | `server/tests/lab-04/hardening.api.test.ts` | Pending |
| API-77 | Hardening | BR-80 | Forced Prisma error inside an action create | `500 INTERNAL_ERROR` with the safe message only | `server/tests/lab-04/hardening.api.test.ts` | Pending |

### 2.8 Regression suites

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| REG-01 | Regression | AC-43, FR-26 | Complete Lab 2 and Lab 3 server suites, with only BR-78 request changes | All pass | `server/tests/lab-02/`, `server/tests/lab-03/` | Pending |
| REG-02 | Regression | AC-43 | Complete Lab 1 – Lab 3 client suites, with only BR-79 home-route changes | All pass | `client/tests/lab-01/` – `client/tests/lab-03/` | Pending |
| REG-03 | Regression | AC-43 | Complete Lab 2 and Lab 3 Playwright projects | All pass | `e2e/lab-02/`, `e2e/lab-03/` | Pending |

### 2.9 Performance smoke

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| PERF-01 | Performance | A-21, BR-47 | 20 sequential calls to each dashboard with 2,000 Tickets / 6,000 actions | p95 < 500 ms each; response < 20 KB | `server/tests/lab-04/performance.smoke.test.ts` | Pending |
| PERF-02 | Performance | BR-23 | Staff action list for a Ticket with 50 actions | p95 < 300 ms | `server/tests/lab-04/performance.smoke.test.ts` | Pending |
| PERF-03 | Performance | FR-23 | Queue with `followUp=outstanding` and with repeated `status` | p95 < 500 ms | `server/tests/lab-04/performance.smoke.test.ts` | Pending |

### 2.10 UI component tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UI-01 | UI | AC-37 | Staff dashboard renders mocked metrics | Six cards in documented order; each one link with name "{label}: {n}. View list" and `href` = API `href` | `client/tests/lab-04/StaffDashboard.test.tsx` | Pending |
| UI-02 | UI | AC-31 | All-zero staff response | Cards show `0`, links present; "You have not recorded any actions yet." | `client/tests/lab-04/StaffDashboard.test.tsx` | Pending |
| UI-03 | UI | AC-38 | Dashboard request fails, then Try again succeeds | One error callout; navigation still rendered; retry renders data | `client/tests/lab-04/StaffDashboard.test.tsx` | Pending |
| UI-04 | UI | AC-35 | With and without `administration` | Accounts group rendered only when present | `client/tests/lab-04/StaffDashboard.test.tsx` | Pending |
| UI-05 | UI | FR-22 | `403` from the dashboard API | `ForbiddenState` | `client/tests/lab-04/StaffDashboard.test.tsx` | Pending |
| UI-06 | UI | FR-18 | Requester dashboard renders mocked metrics | Three cards in attention order; two lists with View all links | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pending |
| UI-07 | UI | AC-31 | Requester all-zero | Welcome empty state with Create ticket; cards show `0` | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pending |
| UI-08 | UI | AC-38 | Requester dashboard failure | Error callout with Try again | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pending |
| UI-09 | UI | ui-spec §2.3 | One list empty, other populated | Per-list empty message; no blank card | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pending |
| UI-10 | UI | FR-04, AC-07 | Staff panel list | Rows in API order; follow-up, voided, edited markers as text | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-11 | UI | AC-39 | Toggle Follow-Up Required Yes → No → Yes | Note appears required; hides; reappears with typed text; payload omits note when No | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-12 | UI | AC-04 | Submit empty form | Field errors under each field and a linked summary; no request | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-13 | UI | AC-50, BR-03 | Performed by and Created fields | Read-only, not focusable as inputs, read-only styling | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-14 | UI | AC-46 | `500` on save | Dialog stays open; every value retained; Try again resubmits | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-15 | UI | AC-45, BR-82 | Double click Save action with a delayed response | One request; button busy | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-16 | UI | AC-11, BR-30 | `409 STALE_ACTION` on edit | Latest values shown read-only; Keep my changes resubmits with the new version; Discard loads latest; typed text never cleared before a choice | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-17 | UI | AC-10 | Row menu with `canEdit` false / true and `followUpOutstanding` | Only permitted items render; empty menu not rendered | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-18 | UI | AC-14 | Void dialog | Void disabled until a reason; voided row collapses with reason | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-19 | UI | AC-06 | `NEW` and `RESOLVED` tickets | Record action absent; reason line shown | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-20 | UI | AC-16 | Requester list | Read-only cards; no buttons or menus | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-21 | UI | BR-24, BR-82 | Network failure then retry of the same form | Both requests carry the same `clientRequestId`; the next new form gets a new one | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-22 | UI | AC-40 | Status select | Current status (disabled) plus `allowedTransitions` only | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-23 | UI | AC-40 | `resolutionBlockers` present | Callout lists each blocker in words with a link to `#actions`; select `aria-describedby` points to it | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-24 | UI | ui-spec §6.4 | Resolve confirmation | Dialog states the action count; cancel sends nothing | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-25 | UI | AC-40 | Successful status save | Summary badge, Resolved at, select options, blockers update without reload | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-26 | UI | AC-26 | `409 STALE_TICKET` | Stale callout; ticket re-fetched; "You tried: …" shown; no automatic resend | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-27 | UI | AC-23 | Flagged Ticket | Requester-flag callout at the top of the workflow panel | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-28 | UI | AC-44, FR-24 | Shell per role after login | Dashboard first and is the redirect target; exact destinations per role | `client/tests/lab-04/ShellNavigation.test.tsx` | Pending |
| UI-29 | UI | FR-25 | Active page on detail routes | Parent link has `aria-current="page"` | `client/tests/lab-04/ShellNavigation.test.tsx` | Pending |
| UI-30 | UI | AC-37 | My Tickets, Queue, User Management mounted with drill-down URLs | Filters initialised from the URL and visible; "Showing: …" line with Clear filters | `client/tests/lab-04/ShellNavigation.test.tsx` | Pending |

### 2.11 Accessibility tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| A11Y-01 | Accessibility | ui-spec §11 | Dashboard landmarks and card names | `main` + `h1`; cards in a `list`; each link's name has label and count | `client/tests/lab-04/Accessibility.test.tsx` | Pending |
| A11Y-02 | Accessibility | AC-51 | Action dialog and Void dialog focus | Focus to first field on open; Tab trapped; Esc cancels; focus returns to trigger | `client/tests/lab-04/Accessibility.test.tsx` | Pending |
| A11Y-03 | Accessibility | AC-51 | Conditional follow-up note | Inserted after the radio group with `aria-required`; focus stays on the radio | `client/tests/lab-04/Accessibility.test.tsx` | Pending |
| A11Y-04 | Accessibility | AC-51 | Row menu | `aria-haspopup="menu"`; arrow keys move; Esc closes; items are `menuitem` | `client/tests/lab-04/Accessibility.test.tsx` | Pending |

### 2.12 UI style tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| STYLE-01 | Style | AC-50, FR-34 | Stylesheet and Lab 4 components scanned for colour literals | None outside the `:root` token block; every `var(--…)` defined | `client/tests/lab-04/ZenGreenLab4Style.test.tsx` | Pending |
| STYLE-02 | Style | ui-spec §2.1 | Metric card styles | Number uses `--zen-primary`; zero uses `--zen-text`; one radius/shadow token set | `client/tests/lab-04/ZenGreenLab4Style.test.tsx` | Pending |
| STYLE-03 | Style | AC-50 | Read-only Performed by / Created | Background `--zen-readonly-bg`, distinct from `--zen-field-bg` | `client/tests/lab-04/ZenGreenLab4Style.test.tsx` | Pending |
| STYLE-04 | Style | AC-52 | Follow-up, voided, edited badges | Each has visible text; follow-up states differ by text not only colour | `client/tests/lab-04/ZenGreenLab4Style.test.tsx` | Pending |
| STYLE-05 | Style | ui-spec §2.1 | Warning border on attention cards | Present only when count > 0 | `client/tests/lab-04/ZenGreenLab4Style.test.tsx` | Pending |
| STYLE-06 | Style | ui-spec §1.3 | Metric numbers | `font-variant-numeric: tabular-nums` | `client/tests/lab-04/ZenGreenLab4Style.test.tsx` | Pending |
| STYLE-07 | Style | AC-51 | Focus ring on cards, row menu, dialog controls | Lab 2 focus style applied on `:focus-visible` | `client/tests/lab-04/ZenGreenLab4Style.test.tsx` | Pending |

### 2.13 Responsive and visual tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| RESP-01 | Responsive | AC-49 | Both dashboards, Staff Ticket Detail, Action dialog, Requester Ticket Detail at three viewports | `scrollWidth <= clientWidth`; no table overflows its card | `e2e/lab-04/responsive.spec.ts` | Pending |
| RESP-02 | Responsive | ui-spec §4.2, §5.3 | Dashboard grid | 3 / 2 / 1 columns at desktop / tablet / mobile | `e2e/lab-04/responsive.spec.ts` | Pending |
| RESP-03 | Responsive | ui-spec §6.6 | Actions Taken | Table at desktop; cards at tablet and mobile | `e2e/lab-04/responsive.spec.ts` | Pending |
| RESP-04 | Responsive | ui-spec §10 | Action form and Void dialog on mobile | Full-screen; Save reachable with the keyboard open | `e2e/lab-04/responsive.spec.ts` | Pending |
| RESP-05 | Responsive | ui-spec §10 | 2000-character unbroken description | Wraps and clamps; no page scroll | `e2e/lab-04/responsive.spec.ts` | Pending |
| RESP-06 | Visual | DoD, ui-spec §14 | Screenshot capture | Every §14 state exists at all three viewports | `e2e/lab-04/screenshots.spec.ts` | Pending |

### 2.14 E2E tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| E2E-01 | E2E | AC-01, AC-05 | Owner and a second staff member each record an action on one Ticket | Both rows visible with the right performer; owner unchanged | `e2e/lab-04/actions-taken-flow.spec.ts` | Pending |
| E2E-02 | E2E | AC-03, AC-39 | Empty submit, then Follow-Up Yes without note, then valid | Field messages in place; note required only on Yes; save succeeds | `e2e/lab-04/actions-taken-flow.spec.ts` | Pending |
| E2E-03 | E2E | AC-09, AC-11 | Two browser contexts edit the same action | Second sees the stale callout and chooses Keep my changes knowingly | `e2e/lab-04/actions-taken-flow.spec.ts` | Pending |
| E2E-04 | E2E | AC-14, AC-16 | Void an action, then the Requester opens the Ticket | Voided row in staff view; absent and read-only list for Requester | `e2e/lab-04/actions-taken-flow.spec.ts` | Pending |
| E2E-05 | E2E | AC-20, AC-22, AC-24, AC-40 | No actions → blocked; record action with follow-up → blocked; mark done → resolve (confirm) → close → reopen | Blockers in words at each step; badge refreshes; reopen re-enables Record action | `e2e/lab-04/ticket-resolution.spec.ts` | Pending |
| E2E-06 | E2E | AC-23 | Requester flags "appears resolved"; staff open the Ticket | Flag callout shown; status unchanged; gate still applies | `e2e/lab-04/ticket-resolution.spec.ts` | Pending |
| E2E-07 | E2E | AC-19, A-20 | Cancel a Ticket with no actions; attempt to assign an inactive user | Cancel succeeds after confirmation; inactive assignee refused with message | `e2e/lab-04/ticket-resolution.spec.ts` | Pending |
| E2E-08 | E2E | AC-26 | Two contexts change priority and status from the same version | Second shows the stale callout with "You tried" | `e2e/lab-04/ticket-resolution.spec.ts` | Pending |
| E2E-09 | E2E | AC-29, AC-37 | Requester dashboard counts vs My Tickets after each drill-down | List totals equal card counts; filters visible | `e2e/lab-04/dashboards.spec.ts` | Pending |
| E2E-10 | E2E | AC-30, AC-35, AC-37 | Staff and Administrator dashboards and drill-downs | Totals equal; Accounts only for Administrator; `/admin/users?role=…` filtered | `e2e/lab-04/dashboards.spec.ts` | Pending |
| E2E-11 | E2E | AC-31, AC-38 | All-zero accounts; dashboard API aborted | Zero states render; failure callout with working Try again | `e2e/lab-04/dashboards.spec.ts` | Pending |
| E2E-12 | E2E | AC-43, AC-44, AC-47 | Full Lab 1–4 walk-through per role (login, dashboard, My Tickets, create, detail, attachment, comment, Internal Note, queue, user management) with console and response listeners | Every step works; zero console errors; no `404` on any client route or asset; no placeholder text found | `e2e/lab-04/regression.spec.ts` | Pending |
| E2E-13 | E2E | AC-45, AC-46 | Triple-click submit on throttled network; offline save of an action, a comment, and a ticket | One write each; values kept after failure; resubmit succeeds | `e2e/lab-04/regression.spec.ts` | Pending |
| E2E-14 | E2E | AC-51 | Keyboard-only: dashboard card → Queue → Ticket → Record action with follow-up → save → resolve | Completed without the mouse; focus always visible | `e2e/lab-04/regression.spec.ts` | Pending |

**Totals:** 13 unit · 77 API (incl. workflow, authorization, migration, hardening) · 3 regression suites ·
3 performance · 30 UI component · 4 accessibility · 7 UI style · 6 responsive/visual · 14 E2E =
**157 planned tests** plus the complete Lab 1–3 suites.

---

## 3. Acceptance-Criterion Traceability

### 3.1 AC → tests

Every AC maps to at least one automated test. No authorization AC is proven by a UI-only test.

| AC | Covered by |
|---|---|
| AC-01 | API-01, E2E-01 |
| AC-02 | UNIT-07, API-03 |
| AC-03 | UNIT-05, API-04, E2E-02 |
| AC-04 | UNIT-04, UNIT-06, API-05, UI-12 |
| AC-05 | API-02, E2E-01 |
| AC-06 | API-06, API-07, API-08, UI-19 |
| AC-07 | API-09, UI-10 |
| AC-08 | API-10, API-11 |
| AC-09 | API-13, E2E-03 |
| AC-10 | API-14, API-15, UI-17 |
| AC-11 | API-16, UI-16, E2E-03 |
| AC-12 | API-17 |
| AC-13 | API-18 |
| AC-14 | API-19, UI-18, E2E-04 |
| AC-15 | API-20 |
| AC-16 | API-21, UI-20, E2E-04 |
| AC-17 | API-22 |
| AC-18 | API-64 |
| AC-19 | UNIT-01, UNIT-02, API-26, API-27, E2E-07 |
| AC-20 | API-28, E2E-05 |
| AC-21 | API-29 |
| AC-22 | API-30, E2E-05 |
| AC-23 | API-32, UI-27, E2E-06 |
| AC-24 | API-33, E2E-05 |
| AC-25 | API-35 |
| AC-26 | API-36, UI-26, E2E-08 |
| AC-27 | API-37 |
| AC-28 | UNIT-03, API-38 |
| AC-29 | API-43, E2E-09 |
| AC-30 | API-51, API-52, API-56, E2E-10 |
| AC-31 | API-47, API-57, UI-02, UI-07, E2E-11 |
| AC-32 | UNIT-08, API-55 |
| AC-33 | UNIT-09, API-46 |
| AC-34 | API-45 |
| AC-35 | API-58, API-59, UI-04, E2E-10 |
| AC-36 | API-48, API-60 |
| AC-37 | API-49, UI-01, UI-30, E2E-09, E2E-10 |
| AC-38 | UI-03, UI-08, E2E-11 |
| AC-39 | UNIT-13, UI-11, E2E-02 |
| AC-40 | UI-22, UI-23, UI-25, E2E-05 |
| AC-41 | API-69, API-72 |
| AC-42 | API-73 |
| AC-43 | REG-01, REG-02, REG-03, E2E-12 |
| AC-44 | UI-28, E2E-12 |
| AC-45 | UI-15, E2E-13 |
| AC-46 | UI-14, E2E-13 |
| AC-47 | E2E-12 |
| AC-48 | API-75, API-76 |
| AC-49 | RESP-01 – RESP-05 |
| AC-50 | STYLE-01, STYLE-03, UI-13 |
| AC-51 | A11Y-02 – A11Y-04, STYLE-07, E2E-14 |
| AC-52 | STYLE-04 |

### 3.2 Business rules with dedicated coverage

Rules whose failure the AC tests alone might miss:

| BR | Covered by |
|---|---|
| BR-01 (action belongs to exactly one Ticket) | API-23 |
| BR-03 (performer never client-supplied) | UNIT-07, API-03, UI-13 |
| BR-10 (follow-up pairing, also a DB constraint) | UNIT-05, API-04, API-24 |
| BR-14 (actionable statuses) | API-06 – API-08 |
| BR-18 (performer / owner / Administrator) | API-13 – API-15 |
| BR-22 (voided excluded everywhere) | API-19, API-29, API-61 |
| BR-24 (idempotent create) | API-10 – API-12, UI-21 |
| BR-26 / BR-29 (what bumps Ticket version) | API-25, API-37 |
| BR-35 (gate, all blockers listed) | UNIT-03, API-28 – API-31 |
| BR-37 (cancel not gated) | API-40 |
| BR-42 (Requester predicate) | API-19, API-21 |
| BR-45 (`publicActivityAt` excludes internal activity) | API-25, API-45 |
| BR-50 (cancelled follow-ups excluded) | API-62 |
| BR-51 (all keys always present) | API-47, API-53, API-57 |
| BR-52 (summary-only projections) | API-50 |
| BR-71 (counts reconcile with lists) | API-49, API-52, API-53 |
| BR-72 (role check before lookup) | API-68 |
| BR-74 – BR-76 (backfill, legacy, recovery) | API-70 – API-72 |
| BR-78 (`expectedVersion` required) | API-39 |
| BR-84 (health discloses nothing) | API-76 |

---

## 4. Responsive and Visual Checklist

### 4.1 Manual visual pass

To be completed against the captured screenshots (`ui-spec.md` §13 holds the full per-item evidence). Key: ✅
verified · ⚠ deviation (see §4.2) · 🔍 proven by the named automated test.

| # | Check | Desktop | Tablet | Mobile | Evidence |
|---|---|---|---|---|---|
| V-01 | Metric cards show label, number, definition, link | | | | `staff-dashboard/loaded.*`, `requester-dashboard/loaded.*` |
| V-02 | Zero renders as `0`, not blank | | | | `*/all-zero.*` |
| V-03 | Breakdowns list all statuses and priorities | | | | `staff-dashboard/loaded.*` |
| V-04 | Accounts group only for Administrator | | | | `staff-dashboard/administrator.*` |
| V-05 | Drill-down filters visible in controls | | | | `*/drill-down.*` |
| V-06 | Several staff actions on one Ticket readable | | | | `actions-taken/list-multiple.*` |
| V-07 | Visibility label always present in the form | | | | `actions-taken/create.*` |
| V-08 | Conditional follow-up note behaves and is marked required | | | | `actions-taken/follow-up-required.*` |
| V-09 | Validation placement under fields and in summary | | | | `actions-taken/validation.*` |
| V-10 | Read-only vs editable fields distinct | | | | `actions-taken/edit.*`; 🔍 STYLE-03 |
| V-11 | Voided and stale states clear by text | | | | `actions-taken/voided.*`, `actions-taken/stale.*` |
| V-12 | Only allowed transitions; blockers in words | | | | `ticket-workflow/allowed-transitions.*`, `ticket-workflow/resolution-blocked.*` |
| V-13 | Status badge refreshes after resolve | | | | `ticket-workflow/resolved.*` |
| V-14 | Requester sees read-only actions without voided | | | | `actions-taken/requester-view.*` |
| V-15 | No horizontal scroll, clipping, or overlap | | | | every §14 file; 🔍 RESP-01 |
| V-16 | Focus visible on new controls | | | | 🔍 STYLE-07, E2E-14 |
| V-17 | Badges distinguishable in greyscale | | — | — | `actions-taken/greyscale.desktop.png`; 🔍 STYLE-04 |
| V-18 | No placeholder, duplicate, or obsolete UI | | | | 🔍 E2E-12 |

### 4.2 Deviations found during this pass

To be recorded as `D-nn` with evidence and verdict, mirrored in `ui-spec.md` §13.1.

### 4.3 Screenshot inventory

| Directory | States |
|---|---|
| `artifacts/lab-04/screenshots/staff-dashboard/` | `loading`, `loaded`, `all-zero`, `administrator`, `drill-down`, `forbidden`, `failure` |
| `artifacts/lab-04/screenshots/requester-dashboard/` | `loading`, `loaded`, `all-zero`, `drill-down`, `forbidden`, `failure` |
| `artifacts/lab-04/screenshots/actions-taken/` | `empty`, `list-multiple`, `create`, `follow-up-required`, `validation`, `edit`, `stale`, `complete-follow-up`, `void-dialog`, `voided`, `not-actionable`, `requester-view`, `greyscale` |
| `artifacts/lab-04/screenshots/ticket-workflow/` | `allowed-transitions`, `resolution-blocked`, `resolve-confirm`, `resolved`, `requester-flagged`, `stale-ticket`, `reopened` |

---

## 5. Test Commands

Prerequisites: PostgreSQL running, `server/.env` present, migrations applied, seed run once.

Server unit, API, workflow, authorization, migration, hardening, performance smoke, and Lab 2–3 regression:

```bash
cd server && npm test
```

Client unit, component, style, and accessibility (Lab 1–4):

```bash
cd client && npm test
```

End-to-end, responsive, and Lab 2–3 E2E regression:

```bash
npm run e2e
```

Lab 4 E2E only (a `lab-04` Playwright project is added beside `lab-02` and `lab-03`):

```bash
npm run e2e:lab4
```

Screenshot capture only:

```bash
npm run e2e:screenshots
```

---

## 6. Final Results

_Pasted from real runs on the final `main` once implementation is complete. Not summarised from memory._

### 6.1 Server

`cd server && npm test` — _pending_

### 6.2 Client

`cd client && npm test` — _pending_

### 6.3 E2E

`npm run e2e` — _pending_

### 6.4 Performance smoke

PERF-01 – PERF-03 timings — _pending_

### 6.5 Run environment

Clean clone, commit hash, Node and PostgreSQL versions, database state — _pending_

# Lab 3 Sprint Engineering Specification

Project: TokTickIT — IT Service Desk
Sprint: Lab 3 — Authentication, Roles, IT Staff Ticketing, and Administrator User Management
Status: Draft for student review and approval (must be approved before implementation begins)
Companion documents: [ui-spec.md](ui-spec.md), [api-spec.md](api-spec.md), [tests.md](tests.md)

This document is the authoritative Sprint 3 contract. It extends the approved Lab 2 contract; where a Lab 2
rule is still in force it is cited as `Lab 2 BR-nn` rather than restated. Lab 3 identifiers (`FR-nn`, `BR-nn`,
`AC-nn`, `A-nn`, `X-nn`) restart at `01` and always mean the Lab 3 series unless prefixed with "Lab 2".

---

## 1. Sprint Goal

Replace the temporary Development Requester selector with real authentication and role-based authorization, and
deliver the first operational IT Staff workflow on top of it. After this sprint a person signs in with an email
address and a password, is forced to choose a new password if they were issued an initial one, and then sees
only the navigation and operations their single role permits. A Requester keeps every Lab 2 ticket function but
now acts as their authenticated self, can talk to IT through Public Comments, and can signal that a problem
appears resolved. IT Staff get a professional Ticket Queue for finding work and a Ticket Detail screen for
claiming or reassigning a Ticket, setting IT Priority, moving the Ticket through its permitted workflow, and
recording Internal Notes the Requester never sees. An Administrator gets one minimalist User Management screen
for viewing, creating, and editing accounts, assigning one role, activating or deactivating an account, and
issuing a new initial password. Every one of those rules is enforced by the backend — the UI hides controls as
feedback, never as protection.

---

## 2. Stakeholder Request Interpretation

In our own words, the stakeholder is asking for five things.

1. **Real identity, replacing a test harness.** The Development Requester selector answered "who is acting?"
   with a dropdown. Lab 3 answers it with a credential check and a server-side session. Every place that read
   `X-Requester-Id` now reads the authenticated session user, and the header, the selector screen, and its
   `localStorage` key are deleted rather than left dormant.
2. **A safe first-login path.** Administrators issue passwords and there is no email in scope, so an account
   can exist in a state where its password is known to someone other than its owner. That state must be
   visibly temporary: the user can sign in, but the application stays closed to them until they choose a new
   password.
3. **Authorization as a backend property.** "Hiding a button is not authorization" is read literally. Every
   protected operation is proven by an API-level test that calls it directly with the wrong role or the wrong
   owner, not by a UI test asserting a button is absent. The absent button is still required — it is good
   feedback — but it is never the control.
4. **An operational IT Staff surface, not a second Requester screen.** The Queue exists to answer "what should
   I work on next?", so it sorts by IT Priority before date, exposes ownership and status at a glance, and
   supports search, filters, sorting, and pagination server-side. Ticket Detail exists to *act*: claim,
   reassign, reprioritise, advance the status, answer the Requester, and record private context.
5. **A deliberately small administration surface.** One screen, one role per user, no deletion, no pagination,
   no bulk operations. The safety rules matter more than the features: an Administrator must not be able to
   lock the product out of administration, whether by deactivating themselves or by removing the last active
   Administrator.

Interpretation decisions worth stating up front:

- "Requesters may indicate that a problem appears resolved" is **not** a status change. It is a flag on the
  Ticket plus a system-authored Public Comment. IT Staff remain the only actors who can set `RESOLVED` or
  `CLOSED`.
- "Assign one role" means exactly one, stored as a single enum column. There is no role table, no role history,
  and no second role.
- "Update basic account information" is scoped to full name, email address, role, and activation state. Nothing
  else on the User model is administrator-editable in Lab 3.
- "Protect every API and screen according to role **and ownership**" means two distinct checks that must both
  pass: a role check ("may an IT Staff user set IT Priority?") and an ownership check ("is this Requester's
  Ticket theirs?"). Lab 2's ownership behaviour — a foreign Ticket is `404`, never `403` — survives unchanged.

---

## 3. Scope

### Included

| # | Included work |
|---|---|
| S-01 | Authentication: login with email and password, server-side session, current-user retrieval, logout that genuinely invalidates the session |
| S-02 | Mandatory first-login password change for any account flagged with an initial password, enforced by middleware on every other route |
| S-03 | Three roles (`REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`), one per user, with a complete authorization matrix enforced server-side |
| S-04 | Migration of the Lab 2 `RequesterUser` model into a real `User` model with credentials, role, and activation state, preserving all Ticket and Attachment data |
| S-05 | Removal of the Development Requester selector, the `X-Requester-Id` header, the `/api/requesters` endpoint, and the stored selector state |
| S-06 | Requester regression: every Lab 2 Ticket and Attachment function working against the authenticated identity, with ownership protection intact |
| S-07 | IT Staff Ticket Queue: server-side search, filters, sorting, pagination, ownership and status visibility, and an open-detail action |
| S-08 | IT Staff Ticket Detail: claim, assign, reassign, unassign, set IT Priority, permitted status transitions with confirmation |
| S-09 | Public Comments (Requester, IT Staff, Administrator) and Internal Notes (IT Staff, Administrator only), both append-only, plus the Requester "Problem Appears Resolved" flag |
| S-10 | Minimalist Administrator User Management: list, search by name or email, optional role filter, create, edit basic information, one-role assignment, activate/deactivate, set a new initial password, plus the Administrator safety rules |
| S-11 | Data increment: `User`, `Session`, `TicketMessage`, `Ticket.itPriority`, `Ticket.assigneeId`, `Ticket.requesterResolvedFlaggedAt`, the widened `TicketStatus` enum, indexes, three migrations, and an idempotent seed |
| S-12 | Zen Green extensions (role badge, IT Priority badge, eight status badges, Public/Internal separation), automated tests at every required level, responsive screenshots, and the `docs/lab-03/` document set |

### Excluded

| # | Explicitly excluded — must not be implemented in Lab 3 |
|---|---|
| X-01 | Email of any kind: invitations, password-reset links, delivery of initial passwords, and notification services |
| X-02 | Multi-factor authentication, social login, single sign-on, and any external identity provider |
| X-03 | Self-registration and Requester-created accounts — accounts exist only because an Administrator created or seeded them |
| X-04 | Actions Taken by IT Staff, and therefore the Lab 4 rule that blocks resolution while Actions Taken are incomplete |
| X-05 | Formal SLA calculation, escalation rules, and automated reminders |
| X-06 | Dashboards and KPI analytics beyond the simple counts shown on the Queue |
| X-07 | Multi-tenant organizations, departments as a managed entity, and customer administration |
| X-08 | Multiple roles per user, role history, and account audit history |
| X-09 | User deletion, bulk user operations, and user import or export — deactivation is the only removal mechanism |
| X-10 | Extended user-profile management: profile photographs, phone numbers, administrator-managed departments, and preferences |
| X-11 | Account locking and unlocking, Administrator approval workflows, and advanced account-recovery or identity-management functions |
| X-12 | Advanced user-list features (pagination, multi-column sorting, multiple simultaneous filters), editing or deleting a Comment or Note, and production-grade deployment or cloud infrastructure changes |

---

## 4. Functional Requirements

### Authentication and session

- **FR-01** The system shall provide a Login screen that collects an email address and a password and submits
  them to the backend over a single authentication endpoint.
- **FR-02** The backend shall authenticate a user only when the account exists, is active, and the supplied
  password verifies against the stored password hash, and shall then establish a server-side session.
- **FR-03** The system shall expose the current authenticated user — identifier, full name, email, role, and
  whether a password change is outstanding — through one endpoint the client calls on start-up to restore an
  existing session.
- **FR-04** The system shall provide a Logout action that invalidates the server-side session, clears the
  session cookie, and returns the user to the Login screen; every subsequent request carrying the old session
  is rejected as unauthenticated.
- **FR-05** The system shall reject any request to a protected endpoint that carries no valid session with a
  distinct unauthenticated response, and the client shall redirect to the Login screen when it receives one.
- **FR-06** The system shall throttle repeated failed authentication attempts for the same email address and
  origin and shall present a safe, self-expiring message when the threshold is reached.

### Mandatory password change

- **FR-07** The system shall mark every account created or reset by an Administrator, and every migrated Lab 2
  Requester, as requiring a password change before normal use.
- **FR-08** The system shall present a mandatory Change Password screen immediately after a successful login by
  such an account, stating the password rules and requiring the current (initial) password, a new password, and
  a confirmation, and shall refuse to render any other application screen until the change succeeds.
- **FR-09** The backend shall enforce the same gate independently: while a password change is outstanding,
  every endpoint except current-user retrieval, password change, and logout is refused.

### Roles, navigation, and server-side authorization

- **FR-10** The system shall assign exactly one role — Requester, IT Staff, or Administrator — to every user.
- **FR-11** The application shell shall display the authenticated user's name and role and shall render only
  the navigation destinations permitted to that role.
- **FR-12** The backend shall enforce the authorization matrix in Section 5 on every protected endpoint,
  independently of what the client renders, and shall answer a wrong-role request with a forbidden response
  that discloses no protected data.
- **FR-13** The client shall present a dedicated forbidden state when a user reaches a screen or triggers an
  operation their role does not permit, rather than a generic failure.

### Requester regression on the authenticated identity

- **FR-14** Every Lab 2 Requester function — create Ticket, My Tickets with search, filters, sorting and
  pagination, Ticket Detail, and the full attachment lifecycle — shall continue to work unchanged in behaviour,
  with the authenticated user as the Requester.
- **FR-15** The backend shall derive the Requester from the session on every requester-scoped operation and
  shall ignore any requester identifier present in a request body, query string, or header.
- **FR-16** The system shall remove the Development Requester Selection screen, the Change Requester action,
  the stored selector value, and the requester-selection endpoint.
- **FR-17** The Requester Ticket Detail screen shall additionally show the Ticket's Public Comments, allow the
  owning Requester to post one, and offer a "Problem Appears Resolved" action.

### IT Staff Ticket Queue

- **FR-18** The system shall provide a Ticket Queue listing Tickets across all Requesters to IT Staff and
  Administrators.
- **FR-19** The Queue shall support server-side keyword search across Ticket Number, Summary, and Requester
  name.
- **FR-20** The Queue shall support server-side filters for Current Status, IT Priority, Requested Priority,
  Category, Related System, Ticket Owner (including explicit "unassigned" and "assigned to me" selections), and
  the Requester-resolution flag.
- **FR-21** The Queue shall support server-side sorting on Ticket Date, Last Updated, Ticket Number, IT
  Priority, and Current Status in both directions, with a deterministic secondary sort, and shall default to
  the most urgent, longest-waiting work first.
- **FR-22** The Queue shall paginate server-side, return pagination metadata, and present distinct loading,
  loaded, empty, no-results, forbidden, and failure states.
- **FR-23** Each Queue row shall identify the Ticket well enough to triage it and shall open the IT Staff
  Ticket Detail screen.

### IT Staff Ticket Detail, ownership, priority, and status

- **FR-24** The system shall present one Ticket to IT Staff with its Requester, classification, both
  priorities, current status, owner, attachments, Public Comments, and Internal Notes.
- **FR-25** The system shall allow a permitted user to claim an unassigned Ticket, to assign or reassign it to
  another active IT Staff or Administrator user, and to unassign it.
- **FR-26** The system shall allow a permitted user to change the IT Priority of a Ticket, leaving the
  Requested Priority untouched and permanently visible.
- **FR-27** The system shall allow a permitted user to move a Ticket to any status permitted from its current
  status by the transition matrix, and shall reject every other transition.
- **FR-28** The system shall require an explicit confirmation before a transition to `RESOLVED`, `CLOSED`, or
  `CANCELLED`.
- **FR-29** Only permitted operational fields shall be editable on that screen; Ticket Number, Ticket Date,
  Requester, Summary, Description, Category, Related System, and Requested Priority remain read-only.

### Public Comments and Internal Notes

- **FR-30** The system shall allow the owning Requester, IT Staff, and Administrators to post Public Comments
  on a Ticket, and shall show them to all three.
- **FR-31** The system shall allow IT Staff and Administrators to post Internal Notes on a Ticket, and shall
  show them to IT Staff and Administrators only.
- **FR-32** The system shall record the author and a backend-generated creation time on every Comment and Note
  and shall display both.
- **FR-33** The system shall reject empty or whitespace-only Comment and Note content and shall enforce the
  documented length limit on the server.
- **FR-34** The system shall allow the owning Requester to flag that the problem appears resolved, shall record
  that flag with its timestamp, shall surface it to IT Staff on the Queue and on Ticket Detail, and shall not
  change the Ticket's status as a result.

### Administrator User Management

- **FR-35** The system shall provide one User Management screen, reachable only by an Administrator, listing
  users with Name, Email, Role, Status, and an Edit action.
- **FR-36** The screen shall support search by name or email and an optional single role filter, both applied
  server-side.
- **FR-37** The system shall allow an Administrator to create a user with a full name, an email address, one
  permitted role, an activation state, and an initial password.
- **FR-38** The system shall allow an Administrator to edit a user's full name, email address, role, and
  activation state.
- **FR-39** The system shall reject a duplicate email address and an invalid role value with field-level
  messages.
- **FR-40** The system shall allow an Administrator to set a new initial password for a user, which that user
  must change at their next login and which invalidates that user's existing sessions.
- **FR-41** The system shall prevent an Administrator from deactivating their own account and from
  deactivating or demoting the last active Administrator.
- **FR-42** The system shall provide validation, success, forbidden, and safe API-failure feedback on every
  User Management operation, and shall never delete a user.

### Cross-cutting UI

- **FR-43** Every remote operation introduced in Lab 3 shall have a defined loading state, a defined success
  state, and a defined safe failure state with a retry path.
- **FR-44** All Lab 3 screens shall be usable at desktop (≥ 992 px), tablet (768–991 px), and mobile
  (< 768 px) without horizontal page scrolling, clipped labels, overlapping messages, or hidden controls.
- **FR-45** All Lab 3 screens shall reuse the Zen Green tokens and the reusable components established in
  Lab 2 rather than introducing a second visual system.
- **FR-46** Public Comments and Internal Notes shall be visually unmistakable from each other wherever they
  are read or written, so private content cannot be posted publicly by accident.

---

## 5. Business Rules

### Authentication and session

- **BR-01** Only an active user with valid credentials may authenticate. An unknown email address, a wrong
  password, and an inactive account are all answered identically with `401 INVALID_CREDENTIALS` and the single
  message "Email or password is incorrect, or the account is not active." Nothing in the response, its timing,
  or its headers distinguishes the three cases (A-06).
- **BR-02** A successful authentication creates one `Session` row holding a 32-byte cryptographically random
  identifier encoded base64url, the user identifier, a creation time, and an absolute expiry 8 hours later.
  That identifier is the only credential the client holds afterwards.
- **BR-03** The session identifier travels in a cookie named `toktickit.sid`, set `HttpOnly`, `SameSite=Lax`,
  `Path=/`, and `Secure` whenever `NODE_ENV` is `production`. It is never written to `localStorage`,
  `sessionStorage`, a URL, a query string, or a response body (A-02, A-03).
- **BR-04** A request whose cookie is absent, malformed, unknown, or past its expiry is unauthenticated:
  `401 UNAUTHENTICATED`. An expired row is deleted when it is encountered.
- **BR-05** Logout deletes the session row and clears the cookie. The same identifier replayed afterwards is
  `401 UNAUTHENTICATED` — invalidation is real, not a client-side discard.
- **BR-06** A successful password change deletes every other session belonging to that user, keeping only the
  session that performed the change.
- **BR-07** Deactivating a user, changing their role, or setting a new initial password for them deletes all of
  that user's sessions immediately. An account cannot keep acting under a permission it no longer has.
- **BR-08** After 5 failed authentication attempts for the same email address and client address within 15
  minutes, further attempts for that pair are answered `429 TOO_MANY_ATTEMPTS` with a safe message until the
  window expires. The counter resets on a successful login and expires on its own; no account is ever locked,
  because unlocking is out of scope (X-11, A-07).

### Passwords

- **BR-09** Passwords are never stored, logged, or returned in plaintext. The stored value is a `scrypt` hash
  produced with `node:crypto` using a per-user 16-byte random salt and the documented cost parameters, recorded
  as `scrypt$N$r$p$<base64 salt>$<base64 hash>` so the parameters can be raised later without a flag day
  (A-04).
- **BR-10** Password verification uses `crypto.timingSafeEqual` on the derived keys; a comparison is never made
  with `===`. A login for an unknown email address is still put through a dummy verification so the response
  time does not reveal whether the address exists (BR-01).
- **BR-11** A password is 10–128 characters. It is not trimmed — leading and trailing spaces are significant —
  but a password consisting only of whitespace is rejected. A new password must differ from the current one and
  must not equal the account's email address or its local part (A-08).
- **BR-12** No endpoint, response body, log line, error message, or test fixture ever contains a password hash
  or a session identifier.
- **BR-13** An Administrator setting an initial password supplies the value once; it is echoed to that
  Administrator exactly once in the response to that operation and is never retrievable afterwards.
- **BR-14** Setting an initial password sets `mustChangePassword = true`; a user completing a password change
  sets it to `false`.

### The mandatory-change gate

- **BR-15** While `mustChangePassword` is `true`, the only reachable endpoints are current-user retrieval,
  password change, and logout. Every other endpoint, whatever the role, answers `403 PASSWORD_CHANGE_REQUIRED`.
- **BR-16** The gate is one middleware applied to the whole protected API surface, so a route added later
  inherits it. It is never implemented as a per-route check.
- **BR-17** The client mirrors the gate by routing every authenticated user with an outstanding change to the
  Change Password screen, including on a direct URL and on a page reload. The client mirror is convenience;
  BR-15 is the control.

### Identity and ownership

- **BR-18** The authenticated user identity, resolved from the session, determines ownership for every
  Requester operation. A `requesterId` in a body, a query string, or a header is ignored — never honoured,
  never echoed (Lab 2 BR-05).
- **BR-19** Every Lab 2 ownership rule survives verbatim with the session user substituted for the selector
  context: a Ticket or Attachment belonging to another Requester answers `404` with a generic message, never
  `403`, and never a message confirming it exists (Lab 2 BR-13, BR-14).
- **BR-20** Ownership remains part of the backend query predicate, not a filter applied after retrieval, and
  never a client responsibility (Lab 2 BR-15).
- **BR-21** IT Staff and Administrators are not subject to Requester ownership: they may open any Ticket
  through the staff routes. They remain subject to the role check, and the Requester-scoped routes stay scoped
  to the caller's own Tickets whatever their role.

### Roles and authorization

- **BR-22** A user has exactly one role, stored as a single enum column with the values `REQUESTER`,
  `IT_STAFF`, and `ADMINISTRATOR`. There is no multiple-role assignment and no role history (X-08).
- **BR-23** Authorization is two independent checks — role, then ownership — and both must pass. Failing the
  role check is `403 FORBIDDEN`; failing a Requester ownership check is `404` (BR-19).
- **BR-24** A `403 FORBIDDEN` response carries no protected payload: no Ticket data, no note content, no note
  count, no user data, and no indication of how many records the caller was not allowed to see.
- **BR-25** For Lab 3 an Administrator holds every IT Staff Ticket permission in addition to User Management,
  and this is stated explicitly in the matrix below rather than inferred (A-01). An IT Staff user holds no
  User Management permission whatsoever.

### Authorization matrix

`✅` permitted · `✅ own` permitted only for the caller's own Ticket · `❌ 403` refused as forbidden ·
`❌ 404` refused as not found, deliberately indistinguishable from "does not exist".

| Operation | Requester | IT Staff | Administrator | Unauthenticated |
|---|---|---|---|---|
| `POST /api/auth/login` | ✅ | ✅ | ✅ | ✅ |
| Logout, current user, change password | ✅ | ✅ | ✅ | ❌ 401 |
| Read reference data (Categories, Related Systems) | ✅ | ✅ | ✅ | ❌ 401 |
| Create a Ticket | ✅ | ❌ 403 | ❌ 403 | ❌ 401 |
| My Tickets list, own Ticket detail | ✅ own | ✅ own | ✅ own | ❌ 401 |
| Another Requester's Ticket through a Requester route | ❌ 404 | ❌ 404 | ❌ 404 | ❌ 401 |
| Attachment upload, list, download, soft removal | ✅ own | ✅ own | ✅ own | ❌ 401 |
| Read the IT Staff Ticket Queue | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Open any Ticket through the staff route | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Claim, assign, reassign, unassign a Ticket | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Set IT Priority | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Change Ticket status | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Read Public Comments | ✅ own | ✅ | ✅ | ❌ 401 |
| Post a Public Comment | ✅ own | ✅ | ✅ | ❌ 401 |
| Read Internal Notes | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Post an Internal Note | ❌ 403 | ✅ | ✅ | ❌ 401 |
| Flag "Problem Appears Resolved" | ✅ own | ❌ 403 | ❌ 403 | ❌ 401 |
| List, search, and filter users | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |
| Create a user, edit a user, set a new initial password | ❌ 403 | ❌ 403 | ✅ | ❌ 401 |
| Delete a user | ❌ 403 | ❌ 403 | ❌ 403 — no such endpoint exists | ❌ 401 |

Two rows deserve their reasoning. A Requester reaching a staff route gets `403`, not `404`, because the route
itself is forbidden to the role and no individual resource is being identified — there is nothing to conceal.
A Requester reaching *another Requester's Ticket* through a Requester route gets `404`, because there the
response would otherwise confirm that a specific Ticket exists (BR-19). Both behaviours are tested directly
against the API (AC-19, AC-20).

### Ticket ownership and assignment

- **BR-26** A Ticket has at most one Ticket Owner, and a newly created Ticket is unassigned.
- **BR-27** A Ticket Owner must be an **active** user whose role is `IT_STAFF` or `ADMINISTRATOR`. Assigning a
  Requester, an inactive user, or an unknown user is `409 INVALID_ASSIGNEE`.
- **BR-28** Claiming is self-assignment and is permitted whether the Ticket is unassigned or owned by someone
  else; reassignment to a third user and unassignment are equally permitted. Lab 3 does not require the current
  owner's consent.
- **BR-29** Claiming or assigning a Ticket whose status is `NEW` also moves it to `OPEN`, in the same
  transaction. This is the only automatic status change in Lab 3 (A-09).
- **BR-30** A Ticket may not leave `NEW` by any transition other than to `OPEN` or `CANCELLED` while it is
  unassigned; work in progress has an owner.

### Priority

- **BR-31** Requested Priority is the Requester's value. It is set at creation and is immutable forever; no
  role can change it, and it stays visible on every screen that shows IT Priority.
- **BR-32** IT Priority is initialised to the Requested Priority when the Ticket is created and may afterwards
  be set to any of `LOW`, `MEDIUM`, `HIGH`, `URGENT` by IT Staff or an Administrator. A Requester attempting to
  change it is `403 FORBIDDEN`.

### Status and the transition matrix

- **BR-33** The Ticket statuses are `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`,
  `CLOSED`, `REOPENED`, and `CANCELLED`.
- **BR-34** Only IT Staff and Administrators change status. A Requester attempting any status change is
  `403 FORBIDDEN`, including a change to `RESOLVED` or `CLOSED`.
- **BR-35** The permitted transitions are exactly:

  | From | Permitted target statuses |
  |---|---|
  | `NEW` | `OPEN`, `IN_PROGRESS`, `CANCELLED` |
  | `OPEN` | `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED` |
  | `IN_PROGRESS` | `OPEN`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED` |
  | `WAITING_FOR_REQUESTER` | `IN_PROGRESS`, `RESOLVED`, `CANCELLED` |
  | `RESOLVED` | `CLOSED`, `REOPENED` |
  | `CLOSED` | `REOPENED` |
  | `REOPENED` | `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED` |
  | `CANCELLED` | — terminal, no transition out |

- **BR-36** Any transition outside that matrix, including a transition from a status to itself, is
  `409 INVALID_STATUS_TRANSITION` with a message naming both the current and the requested status. The Ticket
  is unchanged.
- **BR-37** Transitions to `RESOLVED`, `CLOSED`, and `CANCELLED` require an explicit confirmation step in the
  UI before the request is sent. The backend requires no confirmation token — the confirmation is a UI
  obligation, and the backend's protection is the transition matrix itself.
- **BR-38** `NEW` remains the only status a Ticket may be created with; the create endpoint never accepts a
  status. Lab 4's rule blocking resolution while Actions Taken are incomplete is explicitly deferred (X-04).

### Public Comments and Internal Notes

- **BR-39** Both are stored in one `TicketMessage` table distinguished by a `visibility` column whose values
  are `PUBLIC` and `INTERNAL` (A-05).
- **BR-40** A read performed for a Requester places `visibility = 'PUBLIC'` **inside the query predicate**,
  exactly as ownership is handled (BR-20). Internal content is never fetched and then filtered out in
  application code, in a serializer, or in the client.
- **BR-41** Public Comments are visible to the owning Requester, IT Staff, and Administrators. Internal Notes
  are visible to IT Staff and Administrators only.
- **BR-42** Both are append-only. There is no edit and no delete in Lab 3, and no endpoint offers either
  (X-12).
- **BR-43** Every entry records its author from the session and its creation time from the backend clock. A
  client-supplied author or timestamp is ignored.
- **BR-44** Content is 1–2000 characters after trimming; whitespace-only content is rejected with
  `400 VALIDATION_FAILED`. The 2000-character bound matches the Lab 2 Ticket Description bound, so one
  long-text convention covers the product (A-10).
- **BR-45** Content is stored as plain text and rendered as text, never as HTML or Markdown. Line breaks are
  preserved with CSS, not by generating markup, so a Comment can never inject an element (A-11).
- **BR-46** "Problem Appears Resolved" sets `Ticket.requesterResolvedFlaggedAt` and appends one system-authored
  Public Comment recording that the Requester reported the problem resolved. It does not change the status, it
  may be performed only by the owning Requester, and repeating it on an already-flagged Ticket is
  `409 ALREADY_FLAGGED`. A staff transition to `RESOLVED`, `CLOSED`, or `REOPENED` clears the flag.

### Administrator user management

- **BR-47** An Administrator creates a user with a full name, an email address, exactly one permitted role, an
  activation state, and an initial password. The new account is always created with `mustChangePassword = true`
  (BR-14).
- **BR-48** An Administrator may update only a user's full name, email address, role, and activation state. Any
  other field in the payload is rejected, not silently ignored.
- **BR-49** Email addresses are unique case-insensitively. They are trimmed and normalised to lower case before
  storage and before comparison, so `Ada@kmutt.ac.th` and `ada@kmutt.ac.th` are the same account (A-12). A
  collision on create or on edit is `409 EMAIL_ALREADY_EXISTS`.
- **BR-50** A role value outside the enum is `400 VALIDATION_FAILED` on the `role` field.
- **BR-51** An Administrator may not deactivate their own account and may not change their own role:
  `409 SELF_DEACTIVATION_FORBIDDEN`. They may still edit their own name and email address.
- **BR-52** The system must always retain at least one active Administrator. Deactivating, or changing the role
  of, the last active Administrator is `409 LAST_ACTIVE_ADMINISTRATOR`. The check counts active Administrators
  other than the target and runs inside the same transaction as the update.
- **BR-53** Users are never deleted. Deactivation is the only removal mechanism; it preserves every Ticket,
  Attachment, Comment, and Note authored by that user, and a deactivated user's name still displays wherever
  they are referenced (X-09).
- **BR-54** Setting a new initial password overwrites the password hash, sets `mustChangePassword = true`, and
  deletes every session belonging to that user (BR-07, BR-14). An Administrator may do this for any account,
  including their own.

### Migration and regression

- **BR-55** The Lab 2 `RequesterUser` records become `User` records in place. No Ticket, Attachment, Category,
  or Related System row is dropped, recreated, or renumbered, and `Ticket.requesterId` keeps pointing at the
  same person (A-13).
- **BR-56** Every migrated Requester receives the role `REQUESTER`, a seeded initial password documented for
  local development only, and `mustChangePassword = true`. Their `isActive` value is preserved, so the Lab 2
  inactive Requester stays inactive and now also cannot log in (BR-01).
- **BR-57** The Development Requester selector, its `localStorage` key `toktickit.requesterId`, the
  `X-Requester-Id` header, the `requesterContext` middleware, and `GET /api/requesters` are deleted from the
  codebase. A request still sending the header is not rejected for sending it — the header is simply ignored
  (BR-18).
- **BR-58** Lab 2 acceptance criteria that do not concern the selector must still pass after the migration. A
  Lab 2 test that asserted selector behaviour is replaced by its authenticated equivalent, not deleted.

### Queue query behaviour

- **BR-59** Search, filtering, sorting, and pagination for the Queue are performed server-side. Search is a
  case-insensitive substring match over Ticket Number, Summary, and the Requester's full name.
- **BR-60** Filters combine with AND. `status` may be repeated to select several statuses, which combine with
  OR among themselves and AND with every other filter — this is the one multi-value filter, because triaging
  "everything not yet finished" is the Queue's primary job (A-14).
- **BR-61** The default sort is IT Priority descending (`URGENT` first), then Ticket Date ascending, then
  Ticket `id` ascending as the deterministic tiebreaker: the most urgent, longest-waiting Ticket is the first
  row (A-15).
- **BR-62** Page numbering is 1-based, the default page size is 20, and the permitted page sizes are 10, 20,
  and 50. A page past the end returns `200` with an empty array and correct metadata, presented as the
  no-results state.
- **BR-63** An invalid query parameter — an unknown sort field, a non-permitted page size, a non-numeric page,
  an unknown enum value, an unknown owner sentinel — is `400 INVALID_QUERY_PARAMETER` naming the offending
  parameter. Parameters are never silently ignored or coerced (Lab 2 BR-39).

### Failure behaviour and safe errors

- **BR-64** Every protected endpoint distinguishes unauthenticated (`401`), authenticated but forbidden
  (`403`), invalid input (`400`), missing resource (`404`), conflict (`409`), throttled (`429`), and unexpected
  (`500`).
- **BR-65** Error responses carry a stable code and a safe human message only. Stack traces, SQL, Prisma
  internals, file-system paths, password hashes, and session identifiers never reach the client; they are
  logged server-side (Lab 2 BR-22, BR-12).
- **BR-66** No user input is discarded on failure. The Login form keeps the email address but never the
  password; the Change Password form is cleared on success only; the Comment, Note, user-create, and user-edit
  forms keep every entered value after a validation or server error and allow retry.

---

## 6. UI Specification Summary

Full tokens, component anatomy, wireframes, and the visual checklist live in [ui-spec.md](ui-spec.md). This
section is the binding summary. The Lab 2 Zen Green tokens are carried forward **unchanged**; Lab 3 adds no new
colour value, only new applications of the existing palette.

### 6.1 Screens and required states

| Screen | Route | Required states |
|---|---|---|
| Login | `/login` | initial, client validation, submitting (busy), invalid credentials, throttled, API failure |
| Change Password (mandatory) | `/change-password` | forced entry, rules helper, validation failure, mismatch, same-as-current, submitting, success then redirect |
| Application shell | all app routes | app identity, role-specific navigation, authenticated name, role badge, Change Password, Logout, responsive mobile navigation |
| My Tickets (Requester) | `/tickets` | unchanged from Lab 2, now scoped by the session user |
| Create Ticket (Requester) | `/tickets/new` | unchanged from Lab 2 |
| Requester Ticket Detail | `/tickets/:id` | Lab 2 states, plus comments loading, comments empty, posting, post failure, appears-resolved confirm, already-flagged |
| IT Staff Ticket Queue | `/staff/tickets` | loading, loaded, empty, no-results, forbidden, failure, page-changing |
| IT Staff Ticket Detail | `/staff/tickets/:id` | loading, loaded, claiming, assigning, priority saving, status confirm, invalid transition, note posting, comment posting, forbidden, not-found, failure |
| Administrator User Management | `/admin/users` | loading, loaded, empty, no-results, create, edit, saving, duplicate email, self-deactivation blocked, last-administrator blocked, initial password issued, forbidden, failure |

### 6.2 Badges and role signalling (binding)

- Role badge: `REQUESTER` neutral, `IT_STAFF` `--zen-secondary` on `--zen-pale`, `ADMINISTRATOR`
  `--zen-primary` solid. Always rendered with the role name as text.
- IT Priority reuses the Lab 2 Requested Priority palette (`LOW` neutral, `MEDIUM` pale green, `HIGH` amber,
  `URGENT` red) and is always labelled "IT" so the two priorities can never be confused at a glance. Requested
  Priority keeps its Lab 2 appearance and is labelled "Requested".
- Status badges cover all eight values: `NEW` primary green, `OPEN` secondary green, `IN_PROGRESS` secondary
  green outline, `WAITING_FOR_REQUESTER` amber, `RESOLVED` pale green with a check glyph, `CLOSED` neutral
  grey, `REOPENED` amber outline, `CANCELLED` neutral grey with strikethrough-free "Cancelled" text.
- A Ticket flagged by its Requester carries a distinct "Requester says resolved" badge on the Queue row and on
  Ticket Detail.
- Every badge conveys meaning through text as well as colour (Lab 2 rule, unchanged).

### 6.3 Public Comments versus Internal Notes (binding)

- The two are never interleaved in one list. Ticket Detail shows a Public Comments panel and, for permitted
  roles only, a separate Internal Notes panel.
- The Internal Notes panel sits on a warning-tinted surface (`--zen-warning` border and heading), and its
  composer carries a persistent, non-dismissible label immediately above the text area: "Internal — not visible
  to the Requester."
- The Public Comments composer carries the mirrored label: "Public — the Requester will see this."
- Neither composer is rendered at all for a role that may not post to it, and the backend refuses the post
  regardless (BR-23, BR-24).

### 6.4 Navigation and responsive behaviour

- Requester navigation: My Tickets, Create Ticket. IT Staff navigation: Ticket Queue. Administrator
  navigation: Ticket Queue, User Management. No role is shown a destination it may not open (FR-11).
- Desktop (≥ 992 px): the Queue is a table; Ticket Detail is two columns (ticket information left, operations
  right); User Management is a table with an inline Edit action.
- Tablet (768–991 px): the Queue keeps a reduced column set; Ticket Detail stacks operations under
  information.
- Mobile (< 768 px): the Queue and User Management render as cards; filters collapse into a disclosure panel;
  touch targets stay ≥ 44 px; there is no horizontal page scroll at any size.

---

## 7. Data Changes

PostgreSQL through Prisma. Every change ships as a versioned Prisma migration; no manual SQL against a
database that already holds Lab 2 data.

### 7.1 Enums

```prisma
enum UserRole          { REQUESTER IT_STAFF ADMINISTRATOR }
enum MessageVisibility { PUBLIC INTERNAL }
enum RequestedPriority { LOW MEDIUM HIGH URGENT }          // unchanged, now also used for IT Priority
enum TicketStatus      { NEW OPEN IN_PROGRESS WAITING_FOR_REQUESTER RESOLVED CLOSED REOPENED CANCELLED }
```

`RequestedPriority` is deliberately reused for `Ticket.itPriority` rather than cloned into an `ItPriority`
enum: the value set is identical, and two enums holding the same four members would need two badge maps, two
validators, and two sort orders that could silently drift apart.

### 7.2 Models

| Model | Field | Type | Notes |
|---|---|---|---|
| `User` (was `RequesterUser`) | `id`, `fullName`, `email`, `isActive`, `createdAt`, `updatedAt` | — | Existing Lab 2 columns, unchanged; `email` stays **unique** and is stored lower-cased (BR-49) |
| | `department` | `String?` | **Changed** to nullable: Administrators do not set a department for new users (X-10), and existing values are preserved |
| | `role` | `UserRole` | **New**, default `REQUESTER` (BR-22) |
| | `passwordHash` | `String` | **New**, `scrypt$…` encoding (BR-09); never selected into any API response |
| | `mustChangePassword` | `Boolean` | **New**, default `true` (BR-14) |
| `Session` | `id` | `String` | **New model.** PK, 32 random bytes base64url (BR-02) |
| | `userId` | `Int` | FK → `User.id`, `onDelete: Cascade` |
| | `createdAt` | `DateTime` | `@default(now())` |
| | `expiresAt` | `DateTime` | Absolute expiry, 8 hours after creation (BR-02) |
| `Ticket` | `itPriority` | `RequestedPriority` | **New**; initialised from `requestedPriority` (BR-32) |
| | `assigneeId` | `Int?` | **New**, FK → `User.id`, `onDelete: Restrict`; `null` means unassigned (BR-26) |
| | `requesterResolvedFlaggedAt` | `DateTime?` | **New**; `null` means not flagged (BR-46) |
| | `status` | `TicketStatus` | Enum widened from one value to eight (BR-33) |
| `TicketMessage` | `id` | `Int` | **New model.** PK, autoincrement |
| | `ticketId` | `Int` | FK → `Ticket.id`, `onDelete: Cascade` |
| | `authorId` | `Int` | FK → `User.id`, `onDelete: Restrict` (BR-53) |
| | `visibility` | `MessageVisibility` | `PUBLIC` or `INTERNAL` (BR-39) |
| | `body` | `String` | `@db.Text`, 1–2000 characters after trim (BR-44) |
| | `isSystem` | `Boolean` | `@default(false)`; `true` only for the Comment written by the appears-resolved flag (BR-46) |
| | `createdAt` | `DateTime` | `@default(now())` (BR-43) |

### 7.3 Relationships

- `User 1 — n Ticket` as `requester` through the existing `Ticket.requesterId`, unchanged by the rename.
- `User 1 — n Ticket` as `assignee` through `Ticket.assigneeId` — a second, named relation to the same model,
  following the pattern Lab 2 already established for `uploadedBy` and `removedBy` on `Attachment`.
- `Ticket 1 — n TicketMessage`, cascading, so no message can outlive its Ticket.
- `User 1 — n TicketMessage` as `author`, restricted, so an author can never be deleted out from under a
  message (BR-53 makes deletion impossible anyway; the constraint is the belt to that braces).
- `User 1 — n Session`, cascading, so deactivating through a future hard delete could never orphan a session.

### 7.4 Indexes and constraints

| Object | Reason |
|---|---|
| `User.email` unique | BR-49, and the login lookup path |
| `User @@index([role, isActive])` | Every admin list filter and the "active staff eligible as assignee" lookup (BR-27) |
| `Session @@index([userId])` | Deleting all of a user's sessions on logout-all, password change, role change, and deactivation (BR-06, BR-07) |
| `Session @@index([expiresAt])` | Sweeping expired rows without a full scan (BR-04) |
| `Ticket @@index([status, itPriority, createdAt])` | The Queue's default ordering and its commonest filter, served by one index (BR-61) |
| `Ticket @@index([assigneeId, status])` | "Assigned to me" and "unassigned" filters (FR-20) |
| `Ticket @@index([requesterId, createdAt])` and the other Lab 2 indexes | Retained — My Tickets is unchanged |
| `TicketMessage @@index([ticketId, visibility, createdAt])` | The exact shape of both reads: one Ticket, one visibility scope, oldest first (BR-40) |

**Justified design decision — one `TicketMessage` table instead of two.** Public Comments and Internal Notes
have identical structure (ticket, author, body, timestamp) and differ only in who may read them. Two tables
would duplicate that structure, its index, its validation, and its serializer, and would still need the same
role check on each endpoint. One table with a `visibility` column keeps a single append path and a single
validator. The leak risk this introduces is answered the same way Lab 2 answered the ownership leak risk: the
visibility scope is part of the **query predicate** (BR-40), never a post-retrieval filter, and it gets its own
dedicated test that asserts a Requester's comment read contains no `INTERNAL` row even when the Ticket has
several (AC-47, AC-48).

**Second decision — an opaque session row rather than a signed stateless token.** The handout requires logout
to invalidate. A random identifier looked up in a table invalidates by `DELETE`, immediately and for every
device. A stateless token cannot: it stays valid until it expires unless a denylist is added, at which point
the design has a server-side table anyway, only a less useful one. The row also gives BR-06, BR-07, and BR-54
their mechanism for free.

### 7.5 Migration and seed decisions

Three ordered migrations, each reviewable on its own and each safe against a database holding Lab 2 data.

1. `rename_requester_user_to_user` — `ALTER TABLE "RequesterUser" RENAME TO "User"`, which preserves every row,
   primary key, foreign key, and index without touching `Ticket.requesterId` or the `Attachment` references
   (BR-55). Adds `role` with `DEFAULT 'REQUESTER'`, `mustChangePassword` with `DEFAULT true`, and
   `passwordHash` **nullable**; backfills `passwordHash` with the hash of the documented local initial password
   for every existing row; then sets `passwordHash NOT NULL`. Drops the `NOT NULL` on `department`.
2. `add_session_and_ticket_workflow` — creates `Session`; adds `Ticket.itPriority` nullable, backfills it with
   `UPDATE "Ticket" SET "itPriority" = "requestedPriority"`, then sets it `NOT NULL` (BR-32); adds
   `assigneeId` and `requesterResolvedFlaggedAt` as nullable columns; widens `TicketStatus` with the seven new
   values; creates the new indexes.
3. `add_ticket_message` — creates `MessageVisibility` and `TicketMessage` with its index.

The three-step backfill pattern (add nullable → backfill → set `NOT NULL`) is used for both `passwordHash` and
`itPriority` because a single `NOT NULL` column addition would fail on any non-empty table, which is exactly
the case Lab 3 has to survive.

Seed decisions — the seed stays idempotent, upserting users by `email` so repeated runs change no identifier
(Lab 2 BR-46):

- at least four active Requesters and one inactive Requester, carried forward from the Lab 2 seed;
- at least three active IT Staff and one inactive IT Staff account;
- at least one active Administrator, so User Management is testable from a clean database;
- realistic Tickets spread across all eight statuses, all four IT Priority values, and both assigned and
  unassigned ownership, including at least one Ticket flagged by its Requester;
- example Public Comments and Internal Notes containing no personal or sensitive content; and
- every seeded account carrying `mustChangePassword = true` except the accounts the E2E suite signs in with,
  which are seeded already changed so that the suite can reach the application directly — documented in
  `tests.md` §1.3 so this is a stated decision rather than a surprise.

Seeded credentials are local-development only. They are documented in one table in `README.md` and carry an
explicit warning; no real personal password and no production secret is ever committed (BR-12).

---

## 8. API Contract

Complete request and response shapes, every error case, and examples live in [api-spec.md](api-spec.md). This
section is the binding summary.

### 8.1 Conventions

- Base path `/api`. JSON in and out, except attachment upload (`multipart/form-data`) and download (binary).
- Identity travels in the `toktickit.sid` session cookie (BR-03) and is resolved by one middleware, which
  replaces the Lab 2 `requesterContext` middleware in the same position in the stack (Lab 2 BR-48 anticipated
  exactly this substitution).
- Two middlewares sit behind it: the mandatory-password-change gate (BR-15) and a role guard applied per route
  group.
- The Lab 2 error envelope is unchanged:
  `{ "error": { "code": "STRING_CODE", "message": "safe human message", "fields": [ … ] } }`.
- Timestamps stay ISO-8601 UTC on the wire and are rendered in `Asia/Bangkok` by the client.

### 8.2 Endpoint summary

| # | Method and path | Purpose | Success | Main failures |
|---|---|---|---|---|
| 1 | `POST /api/auth/login` | Authenticate and open a session | `200` with the authenticated user | `400`, `401`, `429`, `500` |
| 2 | `POST /api/auth/logout` | Invalidate the session | `204` | `401`, `500` |
| 3 | `GET /api/auth/me` | Current user and password-change state | `200` | `401`, `500` |
| 4 | `POST /api/auth/change-password` | Change the password, mandatory or voluntary | `200` | `400`, `401`, `500` |
| 5 | `GET /api/categories`, `GET /api/related-systems` | Reference data, now authenticated | `200` array | `401`, `403`, `500` |
| 6 | `POST /api/tickets` | Create a Ticket as the authenticated Requester | `201` | `400`, `401`, `403`, `409`, `500` |
| 7 | `GET /api/tickets`, `GET /api/tickets/:id` | Own Tickets, list and detail | `200` | `400`, `401`, `404`, `500` |
| 8 | The four Lab 2 attachment routes | Unchanged behaviour, session identity | `200` / `201` | `400`, `401`, `404`, `409`, `410`, `413`, `415`, `500` |
| 9 | `GET /api/tickets/:id/comments` | Public Comments for a permitted reader | `200` array | `401`, `403`, `404`, `500` |
| 10 | `POST /api/tickets/:id/comments` | Post a Public Comment | `201` | `400`, `401`, `403`, `404`, `500` |
| 11 | `POST /api/tickets/:id/appears-resolved` | Requester flags the problem resolved | `200` | `401`, `403`, `404`, `409`, `500` |
| 12 | `GET /api/staff/tickets` | The Ticket Queue: search, filter, sort, paginate | `200` `{ data, meta }` | `400`, `401`, `403`, `500` |
| 13 | `GET /api/staff/tickets/:id` | One Ticket for IT Staff operations | `200` | `401`, `403`, `404`, `500` |
| 14 | `PATCH /api/staff/tickets/:id/assignment` | Claim, assign, reassign, unassign | `200` | `400`, `401`, `403`, `404`, `409`, `500` |
| 15 | `PATCH /api/staff/tickets/:id/priority` | Set IT Priority | `200` | `400`, `401`, `403`, `404`, `500` |
| 16 | `PATCH /api/staff/tickets/:id/status` | Permitted status transition | `200` | `400`, `401`, `403`, `404`, `409`, `500` |
| 17 | `GET` / `POST /api/staff/tickets/:id/internal-notes` | Read and append Internal Notes | `200` / `201` | `400`, `401`, `403`, `404`, `500` |
| 18 | `GET /api/staff/assignees` | Active IT Staff and Administrators eligible to own a Ticket | `200` array | `401`, `403`, `500` |
| 19 | `GET /api/admin/users` | User list with search and optional role filter | `200` array | `400`, `401`, `403`, `500` |
| 20 | `POST /api/admin/users` | Create a user with one role and an initial password | `201` | `400`, `401`, `403`, `409`, `500` |
| 21 | `PATCH /api/admin/users/:id` | Edit name, email, role, activation state | `200` | `400`, `401`, `403`, `404`, `409`, `500` |
| 22 | `POST /api/admin/users/:id/initial-password` | Set a new initial password | `200` | `400`, `401`, `403`, `404`, `500` |

`GET /api/requesters` is **removed** (BR-57). There is no user-deletion endpoint (BR-53).

### 8.3 Error code catalogue changes

| Added code | Status | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session (BR-04) |
| `INVALID_CREDENTIALS` | 401 | Login failed — unknown, wrong, or inactive, indistinguishably (BR-01) |
| `PASSWORD_CHANGE_REQUIRED` | 403 | A password change is outstanding (BR-15) |
| `FORBIDDEN` | 403 | The role may not perform this operation (BR-23) |
| `USER_NOT_FOUND` | 404 | Administrator addressed an unknown user |
| `EMAIL_ALREADY_EXISTS` | 409 | Case-insensitive email collision (BR-49) |
| `INVALID_ASSIGNEE` | 409 | Proposed owner is unknown, inactive, or a Requester (BR-27) |
| `INVALID_STATUS_TRANSITION` | 409 | Transition outside the matrix (BR-36) |
| `ALREADY_FLAGGED` | 409 | Appears-resolved repeated on a flagged Ticket (BR-46) |
| `SELF_DEACTIVATION_FORBIDDEN` | 409 | Administrator targeted their own activation state or role (BR-51) |
| `LAST_ACTIVE_ADMINISTRATOR` | 409 | The change would leave no active Administrator (BR-52) |
| `TOO_MANY_ATTEMPTS` | 429 | Login throttle window is open (BR-08) |

| Retired code | Reason |
|---|---|
| `REQUESTER_CONTEXT_MISSING` | The header it described no longer exists (BR-57); its cases are now `UNAUTHENTICATED` |
| `REQUESTER_CONTEXT_INVALID` | Same; an unknown or inactive identity now fails at login (BR-01) or at session resolution (BR-04) |

Every Lab 2 code not listed above survives with its Lab 2 meaning and status.

### 8.4 HTTP status policy

| Status | Used for |
|---|---|
| `200` | Successful retrieval, update, download, soft removal, login, password change |
| `201` | Ticket created, attachment uploaded, comment or note created, user created |
| `204` | Logout |
| `400` | Validation failure, invalid query parameter, invalid path parameter, missing file |
| `401` | No valid session, or failed login |
| `403` | Role not permitted, or a password change is outstanding |
| `404` | Ticket or Attachment unknown **or owned by another Requester**, or an unknown user for an Administrator |
| `409` | Duplicate submission, attachment limit, already removed, email collision, invalid assignee, invalid transition, already flagged, self-deactivation, last active Administrator |
| `410` | Download of a soft-removed attachment (Lab 2, unchanged) |
| `413`, `415` | Attachment size and type (Lab 2, unchanged) |
| `429` | Login throttle |
| `500` | Unexpected server error, safe message only |

Lab 2's api-spec §6.2 recorded that `401` was deliberately unused because there was no authentication and that
Lab 3 would introduce it. Lab 3 discharges that promise: `401` is now the unauthenticated response and `403`
now carries its real meaning of "authenticated, but not permitted".

---

## 9. Acceptance Criteria

Every criterion maps to at least one planned test in [tests.md](tests.md).

### Authentication and session

- **AC-01** Given an active user with valid credentials, when the user logs in, then the backend establishes
  authenticated access, sets an `HttpOnly` session cookie, and returns the permitted user identity and role
  with no password hash and no session identifier in the body.
- **AC-02** Given a wrong password, an unknown email address, or an inactive account, when login is attempted,
  then the API responds `401 INVALID_CREDENTIALS` with the same message in all three cases and no session is
  created.
- **AC-03** Given a logged-in user, when the current-user endpoint is called, then it returns that user's
  identifier, name, email, role, and password-change state.
- **AC-04** Given no session cookie, when any protected endpoint is called, then the API responds
  `401 UNAUTHENTICATED` and returns no protected data.
- **AC-05** Given a logged-in user, when they log out and the same session cookie is replayed on a protected
  endpoint, then the API responds `401 UNAUTHENTICATED`.
- **AC-06** Given a logged-in user in the browser, when they log out and then navigate directly to an
  application URL, then the Login screen is shown and no previously loaded data remains visible.
- **AC-07** Given a session whose `expiresAt` has passed, when a protected endpoint is called with it, then the
  API responds `401 UNAUTHENTICATED` and the expired row is removed.
- **AC-08** Given five consecutive failed logins for one email address from one client, when a sixth is
  attempted within the window, then the API responds `429 TOO_MANY_ATTEMPTS` with a safe message.
- **AC-09** Given a stored user row, when it is inspected in the database, then `passwordHash` is a `scrypt$…`
  string, never the plaintext password, and no log line contains the password.

### Mandatory password change

- **AC-10** Given a user who must change the initial password, when login succeeds, then normal application
  screens remain unavailable until a valid new password is saved.
- **AC-11** Given such a user, when any endpoint other than current-user, change-password, or logout is called
  directly, then the API responds `403 PASSWORD_CHANGE_REQUIRED` and performs nothing.
- **AC-12** Given the Change Password screen, when a new password shorter than 10 characters, a mismatched
  confirmation, or a new password equal to the current one is submitted, then a field-level message appears and
  no request that would change the password succeeds.
- **AC-13** Given a valid new password, when it is saved, then `mustChangePassword` becomes `false`, the user
  lands on their role's home screen, and the old password no longer authenticates.
- **AC-14** Given a user signed in on two sessions, when they change their password on one, then the other
  session's next protected request responds `401 UNAUTHENTICATED`.

### Roles, navigation, and server-side authorization

- **AC-15** Given a Requester, an IT Staff user, and an Administrator, when each signs in, then the shell shows
  their name and role badge and renders only their permitted navigation destinations.
- **AC-16** Given a Requester account, when an Internal Note endpoint is requested, then the operation is
  rejected `403 FORBIDDEN` without exposing note content or a note count.
- **AC-17** Given a Requester account, when the Ticket Queue, a staff Ticket route, or any Administrator user
  route is called directly with a valid session, then the API responds `403 FORBIDDEN` and returns no data.
- **AC-18** Given an IT Staff account, when any Administrator user route is called directly, then the API
  responds `403 FORBIDDEN` and no user data is returned.
- **AC-19** Given a Requester account, when a staff route is called, then the response is `403`, not `404` —
  the route is forbidden to the role and conceals no specific resource.
- **AC-20** Given Requester B, when Requester A's Ticket is requested through a Requester route, then the
  response is `404`, identical to the response for a Ticket that does not exist.
- **AC-21** Given any protected screen reached by direct URL by a role that may not use it, when it renders,
  then a dedicated forbidden state is shown rather than a blank screen or a generic error.

### Requester regression

- **AC-22** Given an authenticated Requester, when the client supplies another `requesterId` in the body, then
  the backend still applies the authenticated identity and the created Ticket belongs to the session user.
- **AC-23** Given an authenticated Requester, when My Tickets loads, then only that user's Tickets are
  returned, with Lab 2 search, filter, sort, and pagination behaviour unchanged.
- **AC-24** Given an authenticated Requester, when a Ticket is created, then Ticket Number generation, the
  initial status `NEW`, and Ticket Date behave exactly as in Lab 2.
- **AC-25** Given an authenticated Requester who owns a Ticket, when they upload, list, download, and soft-
  remove an attachment, then every Lab 2 attachment rule still holds, including the `410` on a removed
  download.
- **AC-26** Given the running application, when the codebase and the client bundle are inspected, then no
  Development Requester selector screen, no `X-Requester-Id` header, no `toktickit.requesterId` key, and no
  `/api/requesters` route exists.
- **AC-27** Given a request that still sends an `X-Requester-Id` header naming another user, when it is
  processed, then the header is ignored and the session identity is used.

### IT Staff Ticket Queue

- **AC-28** Given Tickets belonging to several Requesters, when an IT Staff user opens the Queue, then Tickets
  from all Requesters are listed.
- **AC-29** Given the default Queue request, when it returns, then rows are ordered by IT Priority descending,
  then Ticket Date ascending, then id ascending, and the order is stable across repeated requests.
- **AC-30** Given a search term matching a Ticket Number, a Summary fragment, or a Requester's name in any
  letter case, when the Queue search runs, then the matching Tickets are returned.
- **AC-31** Given a status filter repeated for two statuses combined with an IT Priority filter, when the Queue
  loads, then only Tickets matching one of those statuses **and** that priority are returned.
- **AC-32** Given the "unassigned" and "assigned to me" owner selections, when each is applied, then only
  Tickets with no owner, and only Tickets owned by the calling user, are returned respectively.
- **AC-33** Given 25 Tickets and the default page size of 20, when the Queue loads, then 20 rows are returned
  with `totalItems: 25` and `totalPages: 2`, and page 2 returns the remaining 5.
- **AC-34** Given `pageSize=999`, `page=abc`, `sortBy=secret`, or `status=NONSENSE`, when the Queue is
  requested, then the API responds `400 INVALID_QUERY_PARAMETER` naming the parameter.
- **AC-35** Given a Queue request that fails, and separately a filter combination that matches nothing, when
  the screen renders, then a safe failure state with retry and a distinct no-results state are shown, and a
  Requester-less database shows the empty state instead.

### Ownership, IT Priority, and status

- **AC-36** Given an unassigned Ticket in status `NEW`, when an IT Staff user claims it, then they become the
  Ticket Owner and the status becomes `OPEN` in the same operation.
- **AC-37** Given a Ticket owned by one IT Staff user, when another reassigns it to a third active staff user,
  then the owner changes and the change is visible on the Queue.
- **AC-38** Given an attempt to assign a Requester, an inactive user, or an unknown user as Ticket Owner, when
  it is sent, then the API responds `409 INVALID_ASSIGNEE` and the owner is unchanged.
- **AC-39** Given a Ticket, when an IT Staff user sets IT Priority to `URGENT`, then IT Priority changes,
  Requested Priority is unchanged, and both are visible with distinct labels.
- **AC-40** Given a Requester, when they attempt to set IT Priority or change status through the API directly,
  then the API responds `403 FORBIDDEN` and nothing changes.
- **AC-41** Given a Ticket in `OPEN`, when an IT Staff user moves it to `IN_PROGRESS`, then the status changes
  and is reflected on the Queue and on Ticket Detail.
- **AC-42** Given a Ticket in `NEW`, when a transition to `CLOSED` is attempted, then the API responds
  `409 INVALID_STATUS_TRANSITION` naming both statuses and the Ticket is unchanged.
- **AC-43** Given a Ticket in `RESOLVED`, when an IT Staff user reopens it, then the status becomes `REOPENED`
  and any Requester-resolution flag is cleared.
- **AC-44** Given a transition to `RESOLVED`, `CLOSED`, or `CANCELLED`, when the control is used in the UI,
  then an explicit confirmation is required before the request is sent, and cancelling the confirmation changes
  nothing.

### Public Comments, Internal Notes, and the Requester resolution flag

- **AC-45** Given an owned Ticket, when its Requester posts a Public Comment, then it is stored with that
  author and a backend timestamp and is visible to the Requester and to IT Staff.
- **AC-46** Given an IT Staff user, when they post a Public Comment, then the owning Requester sees it on their
  Ticket Detail screen.
- **AC-47** Given a Ticket carrying both Public Comments and Internal Notes, when its Requester reads comments,
  then only the Public Comments are returned and no internal body, author, or count appears anywhere in the
  response.
- **AC-48** Given an IT Staff user, when they read Internal Notes, then all Internal Notes are returned with
  their authors and timestamps.
- **AC-49** Given empty content, whitespace-only content, or content longer than 2000 characters, when a
  Comment or Note is posted, then the API responds `400 VALIDATION_FAILED` and nothing is stored.
- **AC-50** Given an owned Ticket, when its Requester uses "Problem Appears Resolved", then the flag and its
  timestamp are stored, a system Public Comment is appended, the Ticket status is unchanged, the Queue shows
  the flag, and a second attempt responds `409 ALREADY_FLAGGED`.

### Administrator User Management

- **AC-51** Given an Administrator, when User Management loads, then users are listed with Name, Email, Role,
  Status, and an Edit action.
- **AC-52** Given a search term matching a name or an email fragment in any letter case, when the user list
  reloads, then only matching users are returned; combined with a role filter, only users matching both.
- **AC-53** Given valid input, when an Administrator creates a user with one role and an initial password, then
  the account exists, is active or inactive as chosen, carries that single role, and requires a password change
  at next login.
- **AC-54** Given an email address already used by another account in different letter case, when a user is
  created or edited with it, then the API responds `409 EMAIL_ALREADY_EXISTS` and nothing is written.
- **AC-55** Given a role value outside the enum, or an empty name, when a user is created, then the API
  responds `400 VALIDATION_FAILED` with the offending field named.
- **AC-56** Given an existing user, when an Administrator edits name, email, role, and activation state, then
  all four are updated and no other field is changed.
- **AC-57** Given a user with an existing session, when an Administrator deactivates them or changes their
  role, then that user's next protected request responds `401 UNAUTHENTICATED`.
- **AC-58** Given an Administrator, when they attempt to deactivate their own account or change their own role,
  then the API responds `409 SELF_DEACTIVATION_FORBIDDEN` and nothing changes.
- **AC-59** Given exactly one active Administrator, when an attempt is made to deactivate that account or
  change its role to a non-Administrator role, then the API responds `409 LAST_ACTIVE_ADMINISTRATOR` and the
  account remains an active Administrator.
- **AC-60** Given an Administrator sets a new initial password for a user, when that user next signs in with
  it, then login succeeds, the mandatory Change Password screen appears, the application opens only after a
  valid change, and the user's earlier sessions were already invalidated.

### Migration and regression

- **AC-61** Given a database holding Lab 2 Tickets and Attachments, when the three Lab 3 migrations are
  applied, then every Ticket, Attachment, Category, and Related System row survives with its identifier and its
  Requester link intact.
- **AC-62** Given the migration, when a migrated Requester is inspected, then they have the role `REQUESTER`, a
  non-null password hash, `mustChangePassword = true`, and their original activation state.
- **AC-63** Given a migrated Ticket, when it is inspected, then `itPriority` equals its `requestedPriority` and
  its status is unchanged.

### UI, responsive, and accessibility

- **AC-64** Given the Login, Change Password, Ticket Queue, IT Staff Ticket Detail, and User Management screens
  at 1280×800, 820×1180, and 375×812, when rendered, then there is no horizontal page scrolling, no clipped
  label, no overlapping message, and no hidden primary action.
- **AC-65** Given any Lab 3 screen, when it is inspected, then every colour resolves to a Zen Green token, no
  hard-coded colour value is present, and read-only fields remain visually distinct from editable ones.
- **AC-66** Given the IT Staff Ticket Detail screen, when it renders, then the Internal Notes area is visually
  distinct from the Public Comments area and each composer carries its permanent visibility label.
- **AC-67** Given a keyboard-only user, when they tab through Login, Change Password, and the Queue filters,
  then every control is reachable, focus is always visible, and each screen can be operated without a mouse.
- **AC-68** Given role, IT Priority, Requested Priority, and all eight status values, when badges render, then
  each carries text as well as colour and the two priorities are distinguishable by label alone.

---

## 10. Definition of Done

### 10.1 Part 1 — Product Definition of Done

The AI coding agent may report completion only when **every** box below is true.

**Scope and behaviour**
- [ ] FR-01 – FR-46 are implemented, and nothing from the Excluded table (X-01 – X-12) exists in the code.
- [ ] BR-01 – BR-66 are implemented and demonstrable, including the failure, boundary, and safety rules.
- [ ] AC-01 – AC-68 pass by observation and by automated test.
- [ ] The authorization matrix in Section 5 is implemented exactly, including the `403`-versus-`404` split.

**Security**
- [ ] No password is stored, logged, or returned in plaintext, and no response contains a password hash or a
      session identifier.
- [ ] The session cookie is `HttpOnly` and `SameSite=Lax`, and is `Secure` when `NODE_ENV` is `production`.
- [ ] Logout, password change, role change, deactivation, and a new initial password all invalidate sessions as
      specified.
- [ ] Every protected route is proven by a direct API test with the wrong role and, where applicable, the wrong
      owner — not by a UI assertion.
- [ ] No authentication secret is committed, and `.env` remains git-ignored.

**Tests**
- [ ] Tests exist at every required level: unit, API/integration, UI component, UI style, responsive,
      security/authorization, migration/regression, and E2E.
- [ ] Every Acceptance Criterion maps to at least one test in `tests.md`, and every planned test names its real
      file path.
- [ ] All tests pass from the documented commands on the final `main` branch.
- [ ] No test is skipped, disabled, marked `.only`, or commented out, and no test asserts nothing.
- [ ] Failure paths are covered, not only happy paths: `400`, `401`, `403`, `404`, `409`, `429`, backend-down,
      and the empty, no-results, and forbidden states.

**Data**
- [ ] The Prisma schema matches Section 7, and all migrations apply cleanly both to an empty database and to a
      database holding Lab 2 data.
- [ ] `npx prisma db seed` runs twice with no duplicates and no identifier churn.
- [ ] The seeded role mix from Section 7.5 exists, including the inactive Requester and the inactive IT Staff
      account.
- [ ] Every documented index and unique constraint exists in a migration.

**API**
- [ ] Every endpoint in Section 8 exists with the documented method, path, statuses, and error envelope.
- [ ] `GET /api/requesters`, the `X-Requester-Id` header, and the `requesterContext` middleware are gone.
- [ ] No response leaks a stack trace, SQL, a file-system path, a hash, or a session identifier.

**UI**
- [ ] Zen Green tokens are used everywhere; no hard-coded colours were added in Lab 3.
- [ ] Every screen implements its full state set from Section 6.1.
- [ ] Desktop, tablet, and mobile screenshots exist under `artifacts/lab-03/screenshots/` for authentication,
      the staff queue, staff ticket detail, and user management.
- [ ] The `ui-spec.md` visual checklist is completed against those screenshots, not from memory.

**Documentation**
- [ ] `specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md`, `reviewer.md`, and `ai-use.md` are present
      and current under `docs/lab-03/`.
- [ ] `README.md` setup, run, migrate, seed, and test instructions are current and verified from a clean clone,
      and the seeded local credentials are documented with their development-only warning.
- [ ] Any deviation from this specification is recorded in Section 11 before merge, not discovered afterwards.

**Demonstration**
- [ ] The student can demonstrate live: a valid login, an invalid login, an inactive account, the busy and safe
      failure states, a mandatory first-password change, the authenticated user and role display, logout with
      direct access blocked afterwards, a Requester creating a ticket, a queue search with filters and paging,
      a claim and a reassignment, an IT Priority change, a permitted and a rejected status change, a Public
      Comment round trip, an Internal Note invisible to the Requester, the appears-resolved flag, and every
      Administrator case including the self-deactivation and last-Administrator refusals.

### 10.2 Part 2 — Course Delivery Requirements

- [ ] `lab3-staging` created from `main`; no direct commits to `main` or `lab3-staging`.
- [ ] Every Issue implemented on its own feature branch and merged into `lab3-staging` through a peer-reviewed
      Pull Request.
- [ ] One release Pull Request from `lab3-staging` to `main` after integration testing.
- [ ] The GitHub Project Kanban shows all Issues in Done.
- [ ] `reviewer.md` records reviewer identity, PR links, comments given and received, responses, and approvals.
- [ ] `ai-use.md` records the LLM used, 6–10 selected key prompts, and a brief reflection on specification-agent
      and coding-agent use.
- [ ] Evidence proves `specification.md` existed before the main implementation PRs were completed.
- [ ] The single submission PDF uses the headings "Answer Part 1" – "Answer Part 9" with working links and
      readable screenshots.

---

## 11. Assumptions and Decisions

| # | Assumption or decision | Rationale |
|---|---|---|
| A-01 | An Administrator holds every IT Staff Ticket permission in addition to User Management | The handout keeps the roles conceptually separate but permits an explicit matrix entry, and it also allows an Administrator to be a Ticket Owner and to read Internal Notes; making that a stated superset is simpler to implement and to test than a partial overlap |
| A-02 | Authentication uses an opaque server-side session, not a JSON Web Token | Logout must genuinely invalidate. A row deleted on logout does that immediately and for every device; a stateless token cannot without adding a denylist table, which is a worse version of the same design |
| A-03 | The session cookie is `toktickit.sid`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, with an absolute 8-hour expiry and no sliding renewal | `HttpOnly` keeps the credential out of reach of any script, so XSS cannot exfiltrate it. `SameSite=Lax` plus the existing same-origin Vite proxy is sufficient CSRF protection for this stack, since every state-changing route is `POST`/`PATCH`/`DELETE` with a JSON content type and no cross-site form can produce one. A fixed expiry is one rule to test; sliding renewal is unrequested complexity |
| A-04 | Passwords are hashed with `node:crypto` `scrypt` (`N = 2^15`, `r = 8`, `p = 1`, 16-byte salt, 64-byte key), encoded `scrypt$N$r$p$salt$hash` | A memory-hard KDF from the standard library: no new dependency, no native build on Windows or in CI, and the cost parameters travel with each hash so they can be raised later without invalidating old ones |
| A-05 | Public Comments and Internal Notes share one `TicketMessage` table with a `visibility` enum | Identical structure, one append path, one validator, one index. The leak risk is answered by making visibility part of the query predicate (BR-40) and testing it directly (AC-47) |
| A-06 | Login failures are indistinguishable: unknown email, wrong password, and inactive account all return the same code and message | The handout asks for a clear response for inactive accounts "without exposing unnecessary account information". Naming the inactive case would confirm that an address is registered, which is account enumeration |
| A-07 | Failed-login throttling is an in-process, self-expiring counter keyed by email plus client address, not a persistent lock | Account locking and unlocking are explicitly excluded, so a persistent lock would create a state with no supported exit. Ceiling: the counter lives in one process and resets on restart — move it to the database or a shared cache if the product is ever run multi-instance |
| A-08 | Password rules are 10–128 characters, not trimmed, must differ from the current password, and must not equal the email address or its local part | Length is the property that actually resists guessing; composition rules mostly produce predictable substitutions. The three exclusions block the failure modes an Administrator-issued password invites |
| A-09 | Claiming or assigning a `NEW` Ticket also moves it to `OPEN` | Otherwise every claim needs a second, always-identical click. One documented automatic transition is cheaper than an always-forgotten manual step |
| A-10 | Comment and Note bodies are 1–2000 characters | Matches the Lab 2 Ticket Description bound, so the product has one long-text convention and one set of messages |
| A-11 | Comment and Note bodies are plain text rendered as text, with line breaks preserved by CSS | No Markdown or HTML pipeline means no sanitiser to get wrong; React escapes by default and `white-space: pre-wrap` covers the only formatting anybody actually needs here |
| A-12 | Email addresses are trimmed and stored lower-cased, and uniqueness is therefore case-insensitive through the existing unique index | Normalising on write keeps one plain unique constraint and avoids a `citext` extension or a functional index, either of which would be a database-specific dependency |
| A-13 | The Lab 2 `RequesterUser` table is renamed to `User` rather than replaced by a new table with copied rows | Lab 2 BR-49 committed to extending the model so `Ticket.requesterId` and both Attachment references stay valid. A rename preserves every key and index; a copy would renumber people and break those references |
| A-14 | `status` is the only repeatable Queue filter | "Everything still open" is the Queue's primary question and needs several statuses at once. Every other filter answers a single-value question, and the handout excludes multiple simultaneous filters for the *user list*, not for the Queue |
| A-15 | The default Queue order is IT Priority descending, then Ticket Date ascending, then id ascending | The Queue exists to answer "what next?": most urgent first, and within one urgency the Ticket that has waited longest. The id tiebreaker keeps paging stable when timestamps collide |
| A-16 | Staff routes live under `/api/staff/…` and Administrator routes under `/api/admin/…` | One role guard is mounted per prefix, so a route added later inherits its authorization instead of being forgotten — the same reason Lab 2 mounted the requester context on a prefix |
| A-17 | Assignment, priority, and status are three separate `PATCH` endpoints rather than one Ticket update | Each has a different authorization story, a different validation rule, and a different conflict case; one endpoint would need a branch per field and a test matrix per combination |
| A-18 | The client holds the authenticated user in one React context populated by `GET /api/auth/me` on start-up, replacing the Lab 2 requester-context module in the same position | The single client-side substitution Lab 2 BR-48 was written to allow; route guards and the API client change shape, not structure |
| A-19 | E2E accounts are seeded with `mustChangePassword = false`, while a dedicated account is seeded with `true` for the first-login test | Otherwise every E2E scenario would begin with the same password-change detour, which tests nothing after the first time |
| A-20 | The Requester "Problem Appears Resolved" flag also writes one system-authored Public Comment | The flag alone would be invisible in the conversation history; the comment makes the Ticket's story readable in one place without inventing an event log |

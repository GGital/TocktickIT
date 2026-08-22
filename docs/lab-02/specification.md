# Lab 2 Sprint Engineering Specification

Project: TokTickIT — IT Service Desk
Sprint: Lab 2 — Requester Ticketing MVP with UI Foundation
Status: Draft for student review and approval (must be approved before implementation begins)
Companion documents: [ui-spec.md](ui-spec.md), [api-spec.md](api-spec.md), [tests.md](tests.md)

---

## 1. Sprint Goal

Deliver a professional, responsive, Requester-facing ticketing slice on top of the Lab 1 foundation: a
Requester selected through a temporary Development Requester Selection screen can create an IT support
ticket with attachments, receive a backend-generated official Ticket Number, find that ticket again in a
searchable, filterable, sortable, paginated My Tickets list, open a read-only Ticket Detail screen, and add,
download, or soft-remove their own permitted attachments — while the backend guarantees that no Requester
can read another Requester's ticket or attachment. The sprint also establishes the Zen Green Theme and the
reusable form, list, badge, validation, loading, empty, error, and responsive conventions that Lab 3 and
later screens reuse instead of re-inventing.

---

## 2. Stakeholder Request Interpretation

In our own words, the stakeholder is asking for four things.

1. **A working intake path.** A Requester describes a problem (Summary + Description), classifies it
   (Category + Related System), states how urgent they think it is (Requested Priority), optionally attaches
   evidence, and submits. The system — not the user — assigns the official Ticket Number and the initial
   status.
2. **A working retrieval path.** The ticket must be findable afterwards. My Tickets is scoped to the current
   Requester and must stay usable as the list grows, which means server-side search, filters, sorting, and
   pagination rather than dumping every row into the browser.
3. **Real ownership isolation, without real authentication.** "Prevent one Requester from viewing another
   Requester's ticket" is a backend responsibility. The Development Requester selector only *simulates* who
   is acting; it is a test harness, deliberately not a security boundary, and Lab 3 replaces it with
   authentication. Every ownership check therefore lives in the API, never only in the UI.
4. **A visual and behavioural foundation.** The Zen Green Theme plus documented conventions for forms, lists,
   badges, validation, loading, empty, error, and responsive layout, so later labs extend a system instead of
   starting over.

Interpretation decisions worth stating up front:

- "Indicate the requested priority" means the Requester's *requested* priority. A separate IT Priority set by
  staff is a later-lab concern and is not modelled or shown in Lab 2.
- "Inspect or manage permitted attachments" means view metadata, download active files, add new files, and
  soft-remove their own files. It does not mean editing ticket fields — Ticket Detail is read-only for ticket
  data.
- "Store the data safely" is read as: server-side validation independent of the client, ownership checks on
  every requester-scoped route, files stored under server-generated names outside any user-controlled path,
  and no destructive deletion of attachment records.

---

## 3. Scope

### Included

| # | Included work |
|---|---|
| S-01 | Development Requester Selection screen ("simulated login"), active-requester loading, selection storage, current-requester display, Change Requester, and full requester-context switching |
| S-02 | Create Ticket screen: reference data loading, required fields, client + server validation, busy state, success state showing the official Ticket Number, safe failure state with entered values preserved |
| S-03 | Backend Ticket Number generation, ticket persistence, and default values (status `NEW`, Ticket Date, requester binding) |
| S-04 | Attachment lifecycle: staged selection at create time, upload to an existing ticket, metadata retrieval, download of active files, soft removal with a reason, retained metadata for removed files, blocked download and preview of removed files |
| S-05 | My Tickets: requester-scoped list with server-side search, filters, sorting, pagination, and distinct loading / empty / no-results / failure states |
| S-06 | Requester Ticket Detail (view mode): read-only ticket information plus the attachment section |
| S-07 | Backend ownership protection for ticket list, ticket detail, attachment metadata, upload, download, and soft removal |
| S-08 | Data increment: `RequesterUser`, `Ticket`, `Attachment`, `RelatedSystem`, extended `Category`, enums, indexes, migrations, and an idempotent seed |
| S-09 | REST API contract for all of the above, including pagination metadata, status codes, and one error envelope |
| S-10 | Zen Green Theme tokens and reusable UI conventions (application shell, form controls, buttons, badges, tables/cards, pagination, validation placement, loading/empty/error states, responsive rules, accessibility basics) |
| S-11 | Automated tests at unit, API, UI component, UI style, responsive, and E2E level, plus Playwright screenshots at desktop, tablet, and mobile |
| S-12 | Documentation: `specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md`, `reviewer.md`, `ai-use.md`, and an updated `README.md` |

### Excluded

| # | Explicitly excluded — must not be implemented in Lab 2 |
|---|---|
| X-01 | **Authentication and security:** login, logout, passwords, password hashing, sessions, tokens, authenticated identities, and real role-based authorization. The Development Requester selector is a testing mechanism only and must never be described or treated as secure authentication |
| X-02 | **IT Staff workflow:** staff dashboard or queue, claiming, assigning or reassigning tickets, IT Priority, and any other ticket-owner function |
| X-03 | **Ticket collaboration and work tracking:** Public Comments, Internal Notes, Actions Taken |
| X-04 | **Ticket lifecycle after creation:** any status change beyond the initial `NEW`, resolution confirmation, resolving, closing, reopening, cancelling |
| X-05 | **Administration functions:** administrator management of users, Requesters, roles, or reference data (Categories and Related Systems are seed-managed only) |
| X-06 | Editing or deleting a Ticket after creation — ticket fields are immutable in Lab 2; only the attachment collection changes |
| X-07 | Hard deletion of attachment rows or files, email/notification delivery, virus scanning, cloud object storage, and full-text search engines |

---

## 4. Functional Requirements

### Development Requester context

- **FR-01** The system shall provide a Development Requester Selection screen that loads all **active** seeded
  Requesters from PostgreSQL through the API and presents them in a keyboard-accessible dropdown, with
  distinct loading, empty (no active Requesters), and API-failure states.
- **FR-02** The system shall require a Requester to be chosen and confirmed with a **Continue** action before
  any ticket screen can be used; the chosen Requester becomes the current testing context.
- **FR-03** The application shell shall display the current Requester's name and provide a **Change Requester**
  action that returns to the selection screen.
- **FR-04** When the current Requester changes, the system shall discard all previously loaded
  requester-scoped state (list results, search term, filters, pagination position, open detail) and reload for
  the new Requester.
- **FR-05** The system shall redirect any requester-scoped screen (Create Ticket, My Tickets, Ticket Detail) to
  the Development Requester Selection screen when no valid Requester context exists.
- **FR-06** Every requester-scoped API request shall carry the selected Requester identifier, and the backend
  shall resolve, validate, and use that identifier rather than trusting any requester value in the request
  body.

### Create Ticket

- **FR-07** The Create Ticket screen shall load Categories and Related Systems from the database and shall not
  hard-code reference data in the client.
- **FR-08** The Create Ticket screen shall capture Ticket Summary, Description, Category, Related System, and
  Requested Priority, and shall display Ticket Number, Ticket Date, Requester, and Current Status as
  system-generated or read-only information.
- **FR-09** The system shall validate all input on the client for immediate feedback and independently on the
  server as the authoritative check, returning field-level errors.
- **FR-10** On successful submission the system shall persist exactly one Ticket, generate the official Ticket
  Number in the backend, set the initial status to `NEW`, and bind the Ticket to the current Requester.
- **FR-11** The system shall display a success state containing the generated official Ticket Number and clear
  next actions (open the new Ticket, create another Ticket, go to My Tickets).
- **FR-12** On validation failure or backend/network failure the system shall keep every value the user
  entered, keep any staged attachment selection, present a safe error message, and allow retry.
- **FR-13** The system shall prevent duplicate submissions through a disabled busy submit control on the client
  and a server-side duplicate-window rule (BR-19).

### Attachments

- **FR-14** The system shall allow attachments to be staged on the Create Ticket screen and uploaded to the
  newly created Ticket immediately after creation, reporting per-file success or failure.
- **FR-15** The system shall allow the owning Requester to add permitted attachments to an existing Ticket from
  Ticket Detail.
- **FR-16** The system shall validate every uploaded file on the server for type, size, and per-ticket active
  count, and shall reject a non-permitted file with a specific, field-level message.
- **FR-17** The system shall list attachment metadata for an owned Ticket, distinguishing active attachments
  from removed ones.
- **FR-18** The system shall allow the owning Requester to download an **active** attachment of an owned Ticket.
- **FR-19** The system shall allow the owning Requester to soft-remove an active attachment after an explicit
  confirmation that captures a removal reason.
- **FR-20** The system shall retain removed-attachment metadata (original filename, type, size, who removed it,
  when, and why) and shall block download and preview of removed attachments at the API level.

### My Tickets

- **FR-21** The system shall list only the Tickets owned by the current Requester, newest first by default.
- **FR-22** The system shall provide server-side keyword search across Ticket Number, Summary, and Description.
- **FR-23** The system shall provide server-side filters for Category, Related System, Requested Priority, and
  Current Status.
- **FR-24** The system shall provide server-side sorting on Ticket Date, Last Updated, Ticket Number, and
  Requested Priority in both directions, with a deterministic secondary sort.
- **FR-25** The system shall paginate results server-side and return pagination metadata (current page, page
  size, total items, total pages).
- **FR-26** The system shall present visually distinct **empty** (the Requester owns no Tickets at all) and
  **no-results** (search or filters matched nothing) states, offering a Create Ticket action in the empty state
  and a Clear filters action in the no-results state.
- **FR-27** The list shall expose enough information to identify a Ticket (Ticket Number, Summary, Category,
  Related System, Requested Priority, Current Status, Ticket Date, Last Updated) and shall open Ticket Detail
  from a row or card.

### Ticket Detail and ownership

- **FR-28** The system shall present an owned Ticket's information as read-only, together with the attachment
  section.
- **FR-29** The backend shall enforce ownership on ticket list, ticket detail, attachment metadata, upload,
  download, and soft removal, and shall respond as if the resource does not exist when it belongs to another
  Requester.
- **FR-30** The system shall present a safe not-found / no-access state in the UI without disclosing whether
  the requested Ticket or Attachment exists for someone else.

### Cross-cutting UI

- **FR-31** Every remote data operation shall have a defined loading state, a defined success state, and a
  defined safe failure state with a retry path.
- **FR-32** All screens shall be usable at desktop (≥ 992 px), tablet (768–991 px), and mobile (< 768 px)
  without horizontal page scrolling, clipped labels, overlapping messages, or hidden controls.
- **FR-33** The application shall implement the Zen Green Theme tokens and the reusable form, button, badge,
  list/card, pagination, validation, loading, empty, and error components documented in `ui-spec.md`, and later
  screens shall reuse them rather than defining new visual rules.

---

## 5. Business Rules

### Ticket defaults and system-generated values

- **BR-01** The official Ticket Number is generated by the backend and must be unique across all Tickets. The
  client never supplies, guesses, or edits it.
- **BR-02** A new Ticket begins with Current Status `NEW`. No other status transition exists in Lab 2.
- **BR-03** The Ticket Number format is `TKT-YYYY-NNNNNN`, where `YYYY` is the four-digit creation year in
  `Asia/Bangkok` and `NNNNNN` is a zero-padded per-year counter starting at `000001`. The counter is issued
  atomically by the database, is never reused, and is never renumbered — gaps caused by failed transactions are
  acceptable and must not be back-filled.
- **BR-04** Ticket Date is the server-side creation timestamp (`createdAt`); the client never supplies it.
- **BR-05** A Ticket's Requester is always the currently selected Development Requester resolved from the
  request context. Any `requesterId` present in a request body is ignored.
- **BR-06** Requested Priority is one of `LOW`, `MEDIUM`, `HIGH`, `URGENT`. `MEDIUM` is pre-selected in the form
  as a convenience default, but the value must be present in the submitted payload — the server does not
  silently default a missing priority.
- **BR-07** Ticket fields are immutable after creation in Lab 2. Only the attachment collection may change, and
  any attachment change updates the Ticket's `updatedAt` (Last Updated).

### Requester selection and switching

- **BR-08** The Development Requester selector is a Lab 2 testing mechanism, not authentication. It must be
  labelled as such on screen and must never be relied on as a security control.
- **BR-09** Only Requesters with `isActive = true` are returned by the API and shown in the selector.
- **BR-10** The selected Requester identifier is stored in browser `localStorage` under a single documented key
  and is sent on every requester-scoped API call in the `X-Requester-Id` header.
- **BR-11** If the stored Requester identifier is missing, malformed, unknown, or belongs to an inactive
  Requester, the backend rejects the request, and the client clears the stored value and returns the user to
  the selection screen.
- **BR-12** Switching Requesters immediately invalidates all requester-scoped client state; no data belonging to
  the previous Requester may remain visible after the switch.

### Ownership

- **BR-13** A Ticket is readable only by its owning Requester. A request for a Ticket owned by another Requester
  returns `404 NOT_FOUND` with a generic message — never `403`, and never a message that confirms the Ticket
  exists.
- **BR-14** An Attachment inherits the ownership of its parent Ticket. Upload, metadata read, download, and soft
  removal are permitted only to the owning Requester; otherwise `404 NOT_FOUND`.
- **BR-15** Ownership is enforced inside the backend query itself (the requester identifier is part of the
  lookup), not by filtering after retrieval, and never by the client.

### Validation

- **BR-16** All string inputs are trimmed before validation and stored trimmed. A value that is empty after
  trimming is treated as missing.
- **BR-17** Field constraints — identical on client and server, with the server authoritative:

  | Field | Required | Rule | Rationale |
  |---|---|---|---|
  | Ticket Summary | Yes | 10–120 characters after trim | Long enough to be a meaningful one-line title in the list, short enough to render in one table column without clipping |
  | Description | Yes | 20–2000 characters after trim | Forces a usable problem statement; the upper bound keeps payloads and the detail layout bounded |
  | Category | Yes | Must reference an existing **active** Category | Referential integrity |
  | Related System | Yes | Must reference an existing **active** Related System | Referential integrity |
  | Requested Priority | Yes | One of `LOW`, `MEDIUM`, `HIGH`, `URGENT` | Bounded, badge-able values |
  | Removal reason | Yes | 5–200 characters after trim | Has audit value; anything shorter is noise |

- **BR-18** Validation failures return `400` with a machine-readable field list. The UI renders each message next
  to its field and additionally announces a summary to assistive technology. A single top-level "something went
  wrong" message alone is not acceptable.
- **BR-19** **Duplicate-submission prevention:** the submit control is disabled and shows a busy state while a
  submission is in flight, and the backend rejects a second Ticket with the same `requesterId`, `summary`, and
  `description` created within 60 seconds of the first with `409 DUPLICATE_SUBMISSION`. The client surfaces this
  as a non-destructive message and does not clear the form.

### Failure behaviour and data retained after errors

- **BR-20** No user input is discarded on failure. After a validation, network, or server error the Create Ticket
  form retains all entered values and the staged attachment selection.
- **BR-21** A failed Ticket creation persists nothing — no Ticket row and no partial record. Consumption of a
  Ticket Number counter value is the only permitted side effect (BR-03).
- **BR-22** Error responses expose a stable error `code` and a safe human message only. Stack traces, SQL,
  file-system paths, and Prisma internals must never reach the client; they are logged server-side.

### Attachments

- **BR-23** Permitted file types are JPG/JPEG, PNG, WEBP, and PDF. The server validates by file-extension
  allowlist **and** by inspecting the file's magic bytes; the client-supplied `Content-Type` alone is never
  trusted. A rejected file returns `415 UNSUPPORTED_FILE_TYPE`.
- **BR-24** Maximum size is 5 MB (5 × 1024 × 1024 bytes) per file. An oversized upload is rejected with
  `413 FILE_TOO_LARGE` and is not persisted.
- **BR-25** A Ticket may have at most **five active** Attachments. Removed attachments do not count toward the
  limit. An upload that would exceed the limit is rejected with `409 ATTACHMENT_LIMIT_REACHED`.
- **BR-26** Required attachment metadata: original filename, stored filename, MIME type, size in bytes, uploading
  Requester, upload timestamp, and — once removed — removal timestamp, removal reason, and removing Requester.
- **BR-27** **Safe filename and storage behaviour:** the stored filename is a server-generated UUID plus a
  normalised extension derived from the validated type. The client-supplied filename is kept only as display
  metadata, is never used to build a path, and is rendered escaped. Path-traversal input (`..`, absolute paths,
  path separators) is rejected. Files live under `server/uploads/<ticketId>/`, which is git-ignored and is not
  served as a static directory — every byte is delivered through the ownership-checked download endpoint.
- **BR-28** **Upload transaction / compensation strategy:** the file is written to disk first, then the
  `Attachment` row is inserted. If the insert fails, the written file is deleted before the error is returned
  (compensating action), so no orphan file remains. If the file write fails, no row is created.
- **BR-29** **Attachment upload is independent of Ticket creation.** Ticket creation is a JSON request that never
  carries files; attachments are uploaded afterwards, one request per file. A Ticket created successfully is
  therefore never rolled back because an attachment failed: the Ticket is kept, the success state shows its
  Ticket Number, and each failed file is reported individually with a retry action on Ticket Detail.
- **BR-30** **Removal is always soft.** Removal sets `removedAt`, `removalReason`, and `removedById`. The
  Attachment row and the underlying file are never hard-deleted in Lab 2.
- **BR-31** Soft removal requires an explicit confirmation step that captures the removal reason (BR-17) before
  the request is sent.
- **BR-32** A removed Attachment remains visible as metadata in the attachment list, marked *Removed* with its
  reason and timestamp, but its download and preview are blocked by the API with `410 GONE`. A removed
  attachment cannot be restored or removed again in Lab 2; a second removal returns `409 ALREADY_REMOVED`.
- **BR-33** Only the owning Requester may remove an Attachment, and only while it is active (BR-14, BR-32).

### Search, filtering, sorting, and pagination

- **BR-34** Search, filtering, sorting, and pagination are all performed server-side and always within the
  ownership scope of the current Requester.
- **BR-35** Search is a case-insensitive substring match over Ticket Number, Summary, and Description. The term
  is trimmed; an empty term means no search.
- **BR-36** Filters are Category, Related System, Requested Priority, and Current Status. Multiple filters combine
  with AND, and a filter combined with a search term also combines with AND.
- **BR-37** Default sort is Ticket Date descending, with Ticket `id` descending as the deterministic secondary
  sort, so equal timestamps never produce an unstable page order.
- **BR-38** Page numbering is 1-based. Default page size is 10; permitted page sizes are 10, 20, and 50.
- **BR-39** Invalid query parameters (unknown sort field, non-permitted page size, non-numeric page, unknown enum
  value) return `400 INVALID_QUERY_PARAMETER` naming the offending parameter. They are never silently ignored or
  coerced.
- **BR-40** A page number beyond the last page returns `200` with an empty `data` array and correct metadata,
  which the UI presents as the no-results state.
- **BR-41** Changing the search term, any filter, or the page size resets the current page to 1.

### Empty, no-results, and Ticket Detail access

- **BR-42** The empty state (the Requester owns zero Tickets) and the no-results state (search or filters matched
  nothing) are different states with different messages and different primary actions, and must not be collapsed
  into one.
- **BR-43** Ticket Detail is reachable by direct URL. A direct URL for a Ticket that does not exist, or that
  belongs to another Requester, produces the identical safe not-found state (BR-13).
- **BR-44** Ticket Detail is read-only for Ticket data. No control on that screen may change status, priority,
  category, related system, summary, or description in Lab 2.

### Reference data and seeding

- **BR-45** Only active Categories and active Related Systems are offered when creating a Ticket. An existing
  Ticket keeps its historical reference even if that reference is later deactivated, and Ticket Detail still
  displays it.
- **BR-46** The seed is idempotent: running it repeatedly must not create duplicates or change existing
  identifiers. It seeds the four required Categories, at least six Related Systems, at least four active
  Development Requesters, and at least one inactive Development Requester.
- **BR-47** The inactive Development Requester must never appear in the selector, and any request made with that
  identifier is rejected (BR-11). It exists specifically so that the inactive path can be tested.

### Transition to real authentication in Lab 3

- **BR-48** The requester context is confined to one client module and one backend middleware, so Lab 3 can
  replace the `X-Requester-Id` header with an authenticated identity without touching route handlers, queries, or
  ownership logic.
- **BR-49** The `RequesterUser` model carries no credential fields in Lab 2. Lab 3 extends it (for example with a
  password hash and a role) rather than replacing it, so `Ticket.requesterId` and the Attachment references stay
  valid.
- **BR-50** Nothing in Lab 2 may be named, documented, or presented as authentication, authorization, session, or
  login (BR-08). Screen copy states explicitly that authentication arrives in Lab 3.

---

## 6. UI Specification Summary

Full tokens, component anatomy, and the visual checklist live in [ui-spec.md](ui-spec.md). This section is the
binding summary.

### 6.1 Zen Green tokens

| Token | Value | Use |
|---|---|---|
| `--zen-primary` | `#006B3C` | App header, primary actions, strong emphasis |
| `--zen-secondary` | `#0B7A46` | Active tabs, focus accents, links, hover states |
| `--zen-pale` | `#EAF6EF` | Selected rows, success surfaces, subtle section emphasis |
| `--zen-page-bg` | `#F5F7F6` | Page background |
| `--zen-surface` | `#FFFFFF` | Cards and panels, subtle border, restrained shadow |
| `--zen-text` | `#1C2B24` | Dark charcoal-green body text, not pure black |
| `--zen-field-bg` | `#FFFFFF` | Editable input background with a clear neutral border |
| `--zen-readonly-bg` | `#EEF2EF` | Read-only and system-generated field shading |
| `--zen-error` | `#B3261E` | Error text and border; message appears immediately below the field |
| `--zen-warning` | `#B26A00` | Warning callout or badge only — never ordinary decoration |
| `--zen-success` | `#0B7A46` | Success confirmation, always paired with text or an icon |

Tokens are declared once as CSS custom properties and mapped onto Bootstrap 5 variables. No component may
hard-code a colour value.

### 6.2 Screens and required states

| Screen | Route | Required states |
|---|---|---|
| Development Requester Selection | `/select-requester` | loading, loaded, empty (no active Requesters), API failure, submitting |
| Application shell | all app routes | app identity, My Tickets and Create Ticket navigation, active-page indication, current Requester name, Change Requester, responsive mobile navigation |
| Create Ticket | `/tickets/new` | initial, reference-data loading, reference-data failure, validation failure, submitting (busy), success with Ticket Number, submission failure with values preserved, invalid-attachment |
| My Tickets | `/tickets` | loading, loaded, empty, no-results, failure, page-changing |
| Ticket Detail (view mode) | `/tickets/:id` | loading, loaded, not-found / no-access, failure, attachment uploading, attachment invalid, attachment removing, removed-attachment display |

### 6.3 Component rules (binding)

- Labels sit above controls with consistent font weight and spacing. Required fields carry a red asterisk **and**
  `aria-required`; the asterisk never replaces the validation message.
- All single-line inputs share one height. Description is taller and resizable only within its own column so
  resizing cannot break the layout.
- Buttons always carry visible text; icons may support but never replace it. Every icon-only control has an
  accessible name and a tooltip.
- Button hierarchy: primary (solid `--zen-primary`), secondary (outline), tertiary (link), destructive (red
  outline, used for attachment removal), disabled (visually distinct and non-activatable), busy (spinner plus
  label, disabled).
- The Submit button shows a busy state and is disabled while the request is in flight (BR-19).
- Validation messages appear immediately below their field in `--zen-error`; a summary region with `role="alert"`
  additionally announces the failure count. A single top-of-page error is not sufficient.
- Read-only and system-generated fields (Ticket Number, Ticket Date, Requester, Current Status) use
  `--zen-readonly-bg`, are clearly distinct from editable fields, and remain readable.
- Badges: Requested Priority (`LOW` neutral, `MEDIUM` pale green, `HIGH` amber, `URGENT` red) and Current Status
  (`NEW` primary green). Every badge conveys meaning through text as well as colour.
- The success state after creation prominently displays the official Ticket Number and the next actions.
- Focus indicators stay visible for keyboard users everywhere; `outline: none` without a replacement is
  forbidden.

### 6.4 List, attachment, and responsive behaviour

- Desktop (≥ 992 px): multi-column form layout, content centred with a sensible maximum width, My Tickets as a
  table with columns Ticket Number, Summary, Category, Related System, Requested Priority, Current Status, Ticket
  Date, Last Updated.
- Tablet (768–991 px): two-column layout where practical; Summary and Description keep full width.
- Mobile (< 768 px): fields stack vertically; My Tickets renders as cards showing Ticket Number, Summary,
  Priority and Status badges, Category, and Ticket Date; touch targets stay ≥ 44 px; no horizontal page scroll.
- At every size: no clipped labels, no overlapping messages, no hidden buttons, and no unreadable attachment
  names (long names truncate with an ellipsis and expose the full name through `title`).
- Attachment states are visually distinct: selected-but-not-uploaded, uploading, active, invalid (with reason),
  removed (metadata only, no download or preview control).
- Search, filters, sort, Clear filters, and pagination stay reachable and usable at all viewports; filters
  collapse into a disclosure panel on mobile.

---

## 7. Data Changes

PostgreSQL through Prisma. Every change ships as a versioned Prisma migration; no manual SQL against the
database.

### 7.1 Enums

```prisma
enum RequestedPriority { LOW MEDIUM HIGH URGENT }
enum TicketStatus      { NEW }
```

`TicketStatus` intentionally contains only `NEW` in Lab 2 (BR-02, X-04). Later labs extend the enum by migration;
modelling unused states now would invite untested transitions.

### 7.2 Models

| Model | Field | Type | Notes |
|---|---|---|---|
| `RequesterUser` | `id` | `Int` | PK, autoincrement |
| | `fullName` | `String` | Required |
| | `email` | `String` | **Unique**; natural key used by the idempotent seed |
| | `department` | `String` | Required; disambiguates Requesters in the selector |
| | `isActive` | `Boolean` | Default `true`; drives selector visibility (BR-09) |
| | `createdAt` / `updatedAt` | `DateTime` | `@default(now())` / `@updatedAt` |
| `Category` | `id`, `name`, `createdAt` | — | Existing Lab 1 model, unchanged |
| | `isActive` | `Boolean` | **New**, default `true` (BR-45) |
| `RelatedSystem` | `id` | `Int` | PK, autoincrement |
| | `name` | `String` | **Unique**; seed natural key |
| | `isActive` | `Boolean` | Default `true` |
| | `createdAt` | `DateTime` | `@default(now())` |
| `Ticket` | `id` | `Int` | PK, autoincrement |
| | `ticketNumber` | `String` | **Unique**, `TKT-YYYY-NNNNNN` (BR-03) |
| | `requesterId` | `Int` | FK → `RequesterUser.id`, `onDelete: Restrict` |
| | `categoryId` | `Int` | FK → `Category.id`, `onDelete: Restrict` |
| | `relatedSystemId` | `Int` | FK → `RelatedSystem.id`, `onDelete: Restrict` |
| | `summary` | `String` | `@db.VarChar(120)` |
| | `description` | `String` | `@db.Text` |
| | `requestedPriority` | `RequestedPriority` | Required |
| | `status` | `TicketStatus` | Default `NEW` |
| | `createdAt` / `updatedAt` | `DateTime` | Ticket Date / Last Updated |
| `Attachment` | `id` | `Int` | PK, autoincrement |
| | `ticketId` | `Int` | FK → `Ticket.id`, `onDelete: Cascade` |
| | `originalFilename` | `String` | Display metadata only, never used as a path (BR-27) |
| | `storedFilename` | `String` | **Unique**; server-generated UUID plus extension |
| | `mimeType` | `String` | Server-validated value, not the client header |
| | `sizeBytes` | `Int` | ≤ 5 MB (BR-24) |
| | `uploadedById` | `Int` | FK → `RequesterUser.id` |
| | `uploadedAt` | `DateTime` | `@default(now())` |
| | `removedAt` | `DateTime?` | `null` means active (BR-30) |
| | `removalReason` | `String?` | Required whenever `removedAt` is set (BR-17) |
| | `removedById` | `Int?` | FK → `RequesterUser.id` |
| `TicketNumberCounter` | `year` | `Int` | PK; one row per year |
| | `lastValue` | `Int` | Last issued sequence number (BR-03) |

### 7.3 Relationships

- `RequesterUser 1 — n Ticket` through `Ticket.requesterId`.
- `Ticket 1 — n Attachment` through `Attachment.ticketId`, cascading so no orphan attachment row can exist.
- `Category 1 — n Ticket` and `RelatedSystem 1 — n Ticket`.
- `RequesterUser 1 — n Attachment` **twice**, as `uploadedBy` and `removedBy`. These are the additional
  relationships required to record upload and removal metadata (BR-26); both are named relations in Prisma so the
  two back-references stay distinct.

### 7.4 Indexes and constraints

| Object | Reason |
|---|---|
| `Ticket.ticketNumber` unique | BR-01, and the fastest lookup path for a searched ticket number |
| `Ticket @@index([requesterId, createdAt])` | Every My Tickets query filters by requester and sorts by creation date — the hottest access path |
| `Ticket @@index([requesterId, categoryId])`, `@@index([requesterId, relatedSystemId])`, `@@index([requesterId, requestedPriority])` | Supports the documented filters without a full scan per filter combination |
| `Attachment @@index([ticketId, removedAt])` | Serves the active-attachment count (BR-25) and the detail attachment list |
| `Attachment.storedFilename` unique | Guarantees exactly one row per stored file |
| `RequesterUser.email`, `Category.name`, `RelatedSystem.name` unique | Natural keys that make the seed idempotent (BR-46) |
| `Restrict` FKs on reference data, `Cascade` on `Ticket → Attachment` | Reference data can never be deleted out from under a Ticket; attachments never outlive their Ticket |

**Justified design decision — soft removal as `removedAt DateTime?` rather than `isRemoved Boolean`.** A nullable
timestamp encodes *whether* and *when* in a single column, which removes any possibility of the two disagreeing
(`isRemoved = true` with no timestamp), makes "active" a single `removedAt IS NULL` predicate that the composite
index serves directly, and satisfies the audit requirement (BR-26) for free. `removalReason` and `removedById` are
nullable for the same reason and are enforced together in the service layer: all three columns are written in one
update, never separately.

**Second decision — a counter table instead of a native PostgreSQL sequence for Ticket Numbers.** A sequence
cannot be reset per year without DDL, and DDL in a request path is unacceptable. A one-row-per-year counter table
updated with a single atomic statement —
`INSERT INTO "TicketNumberCounter" ("year","lastValue") VALUES ($1, 1) ON CONFLICT ("year") DO UPDATE SET "lastValue" = "TicketNumberCounter"."lastValue" + 1 RETURNING "lastValue"` —
is race-free under concurrency, needs no application-level lock, and rolls over to `000001` on 1 January by
inserting a new row. Gaps from rolled-back transactions are accepted (BR-03).

### 7.5 Migration and seed decisions

- Two migrations. First `add_related_system_and_category_active` (new `RelatedSystem` table plus
  `Category.isActive`), then `add_requester_ticket_attachment` (enums, `RequesterUser`, `Ticket`, `Attachment`,
  `TicketNumberCounter`, indexes). Splitting them keeps the reference-data change reviewable on its own and lets
  the Related System seed land before ticket work depends on it.
- `Category.isActive` is added with `DEFAULT true` so the four existing Lab 1 rows survive the migration
  unchanged.
- The seed extends the existing idempotent `upsert` pattern: Categories by `name`, Related Systems by `name`,
  Requesters by `email`. Seeded Related Systems: Email, Campus Wi-Fi, VPN, LEB2 App, Grade Submission App, Printer,
  Corporate Laptop (seven). Seeded Requesters: four or more active plus at least one clearly inactive (BR-46,
  BR-47). The seed never creates Tickets or Attachments.
- `server/uploads/` is created at startup when missing, is git-ignored, and holds a committed `.gitkeep`.

---

## 8. API Contract

Complete request and response shapes, every error case, and examples live in [api-spec.md](api-spec.md). This
section is the binding summary.

### 8.1 Conventions

- Base path `/api`. JSON in and out, except attachment upload (`multipart/form-data`) and download (binary).
- Requester context travels in the header `X-Requester-Id: <int>` on every requester-scoped route and is resolved
  by one middleware (BR-48). It is a simulated testing context, not authentication (BR-08).
- Error envelope for every non-2xx response:
  `{ "error": { "code": "STRING_CODE", "message": "safe human message", "fields": [{ "field": "summary", "message": "..." }] } }`
  where `fields` appears only for validation failures. The Lab 1 endpoints migrate to this envelope so the client
  has exactly one error shape.
- Timestamps are ISO-8601 UTC in the API; the client renders them in `Asia/Bangkok`.

### 8.2 Endpoints

| # | Method and path | Purpose | Success | Main failures |
|---|---|---|---|---|
| 1 | `GET /api/health` | Liveness (Lab 1) | `200` | `500` |
| 2 | `GET /api/categories` | Active Categories | `200` array | `500` |
| 3 | `GET /api/related-systems` | Active Related Systems | `200` array | `500` |
| 4 | `GET /api/requesters` | Active Development Requesters | `200` array, never includes inactive | `500` |
| 5 | `POST /api/tickets` | Create one validated Ticket for the context Requester | `201` with the full Ticket including `ticketNumber` | `400` validation, `400`/`403` requester context, `409` duplicate, `500` |
| 6 | `GET /api/tickets` | Owned, searched, filtered, sorted, paginated list | `200` `{ data, meta }` | `400` invalid query, `400`/`403` context, `500` |
| 7 | `GET /api/tickets/:id` | One owned Ticket with its attachment metadata | `200` | `404` unknown or not owned, `400`/`403` context, `500` |
| 8 | `POST /api/tickets/:id/attachments` | Upload one permitted file to an owned Ticket | `201` attachment metadata | `400` no file, `404` not owned, `409` limit reached, `413` too large, `415` bad type, `500` |
| 9 | `GET /api/tickets/:id/attachments` | Attachment metadata for an owned Ticket, active and removed | `200` array | `404`, `400`/`403`, `500` |
| 10 | `GET /api/attachments/:id/download` | Download one active owned attachment | `200` binary with `Content-Disposition` | `404` unknown or not owned, `410` removed, `500` |
| 11 | `DELETE /api/attachments/:id` | Soft-remove one active owned attachment; body `{ "removalReason": "..." }` | `200` updated metadata | `400` missing or short reason, `404` not owned, `409` already removed, `500` |

### 8.3 Ticket-list query contract

`GET /api/tickets?search=&categoryId=&relatedSystemId=&requestedPriority=&status=&sortBy=&sortOrder=&page=&pageSize=`

| Parameter | Accepted values | Default |
|---|---|---|
| `search` | Free text, trimmed, matched case-insensitively against `ticketNumber`, `summary`, `description` | none |
| `categoryId`, `relatedSystemId` | Positive integer that exists | none |
| `requestedPriority` | `LOW` \| `MEDIUM` \| `HIGH` \| `URGENT` | none |
| `status` | `NEW` | none |
| `sortBy` | `createdAt` \| `updatedAt` \| `ticketNumber` \| `requestedPriority` | `createdAt` |
| `sortOrder` | `asc` \| `desc` | `desc` |
| `page` | Integer ≥ 1 | `1` |
| `pageSize` | `10` \| `20` \| `50` | `10` |

Response body:
`{ "data": [ /* tickets */ ], "meta": { "page", "pageSize", "totalItems", "totalPages", "sortBy", "sortOrder" } }`

Anything outside these values returns `400 INVALID_QUERY_PARAMETER` naming the parameter (BR-39); a page past the
end returns `200` with `data: []` (BR-40).

### 8.4 HTTP status policy

| Status | Used for |
|---|---|
| `200` | Successful retrieval, download, and soft removal |
| `201` | Ticket created, attachment uploaded |
| `400` | Validation failure, invalid query parameter, missing or malformed `X-Requester-Id`, missing file |
| `403` | `X-Requester-Id` refers to an unknown or inactive Requester (`REQUESTER_CONTEXT_INVALID`) |
| `404` | Ticket or Attachment unknown **or owned by another Requester** — deliberately indistinguishable (BR-13) |
| `409` | Duplicate submission, attachment limit reached, attachment already removed |
| `410` | Download of a soft-removed attachment (BR-32) |
| `413` | File larger than 5 MB |
| `415` | File type outside the allowlist |
| `500` | Unexpected server error, safe message only (BR-22) |

`401` is deliberately **not** used: Lab 2 has no authentication, and returning `401` would misrepresent the
Development Requester selector as an authentication mechanism (BR-08, BR-50). Lab 3 introduces `401` and a real
`403` with authenticated identities.

---

## 9. Acceptance Criteria

Every criterion maps to at least one planned test in [tests.md](tests.md).

### Development Requester context

- **AC-01** Given the database contains active and inactive seeded Requesters, when the Development Requester
  Selection screen loads, then only active Requesters appear in the dropdown and the inactive one is absent.
- **AC-02** Given no Development Requester is selected, when the user attempts to open My Tickets, Create Ticket,
  or a Ticket Detail URL, then the Requester Selection screen is shown instead.
- **AC-03** Given a Requester is selected and Continue is pressed, when the application shell renders, then the
  selected Requester's name is displayed and a Change Requester action is available.
- **AC-04** Given Requester A is selected with an active search and filter on My Tickets, when the user switches
  to Requester B, then the list reloads for Requester B, Requester A's tickets are no longer visible, and the
  list returns to page 1.
- **AC-05** Given the requesters endpoint fails, when the selection screen loads, then a safe error state with a
  retry action is shown and no requester context is stored.
- **AC-06** Given no active Requesters exist, when the selection screen loads, then a distinct empty state is
  shown and Continue is disabled.
- **AC-07** Given a stored Requester identifier that is unknown or inactive, when any requester-scoped request is
  made, then the API responds `403 REQUESTER_CONTEXT_INVALID`, the client clears the stored value, and the user
  is returned to the selection screen.

### Create Ticket

- **AC-08** Given valid Ticket data, when the Requester submits the form, then one Ticket is saved and the
  official Ticket Number generated by the backend is displayed in the success state.
- **AC-09** Given a created Ticket, when its row is inspected in the database, then `requesterId` matches the
  selected Development Requester, `status` is `NEW`, and `ticketNumber` matches `TKT-YYYY-NNNNNN`.
- **AC-10** Given the Create Ticket screen opens, when reference data loads, then Category and Related System
  options come from the database and contain only active entries.
- **AC-11** Given an empty Summary, when the Requester submits, then a field-level message appears below Summary,
  focus moves to it, and no create request is sent.
- **AC-12** Given a Summary of 9 characters or a Description of 19 characters, when the Requester submits, then a
  boundary validation message is shown; at 10 and 20 characters respectively the submission is accepted.
- **AC-13** Given client validation is bypassed, when an invalid payload is posted directly to `POST /api/tickets`,
  then the API responds `400` with a `fields` array and creates nothing.
- **AC-14** Given a submission is in flight, when the Requester presses Submit again, then the button is disabled
  and shows a busy state, and only one Ticket is created.
- **AC-15** Given the same Requester posts an identical Summary and Description within 60 seconds, when the second
  request is processed, then the API responds `409 DUPLICATE_SUBMISSION` and only one Ticket exists.
- **AC-16** Given the backend is unavailable, when the Requester submits, then a safe error state appears, all
  entered values and staged attachments are preserved, and a retry succeeds once the backend returns.
- **AC-17** Given a payload containing a `requesterId` that differs from the header context, when the Ticket is
  created, then the stored Ticket belongs to the header context Requester (BR-05).

### Attachments

- **AC-18** Given a 1 MB PNG is staged on Create Ticket, when the Ticket is created, then the file is uploaded to
  the new Ticket and appears as an active attachment on Ticket Detail.
- **AC-19** Given a `.exe` or any other non-permitted type is selected, when the Requester tries to upload it,
  then it is rejected with a specific message and the API responds `415`.
- **AC-20** Given a 6 MB PDF, when the Requester uploads it, then the API responds `413`, no file remains on
  disk, and no row is created.
- **AC-21** Given a Ticket already has five active attachments, when a sixth is uploaded, then the API responds
  `409 ATTACHMENT_LIMIT_REACHED` and the UI explains the limit.
- **AC-22** Given a Ticket has five attachments of which one is removed, when a new file is uploaded, then it
  succeeds, because removed attachments do not count toward the limit.
- **AC-23** Given a Ticket was created successfully but its attachment upload failed, when the result is shown,
  then the Ticket still exists with its Ticket Number, the failed file is reported individually, and a retry is
  offered from Ticket Detail.
- **AC-24** Given an active attachment on an owned Ticket, when the Requester downloads it, then the response is
  `200` with the original filename in `Content-Disposition` and the correct content type.
- **AC-25** Given an active attachment, when the Requester removes it with a reason, then a confirmation is
  required, the API responds `200`, `removedAt`, `removalReason`, and `removedById` are set, and the row is still
  present in the database.
- **AC-26** Given a removed attachment, when its download URL is requested directly, then the API responds `410`,
  no file content is returned, and the UI shows no preview or download control for it.
- **AC-27** Given a removed attachment, when Ticket Detail is opened, then its metadata is still listed with a
  Removed marker, the removal reason, and the removal timestamp.
- **AC-28** Given a removal request with no reason or a reason shorter than 5 characters, when it is sent, then
  the API responds `400` and the attachment stays active.
- **AC-29** Given an already-removed attachment, when removal is requested again, then the API responds
  `409 ALREADY_REMOVED`.
- **AC-30** Given an uploaded file, when its stored name is inspected, then it is a server-generated UUID with a
  normalised extension, the original filename is preserved only as metadata, and a filename containing `../`
  cannot escape the upload directory.

### My Tickets

- **AC-31** Given Requester A owns tickets and Requester B owns different tickets, when Requester A opens My
  Tickets, then only Requester A's tickets are returned by the API.
- **AC-32** Given a Requester with no tickets, when My Tickets loads, then the empty state with a Create Ticket
  action is shown, not the no-results state.
- **AC-33** Given a search term matching no ticket, when the list reloads, then the no-results state with a Clear
  filters action is shown, and clearing it restores the full list.
- **AC-34** Given a search term matching a Ticket Number, Summary, or Description fragment in any letter case,
  when the search runs, then the matching tickets are returned.
- **AC-35** Given a Category filter combined with a Priority filter, when the list loads, then only tickets
  matching both are returned.
- **AC-36** Given 12 owned tickets and the default page size, when My Tickets loads, then 10 tickets are returned
  with `totalItems: 12` and `totalPages: 2`, and page 2 returns the remaining 2.
- **AC-37** Given a sort by Ticket Date ascending, when the list loads, then the oldest ticket appears first and
  the order is stable across repeated requests.
- **AC-38** Given the user is on page 2, when a filter or the page size changes, then the list returns to page 1.
- **AC-39** Given `pageSize=999`, `page=abc`, or `sortBy=secret`, when the request is made, then the API responds
  `400 INVALID_QUERY_PARAMETER` naming the parameter.
- **AC-40** Given the ticket-list request fails, when My Tickets renders, then a safe failure state with a retry
  action is shown and no stale list is displayed as if it were current.

### Ticket Detail and ownership

- **AC-41** Given Requester B is selected, when a Ticket belonging to Requester A is requested by id, then the
  Ticket data is not returned and the API responds `404`.
- **AC-42** Given Requester B is selected, when an attachment belonging to Requester A is downloaded or removed by
  id, then the API responds `404` and nothing is modified.
- **AC-43** Given an owned Ticket, when Ticket Detail opens, then Ticket Number, Ticket Date, Requester, Category,
  Related System, Requested Priority, Current Status, Summary, and Description are displayed read-only, with no
  control able to modify them.
- **AC-44** Given a Ticket id that does not exist, when Ticket Detail is opened by direct URL, then the same safe
  not-found state is shown as for a Ticket owned by someone else.

### UI, responsive, and accessibility

- **AC-45** Given any of the three main screens at 1280×800, 820×1180, and 375×812, when rendered, then there is
  no horizontal page scrolling, no clipped label, no overlapping message, and no hidden primary action.
- **AC-46** Given the Create Ticket screen, when it is inspected, then read-only fields are visually distinct from
  editable fields, required fields show a red asterisk, and every colour resolves to a Zen Green token.
- **AC-47** Given a keyboard-only user, when they tab through the selection screen and the Create Ticket form,
  then every control is reachable, focus is always visible, and the form can be submitted without a mouse.
- **AC-48** Given priority and status values, when badges render, then each badge carries text as well as colour
  and uses the documented colour for its value.
- **AC-49** Given a long attachment filename, when it renders on mobile, then it truncates without breaking the
  layout and the full name remains available through `title`.
- **AC-50** Given the Development Requester Selection screen, when it renders, then visible text states that it is
  a Lab 2 testing mechanism and that authentication arrives in Lab 3.

---

## 10. Definition of Done

### 10.1 Part 1 — Product Definition of Done

The AI coding agent may report completion only when **every** box below is true.

**Scope and behaviour**
- [ ] FR-01 – FR-33 are implemented, and nothing from the Excluded table (X-01 – X-07) exists in the code.
- [ ] BR-01 – BR-50 are implemented and demonstrable, including the failure and boundary rules.
- [ ] AC-01 – AC-50 pass by observation and by automated test.

**Tests**
- [ ] Tests exist at every required level: unit, API/integration, UI component, UI style, responsive, and E2E.
- [ ] Every Acceptance Criterion maps to at least one test in `tests.md`, and every planned test names its real
      file path.
- [ ] All tests pass from the documented commands on the final `main` branch.
- [ ] No test is skipped, disabled, marked `.only`, or commented out, and no test asserts nothing.
- [ ] Failure paths are covered, not only happy paths: validation, ownership `404`, `409`, `410`, `413`, `415`,
      backend-down, and empty/no-results states.

**Data**
- [ ] The Prisma schema matches Section 7, and migrations apply cleanly to an empty database.
- [ ] `npx prisma db seed` runs twice with no duplicates and no identifier churn.
- [ ] The inactive Requester exists and is excluded from both the selector and the API.
- [ ] Every documented index and unique constraint exists in the migration.

**API**
- [ ] Every endpoint in Section 8 exists with the documented method, path, statuses, and error envelope.
- [ ] Ownership is enforced inside the backend query for every requester-scoped route.
- [ ] No response leaks a stack trace, SQL, or a file-system path.

**UI**
- [ ] Zen Green tokens are defined once and used everywhere; no hard-coded colours remain.
- [ ] Every screen implements its full state set from Section 6.2.
- [ ] Desktop, tablet, and mobile screenshots exist under `artifacts/lab-02/screenshots/` for Create Ticket, My
      Tickets, and Ticket Detail.
- [ ] The `ui-spec.md` visual checklist is completed against those screenshots, not from memory.

**Documentation**
- [ ] `specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md`, `reviewer.md`, and `ai-use.md` are present and
      current.
- [ ] `README.md` setup, run, seed, and test instructions are current and verified from a clean clone.
- [ ] `.gitignore` excludes `.env` and `server/uploads/`; no secrets and no uploaded files are committed.
- [ ] Any deviation from this specification is recorded in Section 11 before merge, not discovered afterwards.

**Demonstration**
- [ ] The student can demonstrate live: creating a ticket, an invalid submission, an invalid attachment, a
      backend-down failure with values preserved, requester switching, a cross-requester `404`, a download, and a
      soft removal followed by a blocked download.

### 10.2 Part 2 — Course Delivery Requirements

- [ ] `lab2-staging` created from `main`; no direct commits to `main` or `lab2-staging`.
- [ ] Every Issue implemented on its own feature branch and merged into `lab2-staging` through a peer-reviewed
      Pull Request.
- [ ] One release Pull Request from `lab2-staging` to `main` after integration testing.
- [ ] The GitHub Project Kanban shows all Issues in Done.
- [ ] `reviewer.md` records reviewer identity, PR links, comments given and received, responses, and approvals.
- [ ] `ai-use.md` records the LLM used, 6–10 selected key prompts, and a brief reflection.
- [ ] A screenshot proves `specification.md` existed before the main implementation PRs were completed.
- [ ] The single submission PDF uses the headings "Answer Part 1" – "Answer Part 9" with working links and
      readable screenshots.

---

## 11. Assumptions and Decisions

| # | Assumption or decision | Rationale |
|---|---|---|
| A-01 | Requester context travels in an `X-Requester-Id` header and is stored in `localStorage` under `toktickit.requesterId` | A header keeps the identifier out of URLs and query strings and is the single point Lab 3 replaces with an authenticated identity (BR-48) |
| A-02 | Ownership failures return `404`, never `403` | Prevents confirming that another Requester's ticket exists |
| A-03 | Missing or malformed context is `400`, unknown or inactive context is `403`, and `401` is never used | `401` would imply authentication, which Lab 2 explicitly does not have |
| A-04 | Ticket creation is JSON-only; attachments upload separately, one request per file | Makes per-file success and failure reportable, avoids a multi-resource transaction, and satisfies the "Ticket created but attachment upload failed" requirement without discarding the Ticket (BR-29) |
| A-05 | Files are stored on the server's local disk under `server/uploads/<ticketId>/`, not in the database or object storage | Sufficient for the lab, keeps the database small, and no cloud dependency is in scope |
| A-06 | The files of soft-removed attachments are kept on disk, not deleted | Removal is defined as soft (BR-30); deleting the bytes would make it a hard delete in everything but name |
| A-07 | Search uses a case-insensitive `contains` rather than full-text search or a trigram index | Lab-scale data; a search index is unjustified complexity until it is measured to be needed |
| A-08 | Duplicate detection uses a 60-second identical-content window rather than an idempotency key | Requires no client-side key generation and defends against the real risk (double submit or retry) with one query |
| A-09 | `TicketStatus` contains only `NEW` | Later statuses are explicitly out of scope, and unused enum values invite untested transitions |
| A-10 | The Ticket Number year and all displayed timestamps use `Asia/Bangkok`; storage stays UTC | Single-campus product; a fixed display zone removes year-boundary ambiguity in the ticket number |
| A-11 | React Router is added to the client, and screens are real routes (`/select-requester`, `/tickets/new`, `/tickets`, `/tickets/:id`) | Ticket Detail must be reachable and testable by direct URL (BR-43, AC-44) |
| A-12 | Multer is added to the server for multipart parsing, with a hard 5 MB limit plus an in-code magic-byte check | Standard and minimal, and it enforces the size limit before the whole file is buffered |
| A-13 | Playwright is added for E2E tests and responsive screenshots | Required evidence for Parts 6–9 of the submission |
| A-14 | The Lab 1 error shape `{ "error": "text" }` migrates to the `{ "error": { code, message } }` envelope, and the Lab 1 test is updated with it | One error contract for the whole client; the alternative is maintaining two parsers forever |
| A-15 | Preview means an inline image preview for JPG/PNG/WEBP only; PDFs are download-only | Avoids embedding a PDF viewer, which was not requested |
| A-16 | The Requester's department is displayed in the selector | Seeded names can be ambiguous, and the department makes the active testing context obvious in screenshots |
| A-17 | Reference data (Category, Related System) is seed-managed with no administration UI | Administration functions are explicitly excluded (X-05) |
| A-18 | `GET /api/categories` keeps returning `[{ id, name }]`, now filtered to active rows | Preserves the Lab 1 UI contract while satisfying "retrieve active Categories" |

# Lab 3 UI Specification — Zen Green Theme, Sprint 3

Project: TokTickIT — IT Service Desk
Sprint: Lab 3 — Authentication, Roles, IT Staff Ticketing, and Administrator User Management
Status: Draft for student review and approval (must be approved before implementation begins)
Companion documents: [specification.md](specification.md), [api-spec.md](api-spec.md), [tests.md](tests.md)

This document is the authoritative visual and interaction contract for Sprint 3. It **extends** the Lab 2 UI
specification; every Lab 2 token, form convention, card, badge, button level, validation placement, responsive
rule, and accessibility expectation stays in force and is not restated here. Where this file and
`specification.md` disagree, `specification.md` wins and this file is corrected.

Implementation base is unchanged: React 19 + TypeScript + Vite + Bootstrap 5, with Zen Green applied by
overriding Bootstrap's CSS custom properties in one stylesheet. Lab 3 introduces **no new colour value** — every
new badge and surface is composed from the existing tokens.

---

## 1. Design foundations

### 1.1 Colour tokens

Unchanged from Lab 2 (`ui-spec.md` §1.1): `--zen-primary`, `--zen-secondary`, `--zen-pale`, `--zen-page-bg`,
`--zen-surface`, `--zen-text`, `--zen-field-bg`, `--zen-readonly-bg`, `--zen-error`, `--zen-warning`,
`--zen-success`. No component may hard-code a colour value, and Lab 3 adds none (AC-65).

### 1.2 Badge families

Four badge families now share one component. Every badge carries its meaning as text, not only as colour.

| Kind | Value | Background | Text | Extra non-colour signal |
|---|---|---|---|---|
| Role | `REQUESTER` | `--zen-readonly-bg` | `--zen-text` | Label reads "Requester" |
| Role | `IT_STAFF` | `--zen-pale` | `--zen-secondary` | Label reads "IT Staff" |
| Role | `ADMINISTRATOR` | `--zen-primary` | white | Label reads "Administrator" |
| Requested Priority | `LOW` / `MEDIUM` / `HIGH` / `URGENT` | Lab 2 palette, unchanged | Lab 2 | Always prefixed "Requested:" |
| IT Priority | `LOW` / `MEDIUM` / `HIGH` / `URGENT` | Same four Lab 2 colours | Lab 2 | Always prefixed "IT:" — the prefix is what distinguishes the two, so they remain distinguishable in a greyscale print and to a colour-blind reader (AC-68) |
| Status | `NEW` | `--zen-primary` | white | "New" |
| Status | `OPEN` | `--zen-secondary` | white | "Open" |
| Status | `IN_PROGRESS` | `--zen-surface`, `--zen-secondary` border | `--zen-secondary` | "In Progress" |
| Status | `WAITING_FOR_REQUESTER` | `--zen-warning` at 12 % | `--zen-warning` | "Waiting for Requester" |
| Status | `RESOLVED` | `--zen-pale` | `--zen-success` | "Resolved" with a check glyph |
| Status | `CLOSED` | `--zen-readonly-bg` | `--zen-text` | "Closed" |
| Status | `REOPENED` | `--zen-surface`, `--zen-warning` border | `--zen-warning` | "Reopened" |
| Status | `CANCELLED` | `--zen-readonly-bg` | `--zen-text` at 70 % | "Cancelled" |
| Flag | Requester resolution | `--zen-pale`, `--zen-success` border | `--zen-success` | "Requester says resolved" |
| Account | Active / Inactive | `--zen-pale` / `--zen-readonly-bg` | `--zen-success` / `--zen-text` | "Active" / "Inactive" |

Eight statuses is a lot of colour for one table. The rule that keeps the Queue readable is that **status colour
is secondary**: the status column is a text label with a subtle background, while IT Priority is the strongly
coloured element, because priority is what the reader is scanning for (§7.1).

### 1.3 Typography and spacing

Unchanged from Lab 2 §1.2 and §1.3.

---

## 2. Component rules

Lab 2 §2 remains in force. Lab 3 adds five rules.

### 2.1 Password fields

| Rule | Definition |
|---|---|
| Input type | `type="password"` with `autocomplete="current-password"` on Login and on the current-password field, `autocomplete="new-password"` on both new-password fields |
| Reveal control | Each password field carries a "Show password" toggle button with an accessible name that updates to "Hide password"; toggling switches `type` and never re-renders the field, so the caret position survives |
| Manager support | The Login form is a real `<form>` with a labelled email field and a submit button, so browser and password-manager autofill work without a workaround |
| Never echoed | A password value is never written to a query string, a log, a `title`, or a `value` attribute in server-rendered markup, and is cleared from component state on unmount |
| Rules text | Password rules are shown **before** the user types, not only after a failure (§5.2) |

### 2.2 Role-aware navigation

| Rule | Definition |
|---|---|
| Source of truth | Navigation is derived from the authenticated user's role, held in one client context populated by `GET /api/auth/me` (A-18) |
| Destinations | Requester: My Tickets, Create Ticket. IT Staff: Ticket Queue. Administrator: Ticket Queue, User Management |
| Never rendered | A destination a role may not open is not rendered at all — not rendered disabled, not rendered hidden by CSS (FR-11) |
| Not a control | Hiding is feedback. The backend refuses the operation regardless, and the authorization tests prove it against the API, not against the absent link (BR-23, AC-17) |

### 2.3 Message composers

| Rule | Definition |
|---|---|
| Persistent visibility label | Every composer carries a non-dismissible label immediately above the text area: "Public — the Requester will see this." or "Internal — not visible to the Requester." |
| Colour pairing | The Internal composer and its list sit inside a panel with a `--zen-warning` border and heading; the Public composer and its list sit on `--zen-surface` with the standard border |
| Character counter | A live counter appears from 1800 characters onward and turns `--zen-error` past 2000, matching the server bound (BR-44) |
| Submit state | The post button is disabled while empty or whitespace-only, and shows the Lab 2 busy state while the request is in flight |
| Never rendered | A composer is not rendered for a role that may not post to it (BR-24) |
| Escaping | Bodies render as text with `white-space: pre-wrap`; no Markdown, no HTML, no `dangerouslySetInnerHTML` anywhere (BR-45) |

### 2.4 Confirmation dialogs

The Lab 2 `ConfirmDialog` component is reused unchanged for three new cases: a status transition to `RESOLVED`,
`CLOSED`, or `CANCELLED` (BR-37); the "Problem Appears Resolved" action; and deactivating a user. Each dialog
names the specific object and the specific change ("Close ticket TKT-2026-000041?"), keeps the destructive
action on the right, and returns focus to the trigger on cancel.

### 2.5 Forbidden state

A new shared state, rendered whenever the API answers `403 FORBIDDEN` or a route guard blocks a role:

| Rule | Definition |
|---|---|
| Presentation | A centred `Callout` in the Lab 2 warning style, heading "You do not have access to this page." |
| Body | "Your account has the {Role} role, which cannot open this screen." — states the fact without naming what the screen contains |
| Action | One primary button back to the role's own home route |
| Never | It never shows the requested resource's identifier, title, or count, and it is visually distinct from the Lab 2 not-found state so the two are not confused during review |

---

## 3. Application shell

The Lab 2 shell is revised. "Testing as" and Change Requester are gone.

| Element | Rule |
|---|---|
| Wordmark | Unchanged; links to the role's home route rather than always to `/tickets` |
| Navigation | Role-derived (§2.2), with the Lab 2 active-page indication and the Lab 2 mobile disclosure panel |
| Identity | "Signed in as **{Full Name}**" followed by the role badge (§1.2). The email address is not shown in the header — it adds a second identifier where the name already suffices |
| Change Password | A tertiary action in the identity cluster, opening `/change-password` for a voluntary change |
| Logout | A secondary action in the identity cluster, always visible at every viewport, never hidden behind a menu on mobile |
| Absent on | `/login` and `/change-password` render without the shell — there is no authenticated context to display on one, and no permitted destination on the other |

---

## 4. Screen — Login (`/login`)

Purpose: authenticate. This is the screen that replaces the Lab 2 Development Requester Selection screen, and
the Lab 2 "not a login screen" callout is deleted with it.

### 4.1 Layout

```
                    ┌────────────────────────────────────┐
                    │            TokTickIT               │   h1
                    │          Sign in                   │   h2
                    │                                    │
                    │  Email address *                   │   label
                    │  [                              ]  │   input, 42/44 px
                    │                                    │
                    │  Password *                        │   label
                    │  [                        ] [Show] │   input + reveal toggle
                    │                                    │
                    │  ⚠ Email or password is incorrect, │   error callout, role="alert"
                    │    or the account is not active.   │   (only after a failure)
                    │                                    │
                    │            [     Sign in     ]     │   primary, full width
                    └────────────────────────────────────┘
```

Centred card, `max-width: 420px`, vertically centred at ≥ 768 px, top-aligned with 24 px padding below 768 px.
No application shell on this route. There is no "forgot password" link, because password reset by email is out
of scope (X-01) — instead the card's footer reads "Lost your password? Ask your IT administrator to issue a new
one." so the user is not left guessing.

### 4.2 States

| State | Presentation |
|---|---|
| Initial | Both fields empty, Sign in enabled; focus starts in the email field |
| Client validation | A missing or malformed email, or an empty password, shows a message below that field; no request is sent |
| Submitting | Sign in shows "Signing in…" busy state and is disabled; both fields are read-only for the duration |
| Invalid credentials | One error callout with the single message from BR-01; the email value is preserved, the password field is cleared and refocused; nothing on screen distinguishes wrong password from unknown account from inactive account (AC-02) |
| Throttled | The same callout style with "Too many attempts. Please wait a few minutes and try again." Sign in stays enabled — the user may retry after the window and the client does not run a countdown it cannot trust |
| API failure | Error callout with **Try again**; the form keeps the email value |

### 4.3 Behaviour

- Submitting on `Enter` from either field submits the form natively.
- A successful sign-in with `mustChangePassword: false` navigates to the role's home route: `/tickets` for a
  Requester, `/staff/tickets` for IT Staff and Administrators.
- A successful sign-in with `mustChangePassword: true` navigates to `/change-password` and nowhere else
  (BR-17).
- Visiting `/login` while already authenticated redirects to the role's home route rather than offering a
  second sign-in.
- The password value is never placed in component state that outlives the submit, and never in a URL.

Traceability: FR-01, FR-02, FR-05, FR-06, BR-01, BR-08, AC-01, AC-02, AC-08.

---

## 5. Screen — Mandatory Change Password (`/change-password`)

Purpose: convert an Administrator-issued initial password into one only the user knows. The same screen serves
a voluntary change from the shell.

### 5.1 Layout

```
                    ┌──────────────────────────────────────────┐
                    │           Choose a new password          │   h1
                    │                                          │
                    │  ⓘ  Your account uses a password that    │   info callout
                    │     was issued to you. Choose a new one   │   (mandatory mode only)
                    │     to continue.                          │
                    │                                          │
                    │  Current password *                      │
                    │  [                            ] [Show]   │
                    │                                          │
                    │  New password *                          │
                    │  [                            ] [Show]   │
                    │  At least 10 characters. Must differ      │   helper, always visible
                    │  from your current password and from      │
                    │  your email address.                      │
                    │                                          │
                    │  Confirm new password *                  │
                    │  [                            ] [Show]   │
                    │                                          │
                    │      [ Save new password ]   [ Log out ] │   primary + tertiary
                    └──────────────────────────────────────────┘
```

Centred card, `max-width: 480px`. In mandatory mode the only other reachable action is **Log out** — there is
no Cancel, because there is nowhere to cancel to (BR-15). In voluntary mode the info callout is replaced by a
Back link to the role's home route.

### 5.2 Field specification

| Field | Control | Editable | Validation (BR-11) |
|---|---|---|---|
| Current password | `input type=password` + reveal | Yes | Required; verified server-side, reported below this field (api-spec §3.4) |
| New password | `input type=password` + reveal | Yes | Required; 10–128 characters; not whitespace-only; must differ from the current password; must not equal the email address or its local part |
| Confirm new password | `input type=password` + reveal | Yes | Required; must equal New password |

The rules are rendered as helper text under the New password field **before** the user types, not revealed only
by a failure.

### 5.3 States

| State | Presentation |
|---|---|
| Mandatory entry | Info callout visible; the shell is absent; every other route redirects here (BR-17) |
| Voluntary entry | Info callout replaced by a Back link; the shell is present |
| Validation failure | Per-field messages plus the Lab 2 summary region with `role="alert"` naming the failure count |
| Mismatch | "The two passwords do not match." below Confirm; focus moves there |
| Same as current | "Choose a password you have not used here before." below New password |
| Wrong current password | "Your current password is incorrect." below Current password; the two new-password fields keep their values |
| Submitting | Save shows a busy state and is disabled |
| Success | A brief success callout, then navigation to the role's home route. All three fields are cleared |
| API failure | Error callout with **Try again**; entered values are preserved except on success (BR-66) |

### 5.4 Behaviour

- On success the client re-reads the user from `GET /api/auth/me` rather than trusting a local flag, so the gate
  can never be lifted by client state alone.
- The user's other sessions are invalidated server-side (BR-06); the UI states this in the success callout —
  "You have been signed out on your other devices."
- Reloading the page in mandatory mode returns to this same screen (AC-10).

Traceability: FR-07 – FR-09, BR-06, BR-11, BR-14 – BR-17, AC-10, AC-12 – AC-14.

---

## 6. Screen — Requester Ticket Detail, extended (`/tickets/:id`)

Every Lab 2 element of this screen is unchanged: read-only ticket information, the attachment section with its
five states, the removal confirmation, and the safe not-found state. Lab 3 adds two blocks below them.

### 6.1 Layout additions

```
  ┌──────────────────────────────────────────────────────────┐
  │  Ticket information  (Lab 2, read-only)                  │
  ├──────────────────────────────────────────────────────────┤
  │  Attachments  (Lab 2)                                    │
  ├──────────────────────────────────────────────────────────┤
  │  Conversation                                    h2      │
  │                                                          │
  │  ┌────────────────────────────────────────────────────┐  │
  │  │ Nara Sukjai · Requester · 4 Sep 2026 09:21         │  │  comment card
  │  │ The VPN drops every ten minutes.                   │  │
  │  └────────────────────────────────────────────────────┘  │
  │  ┌────────────────────────────────────────────────────┐  │
  │  │ Ada Chaiyawat · IT Staff · 9 Sep 2026 15:02        │  │
  │  │ We have replaced your VPN profile. Please retry.   │  │
  │  └────────────────────────────────────────────────────┘  │
  │                                                          │
  │  Public — the Requester will see this.          label    │
  │  [                                              ]        │  textarea, 3 rows
  │  1842 / 2000                          [ Post comment ]   │  counter + primary
  ├──────────────────────────────────────────────────────────┤
  │  [ Problem appears resolved ]                            │  secondary
  │  IT Staff will confirm and close the ticket.    helper   │
  └──────────────────────────────────────────────────────────┘
```

The Requester sees **one** conversation list, because for them there is only one kind of message. No Internal
Notes panel is rendered, no placeholder for it exists, and no count of hidden messages appears anywhere
(BR-24, AC-47).

### 6.2 States

| State | Presentation |
|---|---|
| Comments loading | Three `Skeleton` comment cards; the composer is disabled |
| Comments empty | "No messages yet. Add a comment if you have more information." — the composer stays available |
| Posting | The post button shows the busy state; the text area is read-only for the duration |
| Post validation failure | Message below the text area; the entered text is preserved (BR-66) |
| Post failure | Error callout above the composer with **Try again**; the entered text is preserved |
| Appears-resolved available | The secondary button is shown with its helper text |
| Appears-resolved confirming | `ConfirmDialog`: "Tell IT that this problem appears resolved? They will confirm and close the ticket." |
| Already flagged | The button is replaced by the "Requester says resolved" badge and the date; a repeat is impossible from the UI and `409 ALREADY_FLAGGED` from the API (BR-46) |
| Status changed by IT | The status badge updates on the next load; the Requester never sees a status control (BR-34) |

Traceability: FR-17, FR-30, FR-32 – FR-34, BR-39 – BR-46, AC-45 – AC-47, AC-49, AC-50.

---

## 7. Screen — IT Staff Ticket Queue (`/staff/tickets`)

Purpose: answer "what should I work on next?" — not "show me everything".

### 7.1 Desktop layout (≥ 992 px)

```
  ┌───────────────────────────────────────────────────────────────────────────────────────┐
  │  Ticket Queue                                                                   h1    │
  │  24 open · 6 unassigned · 3 waiting for requester                       count summary │
  │                                                                                       │
  │  [ Search number, summary, requester    ]  [Status ▾] [IT Priority ▾] [Owner ▾] [More▾]│
  │                                                             [ Clear filters ]         │
  ├───────┬──────────┬────────────────────┬─────────┬────────┬──────────┬────────┬────────┤
  │Number │ Created  │ Summary            │Category │IT Prio │ Status   │ Owner  │Updated │
  ├───────┼──────────┼────────────────────┼─────────┼────────┼──────────┼────────┼────────┤
  │TKT-…41│ 4 Sep    │ VPN disconnects e… │ Network │[IT:URG]│[In Prog] │ Ada C. │ 2 h ago│
  │TKT-…38│ 3 Sep    │ Printer jams on f… │ Hardware│[IT:MED]│[New]     │ —      │ 1 d ago│
  │TKT-…35│ 1 Sep    │ Grade upload fail… │ Software│[IT:HIG]│[Waiting] │ Bee S. │ 3 d ago│
  │       │          │ ✔ Requester says resolved                                         │
  └───────┴──────────┴────────────────────┴─────────┴────────┴──────────┴────────┴────────┘
                                   [ ‹ Prev ]  Page 1 of 2  [ Next › ]     20 per page ▾
```

Eight columns, and the set is justified rather than maximal. **Ticket Number** and **Summary** identify the
work; **Created** and **Updated** show age and activity, which is how a queue is triaged; **IT Priority** is the
sort key and therefore must be visible; **Status** and **Owner** answer "is anyone on this?"; **Category**
supports the commonest routing decision. Requested Priority, Related System, Description, and the Requester's
email are deliberately **not** columns — they live on Ticket Detail, and adding them produces the unreadable
mega-grid the handout warns against. The Requester's name is reachable through search rather than through a
column, because it is a filter criterion more often than a scanning target.

The Requester-resolution flag renders as a full-width sub-row under its Ticket rather than as a ninth column,
so it costs no horizontal space on the rows that do not have it.

Row click and a keyboard `Enter` on the focused row both open `/staff/tickets/:id`; the Ticket Number is also a
real link, so middle-click and "open in new tab" work.

### 7.2 Tablet (768–991 px)

Columns reduce to Number, Summary, IT Priority, Status, Owner. Created and Updated merge into one "Updated"
column, and Category moves under the Summary as secondary text.

### 7.3 Mobile (< 768 px)

```
  ┌──────────────────────────────────────────┐
  │ TKT-2026-000041            [IT: URGENT]  │
  │ VPN disconnects every few minutes        │
  │ [In Progress]  Network                   │
  │ Owner: Ada C.  ·  Updated 2 h ago        │
  │ ✔ Requester says resolved                │
  └──────────────────────────────────────────┘
```

Cards, full width, ≥ 44 px touch target on the whole card. Filters collapse into one "Filters" disclosure
button showing the active-filter count; the search field stays visible above it.

### 7.4 Controls

| Control | Definition |
|---|---|
| Search | One text input, debounced 300 ms, searching number, summary, and requester name (BR-59). Clearing it restores the unsearched list |
| Status filter | A multi-select disclosure listing all eight statuses with checkboxes, plus a one-click "Open work" preset selecting `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED`. This is the only multi-value filter (BR-60) |
| IT Priority filter | Single-select dropdown, four values plus "Any" |
| Owner filter | Single-select dropdown: "Any", "Unassigned", "Assigned to me", then each active staff member |
| More filters | A disclosure holding Requested Priority, Category, Related System, and a "Requester says resolved" checkbox — the four used least often, kept out of the primary row |
| Clear filters | Resets search, every filter, and the page to 1; shown only when at least one is active |
| Sort | Clicking a sortable column header cycles ascending → descending; the active column shows a direction glyph and `aria-sort` |
| Pagination | The Lab 2 `Pagination` component, page size 10 / 20 / 50, default 20 (BR-62) |
| Count summary | Three plain counts under the heading. This is the only analytics in Lab 3 (X-06) |

Changing the search term, any filter, or the page size resets the page to 1.

### 7.5 States

| State | Presentation |
|---|---|
| Loading | Six skeleton rows on desktop, three skeleton cards on mobile; filters remain usable |
| Loaded | Rows or cards as above |
| Empty | No Tickets exist at all: "No tickets have been created yet." with no Clear filters action |
| No results | Filters or search matched nothing: "No tickets match these filters." with a **Clear filters** primary action — a different message and a different action from Empty |
| Page beyond the end | Rendered as No results, since the API returns `200` with an empty array (BR-62) |
| Invalid query rejected | The offending control resets to its default and a warning callout names the parameter; the list reloads with valid values (BR-63) |
| Forbidden | The shared forbidden state (§2.5) — reached only by a Requester typing the URL, since the link is not rendered for them |
| Failure | Error callout with **Try again**; no stale list is displayed as though it were current |
| Page changing | The table dims with `aria-busy="true"` while the next page loads; the previous page stays visible rather than collapsing to a skeleton |

Traceability: FR-18 – FR-23, BR-59 – BR-63, AC-17, AC-19, AC-28 – AC-35, AC-64, AC-68.

---

## 8. Screen — IT Staff Ticket Detail (`/staff/tickets/:id`)

Extends the Lab 2 Ticket screen. Ticket information stays grouped and read-only; only operational fields are
editable (FR-29).

### 8.1 Desktop layout (≥ 992 px)

```
  ┌───────────────────────────────────────────────┬───────────────────────────────────┐
  │  TKT-2026-000041                       h1     │  Operations                 h2    │
  │  [In Progress]  [IT: URGENT]  [Requested:HIGH]│                                   │
  │                                               │  Ticket owner                     │
  │  Requester    Nara Sukjai                     │  [ Ada Chaiyawat        ▾ ]       │
  │  Ticket date  4 Sep 2026 09:20                │  [ Claim ]  [ Unassign ]          │
  │  Category     Network                         │                                   │
  │  Related sys  VPN                             │  IT Priority                      │
  │  Last updated 9 Sep 2026 15:02                │  ( ) Low ( ) Medium               │
  │                                               │  ( ) High (•) Urgent              │
  │  Summary                            read-only │                                   │
  │  VPN disconnects every few minutes            │  Status                           │
  │                                               │  [ In Progress          ▾ ]       │
  │  Description                        read-only │  Only permitted next statuses     │
  │  Since the firmware update the VPN …          │  are listed.                      │
  │                                               │  [ Save status ]                  │
  │  Attachments                    (Lab 2 block) │                                   │
  └───────────────────────────────────────────────┴───────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │  Public Comments                                                          h2     │
  │  … comment cards, oldest first …                                                 │
  │  Public — the Requester will see this.                                           │
  │  [ textarea ]                                      1842 / 2000  [ Post comment ] │
  └──────────────────────────────────────────────────────────────────────────────────┘
  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
  ┃  Internal Notes                            ⚠ Not visible to the Requester   h2   ┃
  ┃  … note cards, oldest first …                                                    ┃
  ┃  Internal — not visible to the Requester.                                        ┃
  ┃  [ textarea ]                                        412 / 2000  [ Post note ]   ┃
  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

Information left, operations right: the reader establishes what the Ticket is before acting on it, and the
three operations sit together rather than being scattered next to the fields they resemble. Below the fold the
two conversations are stacked full width, Public first, because the Public thread is the one both parties see.

Mobile and tablet stack the operations panel directly under the badges, above the descriptive fields, so an IT
Staff user on a phone can claim a Ticket without scrolling past the description.

### 8.2 Operations panel

| Control | Definition |
|---|---|
| Ticket owner | A select populated from `GET /api/staff/assignees` (active IT Staff and Administrators only), with an explicit "Unassigned" option. Changing it saves immediately and shows an inline saving indicator |
| Claim | A primary button shown only when the Ticket is not owned by the current user; assigns to self. On a `NEW` Ticket the status badge visibly becomes "Open" in the same response (BR-29, AC-36) |
| Unassign | A secondary button shown only when the Ticket has an owner |
| IT Priority | The Lab 2 `RadioGroup`, four options, saving on change with an inline indicator. The Requested Priority badge stays visible beside it and is never editable (BR-31) |
| Status | A select listing **only** the statuses permitted from the current one (BR-35), plus a Save status button. An impossible transition is therefore not offered — and is still refused `409` by the API if it is constructed by hand (AC-42) |
| Confirmation | Saving `RESOLVED`, `CLOSED`, or `CANCELLED` opens the `ConfirmDialog` naming the Ticket and the target status (BR-37, AC-44) |

### 8.3 Public Comments and Internal Notes

The two panels are never interleaved and never share a container. The Internal panel is distinguished by four
independent signals so that no single failure — a missing stylesheet, a colour-blind reader, a greyscale
screenshot — can make it look public:

1. a `--zen-warning` border and heading colour;
2. the heading suffix "⚠ Not visible to the Requester";
3. the persistent composer label "Internal — not visible to the Requester.";
4. a lock glyph on every note card's author line.

For an Administrator both panels render identically to IT Staff (A-01). For a Requester the Internal panel does
not exist in the DOM at all.

### 8.4 States

| State | Presentation |
|---|---|
| Loading | Skeleton for the information column and the operations panel; conversations load separately and show their own skeletons |
| Loaded | As above |
| Claiming / assigning / saving priority | The affected control is disabled with an inline busy indicator; the rest of the screen stays usable |
| Status confirming | `ConfirmDialog`; cancelling changes nothing |
| Invalid transition (`409`) | Warning callout above the operations panel: "This ticket cannot move from In Progress to New." The select resets to the current status |
| Invalid assignee (`409`) | Warning callout: "That person cannot own a ticket." The select resets to the current owner |
| Note or comment posting | Per-composer busy state; the other composer stays usable |
| Not found (`404`) | The Lab 2 safe not-found state |
| Forbidden (`403`) | The shared forbidden state (§2.5) |
| Failure | Error callout with **Try again** scoped to the block that failed, so one failed conversation load does not blank the Ticket |

Traceability: FR-24 – FR-33, FR-46, BR-21, BR-26 – BR-46, AC-36 – AC-44, AC-48, AC-49, AC-66.

---

## 9. Screen — Administrator User Management (`/admin/users`)

Purpose: the minimum needed to make authentication and role-based access work. Intentionally one screen.

### 9.1 Desktop layout (≥ 992 px)

```
  ┌───────────────────────────────────────────────────────────────────────────────┐
  │  User Management                                        [ + Create user ]  h1 │
  │                                                                               │
  │  [ Search name or email            ]   [ Role: Any ▾ ]                        │
  ├────────────────────────┬─────────────────────────┬───────────────┬────────────┤
  │ Name                   │ Email                   │ Role          │ Status     │
  ├────────────────────────┼─────────────────────────┼───────────────┼────────────┤
  │ Ada Chaiyawat          │ ada.chaiyawat@kmutt.ac… │ [IT Staff]    │ [Active]   │  [Edit]
  │ Nara Sukjai            │ nara.sukjai@kmutt.ac.th │ [Requester]   │ [Active]   │  [Edit]
  │ Pim Rattana            │ pim.rattana@kmutt.ac.th │ [Administr…]  │ [Active]   │  [Edit]
  │ Somsak Dee             │ somsak.dee@kmutt.ac.th  │ [Requester]   │ [Inactive] │  [Edit]
  └────────────────────────┴─────────────────────────┴───────────────┴────────────┘
        No pagination — the user list is short by design (X-12).
```

Exactly the four columns the handout names, plus the Edit action. There is no Delete control anywhere on the
screen, because there is no deletion (BR-53). There is no pagination control, no multi-column sort, and no
second simultaneous filter (X-12). Long email addresses truncate with an ellipsis and expose the full value
through `title`, following the Lab 2 attachment-filename rule.

Mobile renders one card per user carrying Name, Email, both badges, and a full-width Edit button.

### 9.2 Create and Edit form

Both open in the same modal dialog, differing only in title, in which fields are present, and in the submit
label.

| Field | Control | Create | Edit | Validation |
|---|---|---|---|---|
| Full name | text | Yes | Yes | Required, 2–120 characters after trim |
| Email address | email | Yes | Yes | Required, valid, unique case-insensitively (BR-49) |
| Role | `RadioGroup`, three options | Yes | Yes | Exactly one; no multi-select control exists (BR-22) |
| Account status | `RadioGroup`: Active / Inactive | Yes | Yes | Required; explicit on create, never defaulted |
| Initial password | password + reveal | Yes | — | Required on create, 10–128 characters |
| Set a new initial password | A separate secondary action inside the Edit dialog | — | Yes | Opens a small confirm-and-enter step, then shows the issued password once (BR-13) |

After a create, and after issuing a new initial password, the dialog shows a one-time panel:

```
  ┌────────────────────────────────────────────────────────────┐
  │ ✔ Account created                                          │
  │                                                            │
  │ Initial password                                           │
  │ ┌────────────────────────────┐  [ Copy ]                   │
  │ │ first-login-2026           │                             │
  │ └────────────────────────────┘                             │
  │ Give this to the user directly. It is shown only once and   │
  │ they must change it at first sign-in.                       │
  │                                        [ Done ]            │
  └────────────────────────────────────────────────────────────┘
```

The password is shown in plain text deliberately — the Administrator has to read it out or copy it, and a
masked field they must reveal anyway adds a step without adding secrecy. It is never re-fetchable (BR-13).

### 9.3 States

| State | Presentation |
|---|---|
| Loading | Four skeleton rows |
| Loaded | Rows or cards as above |
| Empty | Impossible in practice (an Administrator is always looking at at least themselves), but handled: "No users found." |
| No results | Search or role filter matched nothing: "No users match this search." with a **Clear** action |
| Creating / saving | The dialog's submit shows a busy state; fields are read-only for the duration |
| Validation failure | Per-field messages plus the Lab 2 summary region; every entered value is preserved (BR-66) |
| Duplicate email (`409`) | "That email address is already in use." below the Email field; nothing else is cleared (AC-54) |
| Self-deactivation blocked (`409`) | Warning callout in the dialog: "You cannot deactivate your own account or change your own role." The controls reset to their stored values (AC-58) |
| Last Administrator blocked (`409`) | Warning callout: "There must be at least one active administrator." The controls reset (AC-59) |
| Initial password issued | The one-time panel above; the list refreshes behind it |
| Forbidden (`403`) | The shared forbidden state (§2.5) — reached only by a non-Administrator typing the URL (AC-17, AC-18) |
| Failure | Error callout inside the dialog with **Try again**; the list behind it is unchanged |

Traceability: FR-35 – FR-42, BR-13, BR-22, BR-47 – BR-54, AC-18, AC-51 – AC-60.

---

## 10. Responsive rules

Lab 2 §8 remains in force and is extended to the new screens.

| Viewport | Required behaviour |
|---|---|
| Desktop ≥ 992 px | Login and Change Password as centred cards; Queue as an eight-column table; Staff Ticket Detail as two columns with conversations full width below; User Management as a four-column table |
| Tablet 768–991 px | Queue reduces to five columns; Staff Ticket Detail stacks operations under the badges; User Management keeps its table with the email column truncating |
| Mobile < 768 px | Queue and User Management render as cards; Queue filters collapse into one disclosure showing the active count; Staff Ticket Detail puts the operations panel above the descriptive fields; every dialog becomes full-screen with its actions pinned at the bottom |
| All sizes | No horizontal page scrolling, no clipped label, no overlapping message, no hidden primary action; touch targets ≥ 44 px; long emails, summaries, and names truncate with an ellipsis and expose the full value through `title` |

Breakpoints are unchanged from Lab 2. Test viewports: 1280 × 800 (desktop), 820 × 1180 (tablet),
375 × 812 (mobile).

**Overflow rule.** Where a table cannot reduce further it scrolls inside its own container with
`overflow-x: auto`, never by letting the page body scroll sideways.

---

## 11. Accessibility rules

Lab 2 §9 remains in force — landmarks, labels, required-field marking, error placement, live regions, keyboard
reachability, focus visibility, colour independence, contrast, touch targets, images, motion, and language.
Lab 3 adds seven rules.

| Rule | Requirement |
|---|---|
| Password fields | Each has a real `<label>`; the reveal toggle is a `<button type="button">` with an accessible name that changes between "Show password" and "Hide password" and an `aria-pressed` state |
| Login failure | The error callout has `role="alert"` so the failure is announced without moving focus away from the form |
| Forced redirect | Arriving at `/change-password` because a change is mandatory announces the reason through the info callout, which is the first focusable region's accessible description — a silent redirect would leave a screen-reader user unaware of why the screen changed |
| Sortable headers | Each sortable Queue header is a `<button>` inside the `<th>` and carries `aria-sort="ascending" \| "descending" \| "none"` |
| Queue rows | The row is not a clickable `<div>`; the Ticket Number is a real link and the row's click handler is a convenience on top of it, so keyboard and assistive-technology users reach the Ticket the same way |
| Internal Notes | The panel is a landmark region with an accessible name "Internal Notes, not visible to the Requester", so the distinction is conveyed without relying on the border colour |
| Live operations | Claim, priority, and status saves announce their result through the Lab 2 `role="status"` region; a failure announces through `role="alert"` |

---

## 12. Reusable component inventory

Reused from Lab 2 **unchanged**: `Button`, `Badge`, `Callout`, `ConfirmDialog`, `EmptyState`, `FormField`,
`Pagination`, `RadioGroup`, `SelectField`, `Skeleton`, `TextArea`, `TextField`, `AttachmentList`,
`AttachmentSection`, `AppShell` (revised in §3).

| New component | Responsibility |
|---|---|
| `PasswordField` | A `TextField` wrapper adding the reveal toggle, the `autocomplete` value, and the never-log rule (§2.1) |
| `RoleBadge` | The role badge family (§1.2) — a thin wrapper over `Badge`, not a new visual system |
| `StatusBadge` | The eight status values, plus the Requester-resolution flag |
| `PriorityBadge` | Both priority families, taking a `kind` of `"requested"` or `"it"` that supplies the mandatory prefix |
| `MessageList` | Renders `TicketMessage` cards for one visibility, including the author line, timestamp, and system-message styling |
| `MessageComposer` | The text area, the persistent visibility label, the counter, and the post button (§2.3) |
| `ForbiddenState` | The shared `403` presentation (§2.5) |
| `RequireRole` | A route guard rendering `ForbiddenState` instead of the route for a role that may not open it — feedback, never the control |
| `AuthProvider` / `useCurrentUser` | Holds the authenticated user from `GET /api/auth/me`, replacing the Lab 2 requester-context module in the same position (A-18) |

Deleted in Lab 3: `RequesterGuard`, `useCurrentRequester`, `requesterContext`, and the `SelectRequester` screen
(BR-57).

---

## 13. Visual inspection checklist

Completed on 17 September 2026 against the screenshots in §14, opened and read one by one — not from memory.
Every box names the file that proves it; paths are relative to `artifacts/lab-03/screenshots/`. A 🔍 marks a
property a still image cannot show, which is instead proven by the named automated test. The capture came from a
clean clone of `lab3-staging` running against a freshly migrated and seeded database (`tests.md` §6.5).

**Colour and theme**
- [x] Every Lab 3 screen resolves its colours to Zen Green tokens; no hard-coded value was introduced —
  `authentication/login-initial.desktop.png`, `staff-queue/loaded.desktop.png`, `staff-ticket-detail/loaded.tablet.png`,
  `user-management/list.tablet.png`; 🔍 STYLE-01 (no colour literal outside the `:root` token block, every
  `var(--…)` defined) and Lab 2 STYLE-08 (no literal in any component). This pass moved the last one, the dialog
  backdrop, into a token (D-04)
- [x] The Login and Change Password cards match the Lab 2 card treatment — `authentication/login-initial.desktop.png`,
  `authentication/change-password-mandatory.tablet.png`: white `zen-card` surface, the same border, radius, and
  shadow as the Lab 2 cards in `artifacts/lab-02/screenshots/ticket-detail/`
- [x] The Internal Notes panel is distinguishable from the Public Comments panel in a greyscale rendering —
  `staff-ticket-detail/greyscale.desktop.png`: with colour removed the Internal panel keeps its heavier left edge,
  the "⚠ Not visible to the Requester" suffix, the "Internal — not visible to the Requester." label, and a lock on
  the note; 🔍 STYLE-05, UI-26

**Identity and navigation**
- [x] The shell shows the authenticated name and the role badge for all three roles — Requester
  `authentication/shell-signed-in.desktop.png`, IT Staff `staff-queue/loaded.desktop.png`, Administrator
  `user-management/list.tablet.png`
- [x] Each role sees only its permitted destinations, and no disabled placeholder for the others — Requester: My
  Tickets, Create Ticket (`authentication/shell-signed-in.tablet.png`); IT Staff: Ticket Queue only
  (`staff-queue/loaded.tablet.png`); Administrator: Ticket Queue, User Management (`user-management/list.tablet.png`);
  🔍 UI-11 – UI-13 (absent from the DOM, not hidden)
- [x] Logout is visible at all three viewports without opening a menu — `authentication/shell-signed-in.desktop.png`,
  `…tablet.png`, `…mobile.png` (beside the closed ☰ menu button), `user-management/list.mobile.png`

**Fields**
- [x] Read-only ticket fields on Staff Ticket Detail remain visually distinct from the editable operations panel —
  `staff-ticket-detail/loaded.tablet.png`, `staff-ticket-detail/invalid-transition.mobile.png`: values on the grey
  read-only ground, controls on white; 🔍 STYLE-06
- [x] Required fields carry the red asterisk and `aria-required` on Login, Change Password, and the user dialog —
  `authentication/login-initial.desktop.png`, `authentication/change-password-mandatory.tablet.png`,
  `user-management/last-administrator.mobile.png`; 🔍 UI-36 (`aria-required` on the Login fields, the three Change
  Password fields, and every create-user field and group)
- [x] Password rules are visible before typing on the Change Password screen —
  `authentication/change-password-mandatory.tablet.png` (all three fields empty, rules already shown)

**Validation and feedback**
- [x] Field-level messages sit immediately below their field on every new form —
  `authentication/change-password-validation.mobile.png`, `user-management/duplicate-email.desktop.png`
- [x] The login failure message is identical for a wrong password and for an inactive account —
  `authentication/login-invalid.mobile.png` and `authentication/login-inactive.mobile.png` (same callout, same
  words); 🔍 E2E-02 compares the three failure screens byte for byte
- [x] The duplicate-email, self-deactivation, and last-Administrator messages each appear in the right place —
  below Email in `user-management/duplicate-email.desktop.png`; at the top of the dialog, controls reset, in
  `user-management/self-deactivation.tablet.png` and `user-management/last-administrator.mobile.png` (a simulated
  response — D-03)

**Badges and states**
- [x] All eight status badges render with their documented treatment and readable text —
  `staff-queue/seeded-statuses.desktop.png`, `…tablet.png`, `…mobile.png` (New, Open, In Progress, Waiting for
  Requester, Resolved ✓, Closed, Reopened, Cancelled on the nine seeded Tickets); 🔍 STYLE-02
- [x] Requested Priority and IT Priority are distinguishable by their label prefix alone —
  `staff-ticket-detail/loaded.tablet.png` ("IT: HIGH" beside "Requested: HIGH"),
  `staff-ticket-detail/greyscale.desktop.png` ("IT: URGENT" beside "Requested: MEDIUM" with no colour); 🔍 STYLE-03
- [x] The "Requester says resolved" flag appears on both the Queue row and Ticket Detail — row:
  `staff-queue/seeded-statuses.desktop.png` (TKT-2026-000005) and `…mobile.png`; detail:
  `staff-ticket-detail/loaded.tablet.png`; 🔍 E2E-07

**Layout integrity**
- [x] No horizontal page scroll at 1280 × 800, 820 × 1180, or 375 × 812 on any Lab 3 screen — every file in §14 was
  captured only after the check passed; 🔍 RESP-01 (`scrollWidth <= clientWidth` on eight screens at three
  viewports)
- [x] No clipped label, no overlapping message, no hidden primary action — `staff-ticket-detail/loaded.tablet.png`,
  `user-management/last-administrator.mobile.png` (full-screen dialog, actions pinned),
  `authentication/shell-signed-in.tablet.png` after D-01; 🔍 RESP-01 (no table hiding a column) and RESP-05
- [x] The Queue table and the user table both truncate long values rather than widening the page —
  `staff-queue/loaded.desktop.png` (Summary ellipsis), `user-management/list.tablet.png` (Email ellipsis),
  `user-management/list.mobile.png`

**Accessibility**
- [x] Focus is visible on every control of every new screen — `authentication/login-initial.desktop.png` (focus ring
  on the email field), `authentication/change-password-validation.mobile.png` (New password); 🔍 STYLE-07 (a
  `:focus-visible` outline on password fields, reveal toggles, Queue sort headers, and dialog actions, and no
  `outline: none` without a replacement)
- [x] Login, Change Password, and the Queue filters are fully operable from the keyboard — 🔍 UI-05 (Login from the
  keyboard alone), UI-36 (Change Password submitted from the keyboard; every Queue filter reached with Tab), and the
  AC-67 test in `e2e/lab-03/staff-ticket-flow.spec.ts` (Queue search, Status preset, and IT Priority operated by
  keyboard in a real browser); a still image cannot show key presses
- [x] Sortable Queue headers expose `aria-sort` — `staff-queue/loaded.desktop.png` (the ▼ on IT Priority is the
  visible half); 🔍 UI-22 and E2E-04 assert the attribute

### 13.1 Deviations found during this pass

Mirrored into `tests.md` §4.2.

| # | Deviation | Where | Impact | Verdict |
|---|---|---|---|---|
| D-01 | At 820 px the Lab 2 My Tickets table, now under the Lab 3 shell, pushed its **Current Status** column past the card edge — reachable only by scrolling inside the card — and wrapped each Ticket Number onto three lines. The page itself did not scroll, so RESP-01 as first written passed. The desktop table was also 21 px wider than its card | `authentication/shell-signed-in.tablet.png` (before: the version in commit `0251833`) | A Requester on a tablet could not see a Ticket's status without scrolling sideways inside the table | **Fixed.** Ticket Numbers no longer wrap and the Summary truncates at each width (`zen-tickets`); both tables now fit with 0 px hidden. RESP-01 additionally fails if any table overflows its card — confirmed to fail with the fix removed |
| D-02 | Pagination wraps onto a second row when there are many pages | `authentication/shell-signed-in.tablet.png` (11 pages), `staff-queue/loaded.mobile.png` (6 pages) | Cosmetic; every page button stays visible and reachable, nothing overlaps | **Accepted.** The Lab 2 `Pagination` component, unchanged by Lab 3; a compact page range is a candidate for a later sprint |
| D-03 | The `last-administrator` capture answers its PATCH with the API's own `409` body instead of reaching the refusal for real | `user-management/last-administrator.*.png` | None on behaviour; the image is staged | **Accepted.** Over HTTP the refusal happens only when two Administrators remove each other at once. E2E-09 performs that race for real in two browsers, and API-94 proves it at the API |
| D-04 | The dialog `::backdrop` colour was a literal `rgba(…)` outside the `:root` token block | `client/src/styles/zen-theme.css` (found by STYLE-01, visible behind every dialog, e.g. `user-management/duplicate-email.desktop.png`) | None visually; broke the one-file token rule of §1.1 | **Fixed.** Now `var(--zen-backdrop)`, the same value, so no new colour was introduced |
| D-05 | Evidence captures exist beyond the §14 inventory: `staff-queue/seeded-statuses.*` and `staff-ticket-detail/greyscale.desktop.png` (added by this pass), the `requester-ticket-detail/` folder (#56), and `authentication/change-password-success`, `forbidden`, `shell-it-staff`, `shell-administrator` (#49, #50) | `artifacts/lab-03/screenshots/` | None; §14 still holds in full (RESP-06) | **Accepted.** No §14 state shows all eight statuses together, the greyscale proof, the Requester conversation, or the shell for each role, so each was kept as evidence |

---

## 14. Screenshot paths

```
artifacts/lab-03/screenshots/
  authentication/      login-initial · login-invalid · login-inactive · login-submitting ·
                       change-password-mandatory · change-password-validation · shell-signed-in · logged-out
  staff-queue/         loading · loaded · filtered · no-results · empty · forbidden · failure · page-2
  staff-ticket-detail/ loaded · claim · priority · status-confirm · invalid-transition ·
                       public-comment · internal-note · forbidden
  user-management/     list · search · role-filter · create · created-password · edit ·
                       duplicate-email · self-deactivation · last-administrator · forbidden
```

Every state is captured at all three viewports with the Lab 2 naming convention.
Example: `artifacts/lab-03/screenshots/staff-queue/no-results.mobile.png`.

---

## 15. Traceability

| Section | Functional requirements | Business rules | Acceptance criteria |
|---|---|---|---|
| §2.2 Role-aware navigation | FR-11, FR-13 | BR-23 – BR-25 | AC-15, AC-21 |
| §2.3 Message composers | FR-46 | BR-24, BR-44, BR-45 | AC-66 |
| §2.5 Forbidden state | FR-13 | BR-24 | AC-21 |
| §3 Application shell | FR-04, FR-11 | BR-05, BR-57 | AC-06, AC-15, AC-26 |
| §4 Login | FR-01, FR-02, FR-05, FR-06 | BR-01, BR-08 | AC-01, AC-02, AC-08 |
| §5 Change Password | FR-07 – FR-09 | BR-06, BR-11, BR-14 – BR-17 | AC-10, AC-12 – AC-14 |
| §6 Requester Ticket Detail | FR-17, FR-30, FR-32 – FR-34 | BR-39 – BR-46 | AC-45 – AC-47, AC-50 |
| §7 Ticket Queue | FR-18 – FR-23 | BR-59 – BR-63 | AC-28 – AC-35 |
| §8 Staff Ticket Detail | FR-24 – FR-33, FR-46 | BR-26 – BR-46 | AC-36 – AC-44, AC-48, AC-66 |
| §9 User Management | FR-35 – FR-42 | BR-47 – BR-54 | AC-51 – AC-60 |
| §10 Responsive | FR-44 | — | AC-64 |
| §11 Accessibility | FR-43 | — | AC-67 |
| §12 Components, §1.2 Badges | FR-45 | — | AC-65, AC-68 |

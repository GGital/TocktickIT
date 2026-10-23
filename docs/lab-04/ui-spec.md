# Lab 4 UI Specification — Zen Green Theme, Sprint 4

Project: TokTickIT — IT Service Desk
Sprint: Lab 4 — Actions Taken, Ticket Resolution Workflow, Role Dashboards, and Final Regression
Status: Draft for student review and approval (must be approved before implementation begins)
Companion documents: [specification.md](specification.md), [api-spec.md](api-spec.md), [tests.md](tests.md)

This document is the authoritative visual and interaction contract for Sprint 4. It **extends** the Lab 2 and
Lab 3 UI specifications; every token, form convention, badge, button level, validation placement, dialog,
forbidden state, responsive rule, and accessibility rule stays in force and is not restated. Where this file and
`specification.md` disagree, `specification.md` wins.

Implementation base is unchanged: React 19 + TypeScript + Vite + Bootstrap 5 with Zen Green applied through CSS
custom properties in `client/src/styles/zen-theme.css`. Lab 4 introduces **no new colour value** (AC-50).

---

## 1. Design foundations

### 1.1 Colour tokens

Unchanged: `--zen-primary`, `--zen-secondary`, `--zen-pale`, `--zen-page-bg`, `--zen-surface`, `--zen-text`,
`--zen-field-bg`, `--zen-readonly-bg`, `--zen-error`, `--zen-warning`, `--zen-success`, `--zen-backdrop`.

### 1.2 New badge values

Lab 4 adds values to the existing `Badge` family, composed from existing tokens. Each carries its meaning in text
(AC-52).

| Kind | Value | Background | Text | Label |
|---|---|---|---|---|
| Follow-up | outstanding | `--zen-warning` at 12 % | `--zen-warning` | "Follow-up outstanding" with a clock glyph |
| Follow-up | completed | `--zen-pale` | `--zen-success` | "Follow-up done" with a check glyph |
| Follow-up | none | `--zen-readonly-bg` | `--zen-text` | "No follow-up" |
| Action | voided | `--zen-readonly-bg` | `--zen-text` at 70 % | "Voided" |
| Action | edited | none (inline text) | `--zen-text` at 70 % | "Edited by {name}, {time}" |
| Queue row | follow-ups | `--zen-warning` at 12 % | `--zen-warning` | "{n} follow-up(s)" |

Status, IT Priority, Requested Priority, role, account, and Requester-flag badges are unchanged from Lab 3 §1.2.

### 1.3 Typography and spacing

Unchanged. Metric card numbers use the existing `h2` display size (`--bs-h2-font-size`) with
`font-variant-numeric: tabular-nums`, so digits do not shift when a count changes.

---

## 2. Component rules

### 2.1 Metric card (`MetricCard`)

| Rule | Definition |
|---|---|
| Anatomy | Label (`h3`, small caps off, `--zen-text`), number (large, `--zen-primary`), one-line definition (muted), and a trailing "View list →" affordance |
| Interaction | The whole card is **one** `<a>` element to `metric.href` (api-spec §2.6). No nested buttons. Hover raises the card shadow one step; focus shows the Lab 2 focus ring around the whole card |
| Accessible name | "{Label}: {count}. View list" — e.g. "Unassigned tickets: 3. View list" |
| Zero | Renders `0` in `--zen-text` (not primary) with the same link; the definition line stays, so zero is clearly an answer, not a failure (BR-51) |
| Emphasis | `unassigned`, `urgentActive`, and Requester `waitingForMe` add a `--zen-warning` left border when their count is > 0 — text label is unchanged, so emphasis is never colour-only |
| Never | Never computes a number in the client; never hides a card because its count is zero |

### 2.2 Breakdown list (`MetricBreakdown`)

`byStatus` and `byItPriority` render as a compact `<ul>` of rows: the existing `StatusBadge` / `PriorityBadge`,
then the count right-aligned, each row a link to its `href`. All keys render, zero included, in lifecycle order for
status and severity order for priority. No charts (X-06).

### 2.3 Dashboard list (`DashboardTicketList`, `DashboardActionList`)

| Rule | Definition |
|---|---|
| Rows | Ticket Number (link), Summary (single line, ellipsis, full text in `title`), status badge, relative and absolute time ("2 h ago · 20 Oct 2026 09:15") |
| Empty | Per list, inside the card: "No tickets updated in the last 7 days." / "You have not recorded any actions yet." — never a blank card |
| Footer | A "View all" link to the list the rows come from |
| Length | Exactly what the API returns (≤ 5 or ≤ 8); the client never pads or truncates further |

### 2.4 Actions Taken form (`ActionTakenForm`)

| Field | Control | Rules shown before typing | Notes |
|---|---|---|---|
| Visibility label | Permanent `Callout` (info) at the top | "Visible to the Requester. Use Internal Notes for private details." | Non-dismissible (BR-44) |
| Action Date/Time | `<input type="datetime-local">` labelled "Action date and time (Bangkok time)" | "Cannot be in the future or before the ticket was opened." | Defaults to now in Bangkok; converted to ISO with `+07:00` on submit |
| Action Description | `TextArea`, required | Counter from 1800 / 2000 | |
| Result | `TextArea`, required, 3 rows | Counter from 900 / 1000 | |
| Follow-Up Required? | `RadioGroup` "No" / "Yes", required, no default | — | Forces a deliberate choice |
| Follow-up Note | `TextArea`, rendered only when "Yes", then required | Counter from 900 / 1000 | Hidden when "No"; its text is kept in state while hidden but not submitted (AC-39) |
| Attachment Notes | `TextField`, optional | "Name the file in Attachments to look at, e.g. router-log.png." Counter from 450 / 500 | Plain text; never a link |
| Performed by | Read-only field (`--zen-readonly-bg`) | — | Create: "You ({name})". Edit: the original performer. Never editable (BR-03) |
| Created / Last edited | Read-only, edit mode only | — | |

Buttons: primary **Save action** (create) / **Save changes** (edit), secondary **Cancel**. Field errors appear under
each field and in a summary callout at the top that links to each field (Lab 2 rule). Submit is disabled with the
busy state while in flight (BR-82).

### 2.5 Void dialog

The Lab 2 `ConfirmDialog` with a required `TextArea` "Reason for voiding" (1–500). Title: "Void action recorded
{date} by {name}?" Body: "Voided actions stay in the staff history, are hidden from the Requester, and no longer
count toward resolving the ticket. This cannot be undone." Destructive button "Void action" on the right, disabled
until a reason is entered. Focus returns to the row's menu trigger on cancel.

### 2.6 Stale-update callout (`StaleCallout`)

Shown on `409 STALE_TICKET` or `409 STALE_ACTION`. Never auto-retries (BR-30).

| Case | Presentation |
|---|---|
| Ticket workflow | Warning callout above the workflow panel: "This ticket changed since you opened it. The latest status and owner are shown below — review them and choose again." The ticket is re-fetched; the user's attempted value is shown as "You tried: Resolved" until they act |
| Action edit | Warning callout inside the form: "Someone else saved this action while you were editing." Below it, the latest saved values render read-only. Two buttons: **Keep my changes** (adopts the new `version` and resubmits the user's values — a knowing overwrite) and **Discard my changes** (loads the latest). The user's typed values are never cleared by this state |

### 2.7 Resolution blockers callout

Under the status select when `resolutionBlockers` is non-empty (api-spec §2.3):

```
⚠ Resolve is not available yet
  • No action has been recorded.                     ← NO_ACTIONS
  • 1 follow-up is still outstanding.                ← OUTSTANDING_FOLLOW_UPS
  • Assign an owner first.                           ← UNASSIGNED
  [ Go to Actions Taken ]
```

The same callout renders from a `409 RESOLUTION_BLOCKED` response if the gate fails at save time.

---

## 3. Application shell

| Element | Lab 4 rule |
|---|---|
| Navigation | Requester: **Dashboard**, My Tickets, Create Ticket. IT Staff: **Dashboard**, Ticket Queue. Administrator: **Dashboard**, Ticket Queue, User Management (FR-24) |
| Home | Wordmark and post-login redirect go to `/dashboard` (Requester) or `/staff/dashboard` (staff) (BR-79) |
| Active page | Active link uses the Lab 2 active style **and** `aria-current="page"`. Detail routes highlight their parent: `/tickets/:id` → My Tickets, `/staff/tickets/:id` → Ticket Queue (FR-25) |
| Cleanup | The Lab 1 `/system-check` route stays reachable by direct URL (a Lab 3 regression test uses it) but is never linked from navigation. `placeholders.tsx` keeps only `NotFoundScreen` (FR-31) |

---

## 4. Screen — Requester Dashboard (`/dashboard`)

Purpose: what needs my attention, and what changed. Not a second My Tickets.

### 4.1 Desktop layout (≥ 992 px)

```
  Dashboard                                                        h1
  Your tickets at a glance · Updated 11:00 (Bangkok)     [ Create ticket ]

  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
  │ Waiting for you   h3  │ │ Open tickets      h3  │ │ Resolved — check  h3  │
  │ 1                     │ │ 3                     │ │ 1                     │
  │ IT needs your reply   │ │ Not yet resolved      │ │ Resolved, not closed  │
  │           View list → │ │           View list → │ │           View list → │
  └───────────────────────┘ └───────────────────────┘ └───────────────────────┘

  ┌──────────────────────────────────────┐ ┌──────────────────────────────────────┐
  │ Recently updated                 h2  │ │ Recently resolved (2, last 7 days) h2│
  │ TKT-…041 VPN disconnects… [Waiting]  │ │ TKT-…038 Printer jams…   [Resolved]  │
  │          2 h ago · 20 Oct 09:15      │ │          1 d ago · 19 Oct 16:02      │
  │ …                                    │ │ …                                    │
  │                         View all →   │ │                         View all →   │
  └──────────────────────────────────────┘ └──────────────────────────────────────┘
```

Card order follows BR spec §6.3 (attention first). The "Updated" time is `generatedAt` rendered in Bangkok time.

### 4.2 Tablet and mobile

Tablet (768–991 px): cards in a 2-column grid (third card spans), lists stacked full width. Mobile (< 768 px): one
column; cards first, then Recently updated, then Recently resolved; **Create ticket** becomes a full-width button
under the heading.

### 4.3 States

| State | Presentation |
|---|---|
| Loading | Three card skeletons and two list skeletons in the final layout, so nothing shifts on load |
| Loaded | As above |
| All zero (no Tickets) | Cards still render with `0`; above them a welcome `EmptyState`: "You have not raised any tickets yet." with a primary **Create ticket** (AC-31) |
| List empty | Per-list empty message (§2.3) |
| Forbidden | Lab 3 `ForbiddenState` (a staff user typing `/dashboard`) |
| Failure | One error `Callout` "We could not load your dashboard." with **Try again**; shell and navigation remain usable (BR-83, AC-38) |

Traceability: FR-18, FR-21, FR-22, BR-53 – BR-57, AC-29, AC-31, AC-37, AC-38.

---

## 5. Screen — IT Staff Dashboard (`/staff/dashboard`)

Purpose: the operational starting point — what is unowned, what is mine, what is urgent.

### 5.1 Desktop layout (≥ 992 px)

```
  Dashboard                                                                 h1
  Service desk overview · Updated 11:00 (Bangkok)                [ Open queue ]

  ┃Unassigned      3┃  ┌ Assigned to me  5 ┐  ┃Urgent & active 2┃
  ┃Active, no owner ┃  │ Active, owner: you│  ┃IT priority Urgent┃
  ┌ Requester says  1┐ ┌ My follow-ups   1 ┐  ┌ New today       4 ┐
  │ resolved        │  │ Tickets with your │  │ Since 00:00       │
  │ Review & resolve│  │ open follow-ups   │  │ Bangkok           │
  └─────────────────┘  └───────────────────┘  └───────────────────┘

  ┌ By status ─────────────┐ ┌ Active by IT priority ┐ ┌ Recently updated ──────────────┐
  │ [New]               2  │ │ [IT: Urgent]       2  │ │ TKT-…041 VPN… [In Progress]   │
  │ [Open]              3  │ │ [IT: High]         3  │ │   [IT: Urgent] 5 min ago      │
  │ [In Progress]       4  │ │ [IT: Medium]       4  │ │ …  (8 rows)                   │
  │ … all 8 …              │ │ [IT: Low]          2  │ │                  View queue → │
  └────────────────────────┘ └───────────────────────┘ └───────────────────────────────┘
  ┌ My recent actions ─────────────────────────────────────────────────────────────────┐
  │ TKT-…041  19 Oct 10:15  Replaced the VPN client profile…  [Follow-up outstanding]  │
  │ …  (5 rows)                                                                        │
  └────────────────────────────────────────────────────────────────────────────────────┘
```

`┃` marks the `--zen-warning` left border applied when the count is > 0 (§2.1).

### 5.2 Administrator addition

Below the grid, an **Accounts** card group (BR-68 – BR-70): three `MetricCard`s for active Requesters, IT Staff,
and Administrators linking to `/admin/users?role=…`, and one compact card "Inactive: 2 · Must change password: 4"
linking to `/admin/users`. Rendered only when the response contains `administration`; IT Staff never see an empty
placeholder for it.

### 5.3 Tablet and mobile

Tablet: cards 2 × 3; breakdowns side by side; lists full width. Mobile: one column in the order cards → My recent
actions → Recently updated → By status → By IT priority → Accounts. Breakdown rows keep ≥ 44 px height.

### 5.4 States

| State | Presentation |
|---|---|
| Loading | Skeletons in final layout |
| All zero | Cards show `0`; "My recent actions" shows "You have not recorded any actions yet."; no welcome panel (staff always have a queue to open) (AC-31) |
| Forbidden | `ForbiddenState` for a Requester typing `/staff/dashboard` |
| Failure | One error callout with **Try again** (BR-83) |

Traceability: FR-19 – FR-22, BR-58 – BR-71, AC-30 – AC-32, AC-35 – AC-38.

---

## 6. Screen — IT Staff Ticket Detail, extended (`/staff/tickets/:id`)

### 6.1 Desktop layout (≥ 992 px)

```
  ┌───────────────────────────────────────────────┬───────────────────────────────────┐
  │  TKT-2026-000041                       h1     │  Workflow                   h2    │
  │  [In Progress] [IT: URGENT] [Requested: HIGH] │  ┌ ✓ The Requester says this ───┐ │
  │  Requester / Date / Category / System / …     │  │ problem appears resolved.    │ │
  │  Resolved at  —                               │  │ Review Actions Taken first.  │ │
  │  Summary / Description            read-only   │  └──────────────────────────────┘ │
  │  Attachments                   (Lab 2 block)  │  Ticket owner / Claim (Lab 3)     │
  │                                               │  IT Priority (Lab 3)              │
  │                                               │  Status [ In Progress ▾ ]         │
  │                                               │  ⚠ Resolve is not available yet   │
  │                                               │   • 1 follow-up is outstanding.   │
  │                                               │   [ Go to Actions Taken ]         │
  │                                               │  [ Save status ]                  │
  └───────────────────────────────────────────────┴───────────────────────────────────┘
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │  Actions Taken (3)                     id="actions"         [ Record action ] h2 │
  │  Date/Time ▴     Description      Result      Performed by  Follow-up    Notes ⋯ │
  │  19 Oct 10:15    Replaced VPN…    Stable 30…  Malee Srisuk  [Outstanding] vpn… ⋯ │
  │  19 Oct 14:40    Called user…     Confirmed…  You           [No follow-up]  —  ⋯ │
  │  ▸ Voided · 18 Oct 09:00 · Thanawat Chaiyo · "Wrong ticket; see TKT-…044"        │
  └──────────────────────────────────────────────────────────────────────────────────┘
  Public Comments (Lab 3)
  Internal Notes (Lab 3)
```

Actions Taken sits between the ticket and the conversations: it is the work record the workflow panel's resolve
decision depends on, so it is the next thing the reader needs after the ticket itself.

### 6.2 Actions Taken panel

| Element | Definition |
|---|---|
| Region | `<section aria-labelledby>` "Actions Taken", `id="actions"` (target of blocker links and dashboard rows) |
| Heading count | Non-voided actions; "(3)" |
| Record action | Primary button. When BR-14 refuses writes it is not rendered; in its place a muted line states why: "Claim or assign this ticket to record actions." / "Reopen this ticket to record more work." |
| Table (desktop) | Columns: Date/Time (Bangkok), Description (3-line clamp + "Show more"), Result (3-line clamp), Performed by (name; "You" for self; Lab 3 role badge for Administrators), Follow-up (badge + note on expand), Attachment Notes (single line, ellipsis, `title`), row menu |
| Row menu `⋯` | `<button>` with accessible name "Actions for action recorded 19 Oct 10:15". Items, each shown only when permitted: **Edit** (`canEdit`), **Mark follow-up done** (`followUpOutstanding`), **Void** (`canEdit`). An empty menu is not rendered |
| Voided rows | Collapsed `<details>` row: "Voided · {date} · {performer} · "{reason}"", `Voided` badge; expands to the original values read-only. Never editable |
| Edited marker | Under the performer: "Edited by {name}, {time}" when `lastEditedBy` is present |
| Order | `actionAt` ascending, `id` ascending (BR-23); the Date/Time header shows the sort direction but is not a sort control (the order is fixed for auditability) |

### 6.3 Create and edit

Create and edit open the `ActionTakenForm` (§2.4) in a modal dialog (desktop, tablet) or full-screen sheet
(mobile). Success closes the dialog, announces "Action saved." through the `role="status"` region, scrolls the new
row into view with a 2-second `--zen-pale` highlight (respecting `prefers-reduced-motion`), and refreshes the ticket
summary (`version`, `allowedTransitions`, blockers) from a re-read of the ticket.

**Mark follow-up done** opens a small `ConfirmDialog`: "Mark the follow-up for the action on 19 Oct 10:15 as done?
The note will be kept." → **Mark done**.

### 6.4 Workflow panel changes

| Control | Lab 4 definition |
|---|---|
| Requester flag callout | Success-tinted callout at the top of the panel when flagged (BR-39) |
| Status select | Lists the current status (selected, disabled) plus **only** `allowedTransitions` (BR-40) |
| Blockers | §2.7 callout when `resolutionBlockers` is non-empty |
| Save status | Confirmation for `RESOLVED`, `CLOSED`, `CANCELLED` (Lab 3). Resolve confirmation adds the action count: "Resolve TKT-2026-000041? 3 actions recorded, no follow-ups outstanding." |
| After success | Summary status badge, `Resolved at`, owner, priority, select options, and blockers all refresh from the response, without page reload (AC-40) |
| All three Lab 3 writes | Send the current `version` as `expectedVersion`; on `STALE_TICKET` show §2.6 |

### 6.5 States (additions to Lab 3 §8.4)

| State | Presentation |
|---|---|
| Actions loading | Table skeleton inside the panel only; the rest of the page is usable |
| Actions empty | `EmptyState` in the panel: "No actions recorded yet." plus Record action when permitted |
| Saving | Dialog submit busy; other panels usable |
| Validation (`400`) | Field messages + summary callout; values retained (BR-81) |
| Duplicate replay (`200`) | Treated as success — the user never sees a duplicate |
| Not actionable (`409`) | Warning callout in the dialog with the API message; values retained |
| Stale (`409`) | §2.6 |
| Forbidden edit (`403`) | Warning callout: "Only the person who recorded this action, the ticket owner, or an administrator can change it." (normally unreachable because the menu hides the item) |
| Voided conflict (`409`) | "This action was voided by someone else." and the list reloads |
| Resolution blocked (`409`) | §2.7 callout; select resets to the current status |
| Failure (`500` / network) | Error callout with **Try again** scoped to the panel or dialog; dialog stays open with values |

### 6.6 Tablet and mobile

Tablet: the workflow panel stacks under the badges (Lab 3); the Actions Taken table becomes cards. Mobile: each
action is a card — header line Date/Time + follow-up badge; Description; "Result:" paragraph; "By {name}"; Attachment
Notes; a full-width row-menu button. **Record action** is full width at the top of the panel. No horizontal scroll.

Traceability: FR-01 – FR-17, BR-14 – BR-41, AC-01 – AC-14, AC-19 – AC-28, AC-39, AC-40.

---

## 7. Screen — Requester Ticket Detail, extended (`/tickets/:id`)

A read-only **Actions Taken** section between the ticket information and Public Comments, heading "Work done by
IT".

| Element | Definition |
|---|---|
| Rows | Cards at every viewport: Date/Time, Description, "Result:", "By {name} (IT Staff)", follow-up badge with the note when required, Attachment Notes as plain text, "Edited" marker when edited |
| Hidden | Voided actions (not returned by the API), every action button, version, editor identity |
| Empty | "IT has not recorded any work on this ticket yet." |
| Loading / failure | Own skeleton; own error callout with **Try again**; the rest of the page unaffected |
| Resolved | When `resolvedAt` is set, the summary line shows "Resolved on {date}" next to the status badge |

Traceability: FR-05, BR-42, BR-43, AC-16.

---

## 8. Drill-down destinations

| Screen | Lab 4 change |
|---|---|
| My Tickets | Status filter becomes a multi-select chip group of all eight statuses, initialised from repeated `status` URL parameters; the URL updates when filters change so back/forward and reload preserve the view |
| Ticket Queue | Adds a "Follow-ups" select: Any / Outstanding / Mine outstanding (`followUp`), initialised from the URL; rows show the follow-up badge when `outstandingFollowUps > 0` |
| User Management | Initialises the role filter from `?role=` |
| All three | When opened from a dashboard, a dismissible info line reads "Showing: {card label}" with **Clear filters**; the applied filters are visible in the controls, never hidden (AC-37) |

---

## 9. Final hardening rules (whole product)

| Rule | Requirement |
|---|---|
| Feedback family | Every remote operation uses the same components: `Skeleton` (loading), field errors + summary (validation), `role="status"` toast line (success), `EmptyState` (empty / no results), `ForbiddenState` (403), warning `Callout` (409), Lab 2 not-found (404), error `Callout` + **Try again** (500 / network) (FR-27) |
| Double submit | Every submit button disables with busy state while in flight (BR-82); Create Ticket keeps its Lab 2 duplicate rule; Action create reuses its `clientRequestId` on retry |
| Form preservation | Create Ticket, Action, Void reason, Comment, Internal Note, User create/edit keep values after any recoverable failure (BR-81, AC-46) |
| Console | No error-level console output and no React key or act warnings in the E2E run (AC-47) |
| Links | Every navigation link and dashboard `href` resolves to a real route |
| Cleanup | No placeholder text ("TODO", "Lorem", "Coming soon"), no unused component, no duplicate status control, no link to the Lab 1 system-check screen |
| Dates | Every timestamp renders through one formatter in `Asia/Bangkok`, format "20 Oct 2026 09:15"; relative time only beside it, never instead of it |

---

## 10. Responsive rules

Lab 2 §8 and Lab 3 §10 remain in force.

| Viewport | Lab 4 behaviour |
|---|---|
| Desktop ≥ 992 px | Dashboards: 3-column card grid, lists below in 2–3 columns. Actions Taken: 7-column table. Action form: 640 px modal |
| Tablet 768–991 px | Dashboards: 2-column grid. Actions Taken: cards. Action form: modal at 90 % width |
| Mobile < 768 px | Dashboards: one column, cards first. Actions Taken: cards with full-width menu button. Action form and Void dialog: full-screen, actions pinned at the bottom, never hidden by the on-screen keyboard |
| All sizes | No horizontal page scroll; long descriptions wrap (`overflow-wrap: anywhere`) and clamp with "Show more"; ticket numbers never wrap mid-token; touch targets ≥ 44 px |

Test viewports unchanged: 1280 × 800, 820 × 1180, 375 × 812.

---

## 11. Accessibility rules

Lab 2 §9 and Lab 3 §11 remain in force. Lab 4 adds:

| Rule | Requirement |
|---|---|
| Dashboard landmarks | Each dashboard is `<main>` with `h1`; card group and each list are `<section>`s with headings; metric cards are a `<ul>` of links so screen readers announce "list, 6 items" |
| Card names | Accessible name includes label and count (§2.1); the decorative arrow is `aria-hidden` |
| Conditional field | Toggling Follow-Up Required to "Yes" inserts the note field directly after the radio group; it receives `aria-required="true"`; focus stays on the radio (no unexpected jump); the change is announced via the radio's `aria-describedby` hint "A follow-up note will be required." |
| Date/time field | Native `datetime-local` with visible label including "(Bangkok time)" and format hint |
| Dialogs | Focus moves to the first field on open, is trapped while open, `Esc` cancels (except while saving), focus returns to the trigger on close |
| Row menu | `aria-haspopup="menu"`, arrow-key navigation, `Esc` closes; each item is a `menuitem` |
| Voided rows | `<details>`/`<summary>` so expand/collapse is native and keyboard-operable |
| Live results | Action saved, follow-up done, voided, and status saved announce via `role="status"`; failures via `role="alert"` |
| Blockers | The blockers callout is referenced by the status select's `aria-describedby`, so the reason Resolve is missing is announced with the control |
| Non-colour cues | Follow-up, voided, edited, and warning-border emphasis all carry text (AC-52) |

---

## 12. Reusable component inventory

Reused unchanged: `Badge`, `Button`, `Callout`, `ConfirmDialog`, `EmptyState`, `FormField`, `Pagination`,
`RadioGroup`, `SelectField`, `Skeleton`, `TextArea`, `TextField`, `StatusBadge`, `PriorityBadge`, `RoleBadge`,
`ForbiddenState`, `RequireRole`, `MessageList`, `MessageComposer`, `AttachmentSection`.

| New component | Responsibility |
|---|---|
| `MetricCard` | One count, one definition, one link (§2.1) |
| `MetricBreakdown` | Status / IT Priority count rows (§2.2) |
| `DashboardTicketList`, `DashboardActionList` | Capped recent lists with empty state (§2.3) |
| `ActionsTakenPanel` | Staff list, row menu, voided rows, Record action (§6.2) |
| `ActionTakenForm` | Create/edit form with conditional follow-up note (§2.4) |
| `RequesterActionsList` | Read-only Requester list (§7) |
| `FollowUpBadge` | The three follow-up states (§1.2) |
| `StaleCallout` | Stale-update recovery (§2.6) |
| `ResolutionBlockers` | Blocker callout (§2.7) |
| `formatBangkok` (lib) | The single timestamp formatter (§9) |

New screens: `RequesterDashboard.tsx`, `StaffDashboard.tsx`. Removed: any placeholder screen other than
`NotFoundScreen`.

---

## 13. Visual and accessibility inspection checklist

To be completed against the screenshots in §14, opened one by one — not from memory. Each item names the file that
proves it (paths relative to `artifacts/lab-04/screenshots/`); 🔍 marks a property a still image cannot show,
proven instead by the named automated test.

**Design consistency**
- [ ] Every Lab 4 screen uses only Zen Green tokens; no colour literal added — 🔍 STYLE-01
- [ ] Metric cards share one size, radius, shadow, and type scale across both dashboards
- [ ] Dashboard, Ticket Detail, and Lab 2–3 screens read as one product (header, spacing, buttons)
- [ ] No temporary, duplicate, or placeholder element remains on any screen — 🔍 E2E-12

**Dashboards**
- [ ] Every card shows label, number, definition, and "View list" — `staff-dashboard/loaded.*`, `requester-dashboard/loaded.*`
- [ ] Zero renders as `0`, not blank — `staff-dashboard/all-zero.*`, `requester-dashboard/all-zero.*`
- [ ] Warning border appears only on attention cards with count > 0
- [ ] All 8 statuses and all 4 IT Priorities listed, zero included — `staff-dashboard/loaded.*`
- [ ] Administrator Accounts group present only for the Administrator — `staff-dashboard/administrator.*`
- [ ] Drill-down lands with filters visible in the controls — `staff-dashboard/drill-down.*`, `requester-dashboard/drill-down.*`
- [ ] Selected metrics match database queries — 🔍 API-43 – API-44, API-51 – API-53 (screenshot of the matching query output in the submission)

**Actions Taken**
- [ ] Different actions by different staff on one Ticket are visible — `actions-taken/list-multiple.*`
- [ ] "Visible to the Requester" label permanently shown in the form — `actions-taken/create.*`
- [ ] Follow-up note appears only when "Yes" and is marked required — `actions-taken/follow-up-required.*`
- [ ] Validation messages sit under their fields and in the summary — `actions-taken/validation.*`
- [ ] Performed by and Created render read-only, visually distinct from editable fields — `actions-taken/edit.*`
- [ ] Voided row is clearly voided by text — `actions-taken/voided.*`
- [ ] Stale edit shows both versions and two explicit choices — `actions-taken/stale.*`
- [ ] Not-actionable reason line replaces Record action — `actions-taken/not-actionable.*`
- [ ] Requester sees read-only list without voided items — `actions-taken/requester-view.*`

**Ticket workflow**
- [ ] Status select lists only allowed transitions — `ticket-workflow/allowed-transitions.*`
- [ ] Blockers callout names each blocker in words — `ticket-workflow/resolution-blocked.*`
- [ ] Resolve confirmation states the action count — `ticket-workflow/resolve-confirm.*`
- [ ] Summary badge and Resolved at refresh after save — `ticket-workflow/resolved.*`
- [ ] Requester flag callout visible in the workflow panel — `ticket-workflow/requester-flagged.*`

**Responsive and accessibility**
- [ ] No horizontal page scroll, clipping, or overlap at all three viewports — 🔍 RESP-01
- [ ] Keyboard focus visible on cards, row menu, dialog fields, conditional field — 🔍 STYLE-07, A11Y-01 – A11Y-04
- [ ] Dialogs are full-screen on mobile with actions reachable above the keyboard — `actions-taken/create.mobile.png`
- [ ] Badges distinguishable in greyscale — `actions-taken/greyscale.desktop.png`; 🔍 STYLE-04

### 13.1 Deviations found during this pass

To be recorded during the visual pass: `D-nn`, description, evidence file, verdict (Fixed / Accepted with reason).

---

## 14. Screenshot paths

```
artifacts/lab-04/screenshots/
  staff-dashboard/      loading · loaded · all-zero · administrator · drill-down · forbidden · failure
  requester-dashboard/  loading · loaded · all-zero · drill-down · forbidden · failure
  actions-taken/        empty · list-multiple · create · follow-up-required · validation · edit · stale ·
                        complete-follow-up · void-dialog · voided · not-actionable · requester-view · greyscale
  ticket-workflow/      allowed-transitions · resolution-blocked · resolve-confirm · resolved ·
                        requester-flagged · stale-ticket · reopened
```

Every state at `desktop`, `tablet`, and `mobile` with the convention `<state>.<viewport>.png` (except
`greyscale.desktop.png`). Example: `artifacts/lab-04/screenshots/actions-taken/stale.mobile.png`.

---

## 15. Traceability

| Section | Functional requirements | Business rules | Acceptance criteria |
|---|---|---|---|
| §2.1 – §2.3, §4, §5 Dashboards | FR-18 – FR-22 | BR-47 – BR-71, BR-83 | AC-29 – AC-38 |
| §2.4, §2.5, §6.2, §6.3 Actions Taken | FR-01 – FR-09, FR-17 | BR-01 – BR-26, BR-44 | AC-01 – AC-15, AC-39 |
| §2.6 Stale callout | FR-15, FR-16 | BR-25, BR-28, BR-30 | AC-11, AC-26, AC-27 |
| §2.7, §6.4 Workflow | FR-10 – FR-14 | BR-31 – BR-41 | AC-19 – AC-28, AC-40 |
| §3 Shell | FR-24, FR-25, FR-31 | BR-79 | AC-44, AC-47 |
| §7 Requester detail | FR-05 | BR-42, BR-43 | AC-16, AC-17 |
| §8 Drill-down | FR-21, FR-23 | BR-53 – BR-69 | AC-37 |
| §9 Hardening | FR-26 – FR-31 | BR-80 – BR-83 | AC-43 – AC-47 |
| §10 Responsive | FR-33 | — | AC-49 |
| §11 Accessibility, §1.2 badges | FR-34 | BR-12 | AC-50 – AC-52 |

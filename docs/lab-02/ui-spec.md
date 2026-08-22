# Lab 2 UI Specification — Zen Green Theme

Project: TokTickIT — IT Service Desk
Sprint: Lab 2 — Requester Ticketing MVP with UI Foundation
Status: Draft for student review and approval (must be approved before implementation begins)
Companion documents: [specification.md](specification.md), [api-spec.md](api-spec.md), [tests.md](tests.md)

This document is the authoritative visual and interaction contract. Later labs extend it; they do not replace
it. Where this file and `specification.md` disagree, `specification.md` wins and this file is corrected.

Implementation base: React 19 + TypeScript + Vite + **Bootstrap 5** (already in the project). Zen Green is
applied by overriding Bootstrap's CSS custom properties in one stylesheet — not by adding a second UI library
and not by writing per-component colour values.

---

## 1. Design foundations

### 1.1 Colour tokens

Declared once in `client/src/styles/zen-theme.css` on `:root`. **No component may contain a literal colour
value** — every colour resolves to a token (AC-46).

| Token | Value | Intended use |
|---|---|---|
| `--zen-primary` | `#006B3C` | Application header, primary buttons, strong emphasis, active status badge |
| `--zen-primary-hover` | `#005730` | Primary button hover and active state (darkened primary) |
| `--zen-secondary` | `#0B7A46` | Active nav item, focus accent, links, hover states |
| `--zen-pale` | `#EAF6EF` | Selected row, success surface, subtle section emphasis, `MEDIUM` badge |
| `--zen-page-bg` | `#F5F7F6` | Page background |
| `--zen-surface` | `#FFFFFF` | Cards, panels, table surface |
| `--zen-border` | `#D7E0DA` | Card border, table rule, input border |
| `--zen-text` | `#1C2B24` | Body text (dark charcoal-green, never pure black) |
| `--zen-text-muted` | `#5A6B62` | Helper text, metadata, placeholder |
| `--zen-field-bg` | `#FFFFFF` | Editable input background |
| `--zen-readonly-bg` | `#EEF2EF` | Read-only and system-generated field shading |
| `--zen-error` | `#B3261E` | Error text, invalid border, required asterisk, destructive button |
| `--zen-error-bg` | `#FDECEA` | Error callout background |
| `--zen-warning` | `#B26A00` | Warning callout/badge, `HIGH` priority badge |
| `--zen-warning-bg` | `#FFF4E5` | Warning callout background |
| `--zen-success` | `#0B7A46` | Success confirmation text and border |
| `--zen-success-bg` | `#EAF6EF` | Success callout background |
| `--zen-neutral` | `#5A6B62` | `LOW` priority badge |
| `--zen-focus-ring` | `rgba(11, 122, 70, 0.35)` | Focus ring colour |

Bootstrap mapping (in the same file):

```css
:root {
  --bs-primary: var(--zen-primary);
  --bs-body-bg: var(--zen-page-bg);
  --bs-body-color: var(--zen-text);
  --bs-border-color: var(--zen-border);
  --bs-link-color: var(--zen-secondary);
  --bs-focus-ring-color: var(--zen-focus-ring);
}
```

**Contrast requirement:** every text/background pair must reach WCAG AA (4.5:1 for body text, 3:1 for large text
and for non-text indicators such as borders and focus rings). Verified pairs: `--zen-text` on `--zen-surface`
(13.9:1), `--zen-text` on `--zen-readonly-bg` (12.6:1), white on `--zen-primary` (6.4:1), `--zen-error` on
`--zen-surface` (6.5:1), `--zen-warning` on `--zen-warning-bg` (4.9:1).

**Colour is never the only signal** (AC-48). Every state also carries text, an icon, or a shape change.

### 1.2 Typography

| Role | Definition |
|---|---|
| Family | `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif` — no web-font download, and Thai text stays readable |
| Page title (`h1`) | 1.75 rem / 600 / `--zen-text` |
| Section title (`h2`) | 1.25 rem / 600 |
| Card title (`h3`) | 1.05 rem / 600 |
| Body | 1 rem / 400 / line-height 1.55 |
| Label | 0.9375 rem / 600 / `--zen-text` |
| Helper and metadata | 0.875 rem / 400 / `--zen-text-muted` |
| Validation message | 0.875 rem / 500 / `--zen-error` |
| Badge | 0.8125 rem / 600 / uppercase, letter-spacing 0.02em |
| Monospace | Ticket Number only: `ui-monospace, "Cascadia Mono", Consolas, monospace` — makes `TKT-2026-000041` scannable and prevents digit ambiguity |

Minimum rendered body text is 14 px at every viewport. Nothing scales below that on mobile.

### 1.3 Spacing and layout scale

4 px base scale: `4, 8, 12, 16, 24, 32, 48`.

| Element | Rule |
|---|---|
| Page container | `max-width: 1140px`, centred, horizontal padding 24 px desktop / 16 px mobile |
| Card | 24 px padding desktop, 16 px mobile; `border: 1px solid var(--zen-border)`; `border-radius: 10px`; `box-shadow: 0 1px 2px rgba(28,43,36,.06)` — restrained, one level only |
| Form field vertical rhythm | 8 px label → control, 4 px control → validation message, 20 px between fields |
| Section gap | 32 px desktop, 24 px mobile |
| Button gap in a group | 12 px |
| Table cell padding | 12 px vertical, 16 px horizontal |

Corner radius: 10 px cards, 8 px inputs and buttons, 999 px badges. One shadow level in the whole application.

---

## 2. Component rules

### 2.1 Control states

Every interactive control implements all six states. A control missing one of these is not done.

| State | Visual definition |
|---|---|
| Editable (default) | `--zen-field-bg` background, 1 px `--zen-border`, `--zen-text` text |
| Focused | 2 px `--zen-secondary` border **plus** a 3 px `--zen-focus-ring` outline offset by 1 px. Never removed for mouse users either (AC-47) |
| Invalid | 1 px `--zen-error` border, `aria-invalid="true"`, message below the field, and a small warning glyph inside the field's trailing edge (non-colour signal) |
| Read-only / system-generated | `--zen-readonly-bg` background, `--zen-border` border, `--zen-text` text, `readonly` attribute, no focus ring change, a small "system generated" helper line where the value's origin is not obvious (AC-46) |
| Disabled | 60 % opacity, `--zen-readonly-bg`, `cursor: not-allowed`, `disabled` attribute so it cannot be activated by keyboard or pointer |
| Busy | Applies to buttons only: inline spinner + label text, `disabled`, `aria-busy="true"` |

All single-line inputs and selects share **one** height: 42 px desktop, 44 px mobile (touch target). The
Description textarea is 6 rows by default, `resize: vertical` only, `max-height` capped at 60 vh so resizing
cannot break the layout.

### 2.2 Labels, required marker, and validation placement

- Labels sit **above** their control, left-aligned, consistent weight (0.9375 rem / 600), 8 px gap.
- Required fields render `<span class="zen-required" aria-hidden="true">*</span>` in `--zen-error` after the
  label text, and the control carries `aria-required="true"`. The asterisk **never** replaces the validation
  message.
- A legend appears once per form: "Fields marked * are required."
- Validation messages render **immediately below their own field**, in `--zen-error`, linked via
  `aria-describedby`. A single top-of-page error alone is forbidden (BR-18).
- On a failed submit, a summary callout also appears at the top of the form with `role="alert"`, stating the
  count and listing the field names as in-page anchor links: "3 fields need attention: Summary, Category,
  Related System." Focus moves to the **first** invalid control (AC-11).
- Client validation triggers on blur and on submit — never on every keystroke, which would flag a field the user
  is still typing.

### 2.3 Button hierarchy

| Level | Style | Used for |
|---|---|---|
| Primary | Solid `--zen-primary`, white text, hover `--zen-primary-hover` | Submit Ticket, Continue, Create Ticket |
| Secondary | Transparent, 1 px `--zen-primary` border, `--zen-primary` text | Cancel, Back to My Tickets, Clear filters |
| Tertiary | No border, `--zen-secondary` text, underline on hover | Row-level "View", inline links |
| Destructive | Transparent, 1 px `--zen-error` border, `--zen-error` text; solid `--zen-error` on hover | Remove attachment |
| Disabled | Per §2.1 | Any of the above when unavailable |
| Busy | Spinner + label, disabled, `aria-busy` | Any submitting action |

Rules: every button carries visible text; icons may support but never replace it. Every icon-only control (for
example the mobile filter toggle) has an `aria-label` **and** a `title`. Primary actions sit on the right of a
button group on desktop and full-width stacked on mobile, primary first.

Busy labels are explicit, not generic: "Submitting…", "Uploading…", "Removing…".

### 2.4 Badges

| Kind | Value | Background | Text | Extra non-colour signal |
|---|---|---|---|---|
| Requested Priority | `LOW` | `#EEF2EF` | `--zen-neutral` | Text "LOW" |
| | `MEDIUM` | `--zen-pale` | `--zen-primary` | Text "MEDIUM" |
| | `HIGH` | `--zen-warning-bg` | `--zen-warning` | Text "HIGH" + ▲ glyph |
| | `URGENT` | `--zen-error-bg` | `--zen-error` | Text "URGENT" + ▲▲ glyph |
| Current Status | `NEW` | `--zen-primary` | `#FFFFFF` | Text "NEW" |
| Attachment state | `REMOVED` | `#EEF2EF` | `--zen-text-muted` | Text "Removed" + strikethrough filename |

Badges are pill-shaped, uppercase, and always contain their own text (AC-48). The same badge component is reused
in the list, the detail screen, and any later screen — a second priority badge implementation is a defect.

### 2.5 Feedback surfaces

| Surface | Definition |
|---|---|
| Loading (block) | Skeleton rows for lists/tables, and a centred spinner with the text "Loading…" for a whole screen. Never a bare spinner with no text |
| Loading (inline) | Button busy state (§2.1) |
| Success | `--zen-success-bg` callout, 1 px `--zen-success` border, check glyph + text, `role="status"` |
| Error | `--zen-error-bg` callout, 1 px `--zen-error` border, warning glyph + text, `role="alert"`, and a **Try again** secondary button wired to the failed request |
| Warning | `--zen-warning-bg` callout, `--zen-warning` border. Reserved for real warnings (for example "4 of 5 attachment slots used") — never decoration |
| Empty | Centred card: short heading, one explanatory sentence, one primary action |
| No results | Same shape as Empty, different copy, and the primary action is **Clear filters** (BR-42) |

Every error callout states what failed and what the user can do. "Something went wrong" without a retry path is
not acceptable.

---

## 3. Application shell

Present on every route except `/select-requester`.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▓ TokTickIT        My Tickets | Create Ticket      Nadia Charoen  [Change ▸] │  ← --zen-primary bar
└──────────────────────────────────────────────────────────────────────────────┘
   ↑ app identity      ↑ nav, active underlined      ↑ dev requester context
```

| Element | Rule |
|---|---|
| App identity | "TokTickIT" wordmark, links to `/tickets` |
| Navigation | **My Tickets** and **Create Ticket**. Active route: white text with a 3 px underline in white plus `aria-current="page"` — the underline is the non-colour indicator |
| Requester display | Full name, and department as smaller muted text on desktop. Prefixed by the label "Testing as:" so nobody reads it as a logged-in user (BR-08, BR-50) |
| Change Requester | Secondary button (white outline on the green bar); returns to `/select-requester` and clears requester-scoped state (FR-04) |
| Mobile (< 768 px) | Wordmark + hamburger toggle (`aria-label="Open navigation"`, `aria-expanded`). Expanded panel stacks nav links, the requester name, and Change Requester. Closes on route change and on `Esc` |
| Height | 60 px desktop, 56 px mobile; the bar is not sticky in Lab 2 |

A skip link ("Skip to main content") precedes the header and is visible on focus. Main content is wrapped in
`<main id="main">`.

---

## 4. Screen — Development Requester Selection (`/select-requester`)

Purpose: choose the testing context. **Not a login screen** (BR-08).

### 4.1 Layout

```
                    ┌────────────────────────────────────┐
                    │            TokTickIT               │   h1
                    │  Select a Development Requester    │   h2
                    │                                    │
                    │  ⓘ  This is a Lab 2 testing        │   info callout, always visible
                    │     mechanism, not a login screen. │
                    │     Authentication and role-based  │
                    │     access arrive in Lab 3.        │
                    │                                    │
                    │  Development Requester *           │   label
                    │  [ Select a requester…        ▾ ]  │   select, 42/44 px
                    │  Choose who you are testing as.    │   helper
                    │                                    │
                    │            [    Continue    ]      │   primary, full width
                    └────────────────────────────────────┘
```

Centred card, `max-width: 480px`, vertically centred at ≥ 768 px, top-aligned with 24 px padding below 768 px.
No application shell on this route — there is no requester context yet.

### 4.2 States

| State | Presentation |
|---|---|
| Loading | Select replaced by a skeleton control; Continue disabled; text "Loading requesters…" |
| Loaded | Options as `Full Name — Department` (A-16). Placeholder option "Select a requester…" is selected, disabled, and non-submittable. Continue disabled until a real option is chosen |
| Empty (`[]` returned) | Empty callout: "No active Development Requesters found." Body: "Run `npx prisma db seed` in the server directory, then reload." Continue hidden. (AC-06) |
| API failure | Error callout with **Try again**; the select is not rendered; nothing is written to `localStorage` (AC-05) |
| Submitting | Continue shows "Continuing…" busy state |
| Rejected context | Arriving here after a `403 REQUESTER_CONTEXT_INVALID` shows a warning callout: "The selected requester is no longer available. Choose another." (AC-07) |

### 4.3 Behaviour

- Selecting and confirming stores the id in `localStorage` under `toktickit.requesterId` (BR-10) and navigates to
  `/tickets`.
- The form submits on `Enter` from the select (native form submission, no key handler needed).
- The inactive seeded Requester never appears (BR-47, AC-01).
- Visiting `/select-requester` with an existing context still shows the screen; picking a different Requester
  replaces the context and clears requester-scoped state (FR-04, AC-04).

Traceability: FR-01 – FR-05, BR-08 – BR-12, AC-01 – AC-07, AC-50.

---

## 5. Screen — Create Ticket (`/tickets/new`)

### 5.1 Desktop layout (≥ 992 px)

```
Create Ticket                                                          h1
┌── System information ─────────────────────────────────────────────┐
│ Ticket Number            Ticket Date            Current Status     │   3 read-only fields
│ [ Generated on submit ]  [ Set on submit    ]   [ NEW          ]   │   --zen-readonly-bg
│ Requester                                                          │
│ [ Nadia Charoen — Registrar Office              ]                  │   read-only, from context
└────────────────────────────────────────────────────────────────────┘
┌── Classification ─────────────────────────────────────────────────┐
│ Category *                        Related System *                 │   2 columns
│ [ Select a category…        ▾ ]   [ Select a system…        ▾ ]    │
│ Requested Priority *                                               │
│ ( ) Low  (•) Medium  ( ) High  ( ) Urgent                          │   radio group, MEDIUM preselected
└────────────────────────────────────────────────────────────────────┘
┌── Problem description ────────────────────────────────────────────┐
│ Ticket Summary *                                        12 / 120   │   counter, muted
│ [                                                              ]   │
│ Description *                                          148 / 2000  │
│ [                                                              ]   │   6 rows, resizable vertically
│ [                                                              ]   │
└────────────────────────────────────────────────────────────────────┘
┌── Attachments (0 of 5) ───────────────────────────────────────────┐
│ [ Choose files ]  JPG, PNG, WEBP or PDF · max 5 MB each · up to 5  │
│ (staged file rows appear here)                                     │
└────────────────────────────────────────────────────────────────────┘
                                        [ Cancel ]  [ Submit Ticket ]
```

Four cards in this order: system-generated values first (so the user sees what the system will produce),
classification grouped together, Summary and Description given full width, Attachments below the main fields,
actions at the bottom right.

### 5.2 Field specification

| Field | Control | Editable | Validation (BR-17) |
|---|---|---|---|
| Ticket Number | Read-only input | No | Shows "Generated on submit" before creation |
| Ticket Date | Read-only input | No | Shows "Set on submit" before creation |
| Current Status | Read-only input | No | Always `NEW` |
| Requester | Read-only input | No | From the selected context; proves the ticket binding on screen (Part 6.1 of the submission) |
| Category * | `<select>` from `GET /api/categories` | Yes | Required, must be a real active id |
| Related System * | `<select>` from `GET /api/related-systems` | Yes | Required, must be a real active id |
| Requested Priority * | Radio group, 4 options | Yes | Required; `MEDIUM` preselected (BR-06). Radios, not a select — four values that must all be visible for a fast choice |
| Ticket Summary * | `<input type="text" maxlength="120">` | Yes | 10–120 after trim; live counter turns `--zen-warning` at 110+ |
| Description * | `<textarea maxlength="2000">` | Yes | 20–2000 after trim; live counter turns `--zen-warning` at 1900+ |
| Attachments | File input + staged list | Yes | Client pre-check of type/size/count; the server is authoritative |

`maxlength` prevents over-typing, but the **minimum** is enforced by validation messages, never by blocking
input.

### 5.3 Screen states

| State | Presentation |
|---|---|
| Initial | Empty editable fields, read-only placeholders, Submit enabled |
| Reference data loading | Category and Related System selects show a skeleton and are disabled; Submit disabled |
| Reference data failure | Error callout above the Classification card with **Try again**; the selects stay disabled; the rest of the form remains usable so typed text is never lost |
| Validation failure | Per §2.2: summary callout with a count, per-field messages, focus on the first invalid control, no request sent (AC-11, AC-13) |
| Submitting | Submit shows "Submitting…" busy state and is disabled; Cancel disabled; fields become read-only for the duration so the payload cannot change mid-flight (AC-14) |
| Success | The form is replaced by a success card (§5.4) |
| Submission failure | Error callout at the top of the form; **every entered value and every staged file is preserved**; Submit re-enabled (BR-20, AC-16) |
| Duplicate (`409`) | Warning callout: "A ticket with the same summary and description was submitted moments ago." The form is not cleared and a link to My Tickets is offered (AC-15) |
| Invalid attachment | Per §5.5; the file row is marked invalid and is excluded from upload; the rest of the form is unaffected (AC-19) |

### 5.4 Success state

```
┌──────────────────────────────────────────────────────────┐
│ ✓  Ticket created                                        │   --zen-success-bg
│                                                          │
│    Ticket Number   TKT-2026-000041                       │   monospace, 1.5 rem
│    Submitted       22 Aug 2026 10:11                     │
│    Attachments     2 uploaded · 1 failed  [ Retry ]      │   only when files were staged
│                                                          │
│    [ View Ticket ]  [ Create Another ]  [ My Tickets ]   │
└──────────────────────────────────────────────────────────┘
```

The Ticket Number is the most prominent element on the screen and is selectable text (a user will copy it). Per
file, the upload outcome is listed individually; a failed file offers a retry that targets Ticket Detail
(BR-29, AC-23). **Create Another** resets the form to its initial state.

### 5.5 Attachment control (create mode)

```
Attachments (2 of 5)
[ Choose files ]   JPG, PNG, WEBP or PDF · max 5 MB each · up to 5 files
┌────────────────────────────────────────────────────────────────────┐
│ 🖼  screenshot-error.png      812 KB                    [ Remove ] │  staged
│ 📄  battery-report.pdf        248 KB                    [ Remove ] │  staged
│ ⚠  crash-dump.exe            1.2 MB   File type not allowed  [ ✕ ] │  invalid
└────────────────────────────────────────────────────────────────────┘
```

| Rule | Definition |
|---|---|
| Selection | Native `<input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf">`; the visible trigger is a secondary button labelled "Choose files" bound to the input via `<label>` |
| Client pre-check | Extension and size are checked before staging so the user gets instant feedback; the server remains authoritative (BR-23, BR-24) |
| Invalid file row | Stays visible with `--zen-error` text stating the exact reason ("File type not allowed", "File is larger than 5 MB") and a dismiss control. It is never uploaded |
| Counter | The card heading shows "Attachments (n of 5)"; at 5 staged files the Choose files button is disabled with the helper text "Attachment limit reached" |
| Filename display | Truncated with an ellipsis in the middle, full name in `title` (AC-49) |
| Persistence | Staged files survive a failed submit (BR-20, AC-16) |
| Upload timing | Files upload only **after** the ticket is created, sequentially, one request each (BR-29) |
| Uploading | Each row shows a determinate progress bar where the browser reports progress, otherwise an indeterminate bar plus "Uploading…" |

Traceability: FR-07 – FR-16, BR-01 – BR-06, BR-17 – BR-29, AC-08 – AC-23, AC-30, AC-46.

---

## 6. Screen — My Tickets (`/tickets`)

### 6.1 Desktop layout (≥ 992 px)

```
My Tickets                                              [ + Create Ticket ]
┌────────────────────────────────────────────────────────────────────────┐
│ [ 🔍 Search ticket number, summary, description        ]               │
│ Category [ All ▾]  System [ All ▾]  Priority [ All ▾]  Status [ All ▾] │
│ Sort [ Newest first ▾]   Show [ 10 ▾]           [ Clear filters ]      │
└────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────┐
│ TICKET NUMBER   SUMMARY          CATEGORY  SYSTEM   PRIORITY  STATUS  … │
│ TKT-2026-000041 Laptop battery…  Hardware  Laptop   [HIGH]    [NEW]   › │
│ TKT-2026-000038 Cannot connect…  Network   VPN      [MEDIUM]  [NEW]   › │
└────────────────────────────────────────────────────────────────────────┘
Showing 1–10 of 12                        [ ‹ Prev ]  1  [2]  [ Next › ]
```

Table columns, in order: Ticket Number (monospace), Summary (truncated to one line with `title`), Category,
Related System, Requested Priority badge, Current Status badge, Ticket Date, Last Updated, and a chevron
affordance. Attachment count appears as a paperclip glyph with a number beside the Summary when > 0.

Column justification: Ticket Number is how a user refers to a ticket to IT; Summary identifies it; Category and
Related System are how a user narrows a long list mentally; Priority and Status are the two at-a-glance states;
Ticket Date and Last Updated distinguish otherwise similar rows and match the sortable fields. Description is
deliberately absent — it is searchable but too long for a row.

### 6.2 Tablet (768–991 px)

Same table, with Related System and Last Updated hidden (their values remain in Ticket Detail). Filters wrap to
two rows.

### 6.3 Mobile (< 768 px)

Cards, one per ticket:

```
┌──────────────────────────────────────────┐
│ TKT-2026-000041            [HIGH] [NEW]  │
│ Laptop battery drains within thirty…     │
│ Hardware · Corporate Laptop              │
│ 22 Aug 2026 · 📎 2                       │
└──────────────────────────────────────────┘
```

The whole card is the link target (minimum 44 px height). Search stays visible; filters and sort collapse behind
a **Filters** disclosure button showing the active filter count as a badge ("Filters · 2").

### 6.4 Controls

| Control | Definition |
|---|---|
| Search | Single text input, debounced 350 ms, submits on `Enter` too. Placeholder: "Search ticket number, summary, description". Clearing it removes the search |
| Filters | Four selects (Category, Related System, Priority, Status), each defaulting to "All". Populated from the reference endpoints; Status offers only `NEW` in Lab 2 |
| Sort | One select mapping to `sortBy` + `sortOrder`: Newest first (default), Oldest first, Recently updated, Ticket Number ascending, Ticket Number descending, Priority high → low, Priority low → high |
| Page size | Select with 10 / 20 / 50 (BR-38) |
| Clear filters | Secondary button, visible only when at least one filter or the search term is active; resets everything and returns to page 1 |
| Pagination | Prev / numbered pages / Next, with the current page marked `aria-current="page"`; Prev disabled on page 1, Next disabled on the last page. Range text "Showing 1–10 of 12" sits to the left |
| Page reset | Any change to search, a filter, or the page size resets to page 1 (BR-41, AC-38) |
| URL sync | The active query state is mirrored into the URL query string so a filtered view can be reloaded and screenshotted |

### 6.5 States

| State | Presentation |
|---|---|
| Loading (first load) | Six skeleton rows (desktop) or three skeleton cards (mobile); the toolbar renders but is disabled |
| Loading (page or filter change) | The existing list dims to 60 % opacity with `aria-busy="true"`; controls stay enabled. Rows are not removed, so the layout does not jump |
| Loaded | Table or cards per viewport |
| Empty (no tickets at all) | Card: "You have not created any tickets yet." Body: "When you submit a ticket it will appear here." Primary action **Create Ticket**. No filter controls are shown, because there is nothing to filter (BR-42, AC-32) |
| No results (filters/search matched nothing) | Card: "No tickets match your search." Body echoes the active criteria. Primary action **Clear filters**; the toolbar stays visible (BR-42, AC-33) |
| Failure | Error callout replacing the list, with **Try again**. No stale rows are shown as if current (AC-40) |
| Requester switch | The list is cleared before the new request resolves, so Requester A's rows are never visible under Requester B's name (BR-12, AC-04) |

Traceability: FR-21 – FR-27, BR-12, BR-34 – BR-42, AC-04, AC-31 – AC-40, AC-45, AC-49.

---

## 7. Screen — Requester Ticket Detail (`/tickets/:id`, view mode)

Read-only for ticket data (BR-44). No comments, no internal notes, no actions taken, no status control (X-02 –
X-04).

### 7.1 Desktop layout

```
‹ Back to My Tickets
TKT-2026-000041                                      [HIGH]  [NEW]        h1 = ticket number
Created 22 Aug 2026 10:11 · Last updated 22 Aug 2026 10:19
┌── Ticket information ─────────────────────────────────────────────┐
│ Requester        Nadia Charoen — Registrar Office                  │
│ Category         Hardware          Related System  Corporate Laptop│
│ Requested Priority  HIGH           Current Status  NEW             │
├────────────────────────────────────────────────────────────────────┤
│ Summary                                                            │
│ Laptop battery drains within thirty minutes                        │
│ Description                                                        │
│ The battery on my assigned corporate laptop drops from 100% …      │
└────────────────────────────────────────────────────────────────────┘
┌── Attachments (2 active of 5) ────────────────────────────────────┐
│ [ Add attachment ]  JPG, PNG, WEBP or PDF · max 5 MB each          │
│ 📄 battery-report.pdf   248 KB  22 Aug 10:19  [Download] [Remove] │
│ 🖼 wrong-screenshot.png 812 KB  22 Aug 10:14  Removed — "Uploaded │
│    the wrong screenshot" · 22 Aug 10:22                            │
└────────────────────────────────────────────────────────────────────┘
```

Ticket information is presented as a definition list (`<dl>`), not as disabled inputs — the data is not a form.
Read-only *fields* on Create Ticket use `--zen-readonly-bg` inputs; Ticket Detail uses labelled values on the
card surface, which is clearer for pure reading and impossible to mistake for an editable form.

Mobile: every pair stacks to a single column; the header wraps with badges below the ticket number.

### 7.2 Attachment section states

| State | Presentation |
|---|---|
| None | "No attachments on this ticket." plus the Add attachment button |
| Active | Type glyph, filename (truncated, `title` full), size, upload timestamp, **Download** (secondary) and **Remove** (destructive) |
| Image preview | JPG/PNG/WEBP show a 48 px thumbnail loaded through the download endpoint; PDFs show a document glyph only (A-15) |
| Uploading | A pending row with an indeterminate progress bar and "Uploading…"; Add attachment is disabled meanwhile |
| Invalid | Inline error row stating the exact server reason (type / size / limit), with a dismiss control. Nothing is added to the list |
| Limit reached | Add attachment disabled, warning helper: "Attachment limit reached. Remove an attachment to add another." (BR-25, AC-21) |
| Removing | The row's Remove button shows "Removing…" busy state |
| Removed | Filename struck through, `REMOVED` badge, removal reason and timestamp in muted text, **no Download and no Remove control, and no thumbnail** (BR-32, AC-26, AC-27) |
| Unavailable | If a download returns `410` or `404` (for example in a stale tab), an inline error appears: "This attachment is no longer available." and the section reloads |

Section heading counts **active** attachments only: "Attachments (2 active of 5)". Removed rows appear below
active rows, in a subdued sub-group headed "Removed".

### 7.3 Removal confirmation

A modal dialog (`role="dialog"`, `aria-modal="true"`, focus trapped, `Esc` closes, focus returns to the Remove
button):

```
┌────────────────────────────────────────────────┐
│ Remove attachment                              │
│ battery-report.pdf will no longer be           │
│ downloadable. Its record is kept on the ticket.│
│                                                │
│ Reason for removal *                           │
│ [                                          ]   │  5–200 chars, counter
│                                                │
│              [ Cancel ]   [ Remove attachment ]│  secondary / destructive
└────────────────────────────────────────────────┘
```

Remove is disabled until the reason reaches 5 characters (BR-17, BR-31, AC-25, AC-28). The copy states plainly
that the record is retained — a user must not think this is a permanent delete.

### 7.4 Screen states

| State | Presentation |
|---|---|
| Loading | Skeleton header plus two skeleton cards |
| Loaded | As above |
| Not found / no access (`404`) | Card: "Ticket not found." Body: "This ticket does not exist, or it does not belong to the requester you are testing as." Primary action **Back to My Tickets**. **Identical** for a non-existent id and for another Requester's ticket (BR-13, AC-41, AC-44) |
| Failure (`500` / network) | Error callout with **Try again** |

Traceability: FR-17 – FR-20, FR-28 – FR-30, BR-13, BR-14, BR-26, BR-30 – BR-33, BR-43, BR-44, AC-24 – AC-30,
AC-41 – AC-44.

---

## 8. Responsive rules

| Viewport | Required behaviour |
|---|---|
| Desktop ≥ 992 px | Multi-column form layout as specified; content centred with `max-width: 1140px`; My Tickets as a table |
| Tablet 768–991 px | Two-column layout where practical; Summary and Description keep full width; the table drops Related System and Last Updated; filters wrap |
| Mobile < 768 px | All fields stack in one column; My Tickets renders as cards; the nav collapses into a hamburger; filters collapse behind a disclosure; buttons are full-width and ≥ 44 px tall; **no horizontal page scrolling** |
| All sizes | No clipped labels, no overlapping messages, no hidden buttons, no unreadable attachment names; long values truncate with an ellipsis and expose the full text through `title` |

Breakpoints use Bootstrap's `md` (768 px) and `lg` (992 px) so the grid and the specification agree.

Overflow rule: if any element cannot fit (a wide table on tablet), the **element** scrolls inside its own
container with `overflow-x: auto`; the page body never scrolls horizontally (AC-45).

Test viewports: 1280 × 800 (desktop), 820 × 1180 (tablet), 375 × 812 (mobile).

---

## 9. Accessibility rules

| Rule | Requirement |
|---|---|
| Landmarks | `<header>`, `<nav>`, `<main id="main">`, and a visible-on-focus skip link |
| Labels | Every control has a programmatic label; placeholders are never used as labels |
| Required fields | `aria-required="true"` plus the visible asterisk and the form legend |
| Errors | `aria-invalid="true"`, message linked with `aria-describedby`, summary callout with `role="alert"`, focus moved to the first invalid control |
| Live regions | Loading uses `aria-busy`; success uses `role="status"`; failure uses `role="alert"` |
| Keyboard | Every control reachable and operable by keyboard, in visual order; the modal traps focus and restores it on close; no keyboard trap anywhere (AC-47) |
| Focus visibility | A visible focus ring everywhere; `outline: none` without a replacement is forbidden |
| Colour independence | Every state conveys meaning through text, glyph, or shape in addition to colour (AC-48) |
| Contrast | WCAG AA for all text and non-text indicators (§1.1) |
| Touch targets | ≥ 44 × 44 px on mobile |
| Images | Attachment thumbnails carry `alt` set to the original filename; decorative glyphs are `aria-hidden` |
| Motion | Transitions ≤ 150 ms and disabled under `prefers-reduced-motion: reduce` |
| Language | `<html lang="en">` |

---

## 10. Reusable component inventory

Built once in Lab 2 under `client/src/components/`, reused by later labs (FR-33):

| Component | Responsibility |
|---|---|
| `AppShell` | Header, navigation, requester display, Change Requester, mobile nav |
| `RequesterGuard` | Redirects to `/select-requester` when no valid context exists (FR-05) |
| `FormField` | Label + required marker + control slot + helper + validation message wiring |
| `TextField`, `TextArea`, `SelectField`, `RadioGroup` | Controls implementing all six states (§2.1), with character counters where specified |
| `Button` | Variant (primary / secondary / tertiary / destructive), busy, disabled |
| `Badge` | `priority` and `status` variants (§2.4) |
| `Callout` | `success` / `error` / `warning` / `info`, with an optional retry action |
| `SkeletonRows`, `SkeletonCard` | Loading placeholders |
| `EmptyState` | Heading, body, primary action — used for both empty and no-results with different copy |
| `DataTable` / `CardList` | Responsive list pair driven by one column definition |
| `Pagination` | Prev / pages / Next plus the range text |
| `FilterBar` | Search, filters, sort, page size, Clear filters, mobile disclosure |
| `AttachmentList` / `AttachmentRow` | All attachment states (§7.2) |
| `ConfirmDialog` | Accessible modal used by the removal confirmation |

A second implementation of any of these is a review defect.

---

## 11. Visual inspection checklist

Completed against the screenshots in §12, not from memory (Lab 2 handout §8.8). Every line is checked at all
three viewports.

**Colour and theme**
- [ ] Header, primary buttons, and strong emphasis use `#006B3C`
- [ ] Active nav, links, and focus accents use `#0B7A46`
- [ ] Selected/success surfaces use `#EAF6EF`; page background is `#F5F7F6`
- [ ] Cards are white with one subtle border and one restrained shadow level
- [ ] Body text is dark charcoal-green, not pure black
- [ ] No literal hex value exists outside `zen-theme.css`

**Fields**
- [ ] Read-only fields (Ticket Number, Ticket Date, Requester, Status) are visibly distinct and still readable
- [ ] All single-line inputs share one height; Description is taller and resizes without breaking the layout
- [ ] Required fields show a red asterisk **and** the form legend appears once
- [ ] Focus ring is visible on every control, including selects and file inputs

**Validation**
- [ ] Every message sits directly below its own field
- [ ] The summary callout states the count and names the fields
- [ ] Focus lands on the first invalid control after a failed submit
- [ ] No message appears only at the top of the page

**Buttons**
- [ ] Hierarchy is visually obvious: primary vs secondary vs tertiary vs destructive
- [ ] Disabled controls are visibly distinct and cannot be activated
- [ ] Submit shows a busy label and is disabled while in flight
- [ ] Every button has visible text; every icon-only control has a label and tooltip

**Badges and states**
- [ ] Priority badges match §2.4 exactly and carry text
- [ ] Status `NEW` badge is consistent on the list and the detail screen
- [ ] Removed attachments show the `REMOVED` badge, the reason, the timestamp, and **no** download or preview control
- [ ] Empty and no-results states are visibly different and offer the right primary action

**Layout integrity**
- [ ] No clipped label at any viewport
- [ ] No overlapping message or badge
- [ ] No unintended horizontal page scrolling
- [ ] No hidden or unreachable primary action on mobile
- [ ] Long attachment filenames truncate and expose the full name in `title`
- [ ] Filters, pagination, and attachment controls remain usable at 375 px

**Accessibility**
- [ ] Full keyboard pass on all four screens with no trap
- [ ] The modal traps focus and returns it on close
- [ ] Screen text confirms the selector is a Lab 2 testing mechanism, not authentication

---

## 12. Screenshot paths

Captured by Playwright at 1280 × 800, 820 × 1180, and 375 × 812, named `<state>.<viewport>.png`.

```
artifacts/lab-02/screenshots/
  requester-selection/   loading · loaded · empty · error
  create-ticket/         initial · validation-failure · submitting · success · api-failure · invalid-attachment
  my-tickets/            loaded · empty · no-results · filtered · page-2 · error
  ticket-detail/         loaded · attachment-active · attachment-removed · remove-dialog · not-found
```

Example: `artifacts/lab-02/screenshots/create-ticket/validation-failure.mobile.png`.

Each directory is a required submission artefact (handout §14, Parts 6–9). Screenshot generation and the UI-style
assertions are specified in [tests.md](tests.md).

---

## 13. Traceability

| Section | Functional requirements | Business rules | Acceptance criteria |
|---|---|---|---|
| §1 Foundations | FR-33 | — | AC-46, AC-48 |
| §2 Components | FR-09, FR-31, FR-33 | BR-18 | AC-11, AC-46 – AC-48 |
| §3 Application shell | FR-03, FR-05 | BR-08, BR-12, BR-50 | AC-03, AC-45 |
| §4 Requester Selection | FR-01 – FR-05 | BR-08 – BR-12, BR-47 | AC-01 – AC-07, AC-50 |
| §5 Create Ticket | FR-07 – FR-16 | BR-01 – BR-06, BR-17 – BR-29 | AC-08 – AC-23, AC-30 |
| §6 My Tickets | FR-21 – FR-27 | BR-12, BR-34 – BR-42 | AC-04, AC-31 – AC-40 |
| §7 Ticket Detail | FR-17 – FR-20, FR-28 – FR-30 | BR-13, BR-14, BR-26, BR-30 – BR-33, BR-43, BR-44 | AC-24 – AC-29, AC-41 – AC-44 |
| §8 Responsive | FR-32 | — | AC-45, AC-49 |
| §9 Accessibility | FR-31 – FR-33 | BR-18 | AC-47, AC-48 |
| §11 Checklist | FR-33 | — | AC-45, AC-46, AC-48 |

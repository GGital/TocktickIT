# Answer Parts 5–9 — captured evidence

Captured 5 September 2026 against the running app (server on :3000, client on :5173) and the
live PostgreSQL database. Uncommitted by request — these files exist only in the working tree.

Requester A = **Areeya Pongsak** (id 4) · Requester B = **Kittipong Wong** (id 3)

## Answer Part 5 — Development Requester Selection

| File | Shows |
|---|---|
| `part5-01-selection-loaded.png` | Selection screen: active requesters loaded from PostgreSQL, plus the visible notice that this is a Lab 2 testing mechanism and not a login |
| `part5-02-selection-chosen.png` | A requester chosen in the dropdown, Continue enabled |
| `part5-03-shell-shows-requester.png` | Application shell after Continue: "Testing as: Areeya Pongsak — Finance Department" with the **Change Requester** action |

The seeded inactive requester (`Somchai Retired`, id 5) never appears — confirmed in `db-evidence.txt`.

## Answer Part 6 — Create Ticket

| File | Shows |
|---|---|
| `part6-01-requester-field-populated.png` | Requester field read-only and populated from the selection made before entering the app (submission sub-demo 1) |
| `part6-02-reference-data-from-database.png` | Category and Related System chosen from values loaded from the database (sub-demo 2) |
| `part6-03-filled-before-submit.png` | Completed form immediately before submission |
| `part6-04-success-with-ticket-number.png` | Success state with the backend-generated **TKT-2026-000342** |

Sub-demo 1 proof that the saved ticket carries the matching `requesterId` is in `db-evidence.txt`:
ticket id 564, `TKT-2026-000342`, status `NEW`, `requesterId` 4 = Areeya Pongsak.

Already captured by the E2E suite, in `artifacts/lab-02/screenshots/create-ticket/`:
`validation-failure` (sub-demo 3), `invalid-attachment` (sub-demo 4), `api-failure` (sub-demo 5),
`submitting`, `initial` — each at all three viewports.

## Answer Part 7 — My Tickets

| File | Shows |
|---|---|
| `part7-01-requester-a-list.png` | Requester A's list |
| `part7-02-search-applied.png` | Server-side search narrowing the list |
| `part7-03-sorted-priority-high-to-low.png` | Sorted by priority, URGENT first (severity order, not alphabetical) |
| `part7-04-filtered-urgent-only.png` | Priority filter applied |
| `part7-05-requester-b-list.png` | After switching to Requester B: **none of A's tickets appear**, B sees only their own |

Empty state, no-results state and page 2 are already in `artifacts/lab-02/screenshots/my-tickets/`.

## Answer Part 8 — Ticket Detail and attachments

| File | Shows |
|---|---|
| `part8-01-detail-with-active-attachment.png` | Owned Ticket Detail, read-only, with an active attachment |
| `part8-02-after-download.png` | After a real download through the UI |
| `downloaded-evidence-screenshot.png` | The file the browser actually downloaded |
| `part8-03-remove-dialog-with-reason.png` | Removal confirmation with the required reason typed |
| `part8-04-removed-metadata-retained.png` | After removal: struck-through filename, REMOVED badge, reason, timestamp, remover, "0 active of 5", and **no download or preview control** |
| `part8-05-unauthorized-not-found.png` | Requester B opening A's ticket: the safe not-found card |

API-level proof is in `api-status.txt`, taken from the same run:

```
Part 8 — owner downloads a REMOVED attachment: HTTP 410 ATTACHMENT_REMOVED
Part 8 — requester B downloads A's attachment: HTTP 404 ATTACHMENT_NOT_FOUND
Part 8 — requester B opens A's ticket:          HTTP 404 TICKET_NOT_FOUND
```

Soft removal is genuinely soft: `db-evidence.txt` shows attachment 210 still present with its
`removalReason` and `removedById`, and the stored file
`server/uploads/565/a6454123-797d-4675-b3de-38eb5b2314a0.png` is still on disk.

## Answer Part 9 — Zen Green and responsive

| File | Shows |
|---|---|
| `part9-my-tickets.desktop.png` / `.tablet.png` / `.mobile.png` | My Tickets at 1280×800, 820×1180, 375×812 — table becomes cards on mobile |
| `part9-create-ticket.desktop.png` / `.tablet.png` / `.mobile.png` | Create Ticket at the same three viewports |

The completed visual checklist is `docs/lab-02/ui-spec.md` §11; the full 63-file inventory is in
`artifacts/lab-02/screenshots/`.

## Database evidence

| File | Shows |
|---|---|
| `db-evidence.txt` | The three queries: the browser-created ticket with its owner, the retained soft-removed attachment row, and the five seeded requesters with the inactive one flagged |
| `studio-01-ticket-rows.png` | Prisma Studio Ticket table — live database contents with ticketNumber, requesterId, categoryId, relatedSystemId |

## Still to capture by hand

These need your machine or your logged-in accounts, so they are not here:

- Terminal output for `cd server && npm test`, `cd client && npm test`, `npx playwright test` (Part 3)
- GitHub Project Kanban with every Issue in Done (Part 1)
- Rendered `docs/lab-02/*.md` pages and the commit graph, if you want them as images rather than links

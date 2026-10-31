# Lab 4 — Peer Review

Repository under review: https://github.com/GGital/TocktickIT
Branching: the engineering contract and every Lab 4 Issue were built on their own branch and merged into
`lab4-staging` through a reviewed Pull Request. No commit was pushed directly to `main` or to `lab4-staging`; the two
accidental pushes to `lab4-staging` during #81 and #82 were reverted before review, and the work arrived through its
Pull Request.

Review data below was read from the GitHub API on 31 October 2026, after my last review. Every Lab 4 Pull Request on
this repository is reviewed and merged except this documentation one, which has not been reviewed yet. On my partner's
repository, all ten of their Lab 4 Pull Requests are approved; nine are merged, and the tenth, #72, is approved with
four items to finish before it merges. Dates are as GitHub records them (UTC).

## My Reviewer

| Field | Value |
|---|---|
| Name | Praewa Thuwatharanimitkul |
| Student ID | 67070503432 |
| GitHub username | [@MeldyRose](https://github.com/MeldyRose) |
| Their repository | https://github.com/MeldyRose/TokTickIT-Individual-Sprints |
| Association on this repository | Collaborator |

Author of this repository: Phattaratorn Mahatkeerati — 67070503433 — [@GGital](https://github.com/GGital).

## Reviews I Received

All ten Lab 4 Pull Requests so far — the contract and nine implementation Issues — were reviewed by
[@MeldyRose](https://github.com/MeldyRose). Nine were approved on first submission. One, #99, was sent back with
**Request changes**, fixed on the branch, and re-approved. The quotations are excerpts from the review bodies.

| Pull Request | Review | Comment received | My response |
|---|---|---|---|
| [#91](https://github.com/GGital/TocktickIT/pull/91) — Lab 4 engineering contract | Approved 20 Oct | "All IDs (FR-01–FR-34, BR-01–BR-84, AC-01–AC-52, A-01–A-21) match up cleanly across the specs … all 52 ACs are mapped, and all 157 planned tests are set to `Pending`." Noted a typo in the PR body: "the PR description says '6 new and 6 changed endpoints', but the spec tables actually list 8 new and 7 changed endpoints." | Merged 23 Oct. The miscount was only in the PR description; the contract was already correct. |
| [#92](https://github.com/GGital/TocktickIT/pull/92) — data model, migration, seed (Issue #80) | Approved 28 Oct | "Good catch on the Prisma `P3012` behavior with `prisma migrate resolve --rolled-back`. Deleting the history row in `down.sql` is definitely the right practical approach here, and the round-trip test confirms it works." | Merged 28 Oct. |
| [#93](https://github.com/GGital/TocktickIT/pull/93) — Actions Taken API (#81) | Approved 28 Oct | "Robust handling of `clientRequestId` (including concurrent `P2002` deduplication) and optimistic concurrency on `version` (`409 STALE_ACTION`) … Staff routes under `/api/staff` refuse Requesters before ticket lookups (BR-72)." | Merged 28 Oct. |
| [#94](https://github.com/GGital/TocktickIT/pull/94) — workflow, resolution gate, concurrency API (#82) | Approved 28 Oct | "Pulled the branch and ran the test suite locally—everything is green … Totally fine with updating Lab 3 `UNIT-09` instead of deleting it." Agreed to merge ahead of #85 even though the staff screen would break until it landed. | Merged 29 Oct. The PR title repeats #95's by mistake; the branch and body are #82's. |
| [#95](https://github.com/GGital/TocktickIT/pull/95) — dashboard APIs (#83) | Approved 28 Oct | "**`requesterFlagged` link:** Good catch adding the active statuses. Keeping the count reconciled with `meta.totalItems` is definitely the right move here so cancelled tickets don't mess up the list." | Merged 29 Oct. |
| [#96](https://github.com/GGital/TocktickIT/pull/96) — Actions Taken UI (#84) | Approved 28 Oct | "Conditional follow-up note shows only on 'Yes', keeps state, and is omitted on 'No' (AC-39) … Tests: 286/286 passed … `tsc -b && vite build` built cleanly; 0 lint errors." | Merged 29 Oct. |
| [#97](https://github.com/GGital/TocktickIT/pull/97) — ticket workflow UI (#85) | Approved 29 Oct | Approved with one accessibility request: "To avoid screen readers aggressively interrupting right on page load, let's switch the static banner to `role=\"status\"` … and keep `role=\"alert\"` for dynamic save-time rejections." Asked to keep the "Operations" heading rather than rename it to "Workflow". | Merged 29 Oct without the `role` change. It was found again during this visual pass and fixed in this Pull Request (`ui-spec.md` §13.1 D-01). |
| [#98](https://github.com/GGital/TocktickIT/pull/98) — dashboard screens (#86) | Approved 29 Oct | "Full client suite is green (324/324 passing) … sticking to the spec for `.zen-metric-attention` over the hook warning was the right call." Flagged one layout point: "don't forget to have that 3rd card on the Requester dashboard span across both columns (`ui-spec.md` §4.2)." | Merged 29 Oct. The span was missed in #88 and fixed in this Pull Request (D-02), with a RESP-02 check that fails without it. |
| [#99](https://github.com/GGital/TocktickIT/pull/99) — hardening and Labs 1–3 regression (#87) | **Changes requested 29 Oct** | "Running `cd client && npm test` fails with exit code 1 under full suite load": a 5 s timeout in `Hardening.test.tsx`, and an unhandled `TypeError` in `ShellNavigation.test.tsx` because its fetch stub answered `/api/staff/tickets/41` with `[]`. | Reproduced both, and found my earlier "344 passed" had missed the exit code. Fixed the stub to answer unknown routes `404`, filled the Hardening fields in one change event, and raised the jsdom time budgets once for seven older tests that failed the same way. `npm test` was green three runs in a row. |
| [#99](https://github.com/GGital/TocktickIT/pull/99) — re-review after the fix | Approved 29 Oct | "The fixes in `272afc9` are **100% verified and correct** … Bumping `testTimeout` to 15 s and `asyncUtilTimeout` to 5 s is the right, pragmatic way to handle parallel jsdom load without having to rewrite older test suites." | Merged 29 Oct. |
| [#100](https://github.com/GGital/TocktickIT/pull/100) — E2E, responsive, screenshots (#88) | Approved 29 Oct | "Verified all 33 states across `staff-dashboard`, `requester-dashboard`, `actions-taken`, and `ticket-workflow`. Exactly 97 PNGs accounted for … The fixes for `defaultActionAt` minute rounding, dialog focus return, and mobile modal CSS are clean and have targeted tests." | Merged 29 Oct. |

### Changes made in response to review

- **#99:** both requested fixes were made on the branch and re-approved before merging.
- **#97 and #98:** two approvals came with a request each, and neither was done before those Pull Requests merged. The
  visual pass in this Issue found both again, and both are fixed here with a test that fails without the fix:
  - D-01: the static blockers banner is now a status; a save-time refusal is still an alert.
  - D-02: the third Requester card spans the row at tablet width.
- **#91:** the endpoint miscount was in the PR description only, so nothing in the contract changed.

## Reviews I Gave

| Field | Value |
|---|---|
| Partner name | Praewa Thuwatharanimitkul |
| Partner student ID | 67070503432 |
| Partner GitHub username | [@MeldyRose](https://github.com/MeldyRose) |
| Partner repository | https://github.com/MeldyRose/TokTickIT-Individual-Sprints |

My partner opened ten Lab 4 Pull Requests, and I reviewed all ten:

- **#64, #70:** approved on first submission. #70 came with a list of drill-down mismatches to fix as a follow-up,
  which they fixed before merging.
- **#63, #65, #67, #68, #69:** sent back with **Request changes**, then approved after the fixes.
- **#66, #71:** approved after more than one round. #66 had two rounds of requested changes. #71 had one, then two
  approvals that each listed a follow-up, both fixed before merging.
- **#72**, their final integration and documentation Pull Request: two rounds of **Request changes**, then approved
  with four items to finish before merging.

Every review was made against a running server and a fresh database, from their branch, not from the diff alone, and
each defect was reproduced before I asked for a change.

| Pull Request I reviewed | Comment I gave | Their response |
|---|---|---|
| [#63](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/63) — Lab 4 engineering contract | **Changes requested 28 Oct.** Checked the contract against the handout and listed seven gaps, including: "Action Taken fields: Date/Time, Description, Result, Performed by, Follow-Up Required?, Follow-up Note (required if follow-up), Attachment Notes", "Actions must be editable by IT Staff (create + update), not append-only", "Add the Requester dashboard", and "Define stale-update/concurrency handling and migration rollback." | They aligned all four documents with the handout: the seven fields, editable actions, the Requester dashboard, Ticket → Actions Taken as the parent-child model, optimistic concurrency, and a rollback plan. |
| [#63](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/63) — re-review | **Approved 28 Oct.** "contract now aligns with the handout on fields, editability, requester visibility, dashboards, OCC, and rollback." | Merged 28 Oct. |
| [#64](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/64) — schema, migration, seed | **Approved 28 Oct**, with the schema checked in Prisma Studio (screenshots attached) and follow-ups listed for implementation: "seed + legacy backfill plan, dashboard empty/safe-failure states, AC-18 regression mapping, §12 test file names, and drill-down query params vs the queue API." | Merged 28 Oct. |
| [#65](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/65) — Actions Taken API | **Changes requested 29 Oct.** Five defects, each reproduced live. Lost update: "`Math.abs(expected - actual) > 1000` lets a second editor with the same stale `expectedUpdatedAt` overwrite the first within 1s (reproduced: 699ms apart, both 200, first edit lost)." The concurrency check was skipped when the token was missing or invalid. A claim race "reproduced 1/5". An invalid `actionDateTime` silently became `now()`. Tests leaked 75 Tickets per run. | They switched to an atomic `updateMany` on the exact `updatedAt`, required the token, moved the claim into the same transaction, validated dates and booleans, and cleaned up the fixtures. |
| [#65](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/65) — re-review | **Approved 29 Oct.** "Re-tested 207ee85 on a live server + fresh DB … a second editor with the same stale token now gets 409; missing or invalid tokens get 400), the claim race holds (10 parallel rounds, owner consistent) … Build clean, 149/149 tests pass." | Merged 29 Oct. |
| [#66](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/66) — workflow, resolution gate, stale updates | **Changes requested 29 Oct.** "Same-status transitions pass … CLOSED -> CLOSED (terminal) and RESOLVED -> RESOLVED return 200 and re-stamp `closedAt` / `resolvedAt`" The same 1 s concurrency tolerance "let a stale editor CANCEL a ticket 449ms after another staff change". The concurrency check ran before the ownership check, so a Requester got `409` instead of `403`. A test leak broke their Lab 1 category test. | They rejected unchanged statuses, made the check exact and atomic, reordered the checks, fixed the leak, and unified the error envelope. |
| [#66](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/66) — second review | **Changes requested 29 Oct.** Confirmed every fix, then found a regression the fix caused: "requiring expectedUpdatedAt breaks the existing requester 'Problem Appears Resolved' button … the alert shows '[object Object]' (reproduced in the UI as michael.b)." | They sent `expectedUpdatedAt` from the Requester screen and read `error.message`. |
| [#66](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/66) — third review | **Approved 29 Oct.** "The requester 'Problem Appears Resolved' action works again (PATCH 200 …). Errors now show the real message … client 42/42 and server 170/170 tests pass." | Merged 29 Oct. |
| [#67](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/67) — Actions Taken UI | **Changes requested 30 Oct.** Tested the branch merged with their `lab4-staging`; all four ACs held in the UI. Two defects: "Editing the date is silently ignored: the edit form sends actionDateTime, but PATCH … never reads it. It returns 200 and the old date stays", and the Claim checkbox stays on screen after the Ticket is claimed. Also asked for a rebase onto the latest `lab4-staging`. | They read the date on `PATCH` with the create-time validation, refreshed the Ticket after Claim, hid Log and Edit on closed and cancelled Tickets, showed the original performer, and capped the date picker. |
| [#67](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/67) — re-review | **Approved 30 Oct.** "Re-tested a54cd42 (rebased on lab4-staging) … Edited action date now persists (PATCH 200, table and DB updated); invalid/future dates return 400 … Edit modal shows the original performer (checked by editing another staff member's action)." | Merged 30 Oct. |
| [#68](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/68) — ticket workflow UI | **Changes requested 30 Oct.** Four defects, verified as each role. "CANCELLED is one click with no confirmation" "'Closure Remarks (Optional)' is posted as a public comment, so the requester can read it (verified as the requester)." A `422` dropped its `MISSING_ACTION_TAKEN` details. The detail page showed a hard-coded "Issue resolved." | They added a Cancel confirmation, labelled the remarks as visible to the Requester, added the live checklist with the `422` details, and showed the real `resolutionSummary`. |
| [#68](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/68) — re-review | **Approved 30 Oct.** Verified each fix, and forced a real `422`: "I also forced a real 422 by removing the ticket's only action while the modal was open: the MISSING_ACTION_TAKEN detail is listed and the checklist flips to red." Warned that merging it with #67 would declare `handleRefreshTicket` twice (TS2451). | Merged 30 Oct. |
| [#69](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/69) — dashboard APIs | **Changes requested 30 Oct.** Checked every endpoint against direct SQL. Three defects: `recentlyResolved` broke BR-20 ("with the seed, Sarah's TKT-2026-0008 (resolved Sep 15) shows recentlyResolved = 1"); the new tests made the suite flaky on the shared database ("In 4 full runs I got 'expected 48 to be 47' … and a Lab 3 failure"); and the staff tests used `>=` checks that "wouldn't catch leaks". | They kept only `resolvedAt` within 7 days, created test users once with cleanup, asserted exact counts, and fixed the seed so the average resolution time is non-zero. |
| [#69](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/69) — re-review | **Approved 30 Oct.** "the server suite passed 191/191 in 6 consecutive full runs … recentlyResolved now follows BR-20: a ticket resolved Sep 15 counts 0 … 6d23h ago counts 1, 7d1h ago counts 0." | Merged 30 Oct. |
| [#70](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/70) — staff and Administrator dashboard UI | **Approved 30 Oct**, with a follow-up: "Total Open, High/Urgent, My Assigned and Resolved Today drill into queue lists that don't match their counts (5 -> 8, 2 -> 8, 1 -> 2, 1 -> 2), because the queue API ignores status=open, comma-separated priorities and resolvedRange" | Fixed in 406919e before merging (31 Oct): the queue API learned those filters, ownership filters were scoped to active Tickets, and the header link clears old drill-down filters. |
| [#71](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/71) — Requester dashboard and shell | **Changes requested 31 Oct.** Tested live against the seed. The drill-down filter was never cleared ("click Resolved, then Create Ticket … The list is still filtered to RESOLVED and the new ticket isn’t shown"); the Resolved card mixed two counts against BR-20; the routes the PR description claimed did not exist; and the PR targeted `main`. | They cleared the filters, used `resolvedRecently` with a matching drill-down, added the routes, and retargeted to `lab4-staging`. |
| [#71](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/71) — second review | **Approved 31 Oct**, with one regression from the new routing: "a staff user loading /tickets lands on the requester My Tickets page with no nav tab highlighted." | They redirected staff on that URL and read the query string back on reload. |
| [#71](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/71) — third review | **Approved 31 Oct**, with two follow-ups the routing change introduced: the location listener read `user` from the first render ("Staff land on the requester dashboard with the 403"), and a voluntary password change jumped back to My Tickets. | Both fixed with refs before merging (31 Oct). |
| [#72](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/72) — E2E, visual inspection, regression, release | **Changes requested 31 Oct.** Ran everything on a fresh seed. "reviewer.md doesn’t match the actual GitHub reviews"; the screenshot spec "fails on a fresh seed" and the committed screenshots "were taken on a dirty DB"; "The PR description is PR 71’s"; and the `tests.md` counts and claims did not match the files. | They realigned the review states, recaptured on a clean seed, fixed the routing, and corrected `tests.md`. |
| [#72](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/72) — second review | **Changes requested 31 Oct.** Several items fixed, still open: the PR description and the Issue's ticked ACs unchanged; "The reviewer.md comments aren’t my actual review comments"; "The new /staff/tickets and /admin/users routes have no role check"; and the focus-ring screenshot "is byte-identical to 01-staff-dashboard-desktop.png", with no visible focus style on the cards. | They added the role redirects, restored the Back mapping, added a visible `:focus-visible` style with an asserted outline, rewrote the review section from the actual review text (da5d643, fb95c1a), and asked for a re-review. |
| [#72](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/72) — third review | **Approved 31 Oct.** "Re-tested fb95c1a: route guards, Back handling, drill-down URLs, the focus ring and both capture scripts all work on a fresh seed, and Section 3 is quoted word for word." Four items before merging: the PR description and the Issue's ticked ACs; a duplicate `import "./index.css";` that "makes the client suite flaky (121/126 in 2 of 5 runs, 5/5 green without it)"; "30 days" instead of 7 for BR-20 in their PR #69 entry; and staff screenshots recaptured on a newly created database. | Approved; open at the time of writing, waiting on those four items before merging. |

## Kanban

Lab 4 has twelve Issues on the GitHub Project board. #79 is the engineering contract (PR #91), and #80 – #90 are the
backlog it produced:

- **#79 – #88:** closed, after their Pull Requests (#91 – #100) merged.
- **#89, this documentation pass:** open.
- **#90:** open. It is the release of `lab4-staging` into `main` and follows this Issue.

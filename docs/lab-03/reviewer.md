# Lab 3 — Peer Review

Repository under review: https://github.com/GGital/TocktickIT
Branching: the engineering contract and every Lab 3 Issue were built on their own branch and merged into
`lab3-staging` through a reviewed Pull Request. No commit was pushed directly to `main` or to `lab3-staging`.
Review data below was read from the GitHub API on 17 September 2026.

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

All sixteen Lab 3 Pull Requests — the contract and fifteen implementation Issues — were reviewed by
[@MeldyRose](https://github.com/MeldyRose), and every one was submitted as a formal GitHub **Approve** review. The
quotations are excerpts from the review bodies.

| Pull Request | Review | Comment received | My response |
|---|---|---|---|
| [#44](https://github.com/GGital/TocktickIT/pull/44) — Lab 3 engineering contract (Issue #43) | Approved 13 Sept | "Verified against all 14 sections of the CPE 334 Lab 3 handout … 1:1 traceability from 68 Acceptance Criteria to 170 planned tests." Closed with an implementation note: "Ensure `TicketMessage` visibility rules (A-05) and Admin safety rules (preventing self-deactivation & last admin removal) are strictly enforced in backend query predicates." | Merged 13 Sept, before any implementation branch. The note was carried into the work: visibility sits in the query predicate (API-70) and both Administrator safety rules run inside the update transaction (API-93, API-94). |
| [#62](https://github.com/GGital/TocktickIT/pull/62) — data model, migrations, seed (#45) | Approved 13 Sept | "The migration path cleanly renames `RequesterUser` to `User` in-place along with its primary key, sequence, and indexes. By avoiding Prisma's default `DROP/CREATE` strategy, all existing Lab 2 IDs, user relations, and foreign keys are preserved intact." | Merged 14 Sept. |
| [#63](https://github.com/GGital/TocktickIT/pull/63) — authentication API and session foundation (#46) | Approved 14 Sept | "Using a pre-computed dummy hash for unknown emails ensures constant-time verification, eliminating timing side-channel leaks … Standardized `401 INVALID_CREDENTIALS` error message prevents account enumeration." | Merged 14 Sept. |
| [#64](https://github.com/GGital/TocktickIT/pull/64) — authorization guards (#47) | Approved 15 Sept | "Protection is cleanly mounted on path prefixes … ensuring any new routes automatically inherit full middleware coverage … `requirePasswordChangeComplete` correctly executes prior to role guards so password-gated users cannot probe permissions." | Merged 15 Sept. |
| [#65](https://github.com/GGital/TocktickIT/pull/65) — Requester regression on the authenticated identity (#48) | Approved 15 Sept | "All legacy requester selector artifacts (`requesterContext`, `SelectRequester`, `X-Requester-Id`, `toktickit.requesterId`) have been completely purged across client and server codebases, verified by bundle checks." | Merged 15 Sept. |
| [#66](https://github.com/GGital/TocktickIT/pull/66) — Login and mandatory Change Password (#49) | Approved 15 Sept | "Uncontrolled implementation in `PasswordField` is handled really well — passwords are read directly on submit and never leak into React state, storage, or logs … Mandating the `/change-password` flow across direct URLs and page reloads works seamlessly." | Merged 15 Sept. |
| [#67](https://github.com/GGital/TocktickIT/pull/67) — application shell and role navigation (#50) | Approved 15 Sept | "Links for unauthorized destinations are completely omitted from the DOM (not just CSS-hidden or disabled) … Known limitations around remaining badges and password modal routing are well-documented and acceptable for this milestone." | Merged 15 Sept. The documented limitations were closed by #53 and #58. |
| [#68](https://github.com/GGital/TocktickIT/pull/68) — Public Comments, Internal Notes, resolution flag API (#51) | Approved 15 Sept | "Public comment reads hard-code `visibility: 'PUBLIC'` in the DB query, ensuring internal notes never leak to Requesters … The `appears-resolved` route checks `requesterResolvedFlaggedAt: null` inside a transaction, safely handling concurrent requests." | Merged 15 Sept. |
| [#69](https://github.com/GGital/TocktickIT/pull/69) — Ticket Queue API (#52) | Approved 15 Sept | "Enforcing `status` as the single repeatable parameter while strictly returning `400 INVALID_QUERY_PARAMETER` for invalid inputs without coercion keeps the API contract airtight … guarantees stable pagination and byte-identical repeat responses." | Merged 15 Sept, after #68 as stacked. |
| [#70](https://github.com/GGital/TocktickIT/pull/70) — Ticket Queue screen (#53) | Approved 15 Sept | "Clear distinction between empty and no-results states, plus solid handling for 403s and invalid params … Ready to merge once backend PRs #68 and #52 land." | Merged 15 Sept in the stated order. |
| [#71](https://github.com/GGital/TocktickIT/pull/71) — ticket operations API (#54) | Approved 15 Sept | "`statusTransition.ts` strictly validates the 8x8 status matrix (BR-35), correctly rejecting self-transitions (`409`) … Ready to merge following stack order (`#68` → `#52` → this branch)." | Merged 15 Sept in that order. |
| [#72](https://github.com/GGital/TocktickIT/pull/72) — Staff Ticket Detail screen (#55) | Approved 15 Sept | "The Internal panel successfully renders all 4 signals (border, suffix, label, lock glyphs), passing the greyscale exit criterion." | Merged 16 Sept. |
| [#73](https://github.com/GGital/TocktickIT/pull/73) — Requester conversation and appears-resolved (#56) | Approved 15 Sept | "Failed comment submissions cleanly retain the typed text in the composer with a functional **Try again** retry action … Verified that no Internal Notes panel, hidden message counters, placeholders, or `/api/staff` requests leak onto the Requester screen." | Merged 16 Sept, after #72 as asked. |
| [#74](https://github.com/GGital/TocktickIT/pull/74) — user management API (#57) | Approved 15 Sept | "Employs a PostgreSQL advisory lock (`pg_advisory_xact_lock`) inside an interactive transaction to prevent race conditions during concurrent admin updates … Mutation testing confirms that concurrent demotion/deactivation tests fail if the lock or safety checks are omitted." | Merged 16 Sept. |
| [#75](https://github.com/GGital/TocktickIT/pull/75) — User Management screen (#58) | Approved 16 Sept | "Table and mobile cards correctly render Name, Email, Role, Status, and Edit — with **no Delete control** anywhere on screen or in dialogs (UI-28) … One-time password panel offers copy feedback and unmounts on close." | Merged 17 Sept. |
| [#76](https://github.com/GGital/TocktickIT/pull/76) — E2E, responsive, screenshots (#59) | Approved 17 Sept | "`E2E-06` inspects raw network response bodies to guarantee Internal Notes never leak to Requesters. `E2E-10` verifies backend `403` HTTP statuses alongside UI forbidden states … Re-arming the first-login account (`kittipong.w@`) via Admin API keeps test runs repeatable." | Merged 17 Sept. |

### Changes made in response to review

No review requested a change: all sixteen were approved on first submission. Two reviews asked for a merge
order rather than a code change — #70 and #71 depended on the stacked API branches #68 and #69 — and both were
merged in exactly that order. The contract review's implementation note (#44) was the only forward-looking
request, and the two properties it named each ended with a dedicated test.

## Reviews I Gave

| Field | Value |
|---|---|
| Partner name | Praewa Thuwatharanimitkul |
| Partner student ID | 67070503432 |
| Partner GitHub username | [@MeldyRose](https://github.com/MeldyRose) |
| Partner repository | https://github.com/MeldyRose/TokTickIT-Individual-Sprints |

I reviewed all five Lab 3 Pull Requests on my partner's repository. Two were sent back with **Request changes**
for security defects I reproduced against their running API, and both were fixed on the branch and re-approved.
Every Pull Request ended with a formal GitHub **Approve** review.

| Pull Request I reviewed | Comment I gave | Their response |
|---|---|---|
| [#40](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/40) — Lab 3 requirements documents | **Approved 13 Sept.** Mapped the contract back to the handout rather than only reading it: "Required roles/authorization matrix (4.3) → BR-09, BR-17, BR-18, API role columns — covered. DB model requirements (5.1-5.3) → Prisma schema + seed data (4 active/1 inactive Requester, 3 active/1 inactive IT Staff, 1 Admin) — exact match to handout counts." | Merged into their `lab3-staging` the same day. |
| [#41](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/41) — schema evolution, data migration, seed | **Approved 14 Sept.** "I have verified new schema for authentication and ownership for each ticket by reading the prisma object and `npx prisma validate`. Moreover, I have tried and look into seeded data … it is fulfilled with all roles to test all capabilities." | Merged 15 Sept. |
| [#42](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/42) — backend authentication and password management | **Changes requested 15 Sept.** Quoted the login handler returning the session token in the JSON body: "if a website stores a login token in localStorage (or anywhere JavaScript can read it), an XSS attack … can just read that token and send it to an attacker. HttpOnly cookies exist to close that hole … Stop returning token in the JSON body. Rely purely on the cookie." | They replied in the thread: "I understand the security risk now and I manage to fix it as a strict reliance on HTTP-only cookies, removing the token property from the return JSON. Also, add an explicit test assertion to ensure future regression tests fail if raw tokens are ever re-introduced." |
| [#42](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/42) — re-review after the fix | **Approved 15 Sept.** Checked the fix and the guard test, not just the reply: "Login response is now { user: userProfile } only — token no longer leaks into the JSON body … Test added (auth.api.test.ts:51): `expect(res.body).not.toHaveProperty("token")` — locks the fix in so it can't silently regress." | Merged 15 Sept. |
| [#43](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/43) — login and mandatory password change UI | **Approved 16 Sept.** "Verified in browser against a live seeded environment": the login states, that an initial-password account is blocked behind the change modal with the background inert ("verified clicks behind the overlay don't leak through"), the live password checklist, and the header after a successful change. Attached working screenshots. | Merged 16 Sept. |
| [#44](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/44) — ticket screens on the authenticated identity, and comments | **Changes requested 17 Sept.** One blocking authentication bypass, shown with requests made against their API without any session cookie: `resolveAuthUser()` fell back to the `X-Requester-Id` header and even invented a user for an unknown id, so `GET /api/tickets` with `X-Requester-Id: admin-user-001` returned all 12 Tickets and a guessed staff id returned Internal Note content. Pointed out why their AC-03 test missed it — "it only sends the header together with a valid session" — and asked for header-only tests expecting `401`. Also listed three should-fix items (missing-identity `400` instead of `401`, "Problem Appears Resolved" accepted on closed Tickets, and staff status changes skipping the transition matrix). | They replied: "I refactored the auth resolver to rely strictly on session cookies and return `401` Unauthorized whenever a session is missing … cleaned up the client code in `api.ts` and `AuthContext.tsx` to completely drop `localStorage` identity fallbacks and headers … fixed the status handling … added dedicated security probing tests in `requester-regression.api.test.ts`." |
| [#44](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/44) — re-review after the fix | **Approved 17 Sept.** Re-probed the running API: inactive and logged-out sessions answer `401`; ownership (one Requester sees 1 Ticket, another 2, IT Staff all 12, cross-owner reads `404`); Internal Notes `403` for Requesters even on their own Ticket; comment length bounds. Left two non-blocking clean-ups: "`GET /api/requesters` has no login check" and "The client still sends `X-Requester-Id` in 7 helpers." | Approved and open at the time of writing, awaiting merge into their `lab3-staging`. |

## Kanban

Every Lab 3 Issue from #43 to #59 moved to **Done** on the GitHub Project board as its Pull Request merged; all
seventeen are closed. #60 (this documentation) and #61 (release integration) are the two still open at the time
of writing.

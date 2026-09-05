# Lab 2 — Peer Review

Repository under review: https://github.com/GGital/TocktickIT
Branching: every Issue was built on its own feature branch and merged into `lab2-staging` through a reviewed
Pull Request. No commit was pushed directly to `main` or to `lab2-staging`.

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

All thirteen Lab 2 Pull Requests were reviewed by [@MeldyRose](https://github.com/MeldyRose) and every one was
submitted as a formal GitHub **Approve** review. Quotations below are excerpts from the review bodies.

| Pull Request | Review | Comment received | My response |
|---|---|---|---|
| [#15](https://github.com/GGital/TocktickIT/pull/15) — Lab 2 specification, API spec, UI spec | Approved 22 Aug | "I went through all three spec docs … the scope is well-defined … Business rules, backend ownership checks, and API contracts are clear and consistent across all files." | Merged into `lab2-staging`. (PR [#14](https://github.com/GGital/TocktickIT/pull/14) was the same work opened against `main` by mistake; it was closed and re-targeted.) |
| [#16](https://github.com/GGital/TocktickIT/pull/16) — `tests.md` test plan | Approved 22 Aug | "Mapped all 50 ACs and 50 BRs cleanly. 113 test scenarios covering Unit, API, UI, and E2E. Clear target file paths and expected failure cases for TDD." | Merged; the file became the working test matrix for the whole sprint. |
| [#30](https://github.com/GGital/TocktickIT/pull/30) — data model, migrations, seed | Approved 22 Aug | "Schema models, enums, and `Category.isActive` default are correctly implemented per BR-45 & BR-49 … Migrations are cleanly split into two steps. Seed script is idempotent with 4 categories, 7 systems, and 5 requesters." | Merged. |
| [#31](https://github.com/GGital/TocktickIT/pull/31) — Zen Green foundation | Approved 22 Aug | "`zen-theme.css` keeps all colors in one place as requested (AC-46) … ConfirmDialog uses built-in browser popups with `setup.ts` added for testing." | Merged. |
| [#32](https://github.com/GGital/TocktickIT/pull/32) — requester context and reference API | Approved 25 Aug | "Confirmed 15 error codes with bound HTTP status, exclusion of status 401, and unified error envelope … For test execution, it results as 6/6 tests files passed (22/22 tests)." | Merged. The reviewer checked out the branch and ran the suite rather than reading the diff alone. |
| [#33](https://github.com/GGital/TocktickIT/pull/33) — requester selection screen | Approved 25 Aug | "Storage module correctly saves `toktickit.requesterId` and syncs UI components using `useSyncExternalStore` … Selection screen displays all 6 UI states and includes the required testing disclaimer." | Merged. |
| [#34](https://github.com/GGital/TocktickIT/pull/34) — `POST /api/tickets` | Approved 25 Aug | "Correctly implements atomic `TKT-YYYY-NNNNNN` counter using `Asia/Bangkok` timezone … 60-second per-requester duplicate submission guard returns `409 DUPLICATE_SUBMISSION`." | Merged. |
| [#35](https://github.com/GGital/TocktickIT/pull/35) — attachment API | Approved 26 Aug | "Ran `npm test` in `server/` (77/77 tests passing) … Ownership checks run before file processing so non-owners get a simple 404 response. Failed DB saves clean up files automatically." | Merged. |
| [#36](https://github.com/GGital/TocktickIT/pull/36) — `GET /api/tickets` | Approved 26 Aug | "Counts and gets tickets in one transaction so total items and page numbers always match. Priority sorts by severity (URGENT to LOW) with stable id desc secondary sort. `attachmentCount` correctly excludes soft-removed files." | Merged. |
| [#37](https://github.com/GGital/TocktickIT/pull/37) — Create Ticket screen | Approved 29 Aug | "Checked all 9 UI states (§5.3); form validation places focus on the first invalid field, blocks requests, and preserves all user inputs/staged files on failure … 11 test files and 51 tests all passed cleanly." | Merged. |
| [#38](https://github.com/GGital/TocktickIT/pull/38) — My Tickets screen | Approved 29 Aug | "Verified toolbar filters, 350 ms search debounce, explicit `page=1` reset, and responsive layout … Confirmed the `pendingReset` fix prevents requester parameter leaks." | Conflicts with `lab2-staging` were resolved on the branch after approval, then merged 30 Aug. |
| [#39](https://github.com/GGital/TocktickIT/pull/39) — Ticket Detail screen | Approved 29 Aug | "Using `<dl>` instead of disabled inputs makes it clearly read-only, and the safe not-found card handles both 404 and 400 cleanly … Demo seed script (`npm run seed:demo`) works great for testing and keeps `prisma/seed.ts` untouched per BR-46." | Conflicts resolved after approval, then merged 30 Aug. |
| [#40](https://github.com/GGital/TocktickIT/pull/40) — E2E suite and screenshots | Approved 5 Sept | "Added 38 tests across 7 spec files … 63 committed PNG screenshots covering 3 different viewports … Added `apiFetchBlob` to `apiClient.ts` so attachment downloads and previews correctly send the required context headers." | Open at the time of writing; awaiting merge into `lab2-staging`. |

### Changes made in response to review

No review requested a change: all thirteen were approved on first submission. Two Pull Requests (#38 and #39)
needed conflict resolution against `lab2-staging` after approval, because the Create Ticket screen merged
first and touched the same route table, placeholder module, and theme file. The resolutions kept both sides —
both real screens routed, both style blocks retained — and the full client suite was re-run before merging.

## Reviews I Gave

| Field | Value |
|---|---|
| Partner name | Praewa Thuwatharanimitkul |
| Partner student ID | 67070503432 |
| Partner GitHub username | [@MeldyRose](https://github.com/MeldyRose) |
| Partner repository | https://github.com/MeldyRose/TokTickIT-Individual-Sprints |

I reviewed all seven Lab 2 Pull Requests on my partner's repository. Every one was submitted as a formal
GitHub **Approve** review, and one Pull Request was reviewed twice because the author pushed further work
after the first approval.

| Pull Request I reviewed | Comment I gave | Their response |
|---|---|---|
| [#14](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/14) — Lab 2 specification documents | **Approved 22 Aug.** Ticked all nine criteria — six documentation files present, `specification.md` carrying requirements, business rules, acceptance criteria and Definition of Done, `tests.md` carrying the planned cases and traceability, `ui-spec.md` and `api-spec.md` defining UI and API contracts, `reviewer.md` and `ai-use.md` structured, the specification completed before implementation, and no implementation code smuggled into the branch: "This PR is meeting all the acceptance criteria and the purpose of this issue perfectly. I think this is ready to be merged to `lab2-staging`." | Merged into `lab2-staging` the same day. |
| [#16](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/16) — Lab 2 database schema and seed | **Approved 25 Aug (first review).** Verified the schema validates, the migration applies, the seed runs and creates the required data, and Lab 1 still works. Raised one point rather than only ticking boxes: "lab 1 tests are still not updated to test the new seeded database and verify the schema. To complete this task perfectly and make the development of this project to remain on the concept of test-driven development, test files should be updated to verify the result in the later feature branch." | The author replied in the thread: "Even though the PR is approved but I decided to update the lab 1 tests. It will be great if you can recheck my update." They updated the Lab 1 tests and the `client/src/api.ts` interface on the same branch instead of deferring it. |
| [#16](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/16) — re-review after the fix | **Approved again 25 Aug (second review).** Re-checked the pushed changes: "New test files and the interface in `client/src/api.ts` are correctly adjusted to verify the result of seeding and new schema." | Merged into `lab2-staging` after the second approval. |
| [#22](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/22) — Development Requester context and selection screen | **Approved 26 Aug.** Ran the branch rather than reading the diff: "I have tested added UI components and API in this branch, and it is working correctly. The website can verify and give the feedback about the state of the database and API as well." Attached three screenshots of the running screen as evidence. | Merged into `lab2-staging`. |
| [#23](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/23) — reference data APIs and ticket creation | **Approved 26 Aug.** Read the code and exercised ticket creation in the browser: "The API is correctly retrieving seeded data from the database to make LOV as expected, and able to add new ticket on it. The UI is using the Zen green color theme as defined as one of the acceptance criteria." Attached the Create Ticket form and result screenshots. | Merged into `lab2-staging`. |
| [#24](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/24) — My Tickets list, querying and ownership scoping | **Approved 26 Aug with a process note.** Verified the `X-Requester-Id` header is used correctly on the creation endpoint and checked the responsive layout on a mobile viewport, with a mobile screenshot attached. Then raised the only scope concern of the sprint: "I have found that there are some features meant to be part of previously requested PR. It would be better to focus on just a requested features presented in the issue next time to prevent the conflict for merging into `lab2-staging`." | Merged into `lab2-staging`. No written reply to the note, but the two later Pull Requests (#25, #26) each stayed inside their own Issue's scope. |
| [#25](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/25) — Ticket Detail and attachment lifecycle | **Approved 29 Aug.** Exercised the endpoints directly rather than through the UI alone: "Verified the requester ownership scoping, attachment lifecycle (upload → metadata → download → soft-remove) by interacting with the endpoint directly." Attached two screenshots of the results. | Merged into `lab2-staging` on 30 Aug. |
| [#26](https://github.com/MeldyRose/TokTickIT-Individual-Sprints/pull/26) — test results and E2E | **Approved 5 Sept.** Checked that the evidence matched the running application, not just that files existed: "All of the screenshots in the `artifacts/lab-02/screenshots` is captured via Playwright and really reflect the current state of this project. The tests are completed and the evidences are provided in the folder." | Open at the time of writing, awaiting merge into their `lab2-staging`. |


## Kanban

Every Lab 2 Issue moved to **Done** on the GitHub Project board as its Pull Request merged. The one exception
at the time of writing is the E2E Issue, whose Pull Request ([#40](https://github.com/GGital/TocktickIT/pull/40))
is approved and awaiting merge.

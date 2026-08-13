# Lab 1 — Peer Review

Repository under review: https://github.com/GGital/TocktickIT
Partner repository I reviewed: https://github.com/jarbbie/toktickit

## My Reviewer

| Field | Value |
|---|---|
| Name | jaybee |
| Student ID | 67070503429 |
| GitHub username | [@jarbbie](https://github.com/jarbbie) |

### Pull Requests they reviewed for me

| Issue | Pull Request | Review comment received | My response |
|---|---|---|---|
| 1. Project foundation | [PR #5](https://github.com/GGital/TocktickIT/pull/5) | Ticked off all seven acceptance criteria, then: "Reviewed the implementation against the Lab 1 acceptance criteria. The API endpoint, tests, and frontend behavior look correct. I also checked that secrets are excluded from the repository. Approved 😁" | No changes requested. Merged into `lab1-staging`. |
| 2. API health check | [PR #6](https://github.com/GGital/TocktickIT/pull/6) | Ticked off all five acceptance criteria, then: "I tested /api/health, the body contain correct info. Supertest test passed successfully. React page shows system status as it should. LGTM 🫶" | No changes requested. Merged into `lab1-staging`. |
| 3. Create and seed categories | [PR #7](https://github.com/GGital/TocktickIT/pull/7) | "LGTM — Category model ✅ / Category table ✅ / Seed ✅ / Safe credential ✅" | No changes requested. Merged into `lab1-staging`. |
| 4. Display category list | [PR #8](https://github.com/GGital/TocktickIT/pull/8) | Pasted the actual `GET /api/categories` response showing all four categories in id order, then: "React displays custom added values. Test passed. Good job, well done! ヽ༼ຈل͜ຈ༽ﾉ" | No changes requested. Merged into `lab1-staging`. |

Every review verified behaviour by running it — the health endpoint body, the seeded rows, and the
rendered category list — rather than reading the diff alone. Nothing was sent back for fixing, so no
Issue moved to the `Fixing` column.

## Reviews I Gave

| Field | Value |
|---|---|
| Partner name | jaybee |
| Partner student ID | 67070503429 |
| Partner GitHub username | [@jarbbie](https://github.com/jarbbie) |

| Pull Request I reviewed | Comment I gave | Their response |
|---|---|---|
| [jarbbie/toktickit PR #5](https://github.com/jarbbie/toktickit/pull/5) — project foundation | **Approved.** Ticked all seven criteria: "This merge request does meet all acceptance criteria. API and frontend behavior are working correctly with the secrets not being exposed to the VCS and tools for testing are ready to go." | Accepted the approval and merged into `lab1-staging`. |
| [jarbbie/toktickit PR #6](https://github.com/jarbbie/toktickit/pull/6) — API health check | **Approved.** "I have tested curl directly to the /api/health endpoint and got HTTP 200 with response as expected: `{ "status": "ok", "service": "TokTickIT API" }`. Written Supertest test really does verify the endpoint and the React page is showing the status based on a real API call confirmed after trying while API is online and offline." | Accepted the approval and merged into `lab1-staging`. |
| [jarbbie/toktickit PR #7](https://github.com/jarbbie/toktickit/pull/7) — create and seed categories | **Approved.** Queried their database directly and pasted the `Category` columns, both unique indexes (`Category_pkey`, `Category_name_key`) and all four seeded rows: "The migration and schema are correct due to the design. The seed correctly inserted data and safe to run more than one without duplicates. The .env file containing database credential is not committed." | Accepted the approval and merged into `lab1-staging`. |
| [jarbbie/toktickit PR #8](https://github.com/jarbbie/toktickit/pull/8) — display category list | **Approved.** Ticked all six criteria and attached a screenshot of the running page: "The api is working correctly to obtain categories from PostgreSQL through Prisma and the client map the result of querying from the /api/categories to the categories to be shown on the client correctly. Supertest and Vitest test cases are correctly and the application pass all of the test. Loading and error states are correctly shown due to status of API and DB." | Accepted the approval and merged into `lab1-staging`. |

All four of my reviews were submitted as formal GitHub **Approve** reviews.

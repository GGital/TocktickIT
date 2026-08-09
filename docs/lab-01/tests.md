# Lab 1 — Automated Tests

API tests live in `server/tests/lab-01/`, UI tests in `client/tests/lab-01/`.

| Test File | Tool | Test Description |
|---|---|---|
| `server/tests/lab-01/API-01.health.test.ts` | Supertest | `GET /api/health` returns 200 and `{ status: "ok", service: "TokTickIT API" }` |
| `server/tests/lab-01/API-02.categories.test.ts` | Supertest | `GET /api/categories` returns the four seeded categories in id order |
| `client/tests/lab-01/UI-01.heading.test.tsx` | Vitest | TokTickIT heading and Check System button render |
| `client/tests/lab-01/UI-02.loading.test.tsx` | Vitest | Loading state shows, then is replaced by the category list |
| `client/tests/lab-01/UI-03.error.test.tsx` | Vitest | API failure displays a useful error message |

## Running

The database container must be running — `API-02` queries the seeded rows for real rather than
mocking Prisma, so it fails fast if the seed or the connection is broken.

```bash
cd server && npm test
cd client && npm test
```

## Results

```
> server@1.0.0 test
> vitest run

 RUN  v4.1.10 D:/VS File/TocktickIT/server

 ✓ tests/lab-01/API-01.health.test.ts > API-01 GET /api/health > returns 200 with status ok and the service name 21ms
 ✓ tests/lab-01/API-02.categories.test.ts > API-02 GET /api/categories > returns the four seeded categories in id order 43ms

 Test Files  2 passed (2)
      Tests  2 passed (2)
```

```
> client@0.0.0 test
> vitest run

 RUN  v4.1.10 D:/VS File/TocktickIT/client

 ✓ tests/lab-01/UI-01.heading.test.tsx > UI-01 TokTickIT heading > renders the application heading and the Check System button 169ms
 ✓ tests/lab-01/UI-02.loading.test.tsx > UI-02 loading state > shows the loading state, then replaces it with the category list 222ms
 ✓ tests/lab-01/UI-03.error.test.tsx > UI-03 backend unavailable > shows a useful error message when the API cannot be reached 157ms

 Test Files  3 passed (3)
      Tests  3 passed (3)
```

## Notes

- `UI-02` holds the `fetch` promises pending until the test releases them, so the loading state is
  asserted while it is genuinely on screen instead of relying on timing.
- `UI-03` stubs `fetch` with a rejection to simulate an unreachable backend.
- Manual check beyond the suites: stopping the database container makes `/api/categories` return 500
  and the page show `System Status: Offline` with `Unable to connect to TokTickIT API`.

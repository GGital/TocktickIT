# TokTickIT

IT service desk application — CPE 334 individual sprints. Lab 1 is a full-stack vertical slice:
React + TypeScript + Vite + Bootstrap → Express + TypeScript REST API → Prisma → PostgreSQL.

## Prerequisites

- Node.js 20+ (developed on v24)
- PostgreSQL 17 reachable on `localhost:5432`
- Running Docker

## Setup

```bash
git clone https://github.com/GGital/TocktickIT.git
cd TocktickIT
```

### 1. Database

Create the database:

```bash
docker run --name TockTickITDB -e POSTGRES_PASSWORD=YOUR_POSTGRESQL_PASSWORD -e POSTGRES_USERNAME=YOUR_POSTGRESQL_USERNAME -v postgres_data:/var/lib/postgresql/data -p 5432:5432 -d postgres:17-alpine3.22
```

### 2. Backend

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env` and set `DATABASE_URL` to your own PostgreSQL user and password.
`.env` is git-ignored — never commit real credentials.

Apply the schema and seed the request categories:

```bash
npx prisma migrate dev
npx prisma db seed
```

The seed is idempotent — running it again does not create duplicates.

### 3. Frontend

```bash
cd client
npm install
```

## Running

Two terminals:

```bash
cd server && npm run dev     # http://localhost:3000
```

```bash
cd client && npm run dev     # http://localhost:5173
```

Open http://localhost:5173 and click **Check System**. Vite proxies `/api` to the backend,
so the browser stays same-origin and no CORS configuration is needed.

## Tests

```bash
cd server && npm test        # Supertest API tests  (tests/lab-01/)
cd client && npm test        # Vitest UI tests      (tests/lab-01/)
```

## API

| Method | Path | Response |
|---|---|---|
| GET | `/api/health` | `{ "status": "ok", "service": "TokTickIT API" }` |
| GET | `/api/categories` | `[{ "id": 1, "name": "Account and Access" }, ...]` |

## Structure

```
client/                 React + TypeScript + Vite + Bootstrap
  src/
  tests/lab-01/         Vitest UI tests
server/                 Node.js + Express + TypeScript
  prisma/               schema, migrations, seed
  src/                  app.ts (routes), index.ts (listener)
  tests/lab-01/         Supertest API tests
docs/lab-01/            tests.md, reviewer.md, ai_use.md
```

## Documentation

- [docs/lab-01/tests.md](docs/lab-01/tests.md) — test inventory
- [docs/lab-01/reviewer.md](docs/lab-01/reviewer.md) — peer reviewer and reviewed PRs
- [docs/lab-01/ai_use.md](docs/lab-01/ai_use.md) — AI agent use and reflection

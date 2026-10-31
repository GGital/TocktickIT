-- Reverses migration.sql steps 5 -> 1, restoring the exact Lab 3 schema (BR-76).
-- NOT run by `prisma migrate deploy`. Recovery only, after a pg_dump backup; see README
-- "Recovering from the Lab 4 migration". Every Actions Taken row is lost; all Lab 3 data stays.

BEGIN;

-- 5. New Ticket indexes.
DROP INDEX IF EXISTS "Ticket_createdAt_idx";
DROP INDEX IF EXISTS "Ticket_updatedAt_idx";
DROP INDEX IF EXISTS "Ticket_resolvedAt_idx";
DROP INDEX IF EXISTS "Ticket_requesterId_publicActivityAt_idx";
DROP INDEX IF EXISTS "Ticket_requesterId_status_idx";

-- 4. ActionTaken with its foreign keys, CHECK constraints, and indexes.
DROP TABLE IF EXISTS "ActionTaken";

-- 3 – 1. The three Ticket columns.
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "publicActivityAt";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "resolvedAt";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "version";

-- Forget the migration so `prisma migrate deploy` re-applies it. `prisma migrate resolve --rolled-back`
-- cannot do this: it only accepts a migration that failed (P3012), and this one succeeded.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261020100000_add_actions_taken_and_workflow_fields';

COMMIT;

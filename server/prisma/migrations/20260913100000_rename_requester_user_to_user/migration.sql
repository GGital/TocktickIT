-- Lab 3 migration 1 of 3 (spec §7.5, BR-55, BR-56, A-13).
-- RENAME, never drop-and-create: every row, primary key, and foreign key survives, so
-- Ticket.requesterId and both Attachment user references keep pointing at the same person.
ALTER TABLE "RequesterUser" RENAME TO "User";
ALTER TABLE "User" RENAME CONSTRAINT "RequesterUser_pkey" TO "User_pkey";
ALTER INDEX "RequesterUser_email_key" RENAME TO "User_email_key";
ALTER SEQUENCE "RequesterUser_id_seq" RENAME TO "User_id_seq";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');

-- Administrators do not set a department for new users (X-10); existing values are kept.
ALTER TABLE "User" ALTER COLUMN "department" DROP NOT NULL;

-- Every migrated Lab 2 user is a Requester who must change their password (BR-56).
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'REQUESTER',
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;

-- passwordHash: add nullable -> backfill -> NOT NULL. A plain NOT NULL column fails on a non-empty table.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

-- The scrypt hash of the local-development initial password documented in README.md.
-- SQL cannot run scrypt, so every migrated row shares this one salt; mustChangePassword = true
-- replaces it with a per-user salted hash at first login (BR-09, BR-14).
UPDATE "User"
SET "passwordHash" = 'scrypt$32768$8$1$BPYlPiGT/LoIp6zXSN2kMQ==$kmp9w/8W2EcXWxylnjUDKd4kRMXCabJalpp7BuQ5cUWtcrtUX4dCKOBu/jMYlu8Ha/vwDOrbX3t1thLhS20AgQ=='
WHERE "passwordHash" IS NULL;

ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

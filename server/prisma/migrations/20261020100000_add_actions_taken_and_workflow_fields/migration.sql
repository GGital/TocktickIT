-- Lab 4 migration (spec §7.5, BR-73 – BR-76). Additive only: nothing existing is dropped or renamed.
-- Reverse with down.sql beside this file; see README "Recovering from the Lab 4 migration".

-- 1. version: a constant default is safe on a non-empty table (BR-27).
ALTER TABLE "Ticket" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- 2. resolvedAt: updatedAt is the best available evidence for legacy resolutions, documented as approximate (BR-74).
ALTER TABLE "Ticket" ADD COLUMN "resolvedAt" TIMESTAMP(3);
UPDATE "Ticket" SET "resolvedAt" = "updatedAt" WHERE "status" IN ('RESOLVED', 'CLOSED');

-- 3. publicActivityAt: add nullable -> backfill -> NOT NULL with a default (BR-45, BR-74).
-- GREATEST ignores NULLs, so a Ticket with no public activity falls back to createdAt.
-- Internal Notes are excluded so the Requester ordering never reveals private work.
ALTER TABLE "Ticket" ADD COLUMN "publicActivityAt" TIMESTAMP(3);
UPDATE "Ticket" t SET "publicActivityAt" = GREATEST(
  t."createdAt",
  (SELECT MAX(m."createdAt") FROM "TicketMessage" m WHERE m."ticketId" = t."id" AND m."visibility" = 'PUBLIC'),
  (SELECT MAX(GREATEST(a."uploadedAt", a."removedAt")) FROM "Attachment" a WHERE a."ticketId" = t."id")
);
ALTER TABLE "Ticket" ALTER COLUMN "publicActivityAt" SET NOT NULL;
ALTER TABLE "Ticket" ALTER COLUMN "publicActivityAt" SET DEFAULT CURRENT_TIMESTAMP;

-- 4. ActionTaken (spec §7.1).
CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "actionAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "result" VARCHAR(1000) NOT NULL,
    "followUpRequired" BOOLEAN NOT NULL,
    "followUpNote" VARCHAR(1000),
    "followUpCompletedAt" TIMESTAMP(3),
    "followUpCompletedById" INTEGER,
    "attachmentNotes" VARCHAR(500),
    "performedById" INTEGER NOT NULL,
    "lastEditedById" INTEGER,
    "voidedAt" TIMESTAMP(3),
    "voidedById" INTEGER,
    "voidReason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id"),
    -- Prisma cannot declare these, so no code path can bypass them (spec §7.1).
    -- BR-10: a note exactly when a follow-up is required.
    CONSTRAINT "ActionTaken_followUp_pairing_check" CHECK ("followUpRequired" = ("followUpNote" IS NOT NULL)),
    -- BR-16: only a required follow-up can be completed.
    CONSTRAINT "ActionTaken_followUp_completion_check" CHECK ("followUpCompletedAt" IS NULL OR "followUpRequired"),
    -- BR-20: the void fields are all set or all null.
    CONSTRAINT "ActionTaken_void_fields_check" CHECK (
      ("voidedAt" IS NULL) = ("voidedById" IS NULL) AND ("voidedAt" IS NULL) = ("voidReason" IS NULL)
    )
);

-- CreateIndex: idempotent create (BR-24).
CREATE UNIQUE INDEX "ActionTaken_clientRequestId_key" ON "ActionTaken"("clientRequestId");

-- CreateIndex: the list read and its stable order (BR-23).
CREATE INDEX "ActionTaken_ticketId_actionAt_id_idx" ON "ActionTaken"("ticketId", "actionAt", "id");

-- CreateIndex: the resolution gate's two counts (BR-35).
CREATE INDEX "ActionTaken_ticketId_voidedAt_followUpRequired_followUpComp_idx" ON "ActionTaken"("ticketId", "voidedAt", "followUpRequired", "followUpCompletedAt");

-- CreateIndex: myRecentActions and myOutstandingFollowUps (BR-62, BR-67).
CREATE INDEX "ActionTaken_performedById_createdAt_idx" ON "ActionTaken"("performedById", "createdAt");

-- AddForeignKey: no action outlives its Ticket (spec §7.3).
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: a referenced user can never be removed (Lab 3 BR-53).
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_followUpCompletedById_fkey" FOREIGN KEY ("followUpCompletedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. New Ticket indexes for the dashboards (spec §7.4).
CREATE INDEX "Ticket_requesterId_status_idx" ON "Ticket"("requesterId", "status");
CREATE INDEX "Ticket_requesterId_publicActivityAt_idx" ON "Ticket"("requesterId", "publicActivityAt");
CREATE INDEX "Ticket_resolvedAt_idx" ON "Ticket"("resolvedAt");
CREATE INDEX "Ticket_updatedAt_idx" ON "Ticket"("updatedAt");
CREATE INDEX "Ticket_createdAt_idx" ON "Ticket"("createdAt");

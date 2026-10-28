-- A database holding Lab 3 data, loaded after the Lab 3 migrations and before the Lab 4 one
-- (tests.md §1.3). Ids are deliberately non-sequential so any renumbering is visible, and every
-- timestamp is fixed so the BR-74 backfill can be checked to the millisecond.

INSERT INTO "Category" ("id", "name") VALUES (3, 'Hardware'), (8, 'Network');
INSERT INTO "RelatedSystem" ("id", "name") VALUES (4, 'VPN');

INSERT INTO "User" ("id", "fullName", "email", "role", "passwordHash", "mustChangePassword", "updatedAt") VALUES
  (11, 'Lab Three Requester', 'requester@lab3.test', 'REQUESTER', 'unusable-lab3-fixture', false, now()),
  (12, 'Lab Three Staff', 'staff@lab3.test', 'IT_STAFF', 'unusable-lab3-fixture', false, now()),
  (13, 'Lab Three Admin', 'admin@lab3.test', 'ADMINISTRATOR', 'unusable-lab3-fixture', false, now());

INSERT INTO "Session" ("id", "userId", "expiresAt") VALUES
  ('lab3-session-requester', 11, '2099-01-01T00:00:00Z'),
  ('lab3-session-staff', 12, '2099-01-01T00:00:00Z');

INSERT INTO "Ticket" ("id", "ticketNumber", "requesterId", "categoryId", "relatedSystemId", "summary", "description",
                      "requestedPriority", "itPriority", "status", "assigneeId", "createdAt", "updatedAt") VALUES
  -- No messages, no attachments: publicActivityAt falls back to createdAt.
  (51, 'TKT-2026-000051', 11, 3, 4, 'Legacy new', 'New.', 'LOW', 'LOW', 'NEW', NULL,
   '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z'),
  -- A later Internal Note must not move publicActivityAt (BR-45).
  (52, 'TKT-2026-000052', 11, 3, 4, 'Legacy open', 'Open.', 'HIGH', 'HIGH', 'OPEN', 12,
   '2026-09-02T00:00:00Z', '2026-09-10T00:00:00Z'),
  -- The attachment removal is the latest public event.
  (53, 'TKT-2026-000053', 11, 8, 4, 'Legacy resolved', 'Resolved.', 'MEDIUM', 'URGENT', 'RESOLVED', 12,
   '2026-09-03T00:00:00Z', '2026-09-20T00:00:00Z'),
  -- The attachment upload is the latest public event.
  (54, 'TKT-2026-000054', 11, 8, 4, 'Legacy closed', 'Closed.', 'LOW', 'LOW', 'CLOSED', 12,
   '2026-09-04T00:00:00Z', '2026-09-25T00:00:00Z'),
  (55, 'TKT-2026-000055', 11, 3, 4, 'Legacy in progress', 'In progress.', 'HIGH', 'MEDIUM', 'IN_PROGRESS', 13,
   '2026-09-05T00:00:00Z', '2026-09-15T00:00:00Z');

INSERT INTO "Attachment" ("id", "ticketId", "originalFilename", "storedFilename", "mimeType", "sizeBytes",
                          "uploadedById", "uploadedAt", "removedAt", "removalReason", "removedById") VALUES
  (61, 53, 'wrong.png', 'lab3-wrong.png', 'image/png', 20, 11,
   '2026-09-06T00:00:00Z', '2026-09-08T00:00:00Z', 'Wrong file', 11),
  (62, 54, 'log.pdf', 'lab3-log.pdf', 'application/pdf', 10, 11, '2026-09-09T00:00:00Z', NULL, NULL, NULL);

INSERT INTO "TicketMessage" ("id", "ticketId", "authorId", "visibility", "body", "createdAt") VALUES
  (71, 52, 12, 'PUBLIC', 'Looking into it.', '2026-09-05T00:00:00Z'),
  (72, 52, 12, 'INTERNAL', 'Private context.', '2026-09-10T00:00:00Z'),
  (73, 53, 11, 'PUBLIC', 'Thanks.', '2026-09-07T00:00:00Z');

INSERT INTO "TicketNumberCounter" ("year", "lastValue") VALUES (2026, 55);

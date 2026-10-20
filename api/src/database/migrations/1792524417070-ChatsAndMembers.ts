import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 0.3 data model (docs/huginn/architecture.md §3): rooms become chats with per-person
 * membership state, messages gain idempotency, reply and edit/delete columns, and the per-user
 * update log, settings and block tables arrive. Existing chats and messages are carried over.
 * The old socket registries (connected_user, joined_room) are dropped; Socket.IO rooms replaced them.
 */
export class ChatsAndMembers1792524417070 implements MigrationInterface {
  name = 'ChatsAndMembers1792524417070';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. New tables.
    await queryRunner.query(
      'CREATE TABLE "block" ("blockerId" integer NOT NULL, "blockedId" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f147961a77e760d035e5cb1f33a" PRIMARY KEY ("blockerId", "blockedId"))',
    );
    await queryRunner.query(
      'CREATE TABLE "chat" ("id" SERIAL NOT NULL, "kind" character varying(10) NOT NULL, "directKey" character varying, "title" character varying(60), "description" character varying(500), "avatarUrl" character varying, "createdById" integer, "editInfoPolicy" character varying(6) NOT NULL DEFAULT \'admins\', "addMemberPolicy" character varying(6) NOT NULL DEFAULT \'admins\', "sendPolicy" character varying(6) NOT NULL DEFAULT \'all\', "lastMessageId" integer, "lastActivityAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_9d0b2ba74336710fd31154738a5" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_24a5a3c208d5cd61c2e6a6f0e9" ON "chat"  ("directKey") WHERE "directKey" IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_f3c30391c6e5513280173587d1" ON "chat"  ("lastActivityAt") ',
    );
    await queryRunner.query(
      'CREATE TABLE "chat_member" ("chatId" integer NOT NULL, "userId" integer NOT NULL, "role" character varying(6) NOT NULL DEFAULT \'member\', "status" character varying(8) NOT NULL DEFAULT \'active\', "joinedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "joinedAfterMessageId" integer NOT NULL DEFAULT \'0\', "leftAt" TIMESTAMP WITH TIME ZONE, "pinnedAt" TIMESTAMP WITH TIME ZONE, "pinOrder" integer, "archivedAt" TIMESTAMP WITH TIME ZONE, "mutedUntil" TIMESTAMP WITH TIME ZONE, "hiddenAt" TIMESTAMP WITH TIME ZONE, "clearedBeforeMessageId" integer NOT NULL DEFAULT \'0\', "markedUnread" boolean NOT NULL DEFAULT false, "lastDeliveredMessageId" integer NOT NULL DEFAULT \'0\', "lastReadMessageId" integer NOT NULL DEFAULT \'0\', CONSTRAINT "PK_19ebaef9771578d9922a3291b82" PRIMARY KEY ("chatId", "userId"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_ea6eb52b259a212304df99b41a" ON "chat_member"  ("userId", "status") ',
    );
    await queryRunner.query(
      'CREATE TABLE "message_hidden" ("userId" integer NOT NULL, "messageId" integer NOT NULL, CONSTRAINT "PK_c9a5a3b5146bab17445d12593ae" PRIMARY KEY ("userId", "messageId"))',
    );
    await queryRunner.query(
      'CREATE TABLE "user_update" ("userId" integer NOT NULL, "seq" integer NOT NULL, "type" character varying(40) NOT NULL, "data" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_140ac24001b32e6cebf15a092e6" PRIMARY KEY ("userId", "seq"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_953d3a4b45a40d3573ef9f68e7" ON "user_update"  ("createdAt") ',
    );
    await queryRunner.query(
      'CREATE TABLE "user_settings" ("userId" integer NOT NULL, "lastSeenVisibility" character varying(8) NOT NULL DEFAULT \'contacts\', "photoVisibility" character varying(8) NOT NULL DEFAULT \'everyone\', "readReceipts" boolean NOT NULL DEFAULT true, "groupAddPolicy" character varying(8) NOT NULL DEFAULT \'contacts\', "messageRequests" boolean NOT NULL DEFAULT true, "enterToSend" boolean NOT NULL DEFAULT true, "keepArchived" boolean NOT NULL DEFAULT true, "notifyPreviews" boolean NOT NULL DEFAULT true, "notifySounds" boolean NOT NULL DEFAULT true, "groupNotifyMode" character varying(8) NOT NULL DEFAULT \'all\', "mentionsBreakMute" boolean NOT NULL DEFAULT true, "dndUntil" TIMESTAMP WITH TIME ZONE, "theme" character varying(6) NOT NULL DEFAULT \'system\', CONSTRAINT "PK_986a2b6d3c05eb4091bb8066f78" PRIMARY KEY ("userId"))',
    );

    // 2. Chats and memberships from rooms. room.updated_at was written in the API's local time
    //    (a timestamp without time zone), so activity starts at creation and comes from messages.
    await queryRunner.query(
      'INSERT INTO "chat" ("id", "kind", "directKey", "title", "description", "lastActivityAt", "createdAt") SELECT "id", "type", "directKey", "name", "description", "created_at", "created_at" FROM "room"',
    );
    await queryRunner.query(
      'SELECT setval(pg_get_serial_sequence(\'chat\', \'id\'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "chat"), 1))',
    );
    await queryRunner.query(
      'INSERT INTO "chat_member" ("chatId", "userId", "role", "status", "joinedAt") SELECT ru."roomId", ru."userId", \'member\', \'active\', r."created_at" FROM "room_users_user" ru JOIN "room" r ON r."id" = ru."roomId"',
    );
    // Rooms recorded no creator: the earliest sender in each group (else its lowest user id) becomes owner.
    await queryRunner.query(
      'UPDATE "chat_member" cm SET "role" = \'owner\' FROM (SELECT DISTINCT ON (c."id") c."id" AS "chatId", COALESCE((SELECT m."userId" FROM "message" m WHERE m."roomId" = c."id" ORDER BY m."id" LIMIT 1), (SELECT MIN(x."userId") FROM "chat_member" x WHERE x."chatId" = c."id")) AS "userId" FROM "chat" c WHERE c."kind" = \'group\') o WHERE cm."chatId" = o."chatId" AND cm."userId" = o."userId"',
    );
    await queryRunner.query(
      'UPDATE "chat" c SET "createdById" = cm."userId" FROM "chat_member" cm WHERE cm."chatId" = c."id" AND cm."role" = \'owner\'',
    );

    // 3. Messages: new columns, filled from the old ones, then the old ones go.
    await queryRunner.query(
      'ALTER TABLE "message" DROP CONSTRAINT "FK_446251f8ceb2132af01b68eb593"',
    );
    await queryRunner.query(
      'ALTER TABLE "message" DROP CONSTRAINT "FK_fdfe54a21d1542c564384b74d5c"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "public"."message_room_id_desc"',
    );
    await queryRunner.query('ALTER TABLE "message" ADD "chatId" integer');
    await queryRunner.query('ALTER TABLE "message" ADD "senderId" integer');
    await queryRunner.query('ALTER TABLE "message" ADD "clientMessageId" uuid');
    await queryRunner.query(
      'ALTER TABLE "message" ADD "kind" character varying(10) NOT NULL DEFAULT \'text\'',
    );
    await queryRunner.query('ALTER TABLE "message" ADD "body" text');
    await queryRunner.query(
      'ALTER TABLE "message" ADD "replyToMessageId" integer',
    );
    await queryRunner.query(
      'ALTER TABLE "message" ADD "editedAt" TIMESTAMP WITH TIME ZONE',
    );
    await queryRunner.query(
      'ALTER TABLE "message" ADD "deletedForAllAt" TIMESTAMP WITH TIME ZONE',
    );
    await queryRunner.query('ALTER TABLE "message" ADD "deletedById" integer');
    await queryRunner.query(
      'ALTER TABLE "message" ADD "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()',
    );
    await queryRunner.query(
      'UPDATE "message" SET "chatId" = "roomId", "senderId" = "userId", "body" = "text", "createdAt" = "created_at"',
    );
    await queryRunner.query('DELETE FROM "message" WHERE "chatId" IS NULL');
    await queryRunner.query(
      'ALTER TABLE "message" ALTER COLUMN "chatId" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "message" ALTER COLUMN "body" SET NOT NULL',
    );
    await queryRunner.query('ALTER TABLE "message" DROP COLUMN "text"');
    await queryRunner.query('ALTER TABLE "message" DROP COLUMN "created_at"');
    await queryRunner.query('ALTER TABLE "message" DROP COLUMN "updated_at"');
    await queryRunner.query('ALTER TABLE "message" DROP COLUMN "userId"');
    await queryRunner.query('ALTER TABLE "message" DROP COLUMN "roomId"');
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_840379c9b02b128da29625c5ec" ON "message"  ("senderId", "clientMessageId") WHERE "clientMessageId" IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_71e4043b8f3f921945d4fe0328" ON "message"  ("chatId", "id") ',
    );

    // 4. Users: last seen and the update-log counter.
    await queryRunner.query(
      'ALTER TABLE "user" ADD "lastSeenAt" TIMESTAMP WITH TIME ZONE',
    );
    await queryRunner.query(
      'ALTER TABLE "user" ADD "updateSeq" integer NOT NULL DEFAULT \'0\'',
    );

    // 5. Activity and read state: existing history counts as read and delivered.
    await queryRunner.query(
      'UPDATE "chat" c SET "lastMessageId" = m."maxId", "lastActivityAt" = GREATEST(c."lastActivityAt", m."lastAt") FROM (SELECT "chatId", MAX("id") AS "maxId", MAX("createdAt") AS "lastAt" FROM "message" GROUP BY "chatId") m WHERE m."chatId" = c."id"',
    );
    await queryRunner.query(
      'UPDATE "chat_member" cm SET "lastReadMessageId" = COALESCE(c."lastMessageId", 0), "lastDeliveredMessageId" = COALESCE(c."lastMessageId", 0) FROM "chat" c WHERE c."id" = cm."chatId"',
    );

    // 6. Foreign keys, then the old tables.
    await queryRunner.query(
      'ALTER TABLE "chat_member" ADD CONSTRAINT "FK_92e48cf204fcce7febc738c8d6f" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "chat_member" ADD CONSTRAINT "FK_0b7f67b9d8726c419922462e848" FOREIGN KEY ("userId") REFERENCES "user"("Id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "message" ADD CONSTRAINT "FK_619bc7b78eba833d2044153bacc" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "message" ADD CONSTRAINT "FK_bc096b4e18b1f9508197cd98066" FOREIGN KEY ("senderId") REFERENCES "user"("Id") ON DELETE SET NULL ON UPDATE NO ACTION',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "joined_room" CASCADE');
    await queryRunner.query('DROP TABLE IF EXISTS "connected_user" CASCADE');
    await queryRunner.query('DROP TABLE IF EXISTS "room_users_user" CASCADE');
    await queryRunner.query('DROP TABLE IF EXISTS "room" CASCADE');
  }

  public async down(): Promise<void> {
    // Restoring rooms would lose per-person state and message requests; restore a backup instead.
    throw new Error(
      'ChatsAndMembers cannot be reverted. Restore a database backup.',
    );
  }
}

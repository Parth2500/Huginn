import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes that keep people search and message history fast at scale (docs/SCALING.md):
 * trigram indexes for "contains" username and display-name search, and the newest-first
 * history index. Also fills the canonical username key for accounts created before it existed.
 */
export class SearchAndHistoryIndexes1792524417069 implements MigrationInterface {
  name = 'SearchAndHistoryIndexes1792524417069';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(
      `UPDATE "user" SET "usernameKey" = lower("username") WHERE "usernameKey" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS user_username_key_trgm ON "user" USING gin ("usernameKey" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS user_display_name_trgm ON "user" USING gin (lower("displayName") gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS message_room_id_desc ON "message" ("roomId", "id" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS message_room_id_desc`);
    await queryRunner.query(`DROP INDEX IF EXISTS user_display_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS user_username_key_trgm`);
  }
}

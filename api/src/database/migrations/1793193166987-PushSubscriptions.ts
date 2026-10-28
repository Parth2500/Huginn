import { MigrationInterface, QueryRunner } from 'typeorm';

export class PushSubscriptions1793193166987 implements MigrationInterface {
  name = 'PushSubscriptions1793193166987';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "push_subscription" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "sessionId" uuid NOT NULL, "endpoint" character varying(2048) NOT NULL, "p256dh" character varying(200) NOT NULL, "auth" character varying(100) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_07fc861c0d2c38c1b830fb9cb5d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8a227cbc3dc43c0d56117ea156" ON "push_subscription"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_be7e354f4bc3b0b6d57a3b7418" ON "push_subscription"  ("sessionId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_27ae9074fc39a09bc1aee263df" ON "push_subscription"  ("endpoint") `,
    );
    await queryRunner.query(
      `ALTER TABLE "push_subscription" ADD CONSTRAINT "FK_8a227cbc3dc43c0d56117ea1563" FOREIGN KEY ("userId") REFERENCES "user"("Id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "push_subscription" ADD CONSTRAINT "FK_be7e354f4bc3b0b6d57a3b74188" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "push_subscription" DROP CONSTRAINT "FK_be7e354f4bc3b0b6d57a3b74188"`,
    );
    await queryRunner.query(
      `ALTER TABLE "push_subscription" DROP CONSTRAINT "FK_8a227cbc3dc43c0d56117ea1563"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_27ae9074fc39a09bc1aee263df"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_be7e354f4bc3b0b6d57a3b7418"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8a227cbc3dc43c0d56117ea156"`,
    );
    await queryRunner.query(`DROP TABLE "push_subscription"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class Sessions1792601612272 implements MigrationInterface {
  name = 'Sessions1792601612272';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "session" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tokenHash" character(64) NOT NULL, "userId" integer NOT NULL, "provider" character varying(20) NOT NULL, "providerData" jsonb, "userAgent" character varying(200), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "lastUsedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_f55da76ac1c3ac420f444d2ff11" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ff3b5bfd0767bd32942e5ccaad" ON "session"  ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3d2f174ef04fb312fdebd0ddc5" ON "session"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5d97cf9773002b16861b4bb8ae" ON "session"  ("expiresAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "session" ADD CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53" FOREIGN KEY ("userId") REFERENCES "user"("Id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "session" DROP CONSTRAINT "FK_3d2f174ef04fb312fdebd0ddc53"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5d97cf9773002b16861b4bb8ae"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3d2f174ef04fb312fdebd0ddc5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ff3b5bfd0767bd32942e5ccaad"`,
    );
    await queryRunner.query(`DROP TABLE "session"`);
  }
}

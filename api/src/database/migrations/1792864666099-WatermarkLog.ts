import { MigrationInterface, QueryRunner } from 'typeorm';

export class WatermarkLog1792864666099 implements MigrationInterface {
  name = 'WatermarkLog1792864666099';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "watermark_log" ("id" SERIAL NOT NULL, "chatId" integer NOT NULL, "userId" integer NOT NULL, "kind" character(1) NOT NULL, "upTo" integer NOT NULL, "at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_507f3448ac0e9d9d6eacfdb322a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_161bc5b247506fe7f5ab9f86f5" ON "watermark_log"  ("chatId", "userId", "kind", "upTo") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_161bc5b247506fe7f5ab9f86f5"`,
    );
    await queryRunner.query(`DROP TABLE "watermark_log"`);
  }
}

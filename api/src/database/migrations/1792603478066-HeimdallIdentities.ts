import { MigrationInterface, QueryRunner } from 'typeorm';

export class HeimdallIdentities1792603478066 implements MigrationInterface {
  name = 'HeimdallIdentities1792603478066';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "pending_signup" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tokenHash" character(64) NOT NULL, "issuer" character varying(255) NOT NULL, "subject" character varying(255) NOT NULL, "email" character varying(320), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_2d0b029dacccf96f58b57635e6c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7db9d8e8c6009c160754fef736" ON "pending_signup"  ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4549f85328c5f53d9d1e8d877d" ON "pending_signup"  ("expiresAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_identity" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "userId" integer NOT NULL, "issuer" character varying(255) NOT NULL, "subject" character varying(255) NOT NULL, "email" character varying(320), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_87b5856b206b5b77e6e2fa29508" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_75fa7b62b2f22b36ec57457541" ON "user_identity"  ("userId", "issuer") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7fe1cb7b4efc3420da673cc619" ON "user_identity"  ("issuer", "subject") `,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "email" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "password" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_identity" ADD CONSTRAINT "FK_6d46a525c55104a04b24cb66391" FOREIGN KEY ("userId") REFERENCES "user"("Id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_identity" DROP CONSTRAINT "FK_6d46a525c55104a04b24cb66391"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "password" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ALTER COLUMN "email" SET NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7fe1cb7b4efc3420da673cc619"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_75fa7b62b2f22b36ec57457541"`,
    );
    await queryRunner.query(`DROP TABLE "user_identity"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4549f85328c5f53d9d1e8d877d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7db9d8e8c6009c160754fef736"`,
    );
    await queryRunner.query(`DROP TABLE "pending_signup"`);
  }
}

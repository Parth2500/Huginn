import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1792524417068 implements MigrationInterface {
  name = 'InitialSchema1792524417068';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "message" ("id" SERIAL NOT NULL, "text" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer, "roomId" integer, CONSTRAINT "PK_ba01f0a3e0123651915008bc578" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "room" ("id" SERIAL NOT NULL, "type" character varying NOT NULL DEFAULT 'group', "name" character varying, "directKey" character varying, "description" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_26e47ba8f6f86aa31565021b66b" UNIQUE ("directKey"), CONSTRAINT "PK_c6d46db005d623e691b2fbcba23" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "joined_room" ("id" SERIAL NOT NULL, "socketId" character varying NOT NULL, "userId" integer, "roomId" integer, CONSTRAINT "PK_3cc7297cf5fec34d1ad45d03ca4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user" ("Id" SERIAL NOT NULL, "username" character varying NOT NULL, "usernameKey" character varying COLLATE "C", "displayName" character varying(40), "bio" character varying(160), "avatarUrl" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "email" character varying NOT NULL, "password" character varying NOT NULL, CONSTRAINT "UQ_78a916df40e02a9deb1c4b75edb" UNIQUE ("username"), CONSTRAINT "UQ_1ad7310b597b137b94688ed5298" UNIQUE ("usernameKey"), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_1e4be10b13490bd87f4cc30c142" PRIMARY KEY ("Id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "connected_user" ("id" SERIAL NOT NULL, "socketId" character varying NOT NULL, "userId" integer, CONSTRAINT "PK_fdd3395ee69c8b2ca474b3552f0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "room_users_user" ("roomId" integer NOT NULL, "userId" integer NOT NULL, CONSTRAINT "PK_e811974018202e969e902e794de" PRIMARY KEY ("roomId", "userId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_764292bbbb93544a050f844c49" ON "room_users_user"  ("roomId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6c675caa22685ba1e0ebeb0f65" ON "room_users_user"  ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "message" ADD CONSTRAINT "FK_446251f8ceb2132af01b68eb593" FOREIGN KEY ("userId") REFERENCES "user"("Id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message" ADD CONSTRAINT "FK_fdfe54a21d1542c564384b74d5c" FOREIGN KEY ("roomId") REFERENCES "room"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "joined_room" ADD CONSTRAINT "FK_11840eedebeb9d0fcc517d0a277" FOREIGN KEY ("userId") REFERENCES "user"("Id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "joined_room" ADD CONSTRAINT "FK_39ed6c993411e4930d1089d4ab2" FOREIGN KEY ("roomId") REFERENCES "room"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "connected_user" ADD CONSTRAINT "FK_509f0623b39c0c278ea0c063f35" FOREIGN KEY ("userId") REFERENCES "user"("Id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "room_users_user" ADD CONSTRAINT "FK_764292bbbb93544a050f844c499" FOREIGN KEY ("roomId") REFERENCES "room"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "room_users_user" ADD CONSTRAINT "FK_6c675caa22685ba1e0ebeb0f654" FOREIGN KEY ("userId") REFERENCES "user"("Id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "room_users_user" DROP CONSTRAINT "FK_6c675caa22685ba1e0ebeb0f654"`,
    );
    await queryRunner.query(
      `ALTER TABLE "room_users_user" DROP CONSTRAINT "FK_764292bbbb93544a050f844c499"`,
    );
    await queryRunner.query(
      `ALTER TABLE "connected_user" DROP CONSTRAINT "FK_509f0623b39c0c278ea0c063f35"`,
    );
    await queryRunner.query(
      `ALTER TABLE "joined_room" DROP CONSTRAINT "FK_39ed6c993411e4930d1089d4ab2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "joined_room" DROP CONSTRAINT "FK_11840eedebeb9d0fcc517d0a277"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message" DROP CONSTRAINT "FK_fdfe54a21d1542c564384b74d5c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message" DROP CONSTRAINT "FK_446251f8ceb2132af01b68eb593"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6c675caa22685ba1e0ebeb0f65"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_764292bbbb93544a050f844c49"`,
    );
    await queryRunner.query(`DROP TABLE "room_users_user"`);
    await queryRunner.query(`DROP TABLE "connected_user"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TABLE "joined_room"`);
    await queryRunner.query(`DROP TABLE "room"`);
    await queryRunner.query(`DROP TABLE "message"`);
  }
}

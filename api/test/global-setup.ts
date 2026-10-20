import { Client } from 'pg';

/**
 * Gives the end-to-end tests their own database, recreated for every run, so they never touch
 * development data. Override with TEST_DATABASE_URL.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://huginn:huginn@localhost:35000/huginn_test';

export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  const admin = new Client({
    connectionString: Object.assign(new URL(url), {
      pathname: '/postgres',
    }).toString(),
  });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

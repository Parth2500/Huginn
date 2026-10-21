import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { TEST_DATABASE_URL } from './global-setup';

export interface TestApp {
  app: INestApplication;
  base: string;
  close: () => Promise<void>;
}

/** Boots the real application (migrations included) on a random port against the test database. */
export async function startApp(): Promise<TestApp> {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { AppModule } = await import('../src/app.module');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(0);
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, base: `http://localhost:${port}`, close: () => app.close() };
}

export interface Account {
  id: number;
  username: string;
  /** The Cookie header that carries this account's session. */
  cookie: string;
}

export async function register(
  base: string,
  username: string,
): Promise<Account> {
  const email = `${username.replace(/[._]/g, '')}@e2e.test`;
  const created = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, username, password: 'Secret#123' }),
  });
  if (created.status !== 201) {
    throw new Error(
      `register ${username}: ${created.status} ${await created.text()}`,
    );
  }
  const { cookie, me } = await signIn(base, email);
  return { id: me.Id, username, cookie };
}

/** Signs in and returns the session cookie and the response body. */
export async function signIn(
  base: string,
  email: string,
  password = 'Secret#123',
) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = response.headers.getSetCookie()[0] ?? '';
  return {
    response,
    setCookie,
    cookie: setCookie.split(';')[0],
    me: (await response.json()) as { Id: number; email?: string },
  };
}

export function api(
  base: string,
  cookie: string,
  path: string,
  init: RequestInit = {},
) {
  return fetch(`${base}/api${path}`, {
    ...init,
    headers: {
      cookie,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
}

/** A connected socket that records every event it receives, ready once the server says hello. */
export async function connect(base: string, account: Account) {
  const socket: Socket = io(base, {
    extraHeaders: { cookie: account.cookie },
    transports: ['websocket'],
  });
  const events: { name: string; data: any }[] = [];
  socket.onAny((name, data) => events.push({ name, data }));
  const hello = await once<{ protocol: number; seq: number }>(socket, 'hello');
  const updates = () =>
    events.filter((e) => e.name === 'update').map((e) => e.data);
  return { socket, events, hello, updates };
}

/** A protocol v1 request: emits and waits for the acknowledgement. */
export function ask<T = any>(
  socket: Socket,
  event: string,
  data: object = {},
): Promise<T> {
  return socket.timeout(5000).emitWithAck(event, data);
}

export function once<T = any>(
  socket: Socket,
  event: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

export const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

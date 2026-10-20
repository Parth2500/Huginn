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
  process.env.JWT_SECRET = 'e2e-secret';
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
  token: string;
}

export async function register(
  base: string,
  username: string,
): Promise<Account> {
  const email = `${username.replace(/[._]/g, '')}@e2e.test`;
  const created = await fetch(`${base}/api/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, username, password: 'Secret#123' }),
  });
  if (created.status !== 201) {
    throw new Error(
      `register ${username}: ${created.status} ${await created.text()}`,
    );
  }
  const login = await fetch(`${base}/api/users/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Secret#123' }),
  });
  const { access_token } = (await login.json()) as { access_token: string };
  const me = (await (await api(base, access_token, '/users/me')).json()) as {
    Id: number;
  };
  return { id: me.Id, username, token: access_token };
}

export function api(
  base: string,
  token: string,
  path: string,
  init: RequestInit = {},
) {
  return fetch(`${base}/api${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
}

/** A connected socket that records every event it receives. */
export async function connect(base: string, account: Account) {
  const socket: Socket = io(base, {
    extraHeaders: { Authorization: account.token },
    transports: ['websocket'],
  });
  const events: { name: string; data: any }[] = [];
  socket.onAny((name, data) => events.push({ name, data }));
  await once(socket, 'rooms');
  return { socket, events };
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

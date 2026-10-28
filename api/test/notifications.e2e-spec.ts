import { randomUUID } from 'crypto';
import {
  PushOutcome,
  PushSender,
  PushTarget,
} from '../src/notifications/push-sender';
import {
  Account,
  api,
  ask,
  connect,
  pause,
  register,
  signIn,
  startApp,
  TestApp,
} from './helpers';

/** Records pushes instead of sending them. `gone` makes the push service answer 410. */
class FakePushSender extends PushSender {
  sent: { target: PushTarget; payload: any }[] = [];
  gone = new Set<string>();
  get publicKey() {
    return 'test-vapid-public-key';
  }
  send(target: PushTarget, payload: object): Promise<PushOutcome> {
    this.sent.push({ target, payload });
    return Promise.resolve(this.gone.has(target.endpoint) ? 'gone' : 'sent');
  }
}

const subscription = (id: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
});

/** Notifications (product-spec.md §6, architecture.md §8). */
describe('notifications', () => {
  let t: TestApp;
  const push = new FakePushSender();
  let ana: Account;
  let ben: Account;
  let cy: Account;
  const sockets: { socket: { disconnect(): void } }[] = [];
  type Client = Awaited<ReturnType<typeof connect>>;
  const open = async (account: Account) => {
    const client = await connect(t.base, account);
    sockets.push(client);
    return client;
  };
  const say = (client: Client, target: object, text: string, extra = {}) =>
    ask(client.socket, 'message.send', {
      ...target,
      ...extra,
      text,
      clientMessageId: randomUUID(),
    });
  const notices = (client: Client) =>
    client.events.filter((e) => e.name === 'notify').map((e) => e.data);
  const settle = () => pause(250);

  let a: Client;
  let b: Client;
  let c: Client;
  let directChat: number;

  beforeAll(async () => {
    t = await startApp((builder) =>
      builder.overrideProvider(PushSender).useValue(push),
    );
    ana = await register(t.base, 'ana.notify');
    ben = await register(t.base, 'ben.notify');
    cy = await register(t.base, 'cy.notify');
    a = await open(ana);
    b = await open(ben);
    c = await open(cy);
    directChat = (await say(a, { toUserId: ben.id }, 'first')).chatId;
    await say(a, { toUserId: cy.id }, 'hi cy');
    await settle();
  });
  afterAll(async () => {
    sockets.forEach((s) => s.socket.disconnect());
    await t.close();
  });
  beforeEach(() => {
    for (const client of [a, b, c]) {
      client.events.length = 0;
    }
    push.sent = [];
  });

  it('tells the recipient, with the sender and a preview, and never the sender', async () => {
    const sent = await say(a, { chatId: directChat }, 'Lunch at noon?');
    await settle();
    expect(notices(b)).toEqual([
      {
        userId: ben.id,
        chatId: directChat,
        messageId: sent.message.id,
        title: 'ana.notify',
        body: 'Lunch at noon?',
        sound: true,
      },
    ]);
    expect(notices(a)).toEqual([]);
  });

  it('notifies once for a retried send', async () => {
    const clientMessageId = randomUUID();
    const send = () =>
      ask(a.socket, 'message.send', {
        chatId: directChat,
        text: 'once',
        clientMessageId,
      });
    await send();
    await send();
    await settle();
    expect(notices(b)).toHaveLength(1);
  });

  it('says "New message" (no title or body) with previews off, and no sound with sounds off', async () => {
    const changed = await ask(b.socket, 'settings.update', {
      notifyPreviews: false,
      notifySounds: false,
    });
    expect(changed.settings).toMatchObject({
      notifyPreviews: false,
      notifySounds: false,
      readReceipts: true,
    });
    await say(a, { chatId: directChat }, 'secret plans');
    await settle();
    expect(notices(b)[0]).toMatchObject({
      title: null,
      body: null,
      sound: false,
    });
    await ask(b.socket, 'settings.update', {
      notifyPreviews: true,
      notifySounds: true,
    });
  });

  it('keeps muted and archived chats quiet, unless a reply to you breaks through', async () => {
    const mine = await say(b, { chatId: directChat }, 'my question');
    await ask(b.socket, 'chat.state', {
      chatIds: [directChat],
      mute: 'always',
    });
    await say(a, { chatId: directChat }, 'muted chatter');
    await say(a, { chatId: directChat }, 'an answer', {
      replyToMessageId: mine.message.id,
    });
    await settle();
    expect(notices(b).map((n) => n.body)).toEqual(['an answer']);

    b.events.length = 0;
    await ask(b.socket, 'settings.update', { mentionsBreakMute: false });
    await say(a, { chatId: directChat }, 'another answer', {
      replyToMessageId: mine.message.id,
    });
    await settle();
    expect(notices(b)).toEqual([]);
    await ask(b.socket, 'settings.update', { mentionsBreakMute: true });
    await ask(b.socket, 'chat.state', { chatIds: [directChat], mute: null });

    await ask(b.socket, 'chat.state', { chatIds: [directChat], archive: true });
    await say(a, { chatId: directChat }, 'archived chatter');
    await settle();
    expect(notices(b)).toEqual([]);
    await ask(b.socket, 'chat.state', {
      chatIds: [directChat],
      archive: false,
    });
  });

  it('stays quiet in do not disturb until it ends', async () => {
    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const changed = await ask(b.socket, 'settings.update', { dndUntil: until });
    expect(new Date(changed.settings.dndUntil).toISOString()).toBe(until);
    await say(a, { chatId: directChat }, 'during dnd');
    await settle();
    expect(notices(b)).toEqual([]);

    await ask(b.socket, 'settings.update', { dndUntil: null });
    await say(a, { chatId: directChat }, 'after dnd');
    await settle();
    expect(notices(b).map((n) => n.body)).toEqual(['after dnd']);
  });

  it('refuses malformed settings', async () => {
    expect(
      await ask(b.socket, 'settings.update', { notifySounds: 'yes' }),
    ).toMatchObject({ ok: false });
    expect(
      await ask(b.socket, 'settings.update', { groupNotifyMode: 'some' }),
    ).toMatchObject({ ok: false });
    expect(
      await ask(b.socket, 'settings.update', { dndUntil: 'tomorrow-ish' }),
    ).toMatchObject({ ok: false });
  });

  it('titles group notices with the group, and honours "only mentions and replies"', async () => {
    const created = await ask(a.socket, 'group.create', {
      title: 'Lunch crew',
      memberIds: [ben.id, cy.id],
    });
    const groupId = created.chat.id;
    await settle();
    b.events.length = 0;
    c.events.length = 0;

    const first = await say(c, { chatId: groupId }, 'pizza?');
    await settle();
    expect(notices(b)).toMatchObject([
      { chatId: groupId, title: 'Lunch crew', body: 'cy.notify: pizza?' },
    ]);
    expect(notices(a)).toHaveLength(1);

    await ask(b.socket, 'settings.update', { groupNotifyMode: 'mentions' });
    b.events.length = 0;
    await say(a, { chatId: groupId }, 'sure');
    await settle();
    expect(notices(b)).toEqual([]);

    const own = await say(b, { chatId: groupId }, 'which place?');
    await say(c, { chatId: groupId }, 'the usual', {
      replyToMessageId: own.message.id,
    });
    await settle();
    expect(notices(b).map((n) => n.body)).toEqual(['cy.notify: the usual']);
    expect(first.message.id).toBeGreaterThan(0);
    await ask(b.socket, 'settings.update', { groupNotifyMode: 'all' });
  });

  describe('Web Push', () => {
    it('hands out the VAPID public key', async () => {
      const response = await api(t.base, ben.cookie, '/notifications/push-key');
      expect(await response.json()).toEqual({
        publicKey: 'test-vapid-public-key',
      });
    });

    it('pushes only to browsers without an open Huginn tab', async () => {
      // A second browser for Ben, signed in but with no tab open.
      const other = await signIn(t.base, 'bennotify@e2e.test');
      const put = await api(
        t.base,
        other.cookie,
        '/notifications/subscription',
        {
          method: 'PUT',
          body: JSON.stringify(subscription('ben-laptop')),
        },
      );
      expect(put.status).toBe(204);
      // Ben's open tab has a subscription too; it hears through the socket instead.
      await api(t.base, ben.cookie, '/notifications/subscription', {
        method: 'PUT',
        body: JSON.stringify(subscription('ben-phone')),
      });

      const sent = await say(a, { chatId: directChat }, 'are you there?');
      await settle();
      expect(push.sent).toEqual([
        {
          target: expect.objectContaining({
            endpoint: subscription('ben-laptop').endpoint,
          }),
          payload: {
            chatId: directChat,
            messageId: sent.message.id,
            title: 'ana.notify',
            body: 'are you there?',
            sound: true,
          },
        },
      ]);
      expect(notices(b)).toHaveLength(1);

      // Signing that browser out removes its subscription with the session.
      await fetch(`${t.base}/api/auth/logout`, {
        method: 'POST',
        headers: { cookie: other.cookie },
      });
      push.sent = [];
      await say(a, { chatId: directChat }, 'gone?');
      await settle();
      expect(push.sent).toEqual([]);
    });

    it('forgets a subscription the push service says is gone', async () => {
      const other = await signIn(t.base, 'cynotify@e2e.test');
      await api(t.base, other.cookie, '/notifications/subscription', {
        method: 'PUT',
        body: JSON.stringify(subscription('cy-old')),
      });
      c.socket.disconnect();
      push.gone.add(subscription('cy-old').endpoint);
      const cyChat = (await say(a, { toUserId: cy.id }, 'one')).chatId;
      await settle();
      expect(push.sent).toHaveLength(1);
      push.sent = [];
      await say(a, { chatId: cyChat }, 'two');
      await settle();
      expect(push.sent).toEqual([]);
    });

    it('accepts only real push services, and only signed in', async () => {
      const bad = [
        { ...subscription('x'), endpoint: 'https://internal.example/hook' },
        {
          ...subscription('x'),
          endpoint: 'http://fcm.googleapis.com/fcm/send/x',
        },
        { ...subscription('x'), endpoint: 'https://fcm.googleapis.com:8443/x' },
        { ...subscription('x'), keys: { p256dh: 'not base64!', auth: 'x' } },
        { endpoint: subscription('x').endpoint },
      ];
      for (const body of bad) {
        const response = await api(
          t.base,
          ana.cookie,
          '/notifications/subscription',
          {
            method: 'PUT',
            body: JSON.stringify(body),
          },
        );
        expect(response.status).toBe(400);
      }
      const anonymous = await fetch(
        `${t.base}/api/notifications/subscription`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(subscription('x')),
        },
      );
      expect(anonymous.status).toBe(401);
    });

    it('removes a subscription on request', async () => {
      await api(t.base, ana.cookie, '/notifications/subscription', {
        method: 'PUT',
        body: JSON.stringify(subscription('ana-1')),
      });
      const removed = await api(
        t.base,
        ana.cookie,
        '/notifications/subscription',
        {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: subscription('ana-1').endpoint }),
        },
      );
      expect(removed.status).toBe(204);
    });
  });
});

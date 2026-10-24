import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import {
  Account,
  ask,
  connect,
  pause,
  register,
  startApp,
  TestApp,
} from './helpers';

/** Delete for me and delete for everyone (product-spec.md §3.4). */
describe('deleting messages', () => {
  let t: TestApp;
  let ana: Account;
  let ben: Account;
  let cy: Account;
  const sockets: { socket: { disconnect(): void } }[] = [];
  const open = async (account: Account) => {
    const client = await connect(t.base, account);
    sockets.push(client);
    return client;
  };
  type Client = Awaited<ReturnType<typeof connect>>;
  const say = (client: Client, target: object, text: string) =>
    ask(client.socket, 'message.send', {
      ...target,
      text,
      clientMessageId: randomUUID(),
    });
  const texts = async (client: Client, chatId: number) =>
    (await ask(client.socket, 'chat.open', { chatId })).messages.map(
      (m: any) => (m.deleted ? '(deleted)' : m.text),
    );

  beforeAll(async () => {
    t = await startApp();
    ana = await register(t.base, 'ana.delete');
    ben = await register(t.base, 'ben.delete');
    cy = await register(t.base, 'cy.delete');
  });
  afterAll(async () => {
    sockets.forEach((s) => s.socket.disconnect());
    await t.close();
  });

  it('deletes for me only, on all my devices, and moves the preview back', async () => {
    const a = await open(ana);
    const phone = await open(ana);
    const b = await open(ben);
    const first = await say(a, { toUserId: ben.id }, 'one');
    const chatId = first.chatId;
    const second = await say(b, { chatId }, 'two');

    const done = await ask(a.socket, 'message.delete', {
      messageIds: [second.message.id],
      scope: 'me',
    });
    expect(done.ok).toBe(true);
    expect(await texts(a, chatId)).toEqual(['one']);
    expect(await texts(b, chatId)).toEqual(['two', 'one']);
    const { chat } = await ask(a.socket, 'chat.get', { chatId });
    expect(chat.lastMessage.text).toBe('one');

    await pause(200);
    const hidden = phone
      .updates()
      .filter((u: any) => u.type === 'message.hidden');
    expect(hidden.at(-1).data).toEqual({
      chatId,
      messageIds: [second.message.id],
    });
    expect(b.updates().some((u: any) => u.type === 'message.hidden')).toBe(
      false,
    );
  });

  it('deletes your own recent message for everyone, as a tombstone', async () => {
    const a = await open(ana);
    const b = await open(ben);
    const sent = await say(a, { toUserId: ben.id }, 'oops');
    const done = await ask(a.socket, 'message.delete', {
      messageIds: [sent.message.id],
      scope: 'all',
    });
    expect(done.ok).toBe(true);
    await pause(200);
    const seen = b.updates().filter((u: any) => u.type === 'message.deleted');
    expect(seen.at(-1).data.message).toMatchObject({
      id: sent.message.id,
      deleted: true,
      text: null,
      deletedById: ana.id,
    });
    expect((await texts(b, sent.chatId))[0]).toBe('(deleted)');
  });

  it("refuses everyone's delete after 15 minutes, or of someone else's message", async () => {
    const a = await open(ana);
    const b = await open(ben);
    const old = await say(a, { toUserId: ben.id }, 'old news');
    await t.app
      .get(DataSource)
      .query(
        `UPDATE message SET "createdAt" = now() - interval '16 minutes' WHERE id = $1`,
        [old.message.id],
      );
    const late = await ask(a.socket, 'message.delete', {
      messageIds: [old.message.id],
      scope: 'all',
    });
    expect(late.error).toMatch(/within 15 minutes/);

    const theirs = await ask(b.socket, 'message.delete', {
      messageIds: [old.message.id],
      scope: 'all',
    });
    expect(theirs.error).toMatch(/Only group admins/);
    // For yourself it's always fine.
    expect(
      (
        await ask(b.socket, 'message.delete', {
          messageIds: [old.message.id],
          scope: 'me',
        })
      ).ok,
    ).toBe(true);
  });

  it("lets a group admin delete anyone's message for everyone", async () => {
    const a = await open(ana);
    const b = await open(ben);
    const group = await ask(a.socket, 'group.create', {
      title: 'Delete crew',
      memberIds: [ben.id, cy.id],
    });
    const fromBen = await say(b, { chatId: group.chat.id }, 'spam');
    const done = await ask(a.socket, 'message.delete', {
      messageIds: [fromBen.message.id],
      scope: 'all',
    });
    expect(done.ok).toBe(true);
    const c = await open(cy);
    // Newest first: the tombstone, then "Ana created the group".
    expect(await texts(c, group.chat.id)).toEqual(['(deleted)', null]);
  });

  it("can't touch messages outside your chats, and checks its input", async () => {
    const a = await open(ana);
    const c = await open(cy);
    const sent = await say(a, { toUserId: ben.id }, 'private');
    const outsider = await ask(c.socket, 'message.delete', {
      messageIds: [sent.message.id],
      scope: 'me',
    });
    expect(outsider.error).toMatch(/couldn't be found/);
    expect(
      (await ask(a.socket, 'message.delete', { messageIds: [], scope: 'me' }))
        .ok,
    ).toBe(false);
    expect(
      (
        await ask(a.socket, 'message.delete', {
          messageIds: [sent.message.id],
          scope: 'them',
        })
      ).ok,
    ).toBe(false);
  });
});

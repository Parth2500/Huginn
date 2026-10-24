import { randomUUID } from 'crypto';
import {
  Account,
  ask,
  connect,
  pause,
  register,
  startApp,
  TestApp,
} from './helpers';

/** Clear chat and delete chat (product-spec.md §1.4–1.5): for you only, never for the others. */
describe('clear and delete chat', () => {
  let t: TestApp;
  let me: Account;
  let sam: Account;
  let lee: Account;
  const sockets: { socket: { disconnect(): void } }[] = [];
  const open = async (account: Account) => {
    const client = await connect(t.base, account);
    sockets.push(client);
    return client;
  };
  const say = (
    socket: Awaited<ReturnType<typeof connect>>['socket'],
    target: object,
    text: string,
  ) =>
    ask(socket, 'message.send', {
      ...target,
      text,
      clientMessageId: randomUUID(),
    });

  beforeAll(async () => {
    t = await startApp();
    me = await register(t.base, 'cleo.clear');
    sam = await register(t.base, 'sam.clear');
    lee = await register(t.base, 'lee.clear');
  });
  afterAll(async () => {
    sockets.forEach((s) => s.socket.disconnect());
    await t.close();
  });

  it('clears the history for you only and keeps the chat in your list', async () => {
    const m = await open(me);
    const s = await open(sam);
    const first = await say(m.socket, { toUserId: sam.id }, 'one');
    const chatId = first.chatId;
    await say(s.socket, { chatId }, 'two');

    const cleared = await ask(m.socket, 'chat.state', {
      chatIds: [chatId],
      clear: true,
    });
    expect(cleared.ok).toBe(true);
    expect(cleared.results[0].unreadCount).toBe(0);
    expect(cleared.results[0].me.clearedBeforeMessageId).toBeGreaterThan(
      first.message.id,
    );

    expect((await ask(m.socket, 'chat.open', { chatId })).messages).toEqual([]);
    const mine = await ask(m.socket, 'chat.get', { chatId });
    expect(mine.chat.lastMessage).toBeNull();
    const list = await ask(m.socket, 'chats.list', {});
    expect(list.chats.map((c: any) => c.id)).toContain(chatId);

    // Sam keeps everything.
    const theirs = await ask(s.socket, 'chat.open', { chatId });
    expect(theirs.messages.map((x: any) => x.text)).toEqual(['two', 'one']);

    // New messages show as usual.
    await say(s.socket, { chatId }, 'three');
    const after = await ask(m.socket, 'chat.open', { chatId });
    expect(after.messages.map((x: any) => x.text)).toEqual(['three']);
  });

  it('deletes a direct chat from your list until a new message brings it back', async () => {
    const m = await open(me);
    const l = await open(lee);
    const sent = await say(l.socket, { toUserId: me.id }, 'hi cleo');
    const chatId = sent.chatId;
    await ask(m.socket, 'chat.state', { chatIds: [chatId], pin: true });

    const phone = await open(me);
    const deleted = await ask(m.socket, 'chat.state', {
      chatIds: [chatId],
      delete: true,
    });
    expect(deleted.ok).toBe(true);
    expect(deleted.results[0].me.hiddenAt).not.toBeNull();
    expect(deleted.results[0].me.pinnedAt).toBeNull();
    const list = await ask(m.socket, 'chats.list', {});
    expect(list.chats.map((c: any) => c.id)).not.toContain(chatId);

    // My other device hears about it.
    await pause(200);
    const seen = phone
      .updates()
      .filter((u: any) => u.type === 'chat.state' && u.data.chatId === chatId);
    expect(seen.at(-1).data.me.hiddenAt).not.toBeNull();

    // Lee still has the chat and its history.
    const theirs = await ask(l.socket, 'chat.open', { chatId });
    expect(theirs.messages.map((x: any) => x.text)).toEqual(['hi cleo']);

    // Lee writes again: the chat is back for me, with only the new message.
    await say(l.socket, { chatId }, 'are you there?');
    const back = await ask(m.socket, 'chats.list', {});
    const chat = back.chats.find((c: any) => c.id === chatId);
    expect(chat.lastMessage.text).toBe('are you there?');
    expect(chat.unreadCount).toBe(1);
    const history = await ask(m.socket, 'chat.open', { chatId });
    expect(history.messages.map((x: any) => x.text)).toEqual([
      'are you there?',
    ]);
  });

  it('refuses to delete a group, and changes nothing else in the same request', async () => {
    const m = await open(me);
    const group = await ask(m.socket, 'group.create', {
      title: 'Clearing crew',
      memberIds: [sam.id, lee.id],
    });
    const direct = await say(m.socket, { toUserId: sam.id }, 'still here');
    const refused = await ask(m.socket, 'chat.state', {
      chatIds: [group.chat.id, direct.chatId],
      delete: true,
    });
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/leave it first/);
    const list = await ask(m.socket, 'chats.list', {});
    expect(list.chats.map((c: any) => c.id)).toEqual(
      expect.arrayContaining([group.chat.id, direct.chatId]),
    );

    // Clearing a group is fine.
    const cleared = await ask(m.socket, 'chat.state', {
      chatIds: [group.chat.id],
      clear: true,
    });
    expect(cleared.ok).toBe(true);
  });

  it('only accepts clear: true and delete: true', async () => {
    const m = await open(me);
    const chat = (await ask(m.socket, 'chats.list', {})).chats[0];
    for (const bad of [{ clear: false }, { delete: 'yes' }, { delete: 1 }]) {
      expect(
        (await ask(m.socket, 'chat.state', { chatIds: [chat.id], ...bad })).ok,
      ).toBe(false);
    }
  });
});

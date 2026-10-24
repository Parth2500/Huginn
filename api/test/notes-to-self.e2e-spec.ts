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

/** Notes to self (product-spec.md §2.2): a chat with only you, pinned outside the limit. */
describe('notes to self', () => {
  let t: TestApp;
  let me: Account;
  const sockets: { socket: { disconnect(): void } }[] = [];
  const open = async (account: Account) => {
    const client = await connect(t.base, account);
    sockets.push(client);
    return client;
  };
  const say = (
    socket: Awaited<ReturnType<typeof connect>>['socket'],
    toUserId: number,
    text: string,
  ) =>
    ask(socket, 'message.send', {
      toUserId,
      text,
      clientMessageId: randomUUID(),
    });

  beforeAll(async () => {
    t = await startApp();
    me = await register(t.base, 'nora.notes');
  });
  afterAll(async () => {
    sockets.forEach((s) => s.socket.disconnect());
    await t.close();
  });

  it('is created by the first note, pinned, and synced to every device', async () => {
    const laptop = await open(me);
    const phone = await open(me);
    const first = await say(laptop.socket, me.id, 'buy milk');
    expect(first.ok).toBe(true);
    const again = await say(laptop.socket, me.id, 'and bread');
    expect(again.chatId).toBe(first.chatId);

    const { chat } = await ask(laptop.socket, 'chat.get', {
      chatId: first.chatId,
    });
    expect(chat.kind).toBe('self');
    expect(chat.members.map((m: any) => m.Id)).toEqual([me.id]);
    expect(chat.me.pinnedAt).not.toBeNull();
    expect(chat.unreadCount).toBe(0);

    await pause(200);
    const kinds = phone
      .updates()
      .filter((u: any) => u.type === 'chat.new')
      .map((u: any) => u.data.chat.kind);
    expect(kinds).toEqual(['self']);
  });

  it("doesn't count towards the five pins", async () => {
    const m = await open(me);
    const chatIds: number[] = [];
    for (let i = 0; i < 5; i++) {
      const other = await register(t.base, `pal${i}.notes`);
      chatIds.push((await say(m.socket, other.id, 'hi')).chatId);
    }
    const pinned = await ask(m.socket, 'chat.state', { chatIds, pin: true });
    expect(pinned.ok).toBe(true);
  });

  it('can be deleted, and comes back with the next note', async () => {
    const m = await open(me);
    const note = await say(m.socket, me.id, 'temp');
    const deleted = await ask(m.socket, 'chat.state', {
      chatIds: [note.chatId],
      delete: true,
    });
    expect(deleted.ok).toBe(true);
    const back = await say(m.socket, me.id, 'new note');
    expect(back.chatId).toBe(note.chatId);
    const history = await ask(m.socket, 'chat.open', { chatId: note.chatId });
    expect(history.messages.map((x: any) => x.text)).toEqual(['new note']);
  });
});

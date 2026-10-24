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

/** Ticks from watermarks (product-spec.md §3.1, architecture.md §6). */
describe('receipts', () => {
  let t: TestApp;
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
  const say = (client: Client, target: object, text: string) =>
    ask(client.socket, 'message.send', {
      ...target,
      text,
      clientMessageId: randomUUID(),
    });
  const lastReceipt = (client: Client, chatId: number) =>
    client
      .updates()
      .filter((u: any) => u.type === 'receipt' && u.data.chatId === chatId)
      .at(-1)?.data;

  beforeAll(async () => {
    t = await startApp();
    ana = await register(t.base, 'ana.receipts');
    ben = await register(t.base, 'ben.receipts');
    cy = await register(t.base, 'cy.receipts');
  });
  afterAll(async () => {
    sockets.forEach((s) => s.socket.disconnect());
    await t.close();
  });

  it('goes sent, delivered, read in a direct chat', async () => {
    const a = await open(ana);
    const b = await open(ben);
    const sent = await say(a, { toUserId: ben.id }, 'hello');
    const { chatId } = sent;
    const id = sent.message.id;
    let chat = (await ask(a.socket, 'chat.get', { chatId })).chat;
    expect(chat.receipts.deliveredUpTo).toBeLessThan(id);

    await ask(b.socket, 'chat.delivered', { chatId, upTo: id });
    await pause(200);
    expect(lastReceipt(a, chatId)).toEqual({
      chatId,
      deliveredUpTo: id,
      readUpTo: 0,
    });

    // A huge upTo is capped at the newest message.
    await ask(b.socket, 'chat.read', { chatId, upTo: 1e9 });
    await pause(200);
    expect(lastReceipt(a, chatId)).toMatchObject({ readUpTo: id });
    chat = (await ask(a.socket, 'chat.get', { chatId })).chat;
    expect(chat.receipts).toEqual({ deliveredUpTo: id, readUpTo: id });
    const next = await say(a, { chatId }, 'still there?');
    chat = (await ask(a.socket, 'chat.get', { chatId })).chat;
    expect(chat.receipts.readUpTo).toBeLessThan(next.message.id);
  });

  it('hides reads both ways when either side turns receipts off', async () => {
    const a = await open(ana);
    const b = await open(ben);
    const sent = await say(a, { toUserId: ben.id }, 'private?');
    await ask(b.socket, 'chat.read', {
      chatId: sent.chatId,
      upTo: sent.message.id,
    });
    const off = await ask(b.socket, 'settings.update', { readReceipts: false });
    expect(off.settings.readReceipts).toBe(false);
    await pause(200);
    expect(lastReceipt(a, sent.chatId)).toMatchObject({ readUpTo: 0 });

    // Ben no longer sees Ana's reads either.
    const reply = await say(b, { chatId: sent.chatId }, 'yes');
    await ask(a.socket, 'chat.read', {
      chatId: sent.chatId,
      upTo: reply.message.id,
    });
    const theirs = (await ask(b.socket, 'chat.get', { chatId: sent.chatId }))
      .chat;
    expect(theirs.receipts.readUpTo).toBe(0);
    expect(theirs.receipts.deliveredUpTo).toBe(reply.message.id);

    await ask(b.socket, 'settings.update', { readReceipts: true });
    expect((await ask(b.socket, 'settings.get')).settings.readReceipts).toBe(
      true,
    );
    const back = (await ask(b.socket, 'chat.get', { chatId: sent.chatId }))
      .chat;
    expect(back.receipts.readUpTo).toBe(reply.message.id);
  });

  it('waits for every member in a group', async () => {
    const a = await open(ana);
    const b = await open(ben);
    const c = await open(cy);
    const group = await ask(a.socket, 'group.create', {
      title: 'Tick crew',
      memberIds: [ben.id, cy.id],
    });
    const chatId = group.chat.id;
    const sent = await say(a, { chatId }, 'all here?');
    await ask(b.socket, 'chat.read', { chatId, upTo: sent.message.id });
    let chat = (await ask(a.socket, 'chat.get', { chatId })).chat;
    expect(chat.receipts.readUpTo).toBeLessThan(sent.message.id);
    // Group reads count even with receipts off (only direct chats hide them).
    await ask(c.socket, 'settings.update', { readReceipts: false });
    await ask(c.socket, 'chat.read', { chatId, upTo: sent.message.id });
    chat = (await ask(a.socket, 'chat.get', { chatId })).chat;
    expect(chat.receipts).toEqual({
      deliveredUpTo: sent.message.id,
      readUpTo: sent.message.id,
    });
    await ask(c.socket, 'settings.update', { readReceipts: true });
  });
});

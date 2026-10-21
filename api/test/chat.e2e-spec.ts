import { randomUUID } from 'crypto';
import {
  Account,
  ask,
  connect,
  once,
  pause,
  register,
  startApp,
  TestApp,
} from './helpers';
import { RETENTION_MS, UpdatesService } from '../src/chat/updates.service';

/** Realtime protocol v1 (docs/huginn/architecture.md §4–5). */
describe('chats over Socket.IO', () => {
  let t: TestApp;
  let maya: Account;
  let sam: Account;
  let tess: Account;
  let rui: Account;
  const sockets: { socket: { disconnect(): void } }[] = [];

  beforeAll(async () => {
    t = await startApp();
    maya = await register(t.base, 'maya.chat');
    sam = await register(t.base, 'sam.chat');
    tess = await register(t.base, 'tess.chat');
    rui = await register(t.base, 'rui.chat');
  });
  afterAll(async () => {
    sockets.forEach((s) => s.socket.disconnect());
    await t.close();
  });

  const open = async (account: Account) => {
    const client = await connect(t.base, account);
    sockets.push(client);
    return client;
  };
  const send = (
    socket: Parameters<typeof ask>[0],
    target: { chatId: number } | { toUserId: number },
    text: string,
    clientMessageId = randomUUID(),
  ) => ask(socket, 'message.send', { ...target, text, clientMessageId });

  let directId: number;

  it('opens a draft, and the other person sees nothing until the first message', async () => {
    const m = await open(maya);
    const s = await open(sam);
    expect(m.hello.protocol).toBe(1);

    const opened = await ask(m.socket, 'direct.open', { userId: sam.id });
    expect(opened.ok).toBe(true);
    expect(opened.chat).toBeNull();
    expect(opened.partner.username).toBe('sam.chat');
    expect(opened.partner.email).toBeUndefined();

    await pause(300);
    expect(s.updates()).toEqual([]);

    const sent = await send(m.socket, { toUserId: sam.id }, '  hello sam  ');
    expect(sent.ok).toBe(true);
    expect(sent.message.text).toBe('hello sam');
    directId = sent.chatId;

    await pause(300);
    const types = s.updates().map((u) => `${u.seq}:${u.type}`);
    expect(types).toEqual(['1:chat.new', '2:message.new']);
    const chat = s.updates()[0].data.chat;
    expect(chat.kind).toBe('direct');
    expect(chat.directKey).toBeUndefined();
    expect(chat.members.map((u: any) => u.username).sort()).toEqual([
      'maya.chat',
      'sam.chat',
    ]);
    expect(chat.members.every((u: any) => u.email === undefined)).toBe(true);
  });

  it('stores a retried send once', async () => {
    const m = await open(maya);
    const s = await open(sam);
    const id = randomUUID();
    const first = await send(m.socket, { chatId: directId }, 'only once', id);
    const again = await send(m.socket, { chatId: directId }, 'only once', id);
    expect(again.message.id).toBe(first.message.id);
    await pause(300);
    expect(s.updates().filter((u) => u.type === 'message.new')).toHaveLength(1);
  });

  it('keeps one sender’s burst of messages in the order they were sent', async () => {
    const m = await open(maya);
    const texts = Array.from({ length: 10 }, (_, i) => `burst ${i}`);
    const acks = await Promise.all(
      texts.map((text) => send(m.socket, { chatId: directId }, text)),
    );
    const ids = acks.map((a) => a.message.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it('replays missed updates with sync, in order', async () => {
    const away = await open(sam);
    const since = away.hello.seq;
    away.socket.disconnect();

    const m = await open(maya);
    await send(m.socket, { chatId: directId }, 'while you were away 1');
    await send(m.socket, { chatId: directId }, 'while you were away 2');

    const back = await open(sam);
    expect(back.hello.seq).toBe(since + 2);
    const sync = await ask(back.socket, 'sync', { sinceSeq: since });
    expect(sync.ok).toBe(true);
    expect(sync.reset).toBe(false);
    expect(sync.updates.map((u: any) => [u.seq, u.data.message.text])).toEqual([
      [since + 1, 'while you were away 1'],
      [since + 2, 'while you were away 2'],
    ]);
    const upToDate = await ask(back.socket, 'sync', { sinceSeq: sync.seq });
    expect(upToDate.updates).toEqual([]);
  });

  it('counts unread on the server and clears it on read, for every device', async () => {
    const phone = await open(sam);
    const laptop = await open(sam);
    const listed = await ask(laptop.socket, 'chats.list');
    const chat = listed.chats.find((c: any) => c.id === directId);
    expect(chat.unreadCount).toBeGreaterThan(0);
    expect(chat.lastMessage.text).toBe('while you were away 2');

    const read = await ask(laptop.socket, 'chat.read', {
      chatId: directId,
      upTo: chat.lastMessage.id,
    });
    expect(read.ok).toBe(true);
    await pause(300);
    const state = phone.updates().find((u) => u.type === 'chat.state');
    expect(state).toBeDefined();
    expect(state.data.unreadCount).toBe(0);
    expect(state.data.me.lastReadMessageId).toBe(chat.lastMessage.id);
  });

  it('pages history newest first, before a message id', async () => {
    const m = await open(maya);
    const latest = await ask(m.socket, 'chat.open', { chatId: directId });
    expect(latest.ok).toBe(true);
    const ids = latest.messages.map((x: any) => x.id);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
    const older = await ask(m.socket, 'messages.page', {
      chatId: directId,
      before: ids[ids.length - 1],
    });
    expect(older.messages.every((x: any) => x.id < ids[ids.length - 1])).toBe(
      true,
    );
  });

  it('requires a name and at least two other people for a group', async () => {
    const m = await open(maya);
    const tooSmall = await ask(m.socket, 'group.create', {
      title: 'Pair',
      memberIds: [sam.id],
    });
    expect(tooSmall.ok).toBe(false);
    expect(tooSmall.error).toContain('at least two other people');

    const t1 = await open(tess);
    const created = await ask(m.socket, 'group.create', {
      title: '  Launch crew ',
      memberIds: [sam.id, tess.id, tess.id],
    });
    expect(created.ok).toBe(true);
    expect(created.chat.title).toBe('Launch crew');
    expect(created.chat.me.role).toBe('owner');
    expect(created.chat.members).toHaveLength(3);
    const update = await once(t1.socket, 'update');
    expect(update.type).toBe('chat.new');
    expect(update.data.chat.me.role).toBe('member');
  });

  it('refuses to open or write to a chat you are not in', async () => {
    const r = await open(rui);
    const opened = await ask(r.socket, 'chat.open', { chatId: directId });
    expect(opened).toEqual({
      ok: false,
      error: "You're not a member of that chat.",
    });
    const page = await ask(r.socket, 'messages.page', { chatId: directId });
    expect(page.ok).toBe(false);
    const sent = await send(r.socket, { chatId: directId }, 'let me in');
    expect(sent.ok).toBe(false);
    const got = await ask(r.socket, 'chat.get', { chatId: directId });
    expect(got.ok).toBe(false);
  });

  it('sends typing only to people who have the chat open', async () => {
    const m = await open(maya);
    const s = await open(sam);
    const r = await open(rui);
    m.socket.emit('typing', { chatId: directId }); // not opened yet: ignored
    await ask(m.socket, 'chat.open', { chatId: directId });
    await ask(s.socket, 'chat.open', { chatId: directId });
    m.socket.emit('typing', { chatId: directId });
    const typing = await once(s.socket, 'typing');
    expect(typing).toMatchObject({
      chatId: directId,
      user: { username: 'maya.chat' },
    });
    await pause(200);
    expect(s.events.filter((e) => e.name === 'typing')).toHaveLength(1);
    expect(r.events.filter((e) => e.name === 'typing')).toHaveLength(0);
  });

  it('rejects empty, over-long and unidentified messages', async () => {
    const m = await open(maya);
    const empty = await send(m.socket, { chatId: directId }, '   ');
    expect(empty.ok).toBe(false);
    const long = await send(m.socket, { chatId: directId }, 'x'.repeat(2001));
    expect(long.error).toContain('2000');
    const noId = await ask(m.socket, 'message.send', {
      chatId: directId,
      text: 'hi',
    });
    expect(noId.error).toContain('clientMessageId');
  });

  it('turns away a socket without a valid session', async () => {
    const { io } = await import('socket.io-client');
    const bad = io(t.base, {
      extraHeaders: { cookie: 'huginn_session=not-a-session' },
      transports: ['websocket'],
    });
    expect((await once(bad, 'unauthorized')).message).toContain(
      'Sign in again',
    );
    bad.disconnect();
  });

  // Last: pruning empties every test user's log.
  it('tells a device to reload once the updates it missed are pruned', async () => {
    const away = await open(sam);
    const since = away.hello.seq;
    away.socket.disconnect();
    const m = await open(maya);
    await send(m.socket, { chatId: directId }, 'sent before the prune');

    const pruned = await t.app
      .get(UpdatesService)
      .prune(new Date(Date.now() + RETENTION_MS + 1000));
    expect(pruned).toBeGreaterThan(0);

    const back = await open(sam);
    const sync = await ask(back.socket, 'sync', { sinceSeq: since });
    expect(sync.reset).toBe(true);
    expect(sync.seq).toBe(since + 1);
  });
});

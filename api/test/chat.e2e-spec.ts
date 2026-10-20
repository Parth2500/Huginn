import {
  Account,
  connect,
  once,
  pause,
  register,
  startApp,
  TestApp,
} from './helpers';

describe('chats over Socket.IO', () => {
  let t: TestApp;
  let maya: Account;
  let sam: Account;
  let tess: Account;
  const sockets: { socket: { disconnect(): void } }[] = [];

  beforeAll(async () => {
    t = await startApp();
    maya = await register(t.base, 'maya.chat');
    sam = await register(t.base, 'sam.chat');
    tess = await register(t.base, 'tess.chat');
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

  it('opens a draft, and the other person sees nothing until the first message', async () => {
    const m = await open(maya);
    const s = await open(sam);

    m.socket.emit('openDirect', { userId: sam.id });
    const opened = await once(m.socket, 'directOpened');
    expect(opened.room).toBeNull();
    expect(opened.partner.username).toBe('sam.chat');
    expect(opened.partner.email).toBeUndefined();

    await pause(300);
    expect(
      s.events
        .filter((e) => e.name !== 'onlineUsers' && e.name !== 'rooms')
        .map((e) => e.name),
    ).toEqual([]);

    const activity = once(s.socket, 'roomActivity');
    m.socket.emit('sendDirectMessage', {
      userId: sam.id,
      text: '  hello sam  ',
    });
    const created = await once(m.socket, 'directRoomCreated');
    expect(created.room.type).toBe('direct');
    expect(created.room.directKey).toBeUndefined();

    const ping = await activity;
    expect(ping.message.text).toBe('hello sam');
    expect(ping.message.user.email).toBeUndefined();

    s.socket.emit('paginateRooms', { limit: 10, page: 0 });
    const rooms = await once(s.socket, 'rooms');
    expect(rooms.items.map((r: any) => r.lastMessage?.text)).toContain(
      'hello sam',
    );

    // Opening the same person again finds the chat instead of a new draft.
    m.socket.emit('openDirect', { userId: sam.id });
    expect((await once(m.socket, 'directOpened')).room.id).toBe(
      created.room.id,
    );
  });

  it('keeps one sender’s burst of messages in the order they were sent', async () => {
    const m = await open(maya);
    m.socket.emit('openDirect', { userId: tess.id });
    await once(m.socket, 'directOpened');
    m.socket.emit('sendDirectMessage', { userId: tess.id, text: 'first' });
    const { room } = await once(m.socket, 'directRoomCreated');

    const received: string[] = [];
    m.socket.on('messageAdded', (msg: { text: string }) =>
      received.push(msg.text),
    );
    for (let i = 0; i < 12; i++) {
      m.socket.emit('addMessage', { text: `n${i}`, room: { id: room.id } });
    }
    await pause(2000);
    expect(received.filter((x) => x.startsWith('n'))).toEqual(
      Array.from({ length: 12 }, (_, i) => `n${i}`),
    );
  });

  it('requires a name and at least two other people for a group', async () => {
    const m = await open(maya);
    m.socket.emit('createRoom', { name: 'Pair', users: [{ Id: sam.id }] });
    expect((await once(m.socket, 'chatError')).message).toContain(
      'at least two other people',
    );

    m.socket.emit('createRoom', {
      name: 'Trio',
      users: [{ Id: sam.id }, { Id: tess.id }],
    });
    const group = await once(m.socket, 'roomCreated');
    expect(group.type).toBe('group');
    expect(group.users.map((u: any) => u.username).sort()).toEqual([
      'maya.chat',
      'sam.chat',
      'tess.chat',
    ]);
  });

  it('refuses to open or write to a chat you are not in', async () => {
    const outsider = await register(t.base, 'outsider.chat');
    const o = await open(outsider);
    const m = await open(maya);
    m.socket.emit('createRoom', {
      name: 'Private',
      users: [{ Id: sam.id }, { Id: tess.id }],
    });
    const group = await once(m.socket, 'roomCreated');

    o.socket.emit('joinRoom', { id: group.id });
    expect((await once(o.socket, 'chatError')).message).toBe(
      "You're not a member of that chat.",
    );
    o.socket.emit('addMessage', { text: 'let me in', room: { id: group.id } });
    expect((await once(o.socket, 'chatError')).message).toBe(
      "You're not a member of that chat.",
    );
  });

  it('rejects empty and over-long messages', async () => {
    const m = await open(maya);
    m.socket.emit('sendDirectMessage', { userId: sam.id, text: '   ' });
    expect((await once(m.socket, 'chatError')).message).toContain(
      'between 1 and 2000',
    );
    m.socket.emit('sendDirectMessage', {
      userId: sam.id,
      text: 'x'.repeat(2001),
    });
    expect((await once(m.socket, 'chatError')).message).toContain(
      'between 1 and 2000',
    );
  });

  it('turns away a socket without a valid session', async () => {
    const { io } = await import('socket.io-client');
    const bad = io(t.base, {
      extraHeaders: { Authorization: 'not-a-token' },
      transports: ['websocket'],
    });
    expect((await once(bad, 'unauthorized')).message).toContain(
      'Sign in again',
    );
    bad.disconnect();
  });
});

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

/** Pin, archive, mute and read state (product-spec.md §1.2–1.7, architecture.md §4.2). */
describe('chat list state', () => {
  let t: TestApp;
  let me: Account;
  const others: Account[] = [];
  const chatIds: number[] = [];
  const sockets: { socket: { disconnect(): void } }[] = [];
  const open = async (account: Account) => {
    const client = await connect(t.base, account);
    sockets.push(client);
    return client;
  };

  beforeAll(async () => {
    t = await startApp();
    me = await register(t.base, 'pia.state');
    const m = await open(me);
    // Seven direct chats, each started by me.
    for (let i = 0; i < 7; i++) {
      const other = await register(t.base, `peer${i}.state`);
      others.push(other);
      const sent = await ask(m.socket, 'message.send', {
        toUserId: other.id,
        text: `hello ${i}`,
        clientMessageId: randomUUID(),
      });
      chatIds.push(sent.chatId);
    }
  });
  afterAll(async () => {
    sockets.forEach((s) => s.socket.disconnect());
    await t.close();
  });

  it('pins up to 5 chats, in the order they were pinned, and refuses a sixth', async () => {
    const m = await open(me);
    const first = await ask(m.socket, 'chat.state', {
      chatIds: [chatIds[0]],
      pin: true,
    });
    expect(first.ok).toBe(true);
    const more = await ask(m.socket, 'chat.state', {
      chatIds: chatIds.slice(1, 5),
      pin: true,
    });
    expect(more.results.map((r: any) => r.me.pinOrder)).toEqual([2, 3, 4, 5]);

    const sixth = await ask(m.socket, 'chat.state', {
      chatIds: [chatIds[5]],
      pin: true,
    });
    expect(sixth.ok).toBe(false);
    expect(sixth.error).toBe(
      'You can pin up to 5 chats. Unpin one to pin this.',
    );

    // Pinning one that's already pinned doesn't count twice.
    expect(
      (await ask(m.socket, 'chat.state', { chatIds: [chatIds[0]], pin: true }))
        .ok,
    ).toBe(true);
    await ask(m.socket, 'chat.state', { chatIds: [chatIds[0]], pin: false });
    expect(
      (await ask(m.socket, 'chat.state', { chatIds: [chatIds[5]], pin: true }))
        .ok,
    ).toBe(true);
  });

  it('archives out of the main list, unpins, and counts the folder', async () => {
    const m = await open(me);
    const archived = await ask(m.socket, 'chat.state', {
      chatIds: [chatIds[1]],
      archive: true,
    });
    expect(archived.results[0].me.archivedAt).not.toBeNull();
    expect(archived.results[0].me.pinnedAt).toBeNull();

    const main = await ask(m.socket, 'chats.list', {});
    expect(main.chats.map((c: any) => c.id)).not.toContain(chatIds[1]);
    const folder = await ask(m.socket, 'chats.list', { folder: 'archived' });
    expect(folder.chats.map((c: any) => c.id)).toEqual([chatIds[1]]);
    expect(await ask(m.socket, 'chats.folders')).toMatchObject({
      archived: { count: 1, unread: 0 },
    });

    // A new message keeps it archived and shows as unread on the folder.
    const peer = await open(others[1]);
    await ask(peer.socket, 'message.send', {
      chatId: chatIds[1],
      text: 'still here?',
      clientMessageId: randomUUID(),
    });
    expect(await ask(m.socket, 'chats.folders')).toMatchObject({
      archived: { count: 1, unread: 1 },
    });

    // Pinning an archived chat unarchives it.
    const pinned = await ask(m.socket, 'chat.state', {
      chatIds: [chatIds[2]],
      pin: false,
    });
    expect(pinned.ok).toBe(true);
    const back = await ask(m.socket, 'chat.state', {
      chatIds: [chatIds[1]],
      pin: true,
    });
    expect(back.results[0].me.archivedAt).toBeNull();
  });

  it('mutes for a time, always, or not at all', async () => {
    const m = await open(me);
    const before = Date.now();
    const eight = await ask(m.socket, 'chat.state', {
      chatIds: [chatIds[3]],
      mute: '8h',
    });
    const until = new Date(eight.results[0].me.mutedUntil).getTime() - before;
    expect(until).toBeGreaterThan(7.9 * 3600_000);
    expect(until).toBeLessThan(8.1 * 3600_000);
    const always = await ask(m.socket, 'chat.state', {
      chatIds: [chatIds[3]],
      mute: 'always',
    });
    expect(new Date(always.results[0].me.mutedUntil).getUTCFullYear()).toBe(
      9999,
    );
    const off = await ask(m.socket, 'chat.state', {
      chatIds: [chatIds[3]],
      mute: null,
    });
    expect(off.results[0].me.mutedUntil).toBeNull();
    expect(
      (await ask(m.socket, 'chat.state', { chatIds: [chatIds[3]], mute: '2d' }))
        .ok,
    ).toBe(false);
  });

  it('marks unread and read, and tells every device', async () => {
    const phone = await open(me);
    const laptop = await open(me);
    const peer = await open(others[6]);
    await ask(peer.socket, 'message.send', {
      chatId: chatIds[6],
      text: 'one',
      clientMessageId: randomUUID(),
    });
    await pause(200);

    const read = await ask(phone.socket, 'chat.state', {
      chatIds: [chatIds[6]],
      unread: false,
    });
    expect(read.results[0].unreadCount).toBe(0);
    const unread = await ask(phone.socket, 'chat.state', {
      chatIds: [chatIds[6]],
      unread: true,
    });
    expect(unread.results[0].me.markedUnread).toBe(true);
    await pause(200);
    const seen = laptop
      .updates()
      .filter(
        (u: any) => u.type === 'chat.state' && u.data.chatId === chatIds[6],
      );
    expect(seen.at(-1).data.me.markedUnread).toBe(true);

    // Opening and reading clears the mark.
    const cleared = await ask(laptop.socket, 'chat.read', {
      chatId: chatIds[6],
      upTo: 1e9,
    });
    expect(cleared.ok).toBe(true);
    const list = await ask(laptop.socket, 'chat.get', { chatId: chatIds[6] });
    expect(list.chat.me.markedUnread).toBe(false);
  });

  it('refuses bad requests and chats that are not yours', async () => {
    const m = await open(me);
    expect(
      (await ask(m.socket, 'chat.state', { chatIds: [], pin: true })).ok,
    ).toBe(false);
    expect(
      (
        await ask(m.socket, 'chat.state', {
          chatIds: [chatIds[0]],
          pin: true,
          archive: true,
        })
      ).ok,
    ).toBe(false);
    expect(
      (await ask(m.socket, 'chat.state', { chatIds: [chatIds[0]], pin: 'yes' }))
        .ok,
    ).toBe(false);
    const stranger = await open(await register(t.base, 'quinn.state'));
    const theirs = await ask(stranger.socket, 'chat.state', {
      chatIds: [chatIds[0]],
      archive: true,
    });
    expect(theirs.error).toBe("You're not a member of that chat.");
  });
});

import { ask, connect, register, startApp, TestApp } from './helpers';

/** System messages (product-spec.md §3.10): recorded events, worded by each client. */
describe('system messages', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('opens a new group with "created the group", which nobody counts as unread', async () => {
    const ana = await register(t.base, 'ana.system');
    const ben = await register(t.base, 'ben.system');
    const cy = await register(t.base, 'cy.system');
    const a = await connect(t.base, ana);
    const b = await connect(t.base, ben);
    const group = await ask(a.socket, 'group.create', {
      title: 'System crew',
      memberIds: [ben.id, cy.id],
    });
    expect(group.chat.lastMessage).toMatchObject({
      kind: 'system',
      sender: null,
      text: null,
      system: { type: 'group.created', actorId: ana.id, title: 'System crew' },
    });
    const theirs = await ask(b.socket, 'chat.get', { chatId: group.chat.id });
    expect(theirs.chat.unreadCount).toBe(0);
    const history = await ask(b.socket, 'chat.open', {
      chatId: group.chat.id,
    });
    expect(history.messages.map((m: any) => m.kind)).toEqual(['system']);

    // It can't be deleted for everyone, even by the owner.
    const refused = await ask(a.socket, 'message.delete', {
      messageIds: [history.messages[0].id],
      scope: 'all',
    });
    expect(refused.ok).toBe(false);
    a.socket.disconnect();
    b.socket.disconnect();
  });
});

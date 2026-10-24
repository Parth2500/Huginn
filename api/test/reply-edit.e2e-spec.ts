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

/** Reply with a quote, and edit within 15 minutes (product-spec.md §3.2–3.3). */
describe('replying and editing', () => {
  let t: TestApp;
  let ana: Account;
  let ben: Account;
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

  beforeAll(async () => {
    t = await startApp();
    ana = await register(t.base, 'ana.reply');
    ben = await register(t.base, 'ben.reply');
  });
  afterAll(async () => {
    sockets.forEach((s) => s.socket.disconnect());
    await t.close();
  });

  it('quotes the message it replies to, in the send and in history', async () => {
    const a = await open(ana);
    const b = await open(ben);
    const question = await say(a, { toUserId: ben.id }, 'Is staging back?');
    const answer = await say(
      b,
      { chatId: question.chatId, replyToMessageId: question.message.id },
      'Yes, since 9',
    );
    expect(answer.message.replyTo).toEqual({
      id: question.message.id,
      senderId: ana.id,
      excerpt: 'Is staging back?',
    });
    const history = await ask(a.socket, 'chat.open', {
      chatId: question.chatId,
    });
    expect(history.messages[0].replyTo.excerpt).toBe('Is staging back?');

    // Not a message in this chat: refused.
    const other = await say(
      a,
      { toUserId: (await register(t.base, 'cy.reply')).id },
      'elsewhere',
    );
    const wrong = await say(
      b,
      { chatId: question.chatId, replyToMessageId: other.message.id },
      'huh',
    );
    expect(wrong.ok).toBe(false);
  });

  it('edits your own message within 15 minutes, for everyone', async () => {
    const a = await open(ana);
    const b = await open(ben);
    const sent = await say(a, { toUserId: ben.id }, 'tpyo');
    const edited = await ask(a.socket, 'message.edit', {
      messageId: sent.message.id,
      text: 'typo',
    });
    expect(edited.message).toMatchObject({ text: 'typo' });
    expect(edited.message.editedAt).not.toBeNull();
    await pause(200);
    const seen = b.updates().filter((u: any) => u.type === 'message.edited');
    expect(seen.at(-1).data.message.text).toBe('typo');

    expect(
      (
        await ask(b.socket, 'message.edit', {
          messageId: sent.message.id,
          text: 'mine now',
        })
      ).error,
    ).toMatch(/your own/);

    await t.app
      .get(DataSource)
      .query(
        `UPDATE message SET "createdAt" = now() - interval '16 minutes' WHERE id = $1`,
        [sent.message.id],
      );
    expect(
      (
        await ask(a.socket, 'message.edit', {
          messageId: sent.message.id,
          text: 'late',
        })
      ).error,
    ).toMatch(/15 minutes/);
  });
});

import { Chat } from 'src/app/models/chat.interface';
import { IUser } from 'src/app/models/user.interface';
import {
  byActivity,
  byListOrder,
  chatPartner,
  chatTitle,
  draftTarget,
  isHidden,
  isMuted,
  mutedForever,
  personName,
  withUpdatedUser,
} from './chat-display';

const me: IUser = { Id: 1, username: 'maya' };
const sam: IUser = { Id: 2, username: 'sam', displayName: 'Sam Rivera' };

function makeChat(overrides: Partial<Chat>): Chat {
  return {
    id: 9,
    kind: 'direct',
    title: null,
    description: null,
    avatarUrl: null,
    createdAt: '2026-10-20T10:00:00Z',
    lastActivityAt: '2026-10-20T10:00:00Z',
    members: [
      { ...me, role: 'member' },
      { ...sam, role: 'member' },
    ],
    lastMessage: null,
    unreadCount: 0,
    me: {
      role: 'member',
      status: 'active',
      pinnedAt: null,
      pinOrder: null,
      archivedAt: null,
      mutedUntil: null,
      markedUnread: false,
      lastReadMessageId: 0,
      clearedBeforeMessageId: 0,
      hiddenAt: null,
    },
    policies: { editInfo: 'admins', addMember: 'admins', send: 'all' },
    ...overrides,
  };
}

describe('chat display helpers', () => {
  const direct = makeChat({});
  const group = makeChat({ id: 10, kind: 'group', title: 'Launch crew' });

  it('titles a direct chat with the other person, and a group with its name', () => {
    expect(chatPartner(direct, me)?.Id).toBe(2);
    expect(chatTitle(direct, me)).toBe('Sam Rivera');
    expect(chatPartner(group, me)).toBeUndefined();
    expect(chatTitle(group, me)).toBe('Launch crew');
  });

  it('titles a draft with the person it will be with', () => {
    const draft = { kind: 'direct' as const, title: null, description: null, members: [me, sam] };
    expect(chatTitle(draft, me)).toBe('Sam Rivera');
  });

  it('titles Notes to self, and sends its first note to you', () => {
    const notes = makeChat({ kind: 'self', members: [{ ...me, role: 'owner' }] });
    expect(chatTitle(notes, me)).toBe('Notes to self');
    expect(chatPartner(notes, me)).toBeUndefined();
    expect(draftTarget(notes, me)).toBe(1);
    expect(draftTarget(direct, me)).toBe(2);
  });

  it('falls back from display name to username', () => {
    expect(personName({ username: 'tess' })).toBe('tess');
    expect(personName(undefined)).toBe('Someone');
  });

  it('applies a profile update to members and the last message', () => {
    const withLast = makeChat({
      lastMessage: {
        id: 1,
        chatId: 9,
        clientMessageId: null,
        sender: sam,
        kind: 'text',
        text: 'hi',
        replyTo: null,
        createdAt: '2026-10-20T10:00:00Z',
        editedAt: null,
        deleted: false,
      },
    });
    const updated = withUpdatedUser(withLast, { Id: 2, displayName: 'Sam R.' });
    expect(updated.members[1].displayName).toBe('Sam R.');
    expect(updated.lastMessage?.sender?.displayName).toBe('Sam R.');
    expect(withLast.members[1].displayName).toBe('Sam Rivera');
  });

  it('orders by newest activity, then by id', () => {
    const older = makeChat({ id: 1, lastActivityAt: '2026-10-20T09:00:00Z' });
    const newer = makeChat({ id: 2, lastActivityAt: '2026-10-20T11:00:00Z' });
    const tie = makeChat({ id: 3, lastActivityAt: '2026-10-20T11:00:00Z' });
    expect([older, newer, tie].sort(byActivity).map((c) => c.id)).toEqual([3, 2, 1]);
  });
});

describe('chat list order and mute', () => {
  const at = (id: number, lastActivityAt: string, pinOrder: number | null = null) =>
    makeChat({
      id,
      lastActivityAt,
      me: { ...makeChat({}).me, pinnedAt: pinOrder ? '2026-10-20T00:00:00Z' : null, pinOrder },
    });

  it('puts pinned chats first in pin order, then the rest by activity', () => {
    const chats = [
      at(1, '2026-10-21T10:00:00Z'),
      at(2, '2026-10-01T10:00:00Z', 2),
      at(3, '2026-10-21T12:00:00Z'),
      at(4, '2026-09-01T10:00:00Z', 1),
    ];
    expect(chats.sort(byListOrder).map((c) => c.id)).toEqual([4, 2, 3, 1]);
  });

  it('knows when a mute has run out, and when it is for always', () => {
    const now = Date.parse('2026-10-21T12:00:00Z');
    const mutedUntil = (value: string | null) => makeChat({ me: { ...makeChat({}).me, mutedUntil: value } });
    expect(isMuted(mutedUntil('2026-10-21T13:00:00Z'), now)).toBe(true);
    expect(isMuted(mutedUntil('2026-10-21T11:00:00Z'), now)).toBe(false);
    expect(isMuted(mutedUntil(null), now)).toBe(false);
    expect(mutedForever(mutedUntil('9999-12-31T00:00:00Z'))).toBe(true);
    expect(mutedForever(mutedUntil('2026-10-21T13:00:00Z'))).toBe(false);
  });

  it('hides a deleted chat until something newer arrives', () => {
    const deleted = (lastActivityAt: string) =>
      makeChat({ lastActivityAt, me: { ...makeChat({}).me, hiddenAt: '2026-10-21T12:00:00Z' } });
    expect(isHidden(deleted('2026-10-21T11:00:00Z'))).toBe(true);
    expect(isHidden(deleted('2026-10-21T12:00:00Z'))).toBe(true);
    expect(isHidden(deleted('2026-10-21T12:00:01Z'))).toBe(false);
    expect(isHidden(makeChat({}))).toBe(false);
  });
});

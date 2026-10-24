import { TestBed } from '@angular/core/testing';
import { Chat, ChatMessage, MyChatState } from 'src/app/models/chat.interface';
import { ChatsStore } from './chats.store';
import { LocalDb } from './local-db';

const me: MyChatState = {
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
};

const message = (id: number, createdAt: string): ChatMessage => ({
  id,
  chatId: 9,
  clientMessageId: null,
  sender: { Id: 2, username: 'sam' },
  kind: 'text',
  text: `message ${id}`,
  replyTo: null,
  createdAt,
  editedAt: null,
  deleted: false,
});

const chat: Chat = {
  id: 9,
  kind: 'direct',
  title: null,
  description: null,
  avatarUrl: null,
  createdAt: '2026-10-20T10:00:00Z',
  lastActivityAt: '2026-10-20T10:00:00Z',
  members: [],
  lastMessage: message(5, '2026-10-20T10:00:00Z'),
  unreadCount: 2,
  me,
  policies: { editInfo: 'admins', addMember: 'admins', send: 'all' },
};

describe('ChatsStore: clear and delete', () => {
  let store: ChatsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: LocalDb,
          useValue: { putChats: async () => undefined, replaceChats: async () => undefined },
        },
      ],
    });
    store = TestBed.inject(ChatsStore);
    store.replace([chat], null);
  });

  it('drops the preview once the clear point passes it', () => {
    store.applyState(9, { ...me, clearedBeforeMessageId: 5, lastReadMessageId: 5 }, 0);
    expect(store.get(9)?.lastMessage).toBeNull();
    expect(store.mainChats().map((c) => c.id)).toEqual([9]);
  });

  it('keeps a deleted chat out of the lists until a newer message arrives', () => {
    store.applyState(9, { ...me, clearedBeforeMessageId: 5, hiddenAt: '2026-10-21T00:00:00Z' }, 0);
    expect(store.chats()).toEqual([]);
    expect(store.get(9)).toBeDefined();

    store.applyMessage(message(6, '2026-10-21T09:00:00Z'), true);
    expect(store.mainChats().map((c) => c.id)).toEqual([9]);
    expect(store.get(9)?.unreadCount).toBe(1);
  });
});

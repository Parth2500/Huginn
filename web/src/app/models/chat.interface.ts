import { IUser } from './user.interface';

/**
 * Realtime protocol v1, as the API sends it (api/src/chat/chat.types.ts). Dates arrive as ISO
 * strings over the socket and stay strings here.
 */
export const PROTOCOL_VERSION = 1;

export type ChatKind = 'self' | 'direct' | 'group';
export type MemberRole = 'owner' | 'admin' | 'member';
export type GroupPolicy = 'all' | 'admins';

export interface ChatMessage {
  id: number;
  chatId: number;
  clientMessageId: string | null;
  sender: IUser | null;
  kind: 'text' | 'system';
  /** Null once deleted for everyone. */
  text: string | null;
  replyTo: { id: number; senderId: number | null; excerpt: string | null } | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
}

export interface ChatMember extends IUser {
  role: MemberRole;
}

/** Your own state in a chat; nobody else sees it. */
export interface MyChatState {
  role: MemberRole;
  status: 'active' | 'request' | 'left' | 'removed';
  pinnedAt: string | null;
  pinOrder: number | null;
  archivedAt: string | null;
  mutedUntil: string | null;
  markedUnread: boolean;
  lastReadMessageId: number;
  clearedBeforeMessageId: number;
  /** Deleted from your list at this time; a newer message brings the chat back. */
  hiddenAt: string | null;
}

/** How long a mute lasts; `null` unmutes. */
export type MuteFor = '8h' | '1w' | 'always' | null;

/** One change to your own state in chats (`chat.state`); exactly one field. */
export type ChatStateChange =
  | { pin: boolean }
  | { archive: boolean }
  | { mute: MuteFor }
  | { unread: boolean }
  | { clear: true }
  | { delete: true };

export interface ChatStateResult {
  chatId: number;
  me: MyChatState;
  unreadCount: number;
}

export interface Chat {
  id: number;
  kind: ChatKind;
  title: string | null;
  description: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastActivityAt: string;
  members: ChatMember[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
  me: MyChatState;
  policies: { editInfo: GroupPolicy; addMember: GroupPolicy; send: GroupPolicy };
}

/** A direct chat (or your Notes to self) that doesn't exist yet: the first message creates it. */
export interface DraftChat {
  id?: undefined;
  kind: 'direct' | 'self';
  title: null;
  description: null;
  members: IUser[];
}

/** What the chat pane can show: a saved chat or a draft. */
export type OpenChat = Chat | DraftChat;

export type Update =
  | { seq: number; type: 'chat.new'; data: { chat: Chat } }
  | { seq: number; type: 'message.new'; data: { message: ChatMessage } }
  | { seq: number; type: 'chat.state'; data: { chatId: number; me: MyChatState; unreadCount: number } };

export type Ack<T> = ({ ok: true } & T) | { ok: false; error: string };

export interface TypingEvent {
  chatId: number;
  user: { Id: number; username: string; displayName?: string | null };
}

export interface ChatCursor {
  lastActivityAt: string;
  id: number;
}

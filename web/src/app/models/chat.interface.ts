import { IUser } from './user.interface';

/**
 * Realtime protocol v1, as the API sends it (api/src/chat/chat.types.ts). Dates arrive as ISO
 * strings over the socket and stay strings here.
 */
export const PROTOCOL_VERSION = 1;

export type ChatKind = 'self' | 'direct' | 'group';
export type MemberRole = 'owner' | 'admin' | 'member';
export type GroupPolicy = 'all' | 'admins';

/** What a system message records; each client words it for its reader (product-spec.md §3.10). */
export type SystemEvent = { type: 'group.created'; actorId: number; title: string };

export interface ChatMessage {
  id: number;
  chatId: number;
  clientMessageId: string | null;
  sender: IUser | null;
  kind: 'text' | 'system';
  /** Null once deleted for everyone, and for system messages. */
  text: string | null;
  /** Set on system messages only. */
  system: SystemEvent | null;
  replyTo: { id: number; senderId: number | null; excerpt: string | null } | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  /** Who deleted it for everyone: the sender, or a group admin. */
  deletedById: number | null;
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
  lastDeliveredMessageId: number;
  lastReadMessageId: number;
  clearedBeforeMessageId: number;
  /** Deleted from your list at this time; a newer message brings the chat back. */
  hiddenAt: string | null;
}

/**
 * Your messages up to `deliveredUpTo` reached every other member (✓✓); up to `readUpTo`, every
 * other member read them. In a direct chat, read stays 0 unless both of you share receipts.
 */
export interface Receipts {
  deliveredUpTo: number;
  readUpTo: number;
}

/** One member's line in message info (dates are ISO strings). */
export interface MessageInfoEntry {
  user: IUser;
  delivered: boolean;
  deliveredAt: string | null;
  /** False when they read it but don't share read receipts. */
  read: boolean;
  readAt: string | null;
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
  /** How far every other member has received and read: the ticks on your messages. */
  receipts: Receipts;
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
  | { seq: number; type: 'chat.state'; data: { chatId: number; me: MyChatState; unreadCount: number } }
  | { seq: number; type: 'receipt'; data: { chatId: number } & Receipts }
  | { seq: number; type: 'message.edited'; data: { message: ChatMessage } }
  | { seq: number; type: 'message.deleted'; data: { message: ChatMessage } }
  | { seq: number; type: 'message.hidden'; data: { chatId: number; messageIds: number[] } };

export type Ack<T> = ({ ok: true } & T) | { ok: false; error: string };

export interface TypingEvent {
  chatId: number;
  user: { Id: number; username: string; displayName?: string | null };
}

export interface ChatCursor {
  lastActivityAt: string;
  id: number;
}

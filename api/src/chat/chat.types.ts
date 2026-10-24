import { IPublicUser } from 'src/user/entities/user.interface';
import { ChatKind, GroupPolicy } from './entities/chat.entity';
import { MemberRole, MemberStatus } from './entities/chat-member.entity';
import { MessageKind } from './entities/message.entity';

/** What clients receive. Mirrored in web/src/app/models. Version 1 of the realtime protocol. */
export const PROTOCOL_VERSION = 1;

/**
 * What a system message records (product-spec.md §3.10). Clients word it, so "You" and names
 * fit the reader. More events arrive with full groups (1.7).
 */
export type SystemEvent = {
  type: 'group.created';
  actorId: number;
  title: string;
};

export interface MessageDto {
  id: number;
  chatId: number;
  clientMessageId: string | null;
  sender: IPublicUser | null;
  kind: MessageKind;
  /** Null once deleted for everyone, and for system messages. */
  text: string | null;
  /** Set on system messages only. */
  system: SystemEvent | null;
  replyTo: {
    id: number;
    senderId: number | null;
    excerpt: string | null;
  } | null;
  createdAt: Date;
  editedAt: Date | null;
  deleted: boolean;
  /** Who deleted it for everyone: the sender, or a group admin. */
  deletedById: number | null;
}

export interface MemberDto extends IPublicUser {
  role: MemberRole;
}

/** Your own state in a chat. Nobody else sees it. */
export interface MyChatState {
  role: MemberRole;
  status: MemberStatus;
  pinnedAt: Date | null;
  pinOrder: number | null;
  archivedAt: Date | null;
  mutedUntil: Date | null;
  markedUnread: boolean;
  lastDeliveredMessageId: number;
  lastReadMessageId: number;
  clearedBeforeMessageId: number;
  /** Deleted from your list at this time; a newer message brings the chat back. */
  hiddenAt: Date | null;
}

export interface ChatSummary {
  id: number;
  kind: ChatKind;
  title: string | null;
  description: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  members: MemberDto[];
  lastMessage: MessageDto | null;
  unreadCount: number;
  me: MyChatState;
  /** How far every other member has received and read: your ticks (architecture.md §6). */
  receipts: Receipts;
  policies: {
    editInfo: GroupPolicy;
    addMember: GroupPolicy;
    send: GroupPolicy;
  };
}

/**
 * Your messages up to `deliveredUpTo` reached every other member (✓✓), and up to `readUpTo`
 * every other member read them (✓✓ in the read colour). In a direct chat, read stays 0 unless
 * both of you have read receipts on.
 */
export interface Receipts {
  deliveredUpTo: number;
  readUpTo: number;
}

/** How long a mute lasts; `null` unmutes. */
export type MuteFor = '8h' | '1w' | 'always' | null;

/**
 * One change to your own state in one or more chats (`chat.state`). Exactly one field is set.
 * `unread: false` marks the chats read up to their last message. `clear` hides every message so
 * far, for you only; `delete` also takes a direct chat out of your list until a new message.
 */
export type ChatStateChange =
  | { pin: boolean }
  | { archive: boolean }
  | { mute: MuteFor }
  | { unread: boolean }
  | { clear: true }
  | { delete: true };

/** The list's folders. The main list leaves archived chats out. */
export type ChatFolder = 'main' | 'archived';

/** Durable changes, delivered live and replayed by `sync`. */
export type UpdatePayload =
  | { type: 'chat.new'; data: { chat: ChatSummary } }
  | { type: 'message.new'; data: { message: MessageDto } }
  | {
      type: 'chat.state';
      data: { chatId: number; me: MyChatState; unreadCount: number };
    }
  /** Someone's watermark moved, and with it the ticks on your messages. */
  | { type: 'receipt'; data: { chatId: number } & Receipts }
  /** Edited: the message comes again with its new text and `editedAt`. */
  | { type: 'message.edited'; data: { message: MessageDto } }
  /** Deleted for everyone: the message comes again as a tombstone (no text). */
  | { type: 'message.deleted'; data: { message: MessageDto } }
  /** Deleted for me: only your own devices hear it. */
  | { type: 'message.hidden'; data: { chatId: number; messageIds: number[] } };

export type UpdateDto = UpdatePayload & { seq: number };

export type Ack<T> = ({ ok: true } & T) | { ok: false; error: string };

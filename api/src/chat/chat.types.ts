import { IPublicUser } from 'src/user/entities/user.interface';
import { ChatKind, GroupPolicy } from './entities/chat.entity';
import { MemberRole, MemberStatus } from './entities/chat-member.entity';
import { MessageKind } from './entities/message.entity';

/** What clients receive. Mirrored in web/src/app/models. Version 1 of the realtime protocol. */
export const PROTOCOL_VERSION = 1;

export interface MessageDto {
  id: number;
  chatId: number;
  clientMessageId: string | null;
  sender: IPublicUser | null;
  kind: MessageKind;
  /** Null once deleted for everyone. */
  text: string | null;
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
  policies: {
    editInfo: GroupPolicy;
    addMember: GroupPolicy;
    send: GroupPolicy;
  };
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
  /** Deleted for everyone: the message comes again as a tombstone (no text). */
  | { type: 'message.deleted'; data: { message: MessageDto } }
  /** Deleted for me: only your own devices hear it. */
  | { type: 'message.hidden'; data: { chatId: number; messageIds: number[] } };

export type UpdateDto = UpdatePayload & { seq: number };

export type Ack<T> = ({ ok: true } & T) | { ok: false; error: string };

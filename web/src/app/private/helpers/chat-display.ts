import { Chat, ChatMessage, OpenChat } from 'src/app/models/chat.interface';
import { IUser } from 'src/app/models/user.interface';

/** The other person in a direct chat, or undefined for a group. */
export function chatPartner(chat: OpenChat | undefined | null, me: IUser): IUser | undefined {
  if (!chat || chat.kind !== 'direct') {
    return undefined;
  }
  return chat.members.find((u) => u.Id !== me.Id);
}

/** A person's shown name: their display name, or their username. */
export function personName(user: IUser | undefined | null): string {
  return user?.displayName || user?.username || 'Someone';
}

/** A direct chat is titled with the other person's name; a group with its own name. */
export function chatTitle(chat: OpenChat | undefined | null, me: IUser): string {
  const partner = chatPartner(chat, me);
  return partner ? personName(partner) : chat?.title ?? 'Chat';
}

/** Returns the chat with any copy of `user` replaced by the updated profile. */
export function withUpdatedUser(chat: Chat, user: IUser): Chat {
  const members = chat.members.map((u) => (u.Id === user.Id ? { ...u, ...user } : u));
  const last = chat.lastMessage;
  const lastMessage = last ? withUpdatedSender(last, user) : last;
  return { ...chat, members, lastMessage };
}

export function withUpdatedSender(message: ChatMessage, user: IUser): ChatMessage {
  return message.sender?.Id === user.Id
    ? { ...message, sender: { ...message.sender, ...user } }
    : message;
}

/** Newest activity first; ties broken by id so the order is stable. */
export function byActivity(a: Chat, b: Chat): number {
  const diff = Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt);
  return diff !== 0 ? diff : b.id - a.id;
}

/** Muted right now (mutes end on their own when their time runs out). */
export function isMuted(chat: Chat, now = Date.now()): boolean {
  return !!chat.me.mutedUntil && new Date(chat.me.mutedUntil).getTime() > now;
}

/** Deleted from your list, and nothing has arrived since (the server's rule for the list). */
export function isHidden(chat: Chat): boolean {
  return !!chat.me.hiddenAt && Date.parse(chat.lastActivityAt) <= Date.parse(chat.me.hiddenAt);
}

/** "Always" is stored as the year 9999. */
export function mutedForever(chat: Chat): boolean {
  return !!chat.me.mutedUntil && new Date(chat.me.mutedUntil).getUTCFullYear() >= 9999;
}

/** The main list's order: pinned chats first, in the order they were pinned, then by activity. */
export function byListOrder(a: Chat, b: Chat): number {
  const pa = a.me.pinnedAt ? (a.me.pinOrder ?? 0) : null;
  const pb = b.me.pinnedAt ? (b.me.pinOrder ?? 0) : null;
  if (pa !== null || pb !== null) {
    if (pa === null) {
      return 1;
    }
    if (pb === null) {
      return -1;
    }
    return pa - pb;
  }
  return byActivity(a, b);
}

import { IRoom } from 'src/app/models/room.interface';
import { IUser } from 'src/app/models/user.interface';

/** The other person in a direct chat, or undefined for a group. */
export function roomPartner(room: IRoom | undefined, me: IUser): IUser | undefined {
  if (!room) {
    return undefined;
  }
  const others = (room.users ?? []).filter((u) => u.Id !== me.Id);
  if (room.type === 'direct' || (!room.name && others.length === 1)) {
    return others[0];
  }
  return undefined;
}

/** A person's shown name: their display name, or their username. */
export function personName(user: IUser | undefined | null): string {
  return user?.displayName || user?.username || 'Someone';
}

/** A direct chat is titled with the other person's name; a group with its own name. */
export function roomTitle(room: IRoom | undefined, me: IUser): string {
  const partner = roomPartner(room, me);
  return partner ? personName(partner) : room?.name ?? 'Chat';
}

/** Returns the room with any copy of `user` replaced by the updated profile. */
export function withUpdatedUser<T extends IRoom>(room: T, user: IUser): T {
  const users = room.users?.map((u) => (u.Id === user.Id ? { ...u, ...user } : u));
  const last = room.lastMessage;
  const lastMessage =
    last && last.user?.Id === user.Id ? { ...last, user: { ...last.user, ...user } } : last;
  return { ...room, users, lastMessage };
}

export function isDirect(room: IRoom | undefined): boolean {
  return room?.type === 'direct';
}

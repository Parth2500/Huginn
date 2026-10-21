export interface IUser {
  Id?: number;
  username?: string;
  usernameKey?: string;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  created_at?: Date;
  /** Private: only in the owner's own profile. */
  email?: string | null;
  password?: string | null;
}

/** What anyone may see about a user. */
export interface IPublicUser {
  Id: number;
  username: string;
  displayName: string | null;
  bio?: string | null;
  avatarUrl: string | null;
  created_at?: Date;
  online?: boolean;
}

export function toPublicUser(user: IUser, withBio = false): IPublicUser {
  return {
    Id: user.Id,
    username: user.username,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    ...(withBio ? { bio: user.bio ?? null, created_at: user.created_at } : {}),
  };
}

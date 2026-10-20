export interface IUser {
  Id?: number;
  username?: string;
  /** Optional friendly name; falls back to the username wherever a name is shown. */
  displayName?: string | null;
  bio?: string | null;
  /** Public path of the profile photo, e.g. /api/uploads/avatars/3-1a2b.webp */
  avatarUrl?: string | null;
  created_at?: Date | string;
  /** Present when the server knows it (profile, opening a chat). */
  online?: boolean;
  /** Only ever present for the signed-in user; other people's emails are private. */
  email?: string;
  password?: string;
}

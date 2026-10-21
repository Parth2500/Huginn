import { IUser } from 'src/user/entities/user.interface';
import { Session } from './session.entity';

export interface SignInRequest {
  email?: string;
  password?: string;
}

export interface SignedIn {
  user: IUser;
  /** Kept on the session for the provider, e.g. an OIDC refresh token. */
  providerData?: unknown;
}

export type SignInStep =
  ({ kind: 'signed-in' } & SignedIn) | { kind: 'redirect'; url: string };

/**
 * The seam between Huginn and whoever proves identity (docs/huginn/architecture.md §2.3).
 * Sessions, cookies, sockets and the rest of the app never depend on which provider is in use.
 *
 * - `LocalPasswordProvider` (today): checks an email and password and finishes at once.
 * - `HeimdallOidcProvider` (later): `signIn` returns Heimdall's authorize URL, `completeSignIn`
 *   handles the callback, and `signOut` revokes the refresh token.
 */
export interface AuthProvider {
  readonly name: string;
  signIn(request: SignInRequest): Promise<SignInStep>;
  completeSignIn?(callback: URLSearchParams): Promise<SignedIn>;
  signOut?(session: Session): Promise<void>;
}

export const AUTH_PROVIDER = Symbol('AuthProvider');

/** A sign-in that failed for a reason the person can act on; the message is shown as is. */
export class SignInError extends Error {}

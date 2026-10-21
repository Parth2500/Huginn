import { IUser } from 'src/user/entities/user.interface';
import { Session } from './session.entity';

export interface SignInRequest {
  email?: string;
  password?: string;
}

/** Who an identity provider says someone is. Huginn decides which account that means. */
export interface ExternalIdentity {
  issuer: string;
  subject: string;
  /** As the provider reported it. Heimdall doesn't verify emails yet, so it proves nothing. */
  email: string | null;
}

export type SignInStep =
  | { kind: 'signed-in'; user: IUser }
  | {
      kind: 'redirect';
      url: string;
      /** Kept in a short-lived cookie and handed back to completeSignIn. */
      transaction: string;
    };

/**
 * The seam between Huginn and whoever proves identity (docs/huginn/architecture.md §2).
 * Sessions, cookies, sockets and the rest of the app never depend on which provider signed
 * someone in.
 *
 * - `LocalPasswordProvider`: checks an email and password and finishes at once.
 * - `HeimdallOidcProvider`: `signIn` returns Heimdall's authorize URL, and `completeSignIn`
 *   checks the callback and returns the identity.
 */
export interface AuthProvider {
  readonly name: string;
  signIn(request: SignInRequest): Promise<SignInStep>;
  completeSignIn?(
    callback: URL,
    transaction: string,
  ): Promise<ExternalIdentity>;
  signOut?(session: Session): Promise<void>;
}

/** A sign-in that failed for a reason the person can act on; the message is shown as is. */
export class SignInError extends Error {}

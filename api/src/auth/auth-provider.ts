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
  /**
   * What the session keeps for a sign-out at the provider: the ID token (sent back as
   * `id_token_hint`) and the provider's session ID, `sid`, which a back-channel logout names.
   */
  session?: ProviderSession;
}

export interface ProviderSession {
  idToken: string;
  sid: string | null;
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
  /**
   * Where the browser goes to end the provider's own session (RP-initiated logout), or null when
   * the provider has none.
   */
  signOutUrl?(session: Session): Promise<string | null>;
}

/** A sign-in that failed for a reason the person can act on; the message is shown as is. */
export class SignInError extends Error {}

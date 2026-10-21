import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { lookup } from 'dns';
import { checkServerIdentity } from 'tls';
import * as oidc from 'openid-client';
import { Agent, fetch as undiciFetch } from 'undici';
import {
  AuthProvider,
  ExternalIdentity,
  SignInError,
  SignInStep,
} from './auth-provider';

interface Transaction {
  verifier: string;
  state: string;
  nonce: string;
}

/** Heimdall's settings, or null when Heimdall sign-in isn't configured. */
export function heimdallSettings() {
  const issuer = process.env.HEIMDALL_ISSUER;
  const clientId = process.env.HEIMDALL_CLIENT_ID;
  const clientSecret = process.env.HEIMDALL_CLIENT_SECRET;
  const redirectUri = process.env.HEIMDALL_REDIRECT_URI;
  if (!issuer || !clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return { issuer, clientId, clientSecret, redirectUri };
}

/**
 * Signs in through Heimdall as a confidential client (docs/huginn/architecture.md §2.2):
 * authorization code with PKCE (S256), `state`, `nonce`, the `iss` response parameter
 * (RFC 9207), and an ID token checked against the tenant's JWKS. openid-client does every check.
 *
 * Huginn needs Heimdall only to learn who someone is, so it asks for no refresh token and keeps
 * no Heimdall token after sign-in. Its own session takes over from there.
 */
@Injectable()
export class HeimdallOidcProvider implements AuthProvider {
  readonly name = 'heimdall';
  private readonly logger = new Logger(HeimdallOidcProvider.name);
  private config: Promise<oidc.Configuration> | null = null;

  get enabled() {
    return heimdallSettings() !== null;
  }

  async signIn(): Promise<SignInStep> {
    const settings = this.settings();
    const config = await this.configuration();
    const transaction: Transaction = {
      verifier: oidc.randomPKCECodeVerifier(),
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
    };
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: settings.redirectUri,
      scope: 'openid email',
      code_challenge: await oidc.calculatePKCECodeChallenge(
        transaction.verifier,
      ),
      code_challenge_method: 'S256',
      state: transaction.state,
      nonce: transaction.nonce,
    });
    return {
      kind: 'redirect',
      url: url.href,
      transaction: Buffer.from(JSON.stringify(transaction)).toString(
        'base64url',
      ),
    };
  }

  async completeSignIn(
    callback: URL,
    transaction: string,
  ): Promise<ExternalIdentity> {
    const pending = parseTransaction(transaction);
    if (!pending) {
      throw new SignInError(
        'That sign-in took too long or was started elsewhere. Try again.',
      );
    }
    const config = await this.configuration();
    let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
    try {
      tokens = await oidc.authorizationCodeGrant(config, callback, {
        pkceCodeVerifier: pending.verifier,
        expectedState: pending.state,
        expectedNonce: pending.nonce,
        idTokenExpected: true,
      });
    } catch (error) {
      this.logger.warn(`Heimdall callback refused: ${describe(error)}`);
      throw new SignInError(
        "Heimdall couldn't confirm the sign-in. Try again.",
      );
    }
    const claims = tokens.claims();
    if (!claims) {
      throw new SignInError(
        "Heimdall couldn't confirm the sign-in. Try again.",
      );
    }
    // Only the openid and email scopes were asked for, so this token reads nothing else.
    const info = await oidc.fetchUserInfo(
      config,
      tokens.access_token,
      claims.sub,
    );
    return {
      issuer: claims.iss,
      subject: claims.sub,
      email: typeof info.email === 'string' ? info.email : null,
    };
  }

  private settings() {
    const settings = heimdallSettings();
    if (!settings) {
      throw new SignInError('Sign-in with Heimdall is not set up here.');
    }
    return settings;
  }

  /** Discovery, cached once it succeeds (a failure is retried on the next sign-in). */
  private configuration(): Promise<oidc.Configuration> {
    const settings = this.settings();
    this.config ??= (async () => {
      const fetchOption = developmentFetch();
      const config = await oidc.discovery(
        new URL(settings.issuer),
        settings.clientId,
        undefined,
        oidc.ClientSecretBasic(settings.clientSecret),
        fetchOption ? { [oidc.customFetch]: fetchOption } : undefined,
      );
      if (fetchOption) {
        config[oidc.customFetch] = fetchOption;
      }
      return config;
    })().catch((error: unknown) => {
      this.config = null;
      this.logger.error(`Heimdall discovery failed: ${describe(error)}`);
      throw new SignInError(
        "Can't reach Heimdall right now. Try again, or sign in with your password.",
      );
    });
    return this.config;
  }
}

function parseTransaction(value: string): Transaction | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString(),
    ) as Partial<Transaction>;
    return typeof parsed.verifier === 'string' &&
      typeof parsed.state === 'string' &&
      typeof parsed.nonce === 'string'
      ? (parsed as Transaction)
      : null;
  } catch {
    return null;
  }
}

/**
 * Development only: Heimdall serves `https://<tenant>.localhost` with the ASP.NET development
 * certificate, which is issued for `localhost`. HEIMDALL_CA_FILE pins that certificate, and
 * HEIMDALL_TLS_NAME (default `localhost`) is the name it's checked against. Certificate checks
 * stay on. `*.localhost` resolves to the loopback address (RFC 6761).
 */
function developmentFetch(): oidc.CustomFetch | undefined {
  const caFile = process.env.HEIMDALL_CA_FILE;
  if (!caFile) {
    return undefined;
  }
  const tlsName = process.env.HEIMDALL_TLS_NAME ?? 'localhost';
  const agent = new Agent({
    connect: {
      ca: readFileSync(caFile),
      checkServerIdentity: (_host, cert) => checkServerIdentity(tlsName, cert),
      lookup: (hostname, options, callback) =>
        hostname.endsWith('.localhost')
          ? lookup('localhost', options, callback)
          : lookup(hostname, options, callback),
    },
  });
  return ((url: string, options: Parameters<oidc.CustomFetch>[1]) =>
    undiciFetch(url, {
      ...(options as object),
      dispatcher: agent,
    })) as unknown as oidc.CustomFetch;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : JSON.stringify(error);

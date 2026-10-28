import { createPrivateKey, createPublicKey, KeyObject } from 'crypto';
import { calculateJwkThumbprint, exportJWK, importPKCS8, type JWK } from 'jose';

/** The key Huginn signs its `private_key_jwt` client assertions with (RFC 7523). */
export interface ClientKey {
  key: CryptoKey;
  kid: string;
  alg: 'ES256' | 'RS256';
  /** The public half as a JWK Set: what Heimdall's operator registers. */
  publicJwks: { keys: JWK[] };
}

export class ClientKeyError extends Error {}

/**
 * Reads a PEM private key: EC P-256 (ES256) or RSA of 2048 to 4096 bits (RS256), as Heimdall
 * accepts. The `kid` is the key's JWK thumbprint (RFC 7638), so the
 * key file alone decides it, and a new key gets a new `kid`.
 */
export async function loadClientKey(pem: string): Promise<ClientKey> {
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(pem);
  } catch {
    throw new ClientKeyError(
      'The Heimdall client key is not a PEM private key.',
    );
  }
  const alg = algorithmOf(privateKey);
  const publicJwk = await exportJWK(createPublicKey(privateKey));
  const kid = await calculateJwkThumbprint(publicJwk);
  const key = await importPKCS8(
    privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    alg,
  );
  return {
    key,
    kid,
    alg,
    publicJwks: { keys: [{ ...publicJwk, kid, alg, use: 'sig' }] },
  };
}

function algorithmOf(key: KeyObject): ClientKey['alg'] {
  const details = key.asymmetricKeyDetails;
  switch (key.asymmetricKeyType) {
    case 'ec':
      if (details?.namedCurve === 'prime256v1') {
        return 'ES256';
      }
      break;
    case 'rsa': {
      const bits = details?.modulusLength ?? 0;
      if (bits >= 2048 && bits <= 4096) {
        return 'RS256';
      }
      break;
    }
  }
  throw new ClientKeyError(
    'Heimdall accepts an EC P-256 key or an RSA key of 2048 to 4096 bits.',
  );
}

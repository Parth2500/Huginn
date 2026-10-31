// Makes the key pair for Huginn's private_key_jwt client authentication at Heimdall.
//
//   pnpm run heimdall:client-key [-- <path>]   (default .local/heimdall-client-key.pem)
//
// Writes the private key (EC P-256, mode 600) and prints the public JWK Set for Heimdall's
// operator. The private key never leaves this machine. Refuses to overwrite an existing key: to
// rotate, make a new key at a new path, register both public keys, switch
// HEIMDALL_CLIENT_KEY_FILE, then register the new key alone.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { calculateJwkThumbprint, exportJWK } from 'jose';

const path = process.argv[2] ?? '.local/heimdall-client-key.pem';
if (existsSync(path)) {
  console.error(`${path} already exists. Pick a new path to rotate.`);
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
  mode: 0o600,
  flag: 'wx',
});

// The same kid that Huginn sends (src/auth/client-key.ts): the RFC 7638 thumbprint.
const jwk = await exportJWK(publicKey);
const kid = await calculateJwkThumbprint(jwk);
console.error(`Private key: ${path}. Set HEIMDALL_CLIENT_KEY_FILE=${path}`);
console.error('Public key set for Heimdall (register it on the client):');
console.log(
  JSON.stringify({ keys: [{ ...jwk, kid, alg: 'ES256', use: 'sig' }] }),
);

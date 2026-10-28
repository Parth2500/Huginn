# Huginn architecture

How Huginn works underneath the features in [product-spec.md](product-spec.md). It starts
from what exists today (Angular 16 SPA, NestJS 9 API, Socket.IO, Postgres) and says what
changes, and in which phase. Scale concerns are in [../SCALING.md](../SCALING.md).

---

## 1. System context

```
                     ┌──────────────────────┐
                     │  Heimdall (OIDC IdP) │  sign-in, sessions, account recovery
                     └──────────▲───────────┘
                                │ OIDC code flow + PKCE (back channel)
┌────────────────────┐  HTTPS   │                      ┌────────────────────┐
│ Browser            │◄────────►│  Huginn API          │◄────►│ Postgres           │ users, chats, members,
│  Angular app       │  WSS     │  (NestJS, stateless) │      │ (primary + replicas)│ ciphertext, updates log
│  Service worker    │◄────────►│  REST + Socket.IO    │◄────►│ Redis              │ pub/sub, presence, rate limits,
│  IndexedDB store   │          │                      │      └────────────────────┘ hot caches
│  MLS (WASM)        │          └───────┬──────────────┘      ┌────────────────────┐
└─────────▲──────────┘                  │ jobs (queue)        │ Object storage     │ encrypted media blobs (Phase 3)
          │ Web Push                    ▼                     │ + CDN              │
┌─────────┴──────────┐          ┌──────────────────────┐      └────────────────────┘
│ Browser push       │◄─────────│ Push worker          │  sends Web Push (VAPID) with encrypted payloads
│ services (FCM etc.)│          └──────────────────────┘
└────────────────────┘
```

- **The API is stateless.** Socket.IO servers share events through the Redis adapter (Phase 5),
  so any server can reach any user.
- **The browser holds keys and decrypted content.** The server holds ciphertext and the
  metadata needed to deliver it.

---

## 2. Identity: Heimdall integration

Heimdall is the user's own OIDC provider (repo `Parth2500/heimdall-idp`, .NET 10), still in
development. Since 2026-10-21 Huginn offers **both** sign-in methods: its own email and password,
and "Continue with Heimdall". Both sit behind the `AuthProvider` interface, so neither the
sessions nor the rest of the app depend on which one signed someone in.

### 2.1 What Heimdall provides (as of 2026-10-19)

- **OAuth 2.1 and OIDC:**
  - authorization code with **PKCE S256** (required for every client)
  - refresh tokens with **rotation and family revocation on reuse**
  - `/userinfo` and `/revoke`, plus discovery and JWKS
- **Tokens:**
  - access tokens are RS256 JWTs that live **5 minutes**, with `kid` in the header
  - refresh tokens are opaque
  - the issuer `iss` is in the authorization response (RFC 9207)
- **Tenants:** each tenant is a **host name** with its own issuer, user pool, clients and
  signing keys. Huginn will be a client in a tenant, e.g. `https://huginn.<heimdall-domain>`.
- **Clients:**
  - *public* (PKCE only) or *confidential* (`client_secret_basic`)
  - exact-match `https` redirect URIs
  - **one audience per token**, picked with `resource` (RFC 8707)
- **Sign-in UI:** Heimdall's own Angular login, consent and account pages, with an SSO session
  cookie (`__Host-`, `SameSite=Lax`).
- **Sign-out (Heimdall #40, 2026-10-26):** RP-initiated logout (`end_session_endpoint`) and
  back-channel logout with `sid`.
- **Phase 2 (done 2026-10-28):** PAR (RFC 9126), DPoP, token introspection, `prompt=consent`,
  and `private_key_jwt` client authentication. Huginn uses PAR and can use `private_key_jwt`
  (below). It needs no DPoP or introspection, because it keeps no Heimdall token.
- **Not there yet:**
  - persisted consent (their Phase 3)

### 2.2 How Huginn connects (backend-for-frontend, built 2026-10-21)

- **Client:** Huginn's API is a **confidential client** in the tenant, with the
  `authorization_code` grant only, scopes `openid email`, and the redirect URI
  `<app origin>/api/auth/heimdall/callback`. Heimdall has no client registration API yet, so its
  `seed-dev` registers the `huginn` client and prints the secret once.
- **Client authentication** at `/par`, `/token` and `/revoke`: `client_secret_basic`, or
  `private_key_jwt` (RFC 7523) when `HEIMDALL_CLIENT_KEY_FILE` is set
  (`api/src/auth/client-key.ts`). With the key, Heimdall stores only the public key, so no shared
  secret can leak from either side. Each request gets a new assertion: `aud` is the issuer,
  never an endpoint URL, with a fresh `jti`, a 60-second `exp`, and `typ`
  `client-authentication+jwt`. The `kid` is the key's RFC 7638 thumbprint.
  `npm run heimdall:client-key` makes the key and prints the public JWK Set for Heimdall.
- **The flow** (`api/src/auth/heimdall-oidc.provider.ts`, built on `openid-client`):
  1. `GET /api/auth/heimdall/start` creates the PKCE verifier (S256), `state` and `nonce`. It keeps
     them in a 10-minute httpOnly cookie. When discovery lists a
     `pushed_authorization_request_endpoint`, it pushes these parameters to Heimdall (PAR, RFC
     9126), so the browser carries only a one-time `request_uri`. It then redirects to Heimdall
     `/authorize`.
  2. Heimdall shows its own sign-in page, then redirects to `/api/auth/heimdall/callback`.
  3. The callback checks `state` and the `iss` response parameter (RFC 9207), and exchanges the
     code at `/token`, authenticated as above. It checks the ID token against the tenant's
     JWKS: signature, `iss`, `aud`, `nonce` and expiry.
  4. It reads `email` from `/userinfo`, then decides the account (below).
- **No Heimdall tokens are kept.** Huginn needs Heimdall only to learn who someone is. After the
  callback, Huginn's own session cookie carries them, as with a password. So there's no refresh
  token, no `resource` audience and no serialised refresh. The earlier plan needed a Redis lock
  for those, because Heimdall revokes the whole family when a refresh token is reused.
- **Accounts** (`identities.service.ts`, table `user_identity (issuer, subject) → user`):
  - A known `(iss, sub)` signs in.
  - An unknown one gets a 30-minute sign-up ticket (`pending_signup`, cookie, SHA-256 stored)
    and the welcome page, where the person picks a username. The account then has **no email and
    no password**. The email Heimdall reported stays on `user_identity`, shown only to its owner.
  - **Accounts are never matched by email.** Heimdall's `email_verified` is always `false`, so
    matching would give anyone with someone's address their chats. Instead, a signed-in person
    links Heimdall from their profile (`?intent=link`), which proves both identities. An
    identity already linked to another account is refused.
  - Unlinking is allowed only while the account has a password, so nobody locks themselves out.
- **Sign-out** ends Huginn's session, then sends the browser to Heimdall's `end_session_endpoint`
  with the ID token of that sign-in (`id_token_hint`). Heimdall ends its own session and comes
  back to `HEIMDALL_POST_LOGOUT_REDIRECT_URI`. A session from a sign-up kept no ID token, so
  Heimdall asks the person to confirm first. The session keeps the ID token and Heimdall's `sid`
  in `providerData`.
- **Back-channel logout:** `POST /api/auth/heimdall/backchannel-logout` (registered as Huginn's
  `backchannel_logout_uri`, on the API itself, not the dev proxy). When someone signs out of
  Heimdall from any app, Heimdall's server posts a `logout_token`. `LogoutTokenVerifier` checks the
  signature against the JWKS, `typ` `logout+jwt`, `iss`, `aud`, `iat`, `exp`, the logout event,
  no `nonce`, and a `jti` seen once. Then Huginn ends every session with that `sid` and its
  sockets. A bad token gets 400.
- **Development TLS:** Heimdall serves `https://acme.localhost:7200` with the ASP.NET
  development certificate, which is issued for `localhost`. `HEIMDALL_CA_FILE` pins that
  certificate for the API's requests, checked against the name in `HEIMDALL_TLS_NAME` (default
  `localhost`). `*.localhost` resolves to loopback. Certificate checks stay on. Browsers show a
  warning for `acme.localhost` once, as with Heimdall's own demo.

### 2.3 Sessions and the seam (milestone 0.5)

- `api/src/auth/` holds `LocalPasswordProvider` and `HeimdallOidcProvider`.
- **Sessions:** a random 32-byte token in an httpOnly, `SameSite=Lax` cookie
  (`__Host-huginn_session` when Secure). The `session` table stores its SHA-256, the user, the
  provider and `providerData`. Sessions end after 30 days unused or 90 days in all. HTTP requests
  and the Socket.IO handshake both read the cookie, so the app, API and socket share one origin.
  Sign-out deletes the session and disconnects its sockets.
- **Cross-site requests:** non-GET requests and socket handshakes whose `Origin` isn't in
  `APP_ORIGINS`, or that say `Sec-Fetch-Site: cross-site`, are refused.
- **Heimdall-only later:** once Heimdall has registration and verified emails, local sign-up can
  close and the password route can go, with existing accounts linked by their owners first.

### 2.4 Asks for the Heimdall roadmap

- ~~RP-initiated logout, and back-channel logout~~ (done in Heimdall #40).
- Registration, email verification, and a real `email_verified` claim (today it's always
  `false`). Until then Huginn keeps its own sign-up, and links accounts only by the owner's action.
- A client registration API (today `seed-dev` creates Huginn's client).
- A stable `sub` per tenant user. Heimdall's user ids already provide it.

## 3. Data model (Phase 0 and 1)

Postgres. Changes go through **migrations** (TypeORM migrations); `synchronize` is turned off.

```
user            id PK, oidc_issuer, oidc_subject UNIQUE, username, username_key UNIQUE (C collation),
                display_name, bio, avatar_url, last_seen_at, created_at, deleted_at

user_settings   user_id PK/FK, last_seen_visibility, photo_visibility, read_receipts BOOL,
                group_add_policy, message_requests BOOL, enter_to_send BOOL, keep_archived BOOL,
                notify_previews BOOL, notify_sounds BOOL, group_notify_mode, mentions_break_mute BOOL,
                dnd_until, theme

chat            id PK (bigint), kind ENUM(self, direct, group), direct_key UNIQUE NULL,
                title, description, avatar_url, created_by FK, created_at,
                edit_info_policy, add_member_policy, send_policy,      -- group settings
                last_message_id, last_activity_at, deleted_at

chat_member     (chat_id, user_id) PK, role ENUM(owner, admin, member),
                joined_at, joined_after_message_id, left_at, removed_by,
                status ENUM(active, request, left, removed),            -- request = message request
                pinned_at, pin_order, archived_at, muted_until, hidden_at,   -- per-user list state
                cleared_before_message_id, marked_unread BOOL,
                last_delivered_message_id, last_read_message_id         -- receipt watermarks
                INDEX (user_id, status, pinned_at, last_activity_at)

message         id PK (bigint, monotonic per shard), chat_id FK, sender_id FK, sender_device_id,
                client_message_id UUID, kind ENUM(text, system, media, mls_control),
                body_ciphertext BYTEA,            -- Phase 2+; plaintext column `body` before Phase 2
                reply_to_message_id NULL, edited_at, deleted_for_all_at, deleted_by,
                created_at
                UNIQUE (sender_id, client_message_id)       -- idempotent sends
                INDEX (chat_id, id DESC)

message_hidden  (user_id, message_id) PK                     -- "delete for me"

block           (blocker_id, blocked_id) PK, created_at

device          id PK (UUID), user_id FK, label, created_at, last_seen_at, revoked_at,
                mls_signature_public_key, mls_credential                  -- Phase 2

key_package     id PK, device_id FK, package BYTEA, created_at, used_at   -- Phase 2 (MLS KeyPackages)

push_subscription id PK, device_id FK, endpoint, p256dh, auth, created_at, failed_at

user_update     (user_id, seq) PK, type, data JSONB, created_at           -- sync log (§5), pruned at 30 days

media           id PK, owner_id, chat_id, blob_key, byte_size, mime_hint, created_at   -- Phase 3 (ciphertext only)
```

**Why the list state lives on `chat_member`:** pins, archive, mute, clear, hide and read
position are *per person*. Keeping them on the membership row makes the chat list one indexed
query, and nothing about another person leaks into it.

**Built in 0.3:** `user` (plus `update_seq`), `user_settings`, `chat`, `chat_member`, `message`
(plaintext `body`), `message_hidden`, `block` and `user_update`. The rest arrive with their
phases. The migration from the old schema was:

| Old | Became |
|---|---|
| `room` | `chat` |
| `room_users_user` | `chat_member` |
| `type` and `directKey` | `kind` and `direct_key` |
| `connected_user`, `joined_room` | dropped (Socket.IO rooms replaced them) |

Existing rooms and messages were carried over. Each group's earliest sender became its owner.

---

## 4. Realtime protocol

### 4.1 Transport

- Socket.IO over WebSocket, with long-polling only as a fallback.
- The Socket.IO event name is the type (`message.send`) and its argument is the data. The
  server announces the protocol version in `hello { protocol, seq }` on every connect.
- Client requests use Socket.IO **acknowledgements** (callbacks). Every ack is
  `{ ok: true, ...result }` or `{ ok: false, error }`, where `error` is a sentence fit to show.

### 4.2 Client → server

Built in 0.4:

| Event | Data | Ack |
|---|---|---|
| `sync` | `{ sinceSeq }` | `{ updates[], seq, hasMore, reset }` (§5) |
| `chats.list` | `{ before?, folder?: 'main' \| 'archived' }` | `{ chats[], next }`; the main list leaves archived chats out, and its first page carries every pin |
| `chats.folders` | – | `{ archived: { count, unread } }` (1.1) |
| `chat.state` | `{ chatIds[], pin \| archive \| mute: '8h' \| '1w' \| 'always' \| null \| unread \| clear: true \| delete: true }`, one change (delete refuses groups) | `{ results[]: { chatId, me, unreadCount } }`, plus a `chat.state` update per chat to every device (1.1) |
| `chat.pins` | `{ chatIds[] }`: every pinned chat, first to last | `{ results[]: { chatId, me, unreadCount } }`, plus a `chat.state` update per chat (1.1). Refused unless the ids are exactly the chats pinned now |
| `chat.get` | `{ chatId }` | `{ chat }` |
| `direct.open` | `{ userId }` | `{ partner, chat }`, where `chat` is null until the first message creates it |
| `chat.open` / `chat.close` | `{ chatId }` | `{ messages[], hasMore }` / `{}` |
| `messages.page` | `{ chatId, before?: messageId }` | `{ messages[], hasMore }` |
| `message.send` | `{ chatId \| toUserId, clientMessageId, text, replyToMessageId? }` | `{ message, chatId }` |
| `chat.read` | `{ chatId, upTo: messageId }`, capped at the chat's newest; also delivers | `{}`, plus `receipt` updates for the senders (1.5) |
| `message.info` | `{ messageId }`: your own | `{ entries[]: { user, delivered, deliveredAt, read, readAt }, readCount }` (1.4) |
| `message.edit` | `{ messageId, text }`: your own, within 15 minutes | `{ message }`, plus `message.edited` to every member (1.4) |
| `chat.delivered` | `{ chatId, upTo: messageId }`, capped likewise | `{}`, plus `receipt` updates (1.5) |
| `settings.get` / `settings.update` | `{ readReceipts }` for now; the rest with Settings (1.11) | `{ settings }`; your other tabs get a `settings` event |
| `group.create` | `{ title, description?, memberIds[] }` | `{ chat }` |
| `typing` | `{ chatId }` | – |

Planned with their features (`message.send` gains `kind`, `replyTo` and later `ciphertext`):

| Event | Data | Ack |
|---|---|---|
| `messages.page` | adds `around?: messageId, limit` | `{ messages[], hasMore }` |
| `message.edit` | `{ messageId, body \| ciphertext }` | ok / error |
| `message.delete` | `{ messageIds[], scope: 'me' \| 'all' }` | ok / error |
| `receipt` | `{ chatId, deliveredUpTo?, readUpTo? }` | – |

Group management (`group.update`, `group.members.add`/`remove`, `group.role`, `group.leave`,
`group.delete`) and blocks go over **REST**, because they're rare, need clear errors, and are
easy to audit. Their effects reach other people as updates.

### 4.3 Server → client

- `update { seq, type, data }`: the only push channel for state changes. Built so far:
  `chat.new`, `message.new`, `chat.state` (per-member state with the unread count),
  system messages are `message` rows of kind `system` whose body is a JSON event, sent as
  `system: { type, … }` with no text and worded by each client (built: `group.created`),
  `message.edited` (to every member: the message with its new text and `editedAt`),
  `message.deleted` (to every member: the message again as a tombstone, with `deletedById`)
  and `message.hidden` (to your own devices: `{ chatId, messageIds }` deleted for you). Coming
  with their features: `message.edited`, `chat.updated`, `chat.member`, `receipt`,
  `user.updated` and `block`.
- `hello { protocol, seq }` on every connect, `presence` and `onlineUsers` for who's online,
  and `userUpdated` for profile changes (it moves into `update` as `user.updated`).
- `typing` and `presence` are **ephemeral**. They aren't logged in `update` and are never
  replayed.

---

## 5. Sync and reliability (Phase 0)

The aim: nothing is lost when the connection drops, and every device shows the same state.

- **Per-user update log.** Every durable change a user should see is appended to `update` with
  a per-user, monotonically increasing `seq`, then pushed live. Each device stores the last
  `seq` it applied.
- **Reconnect** sends `sync { sinceSeq }`. The server returns the missed updates in pages of
  200. Updates older than 30 days are pruned hourly. If a device's position falls before the
  oldest kept update, the server answers `{ reset: true }`, and the device reloads its chat list
  and the open chat from scratch. A device that sees a gap in live `seq` numbers syncs too.
- **Idempotent sends.**
  - Every message gets a client-generated `clientMessageId` (a UUID).
  - Retries after a timeout or reconnect are safe: the unique index returns the existing message.
  - This replaces today's "match pending messages by text" trick.
- **Outbox.** Messages written while offline are stored in IndexedDB with their
  `clientMessageId`. They're sent in order when the connection returns, and each becomes ✓
  when its ack arrives.
- **Ordering.** Message ids are server-assigned and monotonic, and the per-socket send queue
  (already built) keeps each sender's order.
- **The local store** (IndexedDB) caches chats, members and recent messages for instant start,
  offline reading and in-chat search. It's the only place decrypted content lives (Phase 2).

---

## 6. Receipts (Phase 1)

Receipts are **watermarks**, not one row per message per reader.

- Each member has `last_delivered_message_id` and `last_read_message_id`.
- A device reports `deliveredUpTo` when it receives messages, and `readUpTo` when the chat is
  open, the tab is visible, and the reader is near the bottom (or has scrolled past those
  messages).
- **The sender's view**, for a message *m* in chat *c*:
  - **delivered** if every other active member's delivered watermark is ≥ *m*
  - **read** if every other active member's read watermark is ≥ *m*
  - In direct chats that's one person. In groups, message info lists everyone.
- **Read receipts off:** that member's read watermark still moves for their own unread badge,
  but isn't shared. Reciprocity: the server stops sending them read updates too.
- **Cost:** one row update per reader per batch, not per message. Updates to senders are
  combined and sent at most every 500 ms per chat.
- **Built 2026-10-24 (1.5):** every chat summary carries `receipts { deliveredUpTo, readUpTo }`,
  the lowest watermarks among the *other* members, and the client compares its own message ids
  against them. A watermark change records a `receipt` update only for members whose own
  messages changed tick, which does the job of the 500 ms batching on the server side; devices
  batch their `chat.delivered` reports per chat every 300 ms. In groups, reads always count
  (WhatsApp's rule); receipts off hides reads only in direct chats, both ways.
- **Times for message info (1.4):** each watermark move is logged in `watermark_log`
  (`chatId, userId, kind d|r, upTo, at`): one row per move, not per message. A message's
  delivered or read time for a member is the earliest move that reached it.

---

## 6.1 Presence and last seen

**Goal:** accurate "online" and "last seen" for contacts, without broadcasting every disconnect
to everyone.

- **Online** means the user has at least one live connection. Presence lives in Redis: a
  per-user connection count, plus a heartbeat that expires after 60 seconds. So a crashed server
  can't leave people "online" forever.
- **Going offline:** when the last connection closes, the server waits a **60-second grace
  period**. If the user reconnects in that time (a network switch, a reload), nothing happens.
  Otherwise it writes `user.last_seen_at` once.
  - Nothing is broadcast.
  - This is one write per real session end, and the time is accurate to the second.
- **Pull, not push:**
  - Opening a direct chat or a profile asks for that person's presence once (`presence.get`).
  - While the chat is open, the client watches that one person (`presence.watch` and
    `presence.unwatch`) and receives their online/offline changes.
  - The chat list shows online dots only for visible rows, by watching at most about 50 people.
  - Nobody receives presence for people they aren't looking at.
- **Privacy:** the server answers `presence.get` and `presence.watch` only for contacts, and only
  if the person's *last seen* setting allows it (and, reciprocally, the asker's own setting
  does). Otherwise it returns nothing, and the UI shows no status line.
- **Why not work out last seen on the receiver's device?** This was considered (decisions.md
  D11). A receiver can only notice someone leaving while the receiver itself is online and
  watching. Different devices would show different times, someone who was offline would see
  nothing, and staying accurate would need regular polling, which costs more than one write at
  disconnect.

## 6.2 Search API (Phase 1)

`GET /search?q=` returns three groups, each limited to 5 results, with `hasMore` for "Show all":

- **contacts:** users who share an accepted chat with the searcher
- **groups:** the searcher's groups, matched on the group name or a member's name
- **people:** everyone else, excluding blocked users in both directions

It's the same index-only search as today: a prefix step, then trigram, joined to `chat_member`
for the contact and group checks.

## 7. End-to-end encryption (Phase 2)

### 7.1 Choice: MLS

**MLS** (Messaging Layer Security, RFC 9420) is used for every chat kind, through **OpenMLS**
compiled to WebAssembly and run in a web worker.

- **Why MLS:**
  - One protocol for self, direct and group chats.
  - Each device is a member of the group, so multi-device works naturally.
  - Joining and leaving are efficient for large groups.
  - It's an IETF standard with forward secrecy and post-compromise security.
- **Why not Signal:** the Signal protocol (X3DH/PQXDH plus Double Ratchet plus Sender Keys) is
  excellent, but libsignal has no supported browser build. Writing a ratchet ourselves is the
  kind of cryptography no one should hand-roll. The trade-offs are in
  [decisions.md](decisions.md).

### 7.2 Roles

- **The Huginn API is the MLS *Delivery Service*.** It stores and forwards handshake messages
  and ciphertext in order per group, and it can't read them.
- **The *Authentication Service* is Huginn plus Heimdall.** A device's MLS credential binds
  `{ userId, deviceId, signature public key }`. Huginn signs it after a Heimdall-authenticated
  session approves the device.

### 7.3 Devices and keys

- **Each browser profile is a device.**
  - On first use it generates an MLS signature key pair and uploads several **KeyPackages**,
    which others use to add the device to groups.
  - Keys are stored in IndexedDB, wrapped by a non-extractable WebCrypto key.
- **Linking a new device:**
  1. The new device signs in through Heimdall.
  2. An existing device approves it, by scanning a QR code or confirming a short code.
  3. The existing device adds the new device to the user's groups.
- **Removing a device** removes it from every group (an MLS commit), so it can't read anything
  new.
- **Self chat** is an MLS group of just the user's own devices.

### 7.4 Messages under MLS

- `message.body_ciphertext` holds the MLS application message. Inside, the decrypted payload is
  structured, and the server never sees it:
  `{ kind, text, replyTo: { id, senderId, excerpt }, entities, linkPreview, media: { key, digest, … } }`.
- **Edit** is a new application message `{ editOf, text }`. **Delete for everyone** is
  `{ deleteOf }`, and the server also wipes the target's ciphertext. Reactions (Phase 4) follow
  the same pattern.
- **Receipts and typing stay plaintext metadata.** The server needs them to route and store
  watermarks, and they carry no content.
- **Membership changes** (add, remove, leave) are MLS commits made by an authorised member's
  device. The server checks Huginn's permission rules (owner/admin) before accepting a commit.

### 7.5 Features that change under encryption

| Feature | How it works when the server can't read |
|---|---|
| Search in chat | On the device, over the IndexedDB store (built that way from Phase 1) |
| Notification previews | The push payload carries the ciphertext. The service worker decrypts it with the device's keys and builds the notification. If decryption fails: "New message". |
| Link previews | The **sender's** device fetches the preview and sends it inside the encrypted payload |
| Reply excerpts | Taken from the sender's local copy and encrypted with the reply |
| History on a new device | Not readable, by design, unless **encrypted backup** is on: the device uploads an archive encrypted with a key derived from a recovery key or passphrase (Argon2id) |
| Moderation | Only through user reports, which carry the decrypted messages from the reporter's device. Message franking (a later step) lets moderators verify a report is genuine. |
| Group invite links (Phase 4) | The link adds you to the *Huginn* membership. An existing member's device then adds your devices to the MLS group the next time it's online. You see "Waiting for a member to let you in…" until then. |

### 7.6 Verification

- **Safety number:** a fingerprint over both users' credentials, shown as 60 digits and a QR
  code. Verifying it marks the contact as verified.
- **Key changes:** any change of credential (a new device, a reset) posts a system line and
  clears the verified mark.

### 7.7 Honest limits

- **Web E2EE trusts the code the server sends.** Mitigations: strict CSP, Subresource
  Integrity, reproducible builds with published hashes, and later an optional installable
  desktop app.
- **Metadata is visible to the server:** who talks to whom, when, group membership, and sizes.
  Reducing it (sealed sender, padding) is future work.
- **Profiles are not encrypted:** name, photo, bio and username are public by design.

---

## 8. Notifications (Phase 1; encrypted previews in Phase 2)

Built for 1.9 ([#9](https://github.com/Parth2500/Huginn/issues/9)) in `api/src/notifications/`.

1. **Who hears** (`NotificationsService.noticesFor`): after a message is stored and acknowledged,
   each other active member is checked. Nobody hears when:
   - they are the sender (on any device)
   - they are in do-not-disturb (`dndUntil`)
   - the chat is muted or archived, or it's a group set to "only mentions and replies", unless
     the message replies to them and *Mentions break through mute* is on. @mentions join this
     rule when they exist (4.x).
   - the chat is a message request (only `active` members are asked)

   A retried send (same `clientMessageId`) notifies nobody again.
2. **The notice** is `{ chatId, messageId, title, body, sound }`. Direct chats: the sender's name
   and the first 120 characters. Groups: the group's title and "Sender: text". With previews off,
   `title` and `body` are null, and devices say "New message". The server builds the preview from
   plaintext in Phase 1. In Phase 2 the payload carries ciphertext instead (2.3, #15).
3. **One channel per device:**
   - Every open tab gets a `notify` socket event. The tab knows whether the chat is on screen, so
     it decides between nothing, a sound, and a system notification.
   - A browser with no open tab (no socket in its session) gets a **Web Push**: VAPID (RFC 8292),
     an encrypted payload (RFC 8291), a 24-hour TTL, and `Topic: chat-<id>`, so the push service
     keeps only the latest push for each chat.
4. **Subscriptions** (`push_subscription`): `PUT /api/notifications/subscription` saves the
   browser's subscription for the current session, and `DELETE` removes it. Signing out deletes the
   session, and the subscription goes with it. Only endpoints at the browsers' push services are
   accepted (FCM, Mozilla, Apple, Windows), so nobody can point Huginn's server at another
   address. A 404 or 410 from the push service deletes the subscription.
5. **Settings** travel with `settings.get` and `settings.update`, next to read receipts:
   `notifyPreviews`, `notifySounds`, `groupNotifyMode` (`all` or `mentions`), `mentionsBreakMute`,
   and `dndUntil`. Every tab of the person gets the new `settings`.
6. **The service worker:**
   - shows the notification with `tag = chatId`, so each chat replaces its own notification
   - opens or focuses the chat when clicked
7. **Badges:** the app badge (PWA) and tab title count unread messages in unmuted chats.
8. **Not yet:** pushes go out from the API process right after the send. A queue and a separate
   push worker come with scaling (Phase 5).

---

## 9. Blocking and requests (Phase 1)

- `block` is checked on:
  - **send:** the message is accepted and stored, but never delivered to the blocker. The
    sender sees ✓ only.
  - **presence and profile fan-out:** suppressed both ways.
  - **group adds:** refused.
  - **search:** blocked people are hidden from the blocker's results.
- **Message requests:** a new direct chat from a stranger creates the recipient's `chat_member`
  with `status = request`. Requests don't produce push notifications or read receipts. Accepting
  sets the status to `active`.

---

## 10. Permissions (Phase 1)

There's one policy function on the server, `can(user, action, chat)`, used by REST and socket
handlers alike. The UI mirrors it to hide controls, but never relies on that.

| Action | Owner | Admin | Member |
|---|---|---|---|
| Send message | ✓ | ✓ | ✓ unless `send_policy = admins` |
| Edit info | ✓ | ✓ | if `edit_info_policy = all` |
| Add members | ✓ | ✓ | if `add_member_policy = all` |
| Remove member | ✓ | ✓ (not admins or the owner) | – |
| Promote / demote | ✓ | – | – |
| Change group settings | ✓ | – | – |
| Delete any message for everyone | ✓ | ✓ | – (own only, within 15 minutes) |
| Transfer ownership / delete group | ✓ | – | – |
| Leave | ✓ (after transfer) | ✓ | ✓ |

---

## 11. Client architecture (Angular)

- **Stores** hold state in Angular signals:
  - `ChatsStore` (list, member state; built)
  - `MessagesStore` (per chat, windowed; built)
  - `OutboxStore` (built)
  - `PresenceStore` and `SettingsStore` (Phase 1)
  - `CryptoService` (a web worker running OpenMLS WASM, Phase 2)
  
  `LocalDb` keeps one IndexedDB database per account (chats, recent messages, the outbox and
  the last applied `seq`), deleted on sign-out.
  
  Components read from the stores, so no more per-component socket subscriptions.
- **The sync engine** applies `update` events to the stores and to IndexedDB in one place.
- **The service worker** handles push, notification clicks, an offline app shell, and cached
  avatars.
- **Versions (milestone 0.2, done):** Angular 22 (standalone, signal inputs and queries, the new
  control flow) and NestJS 12. Since 0.4 every component under the dashboard is OnPush. The
  public sign-in pages, the root and the toast host are still `Eager` until 0.5 rewrites them,
  and then the app drops `zone.js`.

---

## 12. Quality gates (every phase)

- **API:** end-to-end tests with real Socket.IO clients against a test Postgres. These cover
  permissions, blocks, receipts, sync after disconnect, and idempotent sends.
- **UI:** Playwright tests with two browser contexts for the live flows, plus a visual check of
  the main screens in light and dark at 390px and 1440px.
- **Accessibility:** automated checks (axe) plus a keyboard pass on every new surface.
- **Security:**
  - dependency scanning
  - CSP and SRI
  - rate limits on auth-adjacent routes
  - Phase 2: an external review of the MLS integration

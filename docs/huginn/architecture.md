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

## 2. Identity: Heimdall integration (Phase 0)

**Pattern: backend-for-frontend (BFF).** The Huginn API is a *confidential* OIDC client of
Heimdall. The browser never holds Heimdall tokens.

1. "Sign in" sends the browser to `GET /auth/login`. The API redirects to Heimdall's authorize
   endpoint with `response_type=code`, PKCE, `state` and `nonce`.
2. Heimdall redirects back to `/auth/callback`. The API swaps the code for tokens, validates the
   ID token (against Heimdall's JWKS, plus issuer, audience, nonce and expiry), and then:
   - looks up or creates the Huginn user by **`sub`**, Heimdall's stable subject id
   - sets an `httpOnly; Secure; SameSite=Lax` session cookie (opaque id → Redis session)
3. HTTP requests and the Socket.IO handshake authenticate with that cookie. There are no tokens
   in `localStorage`, which removes the current XSS token-theft risk.
4. The API refreshes Heimdall tokens itself while the session lives. Heimdall's **back-channel
   logout** (or a session check) ends the Huginn session and disconnects its sockets.

**What Huginn stores about identity:**

- `user.oidc_subject` (unique) and `user.oidc_issuer`
- whether the email is verified, if Heimdall asserts it (shown only to the owner)
- nothing else from Heimdall

**First sign-in:** a short onboarding asks for a username (the existing policy), then a
display name and photo (optional).

**What Heimdall needs to provide:**

- discovery (`/.well-known/openid-configuration`) and JWKS
- the code flow with PKCE, and a confidential client
- refresh tokens
- back-channel logout
- the scopes `openid profile email`
- a stable `sub`

**Migration:** the current email/password login stays behind a feature flag until Heimdall is
live, then gets removed. Existing users are linked by verified email on their first Heimdall
sign-in.

---

## 3. Data model (Phase 0 and 1)

Postgres. Changes go through **migrations** (TypeORM migrations); `synchronize` is turned off.

```
user            id PK, oidc_issuer, oidc_subject UNIQUE, username, username_key UNIQUE (C collation),
                display_name, bio, avatar_url, created_at, deleted_at

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

update          (user_id, seq) PK, type, payload JSONB, created_at        -- sync log (§5), pruned at 30 days

media           id PK, owner_id, chat_id, blob_key, byte_size, mime_hint, created_at   -- Phase 3 (ciphertext only)
```

**Why the list state lives on `chat_member`:** pins, archive, mute, clear, hide and read
position are *per person*. Keeping them on the membership row makes the chat list one indexed
query, and nothing about another person leaks into it.

**From today's schema:**

| Today | Becomes |
|---|---|
| `room` | `chat` |
| `room_users_user` | `chat_member` |
| `type` and `directKey` | `kind` and `direct_key` |
| `connected_user`, `joined_room` | dropped (Socket.IO rooms replaced them) |

There's no chat data to migrate today, so this is a clean migration.

---

## 4. Realtime protocol

### 4.1 Transport

- Socket.IO over WebSocket, with long-polling only as a fallback.
- Every event uses one envelope: `{ v: 1, type, data }`.
- Client requests use Socket.IO **acknowledgements** (callbacks), instead of the paired
  "emit, then listen for a different event" pattern used today.

### 4.2 Client → server

| Event | Data | Ack |
|---|---|---|
| `sync` | `{ sinceSeq }` | `{ updates[], seq, hasMore }` (§5) |
| `chat.open` / `chat.close` | `{ chatId }` | `{ messages[], cursors }` |
| `messages.page` | `{ chatId, before?: messageId, around?: messageId, limit }` | `{ messages[], hasMore }` |
| `message.send` | `{ chatId \| toUserId, clientMessageId, kind, body \| ciphertext, replyTo? }` | `{ messageId, createdAt }` or `{ error }` |
| `message.edit` | `{ messageId, body \| ciphertext }` | ok / error |
| `message.delete` | `{ messageIds[], scope: 'me' \| 'all' }` | ok / error |
| `receipt` | `{ chatId, deliveredUpTo?, readUpTo? }` | – |
| `typing` | `{ chatId }` (throttled to 1 per 2 s) | – |
| `chat.state` | `{ chatIds[], pin? \| archive? \| mute? \| markUnread? \| hide? \| clear? }` | `{ ok, results[] }` |

Group management (`group.update`, `group.members.add`/`remove`, `group.role`, `group.leave`,
`group.delete`) and blocks go over **REST**, because they're rare, need clear errors, and are
easy to audit. Their effects reach other people as updates.

### 4.3 Server → client

- `update { seq, type, data }`: the only push channel for state changes. Types include
  `message.new`, `message.edited`, `message.deleted`, `chat.updated`, `chat.member`,
  `chat.state`, `receipt`, `user.updated` and `block`.
- `typing` and `presence` are **ephemeral**. They aren't logged in `update` and are never
  replayed.

---

## 5. Sync and reliability (Phase 0)

The aim: nothing is lost when the connection drops, and every device shows the same state.

- **Per-user update log.** Every durable change a user should see is appended to `update` with
  a per-user, monotonically increasing `seq`, then pushed live. Each device stores the last
  `seq` it applied.
- **Reconnect** sends `sync { sinceSeq }`. The server returns the missed updates in pages. If a
  device has been away longer than the retention window (30 days), the server answers
  `{ reset: true }`, and the device reloads its chat list and the open chat from scratch.
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

---

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

1. When a message is stored, the API enqueues one push job per recipient device that needs
   one. A device needs one when:
   - it's not focused on that chat
   - the chat isn't muted or archived (unless a mention breaks through)
   - it isn't a message request
   - the user isn't in do-not-disturb
2. The **push worker** sends Web Push using VAPID keys and the device's `push_subscription`. The
   payload is `{ chatId, messageId, ciphertext?, title? }`, and `title` is omitted when previews
   are off.
3. The **service worker:**
   - shows the notification with `tag = chatId`, so each chat replaces its own notification
   - opens or focuses the chat when clicked
   - removes subscriptions that fail with 404/410
4. **In-tab:** if a Huginn tab is open, it handles the event and the service worker stays
   quiet. Only one notification is shown per message per device.
5. **Badges:** the app badge (PWA) and tab title count unread messages in unmuted chats.

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
| Delete any message for everyone | ✓ | ✓ | – (own only, within 48 hours) |
| Transfer ownership / delete group | ✓ | – | – |
| Leave | ✓ (after transfer) | ✓ | ✓ |

---

## 11. Client architecture (Angular)

- **Stores.** A small set of RxJS stores (or Angular signals after an upgrade):
  - `ChatsStore` (list, member state)
  - `MessagesStore` (per chat, windowed)
  - `PresenceStore`
  - `SettingsStore`
  - `OutboxStore`
  - `CryptoService` (a web worker running OpenMLS WASM, Phase 2)
  
  Components read from the stores, so no more per-component socket subscriptions.
- **The sync engine** applies `update` events to the stores and to IndexedDB in one place.
- **The service worker** handles push, notification clicks, an offline app shell, and cached
  avatars.
- **Upgrade path:**
  - Angular 16 → a current LTS release in Phase 0 (signals, the new control flow, and standalone
    components cut a lot of module boilerplate).
  - NestJS 9 → a current release in the same pass.

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

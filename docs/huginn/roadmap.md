# Huginn roadmap

Phases build on each other. Each milestone is a shippable slice: it ends with the app working,
tested and demoable, never half-migrated.

## Why this order

1. **Foundations first.** Pins, archive, receipts and multi-device all need per-member chat
   state, reliable sync and idempotent sends. Building features on the current model and then
   moving them would mean doing them twice.
2. **Core features before encryption,** but built *encryption-ready*: every message travels in
   the new envelope, search runs on the device, and nothing on the server depends on reading
   message text. Encryption then swaps the body for ciphertext without redesigning features.
3. **Encryption before media.** Media has to be encrypted from the first upload, and retrofitting
   encryption onto stored files is painful.
4. **Expression after media.** Reactions and polls are pleasant but don't change the
   architecture.
5. **Production hardening** runs alongside from Phase 0 (tests, migrations, rate limits), and
   finishes in Phase 5 with scale and operations.
6. **Audio calls last.** They're a separate real-time system (WebRTC, TURN), with no dependency
   from the rest.

## Definition of done (every milestone)

- Works at 390px and 1440px, in light and dark, with keyboard only and with a screen reader.
- Every state is designed: empty, loading, error, offline, no permission.
- API end-to-end tests and Playwright tests for the new flows, run in CI.
- The design detector is clean, and DESIGN.md is updated for new components.
- PRODUCT.md and these docs are updated if behaviour changed.
- The demo database can be reset to a clean seed, so demos start fresh.

---

## Phase 0: Foundations

| # | Milestone | Done when |
|---|---|---|
| 0.1 | **Rename to Huginn** | The UI, page title, favicon, logo mark, package names, docker services, docs and API Swagger title all say Huginn. "ChatApp" appears nowhere. |
| 0.2 | **Migrations and upgrades** | TypeORM migrations replace `synchronize`. Angular and NestJS are on current releases. CI runs the build, lint and tests. The old scaffold specs are replaced by real tests. |
| 0.3 | **New data model** | `chat` and `chat_member` (with per-user state and watermarks), `message` with `client_message_id`, `block` and `user_settings` tables, per [architecture.md §3](architecture.md#3-data-model-phase-0-and-1). Existing features work on it. |
| 0.4 | **Protocol v1** | The event envelope, acknowledgements, idempotent `message.send`, the per-user `update` log with `sync`, and the IndexedDB local store with outbox. Killing the API mid-conversation and restarting it loses nothing, and pending sends complete. |
| 0.5 | **Heimdall sign-in** | BFF code flow with PKCE, cookie sessions, sockets on cookie auth, back-channel logout, first-run username onboarding. The old password login sits behind a flag (on until Heimdall ships). |

---

## Phase 1: Core messenger

| # | Milestone | Includes |
|---|---|---|
| 1.1 | **Chat list power** | Pin (limit 5, drag to reorder), archive with the Archived view, mute (8h, 1 week, always), mark read/unread, delete chat, clear chat, filters (All, Unread, Groups), row menus, swipe actions, Undo snackbars |
| 1.2 | **Multi-select** | Selection mode for chats (bulk archive, mute, read, pin, delete) and for messages (copy, delete) |
| 1.3 | **Notes to self** | Self chat kind, auto-pin, search entry |
| 1.4 | **Message actions** | Reply with quote and jump, edit (15 minutes, with "edited"), delete for me, delete for everyone (48 hours; admins always), tombstones, copy, message info |
| 1.5 | **Ticks** | Sent, delivered and read from watermarks; failed with retry; read-receipt privacy with reciprocity |
| 1.6 | **Timeline polish** | Unread divider and scroll-to-first-unread, drafts per chat, simple formatting, system messages |
| 1.7 | **Groups, full** | Group info drawer, edit name/photo/description, members list with roles, add and remove, promote and demote, group settings, leave (with owner transfer), delete for everyone, announcements mode |
| 1.8 | **Safety** | Block and unblock, the blocked list, message requests (accept, delete, block), privacy settings (last seen, photo, groups) |
| 1.9 | **Notifications** | Permission banner, in-tab notifications, Web Push through the service worker, previews on/off, sounds, per-chat mute, mentions breaking mute, do-not-disturb, app badge |
| 1.10 | **Search in chat** | Device-side index over the local store, highlighted matches with ↑/↓, a results list, "search older messages" |
| 1.11 | **Settings** | All sections except Devices and security; theme switch; keyboard shortcuts |

**Showpiece checkpoint A:** a 5-minute demo covers every feature you listed, live, across two
browsers.

---

## Phase 2: End-to-end encryption

| # | Milestone | Includes |
|---|---|---|
| 2.1 | **Crypto core** | OpenMLS in a WASM web worker, device keys in IndexedDB, KeyPackage upload and refill, a device registry API |
| 2.2 | **Encrypted chats** | Every new chat is an MLS group. Text, edits, deletes, replies and system changes go as encrypted messages. Membership changes are MLS commits checked against permissions. |
| 2.3 | **Encrypted notifications** | The service worker decrypts push payloads for previews, with a "New message" fallback |
| 2.4 | **Devices** | Link a device by QR or short code, the linked devices list, remove a device |
| 2.5 | **Trust** | Safety numbers, QR verification, verified badges, key-change notices, the encryption notice in every chat |
| 2.6 | **Encrypted backup** | Recovery key or passphrase (Argon2id), encrypted history archive, restore on a new device |
| 2.7 | **Review** | An external review of the MLS integration and key storage, plus CSP, SRI and reproducible-build hashes published |

**Showpiece checkpoint B:** the database shows only ciphertext. Two browsers chat, a third
device is linked and verified, and a removed device can't read new messages.

---

## Phase 3: Media and files

Encrypted uploads to object storage with per-file keys. Photos and videos (sent, not called),
files up to 100 MB, voice notes, link previews generated by the sender, the shared-media tab,
storage quotas, and thumbnails made on the device.

## Phase 4: Expression (nice to have)

Reactions, forwarding (with "forwarded many times"), saved messages, @mentions, polls, pinned
messages, invite links, scheduled quiet hours.

## Phase 5: Production

- **Scale:** the Socket.IO Redis adapter, presence in Redis, read replicas, PgBouncer,
  partitioning messages, a fan-out queue.
- **Safety:** rate limits everywhere, reporting with moderation tools, abuse detection on
  metadata.
- **Operations:** metrics, tracing, alerts, load tests to 100,000 sockets, backups with tested
  restores.
- **Compliance:** export my data, delete my account (with key destruction), and a privacy
  policy written from the real data flows.

## Phase 6: Calls (future)

Audio-only WebRTC calls: one-to-one first, then groups of up to 8 through an SFU, with
end-to-end encryption using SFrame. TURN/STUN servers, ringing over push, and call history in
the chat.

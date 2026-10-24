# Huginn roadmap

Phases build on each other. Each feature below is tracked as a GitHub issue
([Parth2500/Huginn issues](https://github.com/Parth2500/Huginn/issues), one milestone per phase). Each milestone is a shippable slice: it ends with the app working,
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
| 0.1 ✓ | **Rename to Huginn** (done 2026-10-21) | The UI, page title, favicon, logo mark, package names, docker services, docs and API Swagger title all say Huginn. "ChatApp" appears nowhere. |
| 0.2 ✓ | **Everything on latest** (done 2026-10-21; see the note below) | Angular, NestJS, TypeORM, Socket.IO, TypeScript, Node (current LTS) and Postgres all on current releases. Angular moved to standalone components, signals and the new control flow. TypeORM migrations replace `synchronize`. CI runs the build, lint and tests, and real tests replace the old scaffold specs. |
| 0.3 ✓ | **New data model** (done 2026-10-21) | `chat` and `chat_member` (with per-user state and watermarks), `message` with `client_message_id`, `block` and `user_settings` tables, per [architecture.md §3](architecture.md#3-data-model-phase-0-and-1). Existing features work on it. |
| 0.4 ✓ | **Protocol v1** (done 2026-10-21) | The event envelope, acknowledgements, idempotent `message.send`, the per-user `update` log with `sync`, and the IndexedDB local store with outbox. Killing the API mid-conversation and restarting it loses nothing, and pending sends complete. |
| 0.5 ✓ | **Cookie sessions and the auth seam** (done 2026-10-21) | Sign-in moves from a token in `localStorage` to an httpOnly cookie session, and sockets authenticate with the cookie. All sign-in code sits behind an `AuthProvider` interface, with today's password login as `LocalPasswordProvider`. |
| 0.6 ✓ | **Heimdall sign-in** (done 2026-10-21) | `HeimdallOidcProvider`: confidential BFF client, PKCE, `state`, `nonce`, RFC 9207 `iss`, ID token checked against JWKS. "Continue with Heimdall" next to the password, a welcome page to choose a username, and linking from the profile. No Heimdall tokens kept. See [architecture.md §2.2](architecture.md#22-how-huginn-connects-backend-for-frontend-built-2026-10-21). |

**Where 0.1 and 0.2 landed:**

- **Renaming:** folders are now `web/` and `api/`. Docker runs Node 24 and Postgres 18.
- **Versions:**
  - Angular 22.2, with standalone components, the `@if`/`@for` control flow, `inject()`, and
    signal inputs, outputs and queries.
  - NestJS 12.2, TypeORM 1.1, Socket.IO 4.8 and TypeScript 6.0.
  - Vitest replaces Karma and Jest. ESLint 10 runs with a flat config.
- **Database:** TypeORM migrations replace `synchronize`. The baseline is checked against the
  live schema (identical columns and indexes).
- **Tests:**
  - API unit tests (27) and API end-to-end tests against Postgres (13), which caught a
    presence leak to all users that's now fixed.
  - Web component tests (21).
  - CI on GitHub Actions, with actions pinned by SHA, plus Dependabot.
- **Follow-up:** Angular 22 makes OnPush the default. The existing components are marked
  `ChangeDetectionStrategy.Eager` for now. Moving their state to signals, then going zoneless,
  is folded into 0.3 and 0.4, as those milestones rewrite the same components.

**Where 0.5 landed:**

- **Sessions** are rows in `session` (only a SHA-256 of the token is stored), behind an httpOnly,
  `SameSite=Lax` cookie (`__Host-huginn_session` in production). They end after 30 days unused
  or 90 days in all. Signing out deletes the row and disconnects that session's sockets in every
  tab, and other browsers stay signed in.
- **Cross-site protection:** changes and socket handshakes from an origin outside `APP_ORIGINS`
  are refused.
- **The seam:** `AuthProvider` with `LocalPasswordProvider`, chosen in one line of `AuthModule`.
  Routes moved to `/api/auth/{register,login,session,logout}`. Sign-in gives one answer for an
  unknown email and a wrong password, and takes the same time for both. JWT is gone.
- **Web:** `AuthService` asks `/api/auth/session` who is signed in. The socket goes through the
  same origin as the app. Only a non-secret profile is remembered, so the app still opens from
  the device's copy when the server is down.
- **Verified:** 30 API unit, 26 API end-to-end and 28 web tests, plus a two-browser run: sign-in,
  no script-visible cookie or stored token, live messages over the cookie socket, reload,
  second tab, sign-out reaching the other tab, and offline start with reconnect.

**Where 0.3 and 0.4 landed:**

- **Data model:** `chat`, `chat_member` (role, status, pins, archive, mute, clear point, read
  and delivered watermarks), `message` with `clientMessageId`, `message_hidden`, `block`,
  `user_settings` and the `user_update` log. The migration carried the existing rooms and
  messages over instead of starting clean, and made each group's earliest sender its owner.
- **Protocol:** requests are acknowledged (`{ ok, ... }` or `{ ok: false, error }`), sends are
  idempotent on `clientMessageId` and ordered per socket, and every durable change is an
  `update { seq, type, data }` recorded in the same transaction as the change. The log is pruned
  after 30 days, and a device behind the pruned point is told to reload.
- **Web client:** signal stores (`ChatsStore`, `MessagesStore`, `OutboxStore`) over an IndexedDB
  copy per account, cleared on sign-out. `ChatService` is the sync engine. Every component
  under the dashboard is OnPush.
- **Verified:** with the API stopped, two messages were sent, the page reloaded, and both were
  still shown as pending. After a restart each was stored once, in order, delivered to the
  other person, and the outbox emptied. Tests: 27 API unit, 19 API end-to-end, 23 web.
- **Carried forward:** going zoneless (`zone.js` is still loaded) once the public sign-in pages
  are rewritten in 0.5. The automated version of the restart test joins the Playwright suite
  when it's set up.

---

## Phase 1: Core messenger

| # | Milestone | Includes |
|---|---|---|
| 1.1 | **Chat list power** (in progress: pin, mute, read/unread, archive and the row menu done 2026-10-22; clear and delete chat, the filters, Undo, pin reordering and swipe actions done 2026-10-24; message requests come with 1.8; tracked in [#1](https://github.com/Parth2500/Huginn/issues/1)) | Pin (limit 5, drag to reorder), the Archived and Message requests folders, mute (8h, 1 week, always), mark read/unread, delete chat, clear chat, filters (All, Unread, Groups), row menus, swipe actions, Undo snackbars |
| 1.2 ✓ | **Multi-select** (done 2026-10-24, [#2](https://github.com/Parth2500/Huginn/issues/2); deleting groups in bulk waits for leaving, 1.7) | Selection mode for chats (bulk archive, mute, read, pin, delete) and for messages (copy, delete) |
| 1.3 ✓ | **Notes to self** (done 2026-10-24, [#3](https://github.com/Parth2500/Huginn/issues/3)) | Self chat kind, auto-pin, search entry |
| 1.4 ✓ | **Message actions** (done 2026-10-24, [#4](https://github.com/Parth2500/Huginn/issues/4)) | Reply with quote and jump, edit (15 minutes, with "edited"), delete for me, delete for everyone (15 minutes; admins always), tombstones, copy, message info |
| 1.5 ✓ | **Ticks** (done 2026-10-24, [#5](https://github.com/Parth2500/Huginn/issues/5); message info comes with 1.4) | Sent, delivered and read from watermarks; failed with retry; read-receipt privacy with reciprocity |
| 1.6 ✓ | **Timeline polish** (done 2026-10-24, [#6](https://github.com/Parth2500/Huginn/issues/6); more system events come with 1.7) | Unread divider and scroll-to-first-unread, drafts per chat, simple formatting, system messages |
| 1.7 | **Groups, full** | Group info drawer, edit name/photo/description, members list with roles, add and remove, promote and demote, group settings, leave (with owner transfer), delete for everyone, announcements mode |
| 1.8 | **Safety and presence** | Block and unblock, the blocked list, message requests (accept, delete, block), privacy settings (last seen, photo, groups), last seen with the 60-second grace period and watch-on-open presence |
| 1.9 | **Notifications** | Permission banner, in-tab notifications, Web Push through the service worker, previews on/off, sounds, per-chat mute, mentions breaking mute, do-not-disturb, app badge |
| 1.9b | **Grouped search** | Contacts, Groups and New people in one search box, from the server, with "Show all" |
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

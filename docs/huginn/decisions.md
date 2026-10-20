# Huginn decisions

The choices that shape everything else. Each one records the decision, why it was made, what it
costs, and what would change it. Open questions follow at the end.

---

## D1. Name: Huginn

- **Decision:** the app is called Huginn, after Odin's raven "thought", who carries word between
  the realms. Its sign-in provider is Heimdall, the gatekeeper.
- **Why:** it pairs with Heimdall without explanation, and it's short and pronounceable.
- **Cost:** the UI rename is milestone 0.1.

## D2. Built in two stages: showpiece, then product

- **Decision:** reach feature-complete with working encryption first (checkpoints A and B),
  then harden for real users.
- **Why:** it keeps the project demonstrable at every step. Production concerns that are cheap
  early (migrations, tests, rate limits, idempotency) are still done early.

## D3. End-to-end encryption with MLS (RFC 9420), through OpenMLS in WASM

- **Decision:** one protocol for self, direct and group chats. Devices are group members.
- **Why:**
  - It's a standard, with forward secrecy and post-compromise security.
  - It scales to large groups.
  - It supports multi-device natively.
  - It has a maintained Rust implementation that compiles to WebAssembly.
- **Alternatives considered:**
  - *Signal protocol:* proven, but libsignal has no supported browser build, and writing our own
    Double Ratchet is not acceptable risk.
  - *Server-side encryption at rest only:* simpler, but the server could still read everything.
    That contradicts the top principle.
- **Cost:**
  - More work, especially device linking and backup.
  - Server-side search and server-made link previews are no longer possible.
  - Moderation only works through user reports.
- **Would change if:** browser-supported libsignal appears and offers something MLS can't for
  our case. Unlikely.

## D4. Encryption-ready from Phase 0

- **Decision:** before encryption exists, messages already use the final envelope.
  - Search runs on the device.
  - Link previews will be made by the sender.
  - No server feature reads message text.
- **Why:** it avoids rebuilding search, previews and notifications when Phase 2 lands.

## D5. Per-member chat state on `chat_member`

- **Decision:** pins, archive, mute, clear point, hidden state, marked-unread and receipt
  watermarks are columns on each person's membership row.
- **Why:** the chat list is one indexed query, the state is naturally private to each person,
  and it syncs as ordinary updates.

## D6. Read and delivery receipts as watermarks

- **Decision:** two message-id watermarks per member, not one row per message per reader.
- **Why:** writes are constant per reader regardless of message count. That's how large
  messengers do it.
- **Cost:** you can't mark an older message unread individually. That's acceptable; "mark chat
  as unread" covers the need.

## D7. A per-user update log for sync

- **Decision:** every durable change gets a per-user sequence number, and devices catch up with
  `sync { sinceSeq }`. Typing and presence stay ephemeral.
- **Why:** nothing is lost across disconnects or between devices. It's the same idea as
  Telegram's update sequence.
- **Cost:** one extra row per update per recipient, pruned after 30 days.

## D8. Heimdall through a backend-for-frontend

- **Decision:** the Huginn API is a confidential OIDC client and keeps sessions in httpOnly
  cookies. The browser never sees access or refresh tokens.
- **Why:** it removes token theft through XSS (today's token lives in `localStorage`), and it
  makes Socket.IO auth a plain cookie. It also lets the API handle refresh and back-channel
  logout.
- **Cost:** the API keeps a small session store (Redis).

## D9. Product rules (defaults, adjustable later)

| Rule | Value | Inspiration |
|---|---|---|
| Pinned chats | 5, plus Notes to self | WhatsApp 3, Telegram 5 |
| Edit window | 15 minutes | WhatsApp |
| Unsend window | 48 hours (sender); unlimited for group admins | WhatsApp is about 2 days; Telegram is unlimited |
| Archived chats on a new message | Stay archived (setting to change) | WhatsApp |
| Read-receipt privacy | Reciprocal | WhatsApp |
| Group size | 256 at first | WhatsApp started there |
| Group creation | At least 2 others; one person is a direct chat | Clean split between kinds |
| Last-seen visibility | Contacts, by default | Telegram and WhatsApp |

## D10. Out of scope

- video calls
- stories or status updates
- public broadcast channels
- bots
- phone-number accounts
- advertising
- server-side reading of messages

---

## Open questions (answer before or during Phase 1)

1. **Message requests.** Should a first message from someone you share no chat with go to
   *Message requests* (recommended, because usernames are publicly searchable), or straight into
   your chats as it does today?
2. **Unsend window.** Is 48 hours right, or should it be unlimited (Telegram) or shorter?
3. **"Last seen."** Show it at all? The recommendation is yes, defaulting to Contacts, with an
   option to switch it off.
4. **Contacts.** Is "anyone you share a chat with" enough, or do you want an explicit
   contact list (add or remove contacts, nicknames)? This affects privacy defaults.
5. **Heimdall timing.** Will Heimdall be ready by the end of Phase 0? If not, milestone 0.5 moves
   to just before Phase 2. Encryption needs device approval through a real identity provider.
6. **Hosting.** Where will Huginn run (a single VPS, Kubernetes, a managed platform)? This
   decides how Redis, object storage and Web Push keys are provisioned in Phase 5.
7. **Angular upgrade.** OK to upgrade Angular 16 and NestJS 9 to current releases in Phase 0?
   It's the cheapest moment, before the large Phase 1 build.

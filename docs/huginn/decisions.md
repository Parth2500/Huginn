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
| Unsend window | 15 minutes, the same as edit (sender); unlimited for group admins | Decided 2026-10-21 |
| Archived chats on a new message | Stay archived (setting to change) | WhatsApp |
| Read-receipt privacy | Reciprocal | WhatsApp |
| Group size | 256 at first | WhatsApp started there |
| Group creation | At least 2 others; one person is a direct chat | Clean split between kinds |
| Last-seen visibility | Contacts only | Decided 2026-10-21 |
| Contacts | Anyone you share an accepted chat with; no saved contacts | Decided 2026-10-21 |
| Message requests | A folder like Archived; first messages from strangers go there | Decided 2026-10-21 |

## D10. Out of scope

- video calls
- stories or status updates
- public broadcast channels
- bots (notices from linked homes are not bots and not chat messages: see D15)
- phone-number accounts
- advertising
- server-side reading of messages

---

## D11. Last seen: recorded on the server, pulled when you look

- **Decision:**
  - Going offline is never broadcast.
  - After a 60-second grace period (to ride out network blips and reloads), the server records
    `last_seen_at` once.
  - Contacts fetch it when they open the chat or profile, and only the open chat is watched
    live.
- **Considered:** working it out on the receiver's device, from when it last saw the person
  online, perhaps with a 5-minute check. That idea's aim (no offline broadcast) is kept. Its
  mechanism isn't:
  - A device can only observe while it's online and watching, so devices would disagree.
  - Anyone who was offline would see nothing.
  - Staying accurate would need polling, which costs more than one write at disconnect.
  
  The 5-minute window becomes the 60-second grace period, which serves the same purpose
  (ignoring short drops) without the inaccuracy.

## D12. Search grouped like Microsoft Teams

- **Decision:** one search box, with results in three groups: Contacts, Groups and New people.
  The server provides them, so they're complete even when the chat list is only partly loaded.
- **Why:** it makes clear at a glance who you already know and who's new. That matters more
  now that strangers go to message requests.

## D13. Heimdall later, with a seam now

- **Decision:** don't connect Heimdall until it's ready. In Phase 0, move to cookie sessions and
  put sign-in behind an `AuthProvider` interface. The design for the connection is written
  against Heimdall's current code (architecture.md §2).
- **Why:** it fixes today's `localStorage` token exposure now, and makes the switch a contained
  change.

## D14. Heimdall now, beside passwords, linked only by the owner

- **Decision (2026-10-21):** connect Heimdall now as a second sign-in method. Keep email and
  password. Link a Heimdall identity to an existing account only when that account's owner,
  signed in, asks to. Never match accounts by email. Keep no Heimdall tokens after sign-in.
- **Why:** Heimdall can sign people in, but it has no sign-up and its emails aren't verified.
  Matching by an unverified email would hand someone's chats to whoever claims their address.
  Huginn only needs the identity at sign-in, so storing and refreshing Heimdall's tokens would
  add risk (refresh-token reuse revokes the family) for nothing.
- **Replaces:** the "link by verified email, then remove the password" plan in D13.

## D15. Notices from linked homes, in their own lane

- **Decision (2026-11-14):** Huginn shows *notices* sent by a person's linked home (a Bifröst
  install, from the Asgard suite). A notice has a title, a short text and optional actions, such as
  Approve and Reject. Notices are not chat messages. They live in their own list, outside every
  chat, and are not end-to-end encrypted.
- **How it works:**
  - A home is linked to its admin's Heimdall account. It calls Huginn with a Heimdall access token
    whose audience is Huginn. Huginn finds the recipient by the token's `sub`, through the linked
    Heimdall identity (D14).
  - A home may send a notice only to the account it is linked to, or to a member who linked their
    own account to that home.
  - The home chooses the notice id. When the person picks an action, Huginn stores the choice. The
    home reads it over a connection the home opened. **Huginn never calls a home.**
  - An answer is a choice, never a command. Huginn does not know what Approve means.
- **Why:** it gives the family "your download is ready" and "may this download start?" without
  bots (D10) and without a server that writes into encrypted chats (D3). The home decides what an
  answer means, so a fault in Huginn can only answer a question the home asked.
- **Cost:**
  - A second kind of content, with its own list, badge and notification settings.
  - Notice text is readable by the server. Homes are told to keep it short and free of secrets.
  - Huginn needs an API that accepts access tokens, beside the cookie sessions (D8). The native
    Android app needs the same thing.
  - Rate limits per home, and a way for a person to mute or unlink a home.
- **Would change if:** homes get their own keys in the encryption model. Then notices could be
  encrypted like messages.
- **Source:** suite decisions S7, S9 and S12 in `Asgard/docs/decisions.md`.

## D16. One authority, with the LAN as a later delivery path

- **Decision (2026-11-14):** the Huginn server is the only authority for message order, read marks
  and membership. There is never a second Huginn server in a home. Later, devices in one home may
  pass messages and set up audio calls over the home network when the internet is down, with
  Bifröst as the courier. The message is uploaded when any device is online again, and the server
  gives it its final place.
- **Why:** two servers that accept messages for the same chats must reconcile them. The parts
  that make a courier safe already exist: the local store, the outbox, and `clientMessageId` (D7,
  protocol v1).
- **Works with no internet:** messages in existing chats between devices in the home, audio calls
  between them, and reading stored history.
- **Needs the internet:** first sign-in, linking a device, creating a group or changing its
  members, reaching anyone outside the home, and notifications to a closed app.
- **Cost:** it waits for end-to-end encryption (Phase 2), so the courier carries only ciphertext,
  and for the native app, because a web page cannot reach an address on the home network.
- **Would change if:** never to a second server. The delivery path may be dropped if it proves
  too costly.
- **Source:** suite decision S9.

## Answered (2026-10-21)

1. **Message requests:** yes, as a folder like Archived.
2. **Unsend window:** 15 minutes, the same as edit.
3. **Last seen:** yes, for contacts only. Server-recorded and pulled; see D11.
4. **Contacts:** anyone you share a chat with; no saved contacts. Search is grouped (D12).
5. **Heimdall:** not yet. Design written against its repo; see D13.
6. **Hosting:** not decided. Phase 5 stays hosting-neutral (containers, managed Postgres and
   Redis, S3-compatible storage).
7. **Upgrades:** everything to latest, in Phase 0 (milestone 0.2).

## Open questions

- **Hosting** (when Phase 5 approaches): this decides how Redis, object storage, Web Push
  keys and TLS are provisioned.

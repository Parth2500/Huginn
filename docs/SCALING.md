# Scaling to a million active users

This note covers what breaks first when ChatApp grows from a demo to a million active users, what
is already handled in the code, and what to build next. Numbers come from measurements on this
stack (Postgres 15, a laptop) unless marked as estimates.

**Assumptions:** 1,000,000 daily active users, about 100,000 connected at peak. Each sends about
40 messages a day and searches people a few times a day. Sign-in moves to the separate OIDC
service, so the app only verifies tokens.

## 1. Finding one person among a million

This is the question that prompted the note, so it comes first.

**The problem.** Search matches usernames and display names anywhere in the text (`%query%`). A
plain index cannot answer "contains", so Postgres reads the whole table on every keystroke.

**Measured on 1,000,000 generated users:**

| Query | No search index | With what the API now creates |
|---|---|---|
| Rare fragment, `fox4242` (contains) | 113 ms, parallel scan on 3 cores | 0.29 ms, trigram index |
| One letter, `q` (prefix) | 481 ms | 0.05 ms |
| Common prefix, `maya` (50,000 matches) | 51 ms | 0.04 ms |

At 113 ms of CPU per keystroke, 1,000 people typing at once would keep about 113 cores busy.
After the change each lookup is a short index read.

**What the code does now** (`UserService.search`):

1. **Canonical key.** `usernameKey` holds the lower-case, NFKC-normalised username, stored with
   the byte-order `C` collation. Its unique index can then answer "starts with" queries and
   return them already sorted, with no sort step and no full scan.
2. **Two-step search.**
   - First, names that start with the query, read straight off that index. For common names
     this fills all 8 results and the search stops.
   - Only if fewer than 8 were found, and the query has at least 3 characters, the second
     step runs "contains" through `pg_trgm` GIN indexes on the key and the display name.
3. **Bounded work.**
   - The server returns at most 8 results and caps queries at 50 characters.
   - The client waits 200–250 ms after the last keystroke before searching, and cancels
     requests that have been overtaken.
4. **Privacy.** Search returns only id, username, display name and photo. Emails are not in
   the query at all.

**Next, in order:**

1. **Rate-limit search per user** (for example 10 requests per second) and the unauthenticated
   username check per IP. That stops scraping and username enumeration.
2. **Send search to a read replica,** so it never competes with message writes.
3. **Move search to a dedicated engine** (OpenSearch, Typesense or Meilisearch) once you have
   tens of millions of users, or want typo tolerance ("myaa" finding "maya") or relevance by
   who you already know. Keep it in sync from Postgres with change-data-capture; Postgres
   stays the source of truth.

## 2. Real-time connections

**The problem.** The app ran as one Node process. One process holds tens of thousands of
sockets at best, so 100,000 concurrent sockets need several servers. Before this change, every
message also looked up each recipient's socket id in Postgres (`connected_user`,
`joined_room`). That costs one query per recipient per message, and it can't work across
servers anyway.

**What the code does now:**

- Each socket joins Socket.IO rooms: `user:<id>` for all of a person's tabs, and `chat:<id>`
  for the chat they have open. Delivery is `server.to('chat:42').emit(...)`, with no database
  query per recipient.
- Online status is "does `user:<id>` have any sockets". The old socket-registry tables are
  no longer used (they are cleared at startup).

**Next:**

1. **Add the Socket.IO Redis adapter.** It is a few lines in `main.ts` (`@socket.io/redis-adapter`)
   and no gateway changes, because delivery already goes through rooms. Messages and presence
   then reach users connected to any server.
2. **Use WebSocket-only transport,** or sticky sessions at the load balancer if long-polling
   must stay. Polling without stickiness breaks the handshake once there are several servers.
3. **Move presence to Redis:** a per-user socket count with a heartbeat TTL. With many servers,
   `fetchSockets()` asks every server, which is too slow to call per event.
4. **Close connections gracefully** on deploys, so clients reconnect spread over time instead
   of all at once.

## 3. Presence and profile updates

**The problem.** Presence went to *every* connected user (`server.emit`). With 100,000 people
online, each sign-in or sign-out became 100,000 deliveries, multiplied by the churn of people
coming and going.

**What the code does now.** Presence (`presence`, `presenceBatch`) and profile changes
(`userUpdated`) go only to people who share a chat with that user (`findContactIds`). Typing
indicators go only to the open chat, and the client sends at most one every 2 seconds.

**Next:**

- **Subscribe to presence only for visible chats** (the open chat and the visible rows of the
  list), instead of all contacts.
- **Batch and debounce updates,** and add a "last seen" timestamp rather than live status for
  people with very large contact lists.

## 4. Writing messages

**The load (estimate).** 1,000,000 users × 40 messages ÷ 86,400 seconds ≈ 460 messages per
second on average. Peaks could reach 5–10 times that.

**Where the time goes today.** Each message does five database steps:

1. a membership check
2. the insert
3. bumping the room's activity time
4. reloading the room with its members
5. re-reading activity data for every member's chat list

**What the code does now:**

- An index on `message ("roomId", id DESC)`, so history paging is a short index read.
- Messages are ordered by id (insertion order).
- A per-socket send queue, so one person's messages are stored in the order they were sent.

**Next:**

1. **Cache room membership** (room → member ids) in Redis. That removes steps 1 and 4 from
   every send.
2. **Keep a per-member row for each chat:** last read message id, unread count, last activity.
   This gives server-side unread counts that survive refreshes and other devices, and turns the
   chat list into one indexed query.
3. **Use cursor paging** (`before id`) instead of page numbers for history and the chat list.
   Page numbers read and throw away more rows the deeper you go.
4. **Fan out through a queue** (Redis Streams, NATS or Kafka). The write path stores the
   message and returns; workers deliver it and update chat lists. Big groups no longer slow
   down the sender.
5. **Partition messages** by chat or by month once the table reaches hundreds of millions of
   rows. A wide-column store such as ScyllaDB or Cassandra is the long-term option for message
   history, which is the route large chat services have taken.

## 5. Database operations

- **Turn off `synchronize: true` and use migrations.** Automatic schema sync can drop columns
  on a type change, and it locks big tables on start-up. (The username-key collation change in
  this commit was applied by hand to avoid exactly that.)
- **Pool connections** with PgBouncer in front of Postgres. Many API servers multiplied by pool
  size quickly exceeds Postgres's connection limit.
- **Serve profile and search reads from read replicas.**
- **Back up continuously** with point-in-time recovery, and test restores.

## 6. Profile photos

**What the code does now:**

- The browser crops the photo to a square and resizes it to 320 px WebP before uploading.
- The server accepts at most 512 KB and checks the file's actual bytes (JPEG, PNG or WebP),
  not its name.
- Files get random names and are cached for a week as immutable.
- The previous photo is deleted when it's replaced.

**Next:**

- Store photos in object storage (S3 or GCS) behind a CDN, with signed direct uploads, so the
  API servers never handle the bytes.
- Re-encode on the server to strip EXIF and location data, and scan uploads for abuse.
- Generate a couple of sizes (48 px for lists, 320 px for profiles).

## 7. Abuse, safety and identity

- **Username policy** (`username.policy.ts`):
  - NFKC normalisation and ASCII-only names, which stops look-alike characters such as a
    Cyrillic "а" posing as Latin "a".
  - No runs of separators, so `a..b` can't impersonate `a.b`.
  - Reserved names are checked with separators removed, so `ad.min` is caught.
  - Uniqueness is case-insensitive, by the canonical key.
- **Rate limits** on sign-up, search, the username check, sending and typing.
- **Block and report users**, and let people control who can message them (for example,
  contacts only).
- **OIDC:** when the separate sign-in service connects, use its subject id as the user's
  identity and keep usernames as an app-level handle. Refresh tokens on long-lived sockets
  rather than letting them expire mid-chat.

## 8. Knowing it works

- **Metrics:** connected sockets per server, event-loop lag, time from sending to delivery,
  database query time (p95/p99), Redis latency.
- **Load testing** with k6 or Artillery's Socket.IO engine: a ramp to 100,000 sockets plus a
  realistic message mix, before every major change.
- **Trace a message end to end** (HTTP or socket → database → fan-out), so slow paths show up
  by name.

## Already in this codebase

| Area | Change |
|---|---|
| Search | `C`-collated canonical key, two-step prefix-then-trigram search, 8-result cap, client debounce |
| Real-time | Socket.IO rooms per user and per chat; no database lookup per recipient |
| Presence and profiles | Sent to contacts only; typing limited to the open chat and throttled |
| Messages | `(roomId, id DESC)` index, insertion-order sorting, per-socket ordered sends |
| Photos | Resized in the browser, file contents checked, size-capped, random names, cached |
| Usernames | Normalised, ASCII-only, reserved list, case-insensitive uniqueness |

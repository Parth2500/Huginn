# Android research: how real apps handle it

Notes for later. When the Android epic ([#52](https://github.com/Parth2500/Huginn/issues/52))
gets closer, we will study WhatsApp and Telegram (APKs, with REA) to see how real-world apps
work and how far Huginn is from them. It's not only about looks: the main question is how they
handle so much data.

## What the apps can show (the phone side)

- **Local storage:** how the on-phone database is laid out (tables, indexes), how much history
  stays on the device, and how long chats are paged. REA can inspect SQLite databases.
  Telegram's can be pulled from an emulator; WhatsApp's is encrypted.
- **Sync:** how a device catches up after being offline, what it fetches first, and how it avoids
  downloading everything again. Telegram documents its model publicly (updates and `pts`
  sequence numbers), which is close to Huginn's `seq` design.
- **Media:** thumbnails first, lazy downloads, caching and cleanup, compression before upload.
- **Network behaviour:** how often they talk to the server, batching, and behaviour on a bad
  connection. Packet captures show timing and size only, since the traffic is encrypted.
- **Feel:** send speed, scrolling, offline and reconnect, notification grouping and replies,
  ticks, typing, swipe-to-reply. REA can capture the same flows in each app on an emulator.

## What the APK can't show (the server side)

How they handle billions of messages and millions of connections never ships in the app.
Better sources:

- WhatsApp's talks on Erlang and 2M+ connections per server, and its encryption whitepaper
- Telegram's MTProto and data-centre docs
- Discord's engineering blog on storing trillions of messages (Cassandra, later ScyllaDB)
- Slack's posts on real-time messaging at scale
- The Signal protocol specs, for multi-device and encryption

Compare these with Huginn's Phase 5 plans (Redis adapter, partitioned messages, fan-out queue,
100k-socket load tests). The load tests then measure how close the running system is.

## Ground rules

- **Telegram's Android client is open source** (DrKLO/Telegram, GPL v2). Read the source rather
  than decompiling. Anything copied from it brings the GPL with it.
- **WhatsApp's terms forbid reverse engineering.** Observing it from the outside is fine.
  Treat anything learned from decompiling as background only: no copied code, assets or exact
  designs.

## Output

A gap list. Each item is "have it", "planned (phase N)" or "missing, decide", for both features
and data handling.

## Open question

Which comes first: the phone side (storage, sync, media) or the server side (connections,
message storage, fan-out)?

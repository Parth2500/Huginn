# Huginn

> *Huginn and Muninn fly each day over the wide world.* Odin's raven Huginn ("thought") carries
> word back and forth between the realms. Heimdall guards the gate; Huginn carries the messages.

Huginn is the chat app in this repository (it was called "ChatApp" until Phase 0). Its
sign-in will come from **Heimdall**, the separate OIDC provider. This folder is the design for
turning the current demo into a full chat app, inspired by WhatsApp, Telegram and
Microsoft Teams.

| Document | What it answers |
|---|---|
| [product-spec.md](product-spec.md) | Every feature, how it behaves, its rules and edge cases |
| [ux-design.md](ux-design.md) | Screens, layouts, menus, interactions and states, with wireframes |
| [architecture.md](architecture.md) | Data model, realtime protocol, sync, receipts, notifications, Heimdall, end-to-end encryption |
| [roadmap.md](roadmap.md) | Phases and milestones, what "done" means, and why this order |
| [decisions.md](decisions.md) | The key decisions with their reasons, and the questions still open |
| [../SCALING.md](../SCALING.md) | What breaks at a million users, with measurements |

## The goal

A chat app people could use as their main messenger. Built in two stages:

1. **Showpiece:** complete and polished enough to stand next to WhatsApp Web and Telegram
   Web in a demo, with end-to-end encryption working.
2. **Product:** hardened to run for real users: scale, abuse handling, operations, security
   review.

## Principles

1. **Private by design.** Messages are end-to-end encrypted. The server stores ciphertext
   and the minimum metadata needed to deliver it. People are found by username, never by email
   or phone.
2. **Familiar, not copied.** Use the patterns people already know from WhatsApp, Telegram and
   Teams (chat list, bubbles, ticks, swipe to reply) without imitating any one of them. Huginn
   keeps its own visual system (see `/DESIGN.md`).
3. **Live and reliable.** What you see is true right now: delivery, read state, presence,
   typing. Nothing is lost when the connection drops; it catches up when it returns.
4. **Every state is designed.** Empty, loading, offline, failed, blocked, removed from a group,
   key changed. Each has a deliberate screen and words.
5. **Works on a phone.** Every screen works at phone width and with touch (long-press,
   swipe), as well as on desktop with keyboard shortcuts.

## Phases at a glance

| Phase | Theme | Headline features |
|---|---|---|
| 0 | Foundations | Rename to Huginn, migrations, per-member chat state, reliable sync, tests, Heimdall sign-in |
| 1 | Core messenger | Pin, archive, delete and clear chats, mute, multi-select, self chat, reply, edit, delete/unsend, ticks, block, group admin and members, leave group, browser notifications, settings, search in chat (on the device) |
| 2 | End-to-end encryption | MLS for every chat, device keys, safety codes, encrypted notifications, linked devices, encrypted backup |
| 3 | Media and files | Encrypted photos, files, voice notes, link previews, shared-media tab |
| 4 | Expression | Reactions, forward, saved messages, @mentions, polls |
| 5 | Production | Horizontal scale, abuse and reporting, rate limits, observability, export/delete account, security review |
| 6 | Calls (future) | Audio calls, one-to-one then small groups. No video. |

Search in chat runs on the device from the start (Phase 1), over a local message store.
Once messages are encrypted the server can't search them, so building it there first means
building it once.

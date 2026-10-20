---
version: 1
slug: "ainers-dashboard-dashboard-component-html-b68d670f"
primary_target: "web/src/app/private/containers/dashboard/dashboard.component.html"
related_targets: ["web/src/app/public/containers/login/login.component.html","web/src/app/public/containers/register/register.component.html","web/src/app/private/components/create-room/create-room.component.html"]
---

# Chat app shell (login, register, rooms, room view, create room)

## Scope and mode
Whole Angular frontend in `web/src/app`. Mode: Operate. Phone width is a hard requirement.

## Audience, task, constraints
Reviewers in a short demo: register → log in → create a room with invited users → exchange live messages, often with two windows side by side. Backend facts the UI must respect (updated 2026-10-20, after the API work):
- People search is a username prefix match that leaves out the searcher.
- Joining a room returns the latest 20 messages, and `loadOlderMessages` pages further back.
- `messageAdded` goes to sockets with the room open. `roomActivity` goes to every member's sockets, which drives previews and unread counts.
- Presence and typing are live. Unread counts are per session, not stored.

## Chosen direction
The category standard, played straight: the three-pane chat layout, with Telegram / WhatsApp Web and Discord as the bar for craft. The user chose it on the decision page over the dealt directions.

## Direction contract
THESIS: A conventional messenger, built to the finish of Telegram Web and Discord, where the live socket behaviour is visible: optimistic sends that settle into delivered, arrivals that animate in, and a truthful connection state. It refuses the stock admin-template look: Material cards, centred forms floating on grey, "Name: x Id: y" rows.
OWN-WORLD: White conversation ground on a faint cool tint. Deep slate sidebar. Indigo is reserved for own bubbles, primary actions and selection. Each member keeps a stable hashed avatar colour. Rounded bubbles with grouped corners, one sans UI stack, 1px hairlines, inline SVG icons in one stroke weight.
STORY: The visitor signs in, sees their rooms, opens one and reads a clean history. They send a message and watch it go from pending to delivered, and see the other window's message arrive live. They create a room by finding people by username.
FIRST VIEWPORT: Desktop has a 300px slate sidebar: app name, signed-in user with sign-out, a New room button, the room list (avatar, name, members, date) and a connection status footer. The main pane has a room header (avatar, name, description, member list), the message stream with day dividers and grouped bubbles, and a composer docked at the bottom with the primary send action at its right. On a phone the list and the room are separate screens, with a back control.
FORM: canon (category standard), chosen over the rolled hand; grounded list position n/a; seed:e359218df351da79
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction and motion
A message is sent optimistically: it appears at once with a clock glyph, and settles to a check when the server's `messageAdded` echo matches it. Incoming messages from others rise in over about 240ms with an exponential ease-out. The connection dot in the sidebar footer tracks the socket's `connect` and `disconnect` events. Reduced motion turns all of this into instant state changes.

## Unresolved
Product name stays "ChatApp" (placeholder). No personal attribution in the app yet.

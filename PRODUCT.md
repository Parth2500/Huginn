# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
The primary audience is reviewers of a portfolio: recruiters, hiring managers and other engineers looking at the author's full-stack skills. They usually see the app in a short guided demo, or click through it themselves for a few minutes. Nobody relies on it for day-to-day messaging.

## Product Purpose
A real-time group chat app built as a portfolio and learning demo. It exists to show working full-stack craft end to end: authentication, room management, live socket messaging and a containerised stack. Success means a reviewer can go from register → log in → create a room with invited users → exchange live messages in a few minutes, without confusion or visible rough edges, and leaves with a clear sense of the author's ability.

## Positioning
Its value is that the whole thing actually works: a real backend, real auth, persisted rooms and messages, and live updates between users. It is not a mockup. It does not claim to be a product that competes with Slack or Discord.

## Operating Context
- Typical session: a scripted or self-guided walkthrough, often with two browser windows or accounts side by side to show live delivery.
- Runs locally through `docker-compose.yml`: `web` (Angular dev server on :4200), `api` (NestJS on :3000), Postgres and pgAdmin.
- Reviewers may open it on a phone as well as a laptop.

## Capabilities and Constraints
- Frontend: Angular 16 (hand-built UI, see below), `ngx-socket-io`, `@auth0/angular-jwt`. Backend: NestJS, Socket.IO gateway, TypeORM/Postgres, JWT auth.
- Public module: login, and registration with password-strength and confirm-password validation.
- Private module (behind the auth guard): a Telegram/WhatsApp-style messenger.
  - **Direct chats:** search a username (sidebar search or the start screen) and pick the person to open a draft chat. The chat is created by the first message, and only then appears in the other person's list. Picking someone you already talk to reopens that chat.
  - **Groups:** "New group" is the only creation flow, for three or more people (you plus at least two). Members see a new group immediately.
  - **Chat list:** previews, activity time, per-session unread counts, ordered by latest activity.
  - **Chat view:** live messages, typing indicator, online presence, and "load earlier messages".
- **Profiles:** photo, display name, @username, bio and join date.
  - Click any name or photo in a chat to open that person's profile panel (with "Message").
  - Your own profile is edited from the account bar (`/private/profile`).
  - Display names show wherever names appear; @usernames are the unique handle.
- **Username policy** (`api/src/user/username.policy.ts`, mirrored in the app):
  - NFKC-normalised; 3–24 ASCII characters; must start with a letter, then letters, digits, `.` or `_`.
  - No `..`, `__`, `._`, `_.` runs, and no trailing separator.
  - A reserved-name list, checked with separators removed.
  - Unique case-insensitively via `usernameKey`, with a live availability check while typing.
- **Scale:** see `docs/SCALING.md`. Search is index-only (measured under 1 ms on 1,000,000 users), delivery uses Socket.IO rooms, and presence goes to contacts only.
- **Sign-in** will move to a separate OIDC project; email and password here are temporary.
- **Privacy:** people are identified by username only. Emails are never sent to anyone but their owner. There is no user listing and no email lookup, and accounts can only be changed or deleted by their owner.
- API (NestJS + Socket.IO, changed on 2026-10-20 at the user's request):
  - Fixed: the rooms query used `users.id` instead of `Id`, which dropped every socket connection.
  - Fixed: room paging counted member rows, not rooms.
  - Added: username search, matching anywhere and ranking prefixes first (`GET /api/users/search?q=`); direct chats (`openDirect`, `sendDirectMessage`, `directRoomCreated`; room `type` + unique `directKey`); membership checks on every room event, message length limits, per-socket ordered sends, room activity bumps, previews, presence, typing, older-message paging, `roomCreated` and `unauthorized` events.
  - Usernames are unique regardless of case (letters, numbers, `. _ -`, up to 24 characters). Emails are compared in lower case.
- Unread counts live in the client for the session; they are not stored on the server.
- Terminology in the code: "room" / "chatroom", "message", "user" (username, email).
- **Constraint:** layouts must work at phone width. This is a real requirement.
- The UI is hand-built: plain Angular templates, a token-based global stylesheet and inline SVG icons. Angular Material was removed from the templates on 2026-10-20 with the user's approval. The packages are still in package.json. Do not build a separate component library.
- Undecided: whether the author wants any personal attribution or links to the portfolio inside the app.

## Brand Commitments
- Name: **Huginn** (chosen 2026-10-20), after Odin's messenger raven. Its sign-in will come from the separate OIDC provider **Heimdall**. Renamed from "ChatApp" in Phase 0 (2026-10-21).
- Goal (chosen 2026-10-20): a feature-complete showpiece first, then hardened into a real product. Priorities: end-to-end encryption first, then media; reactions are nice to have; audio-only calls in the far future (no video).
- Standing preference (chosen 2026-10-20): the app follows the category-standard messenger layout, not a themed world. Its quality bar is Telegram / WhatsApp Web and Discord. It must still not read as a Slack or Discord clone, a stock template, or something too plain.

## Evidence on Hand
- The working app itself is the evidence: source in `web/` and `api/`, with unit tests for services and components.
- There are no screenshots, users, testimonials, metrics or deployment claims. Future work must not make these up, for example fake user counts or "trusted by" copy.

## Product Principles
1. **The demo path is the product.** Register → create room → chat must be obvious and flawless. Polish that path before anything else.
2. **Show that it is live.** Real-time delivery, presence and timestamps are the impressive part, so make them visible and legible instead of hiding them.
3. **Credible over flashy.** Reviewers judge engineering quality. A calm, precise, well-built interface beats decoration that looks like a template.
4. **Every state is seen.** In a demo, empty, loading, error and validation states all come up. Each one should look intentional.
5. **Phone-width is first-class.** Every screen must hold up on a phone as well as on a laptop.

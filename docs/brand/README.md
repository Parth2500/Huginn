# Huginn

The well-kept messenger. Huginn is a private, real-time chat app (direct chats, groups, profiles, presence and typing) built to the finish of Telegram Web and Discord, with sign-in from Heimdall. This system is condensed from the app's `DESIGN.md` and adds the new logo.

## Logo

**The carved raven.** Huginn ("thought") is one of Odin's two ravens, who fly over the world each day and bring the news back. The mark is a raven's head cut in flat facets, like a Norse wood carving, facing right toward the conversation. What makes it a raven and not any bird: the heavy bill with an arched ridge, the flat crown, the small eye, and the shaggy throat hackles. It deliberately avoids the speech-bubble shape that every messenger uses.

| File | Use |
|---|---|
| `huginn-mark.svg` | Default. Favicon, app icon, rail head, auth showcase. White raven on `indigo`; the carved facet on the nape is `#c7d2fe` (the night value of `indigo-ink`, which reads as a soft plane on indigo). |
| `huginn-mark-night.svg` | Dark contexts outside the app (see Night below). Raven in `indigo-ink`'s night value on `indigo-wash`'s night value, facet `#a5b4fc`. |
| `huginn-raven.svg` | The raven alone, in `indigo`, on light surfaces where a tile would be too heavy. |
| `huginn-raven-mono.svg` | One ink (`ink`, #0f172a), eye cut out. Print, embossing, single-colour contexts. |

- **Tile:** a 64-unit square at radius 18, which is the 32px logo tile at `radius-logo` (9px). The tile is part of the mark: the app draws the SVG itself (`app-logo`), never an icon on a CSS square.
- **Minimum size:** 16px for the tile. At 16px the bill and the gape line merge into the head, which is fine; never redraw a simplified mark.
- **Lockup:** tile, then the word "Huginn" in Figtree 700, letter-spacing -0.02em, with a gap of half the tile's width (16px beside the 32px tile). The name is capitalised everywhere, as it is in the product.
- **Clear space:** a quarter of the tile on every side.
- **Night:** the app shows the default mark in both themes. The indigo tile holds up on slate and on night surfaces, where the night tile (#1f1d4d on #121b2d) would nearly vanish. The night mark is for dark contexts outside the app, such as a dark app icon or a dark slide.
- **Never** recolour the raven outside indigo, white, `ink` or the night pair, put it inside a speech bubble, add a gradient or shadow, or flip it to face left.

## Content fundamentals

Messenger copy is short, plain and in sentence case. A person appears by display name first, with "@username" only as a muted second line. Status reads as a full sentence ("maya is online", "2 of 4 others online", "Offline, retrying"). Times are 24-hour and tabular.

## Colour

Cool slate neutrals, one indigo accent and eight member tones. Every role has a Light and a Night value.

- **The One Accent Rule.** `indigo` means "yours" or "act here": own bubbles, primary buttons, send, the active room row, unread badges, links, focus and selection. It is never decoration, a heading or incoming text. Hover deepens to `indigo-deep`.
- **Washes.** `indigo-wash` is the 3px focus halo and the empty-state icon tile; `indigo-ink` is the glyph or text on it, and the typing line.
- **The Two Grounds Rule.** `slate-rail` is for the sidebar and things that float over the app (toasts, the auth showcase). The conversation sits on `conversation-tint` and `surface`. Never put conversation content on slate.
- **Status.** `danger` on `danger-wash`, `success`, `warning`. `online` colours the presence dot only, never text.
- **The Stable Tone Rule.** `tone-0-brick` to `tone-7-ember` fill avatars behind white initials, chosen by id mod 8 or an FNV-1a hash of the name. Never hand-pick a tone or reuse indigo as one. In light mode the sender-name text equals the fill (Ochre darkens to #92400e); at night it lifts to the 300-weight tint of the hue.

## Typography

One family, Figtree (self-hosted, variable 300 to 900). Hierarchy comes from weight (400, 600, 700) and size, never a second typeface, uppercase labels or tracked small caps.

- `display` 700 for the auth pitch only; `headline` 28px for auth titles; `title` 16px 700 for pane headers.
- `body` 15px for base text, `message` 15px at 1.4 for bubbles, `label` 14px 600 for labels and buttons, `caption` 13px for previews and hints, `meta` 11px tabular for bubble times.

## Layout

A 300px slate rail beside a flexible detail pane at 100dvh. Bars are 64px with a 1px `hairline` beneath. The stream and composer are centred to an 820px measure. A run from one sender sits `space-hair` (2px) apart; a new sender opens with `space-xs`. Phone (767px and below) splits the rail and the room into separate screens.

## Shape and depth

- Controls, rows, alerts and toasts use `radius-m` (10px); inner items `radius-s`; panels `radius-l`; the composer `radius-composer`; chips, badges and dividers `radius-pill`; avatars and send `radius-round`.
- **Bubbles** use `radius-bubble` (18px), tightening to 6px where a run joins and to `radius-bubble-tail` (4px) at the run's end.
- Close to flat. `shadow-rest` lifts bubbles off the dot grid; `shadow-float` is only for things above the stream (**The Float Only Rule**). `scrim` dims behind the profile drawer.

## Iconography

Inline SVG on a 24px grid, 2px round stroke, drawn at 14 to 20px, coloured by the text they sit with. Never emoji or text glyphs.

## Do and don't

- Do keep the three-pane messenger grammar and design every screen at phone width.
- Do show live state truthfully: pending clock, delivered check, presence, typing, unread, connection.
- Do set `--ring` on any surface that hosts an avatar with presence.
- Don't use Material cards, centred forms on grey, or "Name: x" label rows.
- Don't add a second typeface or a second accent colour.

## Not synced

Taken from `Parth2500/Huginn` at `redesign/messenger-ui@3ec2cd5` (`DESIGN.md`, fonts). Not included yet:

- **Components** (no bundle built): buttons, inputs, people search, chat search, room rail rows, message bubble, history edge, room header, connection status, avatars, profile drawer, profile editor, toasts, empty and loading states, start-chat guide. Their rules are summarised above and in full in `DESIGN.md`.
- `display` is fluid in the app (`clamp(28px, 2.6vw, 38px)`); it is stored here at its largest step, 38px.
- The night sender-name tints and the rail status tints (#86efac, #fcd34d, #fca5a5) are text values in `DESIGN.md`, not tokens.
- `radius-logo` is a token here; the app draws the tile inside the SVG (rx 18 of 64), so there is no CSS variable for it.

The logo is in the app since `brand/raven-logo`: the rail head, the auth showcase and the favicon (`web/public/favicon.svg`, and `favicon.ico` at 16, 32 and 48px rendered from it).

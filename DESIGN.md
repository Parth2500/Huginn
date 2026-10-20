---
name: ChatApp
description: A conventional three-pane messenger built to the finish of Telegram Web and Discord, with live socket state on show.
colors:
  conversation-tint: "#eef1f6"
  conversation-dot: "rgba(71, 85, 105, 0.09)"
  surface: "#ffffff"
  surface-raised: "#f6f7fb"
  ink: "#0f172a"
  ink-muted: "#475569"
  hairline: "#e2e8f0"
  hairline-strong: "#cbd5e1"
  indigo: "#4f46e5"
  indigo-deep: "#4338ca"
  indigo-wash: "#eef2ff"
  indigo-ink: "#3730a3"
  on-indigo: "#ffffff"
  on-indigo-muted: "#e0e7ff"
  slate-rail: "#1e293b"
  slate-rail-raised: "#273449"
  slate-rail-line: "#334155"
  slate-rail-text: "#f1f5f9"
  slate-rail-text-muted: "#a7b4c7"
  danger: "#b91c1c"
  danger-wash: "#fef2f2"
  online: "#16a34a"
  link: "#4f46e5"
  success: "#15803d"
  warning: "#b45309"
  night-ground: "#0b1220"
  night-surface: "#121b2d"
  night-surface-raised: "#18233a"
  night-ink: "#e8ecf3"
  night-ink-muted: "#a3afc2"
  night-hairline: "#243049"
  night-hairline-strong: "#36445f"
  night-indigo-wash: "#1f1d4d"
  night-indigo-ink: "#c7d2fe"
  night-rail: "#0f1727"
  night-rail-raised: "#1a2438"
  night-danger: "#f87171"
  night-success: "#4ade80"
  night-warning: "#fbbf24"
  tone-0-brick: "#b91c1c"
  tone-1-teal: "#0f766e"
  tone-2-ochre: "#a16207"
  tone-3-violet: "#7e22ce"
  tone-4-green: "#15803d"
  tone-5-rose: "#be185d"
  tone-6-sky: "#0369a1"
  tone-7-ember: "#c2410c"
typography:
  display:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(28px, 2.6vw, 38px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  message:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.3
  caption:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  meta:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "\"tnum\" 1"
rounded:
  bubble-tail: "4px"
  s: "6px"
  m: "10px"
  l: "16px"
  bubble: "18px"
  composer: "22px"
  pill: "99px"
  round: "50%"
spacing:
  hair: "2px"
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  xxl: "32px"
  xxxl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.on-indigo}"
    typography: "{typography.label}"
    rounded: "{rounded.m}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "0 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-raised}"
  button-block:
    width: "100%"
    height: "44px"
  icon-button:
    rounded: "{rounded.m}"
    size: "40px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "0 14px"
    height: "44px"
  people-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "0 14px"
    height: "44px"
  people-search-option:
    textColor: "{colors.ink}"
    rounded: "{rounded.s}"
    padding: "8px 10px"
  people-search-option-active:
    backgroundColor: "{colors.indigo-wash}"
  composer:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.message}"
    rounded: "{rounded.composer}"
    padding: "11px 14px"
    height: "44px"
  send-button:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.on-indigo}"
    rounded: "{rounded.round}"
    size: "44px"
  bubble-incoming:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.message}"
    rounded: "{rounded.bubble}"
    padding: "7px 12px 8px"
  bubble-own:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.on-indigo}"
    typography: "{typography.message}"
    rounded: "{rounded.bubble}"
    padding: "7px 12px 8px"
  room-row:
    textColor: "{colors.slate-rail-text}"
    rounded: "{rounded.m}"
    padding: "10px"
  room-row-hover:
    backgroundColor: "{colors.slate-rail-raised}"
  room-row-active:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.on-indigo}"
  unread-badge:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.on-indigo}"
    rounded: "{rounded.pill}"
    padding: "0 6px"
    height: "20px"
  unread-badge-on-active:
    backgroundColor: "{colors.on-indigo}"
    textColor: "{colors.indigo-ink}"
  new-room-button:
    backgroundColor: "{colors.slate-rail-raised}"
    textColor: "{colors.slate-rail-text}"
    rounded: "{rounded.m}"
    padding: "0 14px 0 10px"
    height: "36px"
  avatar:
    textColor: "{colors.on-indigo}"
    rounded: "{rounded.round}"
    size: "40px"
  avatar-sm:
    size: "32px"
  avatar-xs:
    size: "24px"
  presence-dot:
    backgroundColor: "{colors.online}"
    rounded: "{rounded.round}"
    size: "34%"
  chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "32px"
  day-divider:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "3px 12px"
  load-earlier-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "32px"
  load-earlier-button-hover:
    backgroundColor: "{colors.surface-raised}"
  step-number:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.round}"
    size: "24px"
  tip-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.m}"
    padding: "12px 14px"
  toast:
    backgroundColor: "{colors.slate-rail}"
    textColor: "{colors.slate-rail-text}"
    rounded: "{rounded.m}"
    padding: "6px 6px 6px 14px"
  form-alert:
    backgroundColor: "{colors.danger-wash}"
    textColor: "{colors.danger}"
    rounded: "{rounded.m}"
    padding: "12px 14px"
---

# Design System: ChatApp

## Overview

**Creative North Star: "The Well-Kept Messenger"**

ChatApp is the category-standard messenger played straight: a deep slate room rail on the left, a pale conversation pane on the right, the composer docked at the bottom. The bar is the finish of Telegram Web, WhatsApp Web and Discord. Nothing about the layout is novel on purpose. The craft is in the details a reviewer notices without being told: bubbles whose corners tighten where a run of messages joins, a stable colour per person, a send that settles from pending to delivered, a green presence dot on whoever is online, "is typing" in the header, and a connection state that tells the truth.

The system is calm and dense in the way messengers are dense. One sans family (Figtree, self-hosted) carries every role. Colour does work: indigo marks what is yours or what you can act on, and the eight member tones tell people apart. Everything else is slate neutrals and 1px hairlines. Depth is close to flat, with soft ambient shadows only on things that float over the stream.

The build rejects the stock admin-template look: Material cards, centred forms floating on grey, and "Name: x Id: y" rows. Light and dark schemes are both first-class and follow the OS unless the user picks one.

**Key Characteristics:**
- Three-pane messenger grammar: 300px slate rail, conversation pane, docked composer; phone collapses to list and room as separate screens.
- Indigo is the single accent, reserved for own bubbles, primary actions and selection.
- Eight stable hashed member tones for avatars and sender names.
- Grouped bubble corners (18px outer, 6px joint, 4px tail).
- One Figtree stack, 1px hairlines, inline 2px-stroke SVG icons on a 24px grid.
- Live state is visible: optimistic pending, delivered check, arrival motion, presence dots, typing, unread counts, connection state.

## Colors

Cool slate neutrals with one indigo accent and an eight-hue member palette; every role has a light and a night value.

### Primary
- **Signal Indigo** (`indigo`): own message bubbles, primary buttons, the send button, the active room row, the "New room" button when its screen is open, unread badges, links, focus outlines, text selection and the caret. Hover deepens to **Indigo Deep** (`indigo-deep`).
- **Indigo Wash** (`indigo-wash`, night `night-indigo-wash`): the 3px focus halo around fields, the tile behind empty-state icons and the highlighted option in people search, with **Indigo Ink** (`indigo-ink`, night `night-indigo-ink`) for the glyph or text sitting on it. Indigo Ink also carries live activity text on light surfaces: the header typing line, the search result action label ("Message", "Add") and the tip card icon.
- **On Indigo** (`on-indigo`) for text on the accent, and **On Indigo Muted** (`on-indigo-muted`) for timestamps, ticks and member lines inside indigo.

### Neutral
- **Conversation Tint** (`conversation-tint`, night `night-ground`): the conversation pane ground, overlaid with an 18px dot grid in **Conversation Dot**.
- **Surface** (`surface`, night `night-surface`): room header, composer bar, incoming bubbles, the auth form panel, create-room body.
- **Surface Raised** (`surface-raised`, night `night-surface-raised`): the composer field at rest, chips, secondary button hover, disabled send.
- **Ink** (`ink`) and **Ink Muted** (`ink-muted`): primary text and every secondary line (descriptions, placeholders, timestamps, hints).
- **Hairline** (`hairline`) and **Hairline Strong** (`hairline-strong`): 1px borders. Hairline separates panes and bars; Hairline Strong outlines fields and secondary buttons.
- **Slate Rail** (`slate-rail`, night `night-rail`): the sidebar, the auth showcase panel and toasts. **Slate Rail Raised** for hovered rows and nested panels, **Slate Rail Line** for rail hairlines, **Slate Rail Text** and **Slate Rail Text Muted** for text on slate.

### Status
- **Danger** (`danger` on `danger-wash`), **Success** (`success`), **Warning** (`warning`), each with a brighter night value. Used for field errors, form alerts, password rules met, the offline banner, and the composer counter at its limit (danger).
- **Online** (`online`): the presence dot only, one value in both schemes. It never colours text; presence in words ("Online", "is online") stays in muted ink.
- **Rail status tints**: on the always-dark rail footer the connection line is coloured by state with the 300-weight tints already used for night member names: green #86efac (online), amber #fcd34d (connecting), red #fca5a5 (offline).

### Member Tones
- Eight tones, ordered so consecutive ids land on distant hues: Brick, Teal, Ochre, Violet, Green, Rose, Sky, Ember (`tone-0-brick` through `tone-7-ember`). The tone fills the avatar behind white initials. A paired text value colours the sender name on bubbles; in light mode it equals the fill (Ochre darkens to #92400e for contrast), and in night mode it lifts to the 300-weight tint of the same hue (for example #fca5a5 for Brick).

### Named Rules
**The One Accent Rule.** Indigo means "yours" or "act here": own bubbles, primary actions, selection, focus, unread counts, links. It is never used for decoration, headings or incoming message text; a link inside an incoming bubble is an action and is the one indigo mark there.

**The Stable Tone Rule.** A person or room keeps one tone everywhere, derived from its numeric id (id mod 8) or an FNV-1a hash of the name. Never pick a tone by hand or by position in a list.

**The Two Grounds Rule.** Slate is for the rail and things that float above the app (toasts, the auth showcase). The conversation and its controls sit on light surfaces. Do not put conversation content on slate.

## Typography

**Display Font:** Figtree (with system-ui, -apple-system, Segoe UI, sans-serif)
**Body Font:** Figtree (same stack)

**Character:** One friendly, slightly rounded geometric sans used at every size. Hierarchy comes from weight (400, 600, 700) and size, never from a second family.

### Hierarchy
- **Display** (700, clamp 28-38px, 1.15, -0.02em): the pitch headline on the auth showcase only.
- **Headline** (700, 28px, 1.2, -0.02em): auth form titles. The start-chat heading steps down to 22px at -0.01em, 1.25.
- **Title** (700, 16px, 1.3): room and create-room header titles, empty-stream titles.
- **Body** (400, 15px, 1.5): base text everywhere. Room names in the rail and people-search names are body at 600.
- **Message** (400, 15px, 1.4): bubble text, preserves line breaks and wraps anywhere.
- **Label** (600, 14px): field labels, button text at 14-15px, the New room button. Sender names on bubbles are 13px at 700 in the member tone.
- **Caption** (400, 13px, 1.4): room-row previews, the room header status line, search sub-lines and status, descriptions, field hints and errors, the tip card. The typing line is caption at 500 in Indigo Ink. Day dividers, history notes, section counts, room-row activity times and the composer hint and counter use 12px; unread badges are 12px at 700.
- **Meta** (400, 11px, 1, tabular numerals): timestamps inside bubbles.

### Named Rules
**The Weight Not Family Rule.** Build hierarchy with Figtree's 400 / 600 / 700 weights and the sizes above. No second typeface, no uppercase labels, no tracked-out small caps.

**The Tabular Time Rule.** Every `time` element and every count (unread badges, the composer counter, pager, section count) uses tabular numerals so numbers do not jitter. Times are 24-hour (HH:mm) in bubbles and in room rows alike; earlier days read "Yesterday" or a short date in the rail, and a bubble time carries the full date ("Tuesday 20 October 2026, 14:05") as its title.

## Layout

Desktop is a two-column grid: a fixed 300px slate rail and a flexible detail pane filling 100dvh, each scrolling independently. Bars (rail head, room header, create-room header) are 64px tall with a 1px hairline beneath. The message stream and composer are centred to a 820px measure inside the pane, so long lines stay readable on wide screens; messages bottom-align when the history is short.

Incoming messages leave 15% free on the right and own messages 15% on the left (8% on phones), so the two sides never meet. A run of consecutive messages from one sender sits 2px apart, and a new sender opens with 8px. Day dividers are sticky pills 8px from the top of the stream.

Spacing works on a 4px base with frequent 2, 6, 10 and 14px half-steps inside controls (see `spacing` tokens). Pane padding is 20px desktop, 10-12px on phones. Forms stack fields 20-24px apart with 6px between label and control, inside a 400px (auth) or 560px (create room) measure.

With no room open, the detail pane shows the start-chat guide: a 480px column centred in the pane with 14px between its parts, padded 40px by 24px. In a two-person room the partner's avatar stands in for the room avatar, in the rail and in the room header, and the header drops the member stack.

Breakpoints: at 767px and below the rail and the room become separate screens with a back control in the room header, the member stack and composer hint hide, and toasts move to the bottom. A phone with no rooms yet shows one screen instead: the rail head, the start-chat guide (top-aligned, padded 24px by 16px), then the account bar. From 768px to 1023px the header avatar stack shows two avatars plus the "+n" overflow. The auth split (5fr slate showcase, 7fr form) collapses to a single form column at 900px. Safe-area insets pad the composer and the rail footer.

## Elevation & Depth

Close to flat. Structure comes from tonal grounds (slate rail, tinted conversation pane, white bars) and 1px hairlines. Two soft, cool shadows exist and both are ambient, not structural.

### Shadow Vocabulary
- **Rest lift** (`box-shadow: 0 1px 2px rgba(15,23,42,0.07), 0 1px 1px rgba(15,23,42,0.04)`; night `0 1px 2px rgba(0,0,0,0.4)`): bubbles and day-divider pills, just enough to lift them off the dot grid.
- **Float** (`box-shadow: 0 12px 32px -8px rgba(15,23,42,0.22), 0 2px 6px rgba(15,23,42,0.06)`; night stronger black): elements that hover over content: toasts, the jump-to-latest pill, the user search results dropdown.

### Named Rules
**The Float Only Rule.** Only things that sit above the stream or the page get the Float shadow. Panes, bars, cards and forms stay flat and are separated by hairlines.

## Shapes

Softly rounded rectangles with a few precise exceptions. Controls, rows, alerts and toasts use 10px; small inner items (dropdown options, skeleton lines) use 6px; larger panels and empty-state boxes use 16px. Avatars, presence dots, step numbers and the send button are circles; chips, day dividers, counts, unread badges, the "Load earlier messages" button and the jump pill are full pills. The composer field is a 22px capsule. The logo tile is a 32px square at 9px.

Bubbles have their own geometry: 18px corners, with the corner on the sender's side tightening to 6px where it joins the next or previous message in a run and to 4px at the run's final bubble, forming a tail. Own bubbles mirror this on the right.

Borders are always 1px. Dashed hairlines mark empty placeholders (the empty room list).

## Components

### Buttons
Quiet, solid and compact.
- **Shape:** gently rounded (10px), 40px tall, 44px when full-width.
- **Primary:** indigo fill, white 600-weight text, 16px side padding, optional 18px leading icon with 8px gap.
- **Secondary:** white surface with a strong hairline, ink text; hover fills with the raised surface.
- **Hover / Focus:** 120ms colour transition; focus is a 2px indigo outline offset 2px. Disabled drops to 50% opacity.
- **Icon button:** 40px square, transparent, 20px icon; hover fills with 10% of the current text colour so it works on both slate and white.
- **Send button:** 44px indigo circle at the composer's right; presses down to 92% scale; disabled turns raised-surface grey.

### Chips
- **Style:** 32px pill, raised surface, 1px hairline, 14px 500 text, with an xs avatar leading.
- **State:** removable chips carry a 26px circular remove button that fills with hairline on hover. Your own chip comes first with a muted "(you)" and no remove button.
- **Entry:** a new chip scales in from 94% over 200ms on the ease-out curve.

### Inputs / Fields
- **Style:** 44px tall, 10px radius, white surface, strong hairline, 14px side padding, placeholder in muted ink.
- **Focus:** border turns indigo and a 3px indigo-wash halo appears outside it.
- **Error:** border turns danger, the halo turns danger-wash, and a 13px error line with a 15px icon sits below.
- **Composer:** a 22px capsule on the raised surface that grows from 44px to 160px, turning white on focus with the same indigo halo. Below it a 12px hint row; past 1800 characters a tabular "n / 2000" counter appears at its right and turns danger at 600 when the 2000 limit is reached.

### People Search (combobox)
- **Field:** the input shape (44px, 10px radius, strong hairline) with an 18px search icon leading at 10px gap and a spinner trailing while searching; focus moves to the wrapper (indigo border, indigo-wash halo).
- **Results:** a 4px-padded list on the surface with a hairline border, 10px radius and the Float shadow, dropping in 4px over 200ms, capped at 296px. Options are 8px 10px rows at 6px radius: an sm avatar with presence, the 600 username, and a 13px muted sub-line reading "Online" or the email. The highlighted option (arrow keys or pointer) fills Indigo Wash and reveals a 13px 600 Indigo Ink action label with a 16px icon ("Message" in start chat, "Add" in room creation).
- **Status:** a 13px muted live line under the field narrates idle hint, searching, count found, no match and error in full sentences.

### Navigation (room rail)
- **Style:** slate rail with the brand and New room button in a 64px head, a muted 13px section title with a pill count, the room list, a pager, and a darker footer holding the signed-in user and connection state.
- **Rows:** avatar, then two lines: the 600-weight name with a 12px muted activity time at its right, and a 13px muted preview ("You: …" or "name: …", or "No messages yet · members") with the unread badge at its right. 10px padding, 10px radius, 2px gaps. Hover fills with Slate Rail Raised; the active room fills indigo and its time and preview turn On Indigo Muted. A newly created room slides in and flashes indigo-tinted over 2.4s.
- **Unread:** a 20px indigo pill badge (capped at "99+") and emphasis by brightness, not weight: the name goes white and the preview lifts to Slate Rail Text. On the active row the badge inverts to white with Indigo Ink text at its light value (#3730a3) in both schemes; the night build currently inherits the pale night Indigo Ink there, which is a defect, not the rule.
- **Direct rooms:** a two-person room shows the partner's avatar with presence instead of the room initials.
- **Mobile:** the rail is the whole screen; opening a room replaces it and shows a back control.

### Message Bubble (signature)
- Incoming bubbles are white with ink text and a 13px sender name in the member tone on the first message of a run. Own bubbles are indigo with white text.
- An 11px timestamp floats onto the last line when there is room, followed by a 14px state icon: a clock while pending (bubble at 85% opacity) and a check once the server echo matches.
- A send the server has not confirmed in time shows an alert icon in pale amber (#fde68a) instead of the clock. The time's title carries the full date.
- Links in message text are underlined at 500 weight with a 2px offset and wrap anywhere: the Link colour (`--link`: indigo by day, `#a5b4fc` at night) in incoming bubbles and everywhere else, On Indigo in own bubbles. The night value keeps links above 4.5:1 on night surfaces.
- Arrivals rise 10px and scale from 98% over 280ms on the ease-out curve; reduced motion makes it instant.

### History Edge
- At the top of a truncated history sits a 32px pill button, "Load earlier messages" (surface, strong hairline, 13px 600, raised on hover, spinner while loading), beside a 12px muted "n of m shown". Once the full history is loaded the edge is a 12px muted note: "This is the start of [room]."

### Room Header
- 64px surface bar: avatar (the partner's, with presence, in a two-person room), a 16px 700 title, and one 13px muted status line that joins the description with presence ("maya is online", "2 of 4 others online", "5 members").
- **Typing:** while someone types, the status line is replaced by three 5px dots bobbing 2px in a 1.2s stagger and "maya is typing…" (or "a and b are typing…", "3 people are typing…"), 500 weight in Indigo Ink.
- **Members:** up to three sm avatars with presence, 6px apart, then a raised "+n".

### Connection Status
- In the rail footer the signed-in user's sm avatar carries the presence dot while connected, and a 12px line under the username reads "Online", "Connecting…" or "Offline, retrying" in the rail status tints. When not connected, an amber-tinted banner sits above the composer.

### Avatars
- Circles at 40, 32 and 24px with white 700-weight initials (two letters, letters only) on the member tone. Room header stacks show overflow as a raised-surface "+n" avatar.
- **Presence:** an online person's avatar carries an Online dot at its bottom right, 34% of the avatar (at least 9px), with a 2px ring.

**The Ring Matches Ground Rule.** The presence dot's ring is the colour of whatever the avatar sits on, set through `--ring` by the host: slate rail, raised slate on hover, indigo on the active row, the darker footer, the white header. Any new surface that shows presence sets its ring, including its hover and active states.

### Toasts
- Slate panel, 10px radius, Float shadow, 18px leading icon (green for success, rose for error), 32px dismiss button. Top right under the header on desktop, bottom full-width on phones.

### Empty and Loading States
- Empty states centre a 48-56px indigo-wash icon tile, a title, a muted line and, where useful, a primary button. Loading uses pulsing skeletons at 10% of the current colour, shaped like the content they replace (bubble-shaped in the stream, row-shaped in the rail).
- **Start chat (empty detail pane):** a left-aligned guide rather than a centred card: a 52px icon tile at 16px radius, the 22px heading ("Start your first chat" or "Pick a room, or start a new chat"), a muted lede held to 46ch, the people search, then three numbered steps below a hairline (24px circles with a strong hairline and 12px 700 numerals, 14px muted text with the key phrase in 600 ink), and a tip card (surface, hairline, 10px radius, 13px muted text with a 16px Indigo Ink icon). On wide screens the rail's empty state drops its button because this pane carries the action.

## Do's and Don'ts

### Do:
- **Do** keep the three-pane messenger grammar: 300px slate rail, conversation pane with 64px header, composer docked at the bottom.
- **Do** reserve indigo for own bubbles, primary actions, selection and focus.
- **Do** colour every person through the tone pipe so their avatar and sender name match everywhere.
- **Do** use the grouped bubble corners (18px, 6px joint, 4px tail) for any message-like element, including previews.
- **Do** use inline SVG icons on the 24px grid with a 2px round stroke, sized 14-20px.
- **Do** show live state truthfully: pending clock, delivered check, presence dots, typing line, unread badges, connection status, offline banner.
- **Do** design every screen at phone width first-class, with safe-area insets on docked bars.
- **Do** set `--ring` on any surface that hosts an avatar with presence, for every state of that surface.
- **Do** keep times 24-hour (HH:mm) and tabular wherever they appear.
- **Do** honour prefers-reduced-motion by collapsing animation and transition to instant.

### Don't:
- **Don't** use Material cards, centred forms floating on grey, or "Name: x Id: y" label rows.
- **Don't** introduce a second typeface or a second accent colour.
- **Don't** put a shadow on panes, bars or forms; only floating elements get the Float shadow.
- **Don't** hand-pick member colours or reuse indigo as a member tone.
- **Don't** use emoji or text glyphs as icons.

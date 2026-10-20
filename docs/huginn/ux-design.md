# Huginn UX design

How each feature in [product-spec.md](product-spec.md) looks and behaves on screen. The visual
system (colour, type, spacing, components) is in `/DESIGN.md`, and this document only adds what
those features need. Wireframes are schematic: they show structure and order, not exact sizes.

**Surface mode:** Operate. People come here to get something done (read, reply, find a chat), so
familiar patterns win over novelty. Huginn's character lives in precise details: the ticks,
arrival motion, presence, and the calm slate-and-indigo palette.

---

## 1. Layout and navigation

### 1.1 Desktop (768px and wider)

```
┌──────────────── 300px ────────────────┬───────────────────────── fluid ──────────────────────────┬── 360px ──┐
│ [H] Huginn          [✎ New] [⋯]       │ (avatar) Sam Rivera              [🔍] [📞*] [⋯]           │  Chat     │
│ ┌─ Search people and chats ────────┐  │          @sam.rivera · online                             │  info     │
│ └──────────────────────────────────┘  ├──────────────────────────────────────────────────────────┤  drawer   │
│ [All] [Unread] [Groups]               │                     ── Today ──                           │ (opens on │
│ ▸ Archived · 3                        │  (S) Morning! Staging is back.          09:12             │  demand)  │
│ 📌 Notes to self                       │                 Great, tagging now. 09:14 ✓✓            │           │
│ 📌 Launch crew          14:02  [2]    │  ── 3 unread messages ──                                  │           │
│    Sam Rivera           13:55  ✓✓     │  (S) …                                                    │           │
│    Message requests · 1               │                                                           │           │
│                                       ├──────────────────────────────────────────────────────────┤           │
│ (me) maya.test · Online   [⚙] [⇥]     │ [＋] Message Sam Rivera…                         [➤]      │           │
└───────────────────────────────────────┴──────────────────────────────────────────────────────────┴───────────┘
                                                                                     * calls arrive in Phase 6
```

- **The rail** (left) is for navigation and finding things. Top to bottom:
  - the Huginn mark, *New chat* (✎), and the overflow menu (⋯)
  - search
  - filter chips
  - the Archived row
  - the chat list
  - message requests, as the last row when there are any
  - the account bar
- **The conversation pane** (middle) is for reading and writing.
- **The drawer** (right) shows chat info, profiles, message info and search results. It slides
  over the pane on screens narrower than 1280px, and sits beside it at 1280px and wider.
- **New chat (✎)** opens a small menu: *New message* focuses search, and *New group* opens
  the group form.
- **Overflow (⋯)** holds *Select chats*, *Archived*, *Saved messages* (Phase 4) and *Settings*.

### 1.2 Phone (below 768px)

- Three stacked screens: **list → chat → info**. Each pushes on top of the last, and the back
  arrow pops it.
- Long-press a chat row or a message to enter selection mode, which shows an action bar.
- Swipe a chat row left to **Archive**, or right for **Pin / Mute**. Swipe a message right to
  **Reply**.
- The composer stays docked above the keyboard, respecting the safe area.

### 1.3 Keyboard (desktop)

| Keys | Action |
|---|---|
| Ctrl/⌘ K | Focus search |
| Ctrl/⌘ N | New message |
| Alt ↑ / Alt ↓ | Previous / next chat |
| Ctrl/⌘ F | Search in this chat |
| ↑ in an empty composer | Edit your last message |
| Esc | Close the drawer, then cancel a reply or edit, then leave selection mode |
| Ctrl/⌘ Shift M | Mute or unmute this chat |

Every shortcut has a visible mouse or touch alternative. *Settings → Chats → Keyboard
shortcuts* shows this list.

---

## 2. Chat list

### 2.1 Row anatomy

```
(avatar●)  Name or group                         time
           [✓✓] preview text that truncates…   [🔕] [@] [3]
```

- **Avatar:** the photo, or initials on the person's colour. A green dot on direct chats means
  online. Groups show the group photo or its initials.
- **Name:** semibold. **Time:** muted, tabular figures, 24-hour clock.
- **Preview:**
  - "You: …" with the tick state on your own last message
  - the text alone in a direct chat; "Maya: …" in a group
  - "Draft: …" in accent ink when you have unsent text
  - "Sam is typing…" in accent ink while someone types (replaces the preview briefly)
- **Badges, right-aligned:**
  - mute icon
  - @ for a mention (Phase 4)
  - unread count: accent when the chat is unmuted, grey when muted
  - a plain dot for "marked as unread"
- **Pinned** chats show a small pin icon beside the time.
- **States:** hover (raised slate), selected or open (accent fill), keyboard focus (ring),
  unread (name and preview at full contrast), muted (count grey).

### 2.2 Row menu

Opens by right-click, the chevron that appears on hover, or a long-press on a phone. It's a
menu, not a dialog.

```
Pin chat              (Unpin chat)
Mute notifications ▸  8 hours · 1 week · Always   (Unmute)
Mark as unread        (Mark as read)
Archive chat          (Unarchive)
───────────
Clear chat…
Block @sam…           (direct chats only)
Exit group…           (groups only)
Delete chat…
```

Items ending in "…" open a confirmation. Destructive items use danger ink and sit below a
divider.

### 2.3 Selection mode

```
┌ ✕  3 selected ──────────────────────────── [Select all] ┐
│ ☑ (avatar) Launch crew …                                 │
│ ☐ (avatar) Sam Rivera …                                  │
└ [Archive]  [Mute ▾]  [Mark as read]  [Pin]  [Delete] ───┘
```

- The header becomes "✕ 3 selected". Rows get checkboxes, and clicking a row toggles it
  instead of opening it.
- The bar is docked at the bottom of the rail, or the screen on a phone. Actions that don't
  apply to the selection are disabled, with a tooltip that explains why ("Pin: limit of 5
  reached").

### 2.4 Archived view

- It replaces the list, with a header "← Archived" and the explainer "Archived chats stay
  here when new messages arrive. Change this in Settings." It uses the same rows, menus and
  selection as the main list.
- Empty state: "No archived chats. Archive a chat to keep your list tidy without leaving it."

### 2.5 Message requests view

- Each request shows the sender's profile card (photo, names, "Not in your contacts") and a
  preview of their first message, behind a "Show message" tap.
- Actions: **Accept**, **Delete**, **Block**. Accepting moves the chat to the main list.

### 2.6 Empty and loading states

- **Loading:** skeleton rows (built).
- **No chats:** the start-chat guide (built), now with "or write in *Notes to self*".
- **Search with no results:** "No chats or people match '…'".
- **Offline:** an amber strip under the search box: "Offline. Messages will send when you're
  back online."

---

## 3. Conversation pane

### 3.1 Header

```
(avatar●)  Sam Rivera                                  [🔍] [📞] [⋯]
           @sam.rivera · last seen today at 14:02
```

- Clicking the identity (avatar and name) opens **Chat info** in the drawer.
- The subtitle line:
  - **direct chat:** "online", "last seen …" or "typing…"
  - **group:** "Maya, Sam, Tess and 4 others" or "Sam is typing…"
  - **blocked:** "Blocked"
  - **left or removed:** "You're no longer in this group"
- **🔍** opens in-chat search (§3.8). **⋯** opens a menu:
  - *Chat info* and *Search*
  - *Select messages*
  - *Mute* (with its submenu)
  - *Clear chat…*
  - *Block…* (direct) or *Exit group…* (group)
  - *Delete chat…*

### 3.2 Bubbles

- Grouped runs of bubbles (built), and the sender's name on the first bubble in groups (built).
- **Meta**, inside the bubble at the bottom right: "edited" (if edited), the time, and the
  tick state (own messages).
- **Ticks** (own messages; drawn icons, never glyphs):
  - *Sending:* a clock.
  - *Sent:* one check.
  - *Delivered:* two checks.
  - *Read:* two checks in **sky** (`#7dd3fc`), which reads clearly on the indigo bubble
    (about 3.6:1 as an icon) and stays distinct from delivered (pale indigo).
  - *Failed:* an alert icon in danger ink. Its tooltip explains why, and tapping it opens
    Retry / Delete.
- **Reply quote**, inside the bubble at the top:

```
┌────────────────────────────────┐
│ ┃Maya                          │   ← sender name in their tone, on a tinted inset
│ ┃Staging is back after the…    │     (fill, not a thick coloured border)
│ That's great news!     14:05 ✓✓│
└────────────────────────────────┘
```

  The inset is a slightly darker or lighter wash of the bubble, with a 2px tone mark. Clicking
  it jumps to the original.
- **Tombstone:** italic muted text with a ban icon. "You deleted this message", "This message
  was deleted", or "Deleted by an admin". It has no menu apart from *Delete for me*.
- **System line:** centred, 13px muted, on a small pill like the day dividers. Never a bubble.

### 3.3 Message actions

- **Desktop:** hovering a bubble shows a small action pill beside it: *Reply*, *React* (Phase 4),
  and ⋯. The ⋯ menu has:
  - *Reply*, *Copy text*, *Edit* (own, within 15 minutes), *Info* (own)
  - *Forward* (Phase 4), *Select*, *Pin* (Phase 4)
  - *Delete…*
- **Phone:** long-press selects the message and shows an action sheet with the same items.
  Swipe right to reply, with a haptic tick.
- **Delete dialog:**

```
Delete message?
( ) Delete for me
(•) Delete for everyone        ← only if allowed; explains "within 48 hours of sending"
                 [Cancel]  [Delete]
```

### 3.4 Composer

```
┌ ┃Replying to Maya · "Staging is back after…"            ✕ ┐   ← reply strip (or "Editing message")
│ [＋]  Message Launch crew…                       [😊*] [➤] │   * emoji in Phase 4; ＋ attach in Phase 3
└───────────────────────────────────────────────────────────┘
```

- Enter sends and Shift+Enter adds a line (built). The setting can swap them.
- **Editing:** the strip says "Editing message", the text loads into the field, and the send
  button becomes ✓. Esc cancels.
- **Blocked:** the composer is replaced by "You blocked Sam Rivera · Unblock".
- **Removed or left:** "You're no longer a member of this group."
- **Announcements group, as a member:** "Only admins can send messages."
- **Request not yet accepted (the sender's side):** the composer still works, with a quiet note
  "Sam hasn't accepted your message request yet."

### 3.5 Unread divider and jumping

- A full-width hairline with a centred pill: "3 unread messages". The view opens scrolled so
  the divider sits a third of the way down.
- Jumping to a quoted or searched message scrolls there and flashes the bubble's background
  once (600ms, about 25% accent). With reduced motion, it's a static highlight that fades.

### 3.6 Message info (drawer)

- Shows the message itself at the top, then:
  - **Read by:** avatar, name, time
  - **Delivered to:** the same
  - **Waiting:** people it hasn't reached yet
- In direct chats it's just two timestamps: "Delivered 14:05", "Read 14:07".

### 3.7 Draft chats (built)

- "Say hi to Sam" with a large avatar. Unchanged, except a self chat says "Notes to self. Only
  you can see this."

### 3.8 Search in chat

```
┌ 🔍 [ deploy                      ] 3 of 17  [↑] [↓]  ✕ ┐   ← replaces the header
```

- Matches are highlighted in the stream: an accent wash on the matched words, and a stronger
  wash on the current match.
- The drawer lists the results (avatar, name, date, snippet with the match in bold). Clicking a
  result jumps there.
- **States:**
  - "Searching…"
  - "No messages match 'deploy'"
  - "Showing results from messages on this device · Search older messages", which loads more
    history

---

## 4. Drawer screens

### 4.1 Direct chat info

```
        (  photo  )
        Sam Rivera
        @sam.rivera · online
   [Message*]  [🔍 Search]  [🔕 Mute]          * only when opened outside the chat
 ─────────────────────────────
  Bio            Backend engineer…
  Joined         October 2026
  Encryption     Verified ✓ / View security code   (Phase 2)
 ─────────────────────────────
  Media, links and files ›                         (Phase 3)
  Groups in common ›                               (2)
 ─────────────────────────────
  Clear chat…
  Block @sam…            ← danger ink
  Delete chat…           ← danger ink
```

### 4.2 Group info

```
        (  group photo  ✎ )
        Launch crew  ✎
        Group · 7 members
   [＋ Add]   [🔍 Search]   [🔕 Mute]
 ─────────────────────────────
  Description    Shipping the 0.4 line ✎
  Created        by Maya · 12 Oct 2026
 ─────────────────────────────
  Members (7)                        [🔍]
  (me) You                      Owner
  (S)  Sam Rivera ●             Admin    [⋯]
  (T)  Tess                              [⋯]
  …
 ─────────────────────────────
  Group settings ›          (owner only)
  Media, links and files ›  (Phase 3)
 ─────────────────────────────
  Clear chat…
  Leave group…           ← danger ink
  Delete group…          ← owner only, danger ink
```

- The pencil (✎) appears only for people allowed to edit. Editing happens in place: the field
  becomes an input with *Save* and *Cancel*.
- **Member ⋯ menu**, with only the items you're allowed:
  - *Message* and *View profile*
  - *Make admin* or *Dismiss as admin*
  - *Remove from group…*
- **Role badges** are small muted labels, not coloured chips: "Owner", "Admin".

### 4.3 Group settings

- Three radio groups, each with a one-line explanation of who it affects:
  - *Who can edit group info*
  - *Who can add members*
  - *Who can send messages*
- Saving posts a system message: "Maya changed who can send messages to Only admins."

### 4.4 Add members

- People search with checkboxes, and chosen people as removable chips above (built pattern).
- Disabled rows give a reason: "Already in this group", or "Only lets contacts add them".
- The confirm button says how many: **Add 2 people**.

### 4.5 Leave group (owner)

- A dialog: "You're the owner. Choose who takes over before you leave." It shows a
  member picker, preselected with the longest-standing admin, and *Leave and transfer*.

---

## 5. Notifications

### 5.1 Permission banner

```
┌ 🔔 Get notified about new messages.   [Turn on]   [Not now] ┐   ← top of the rail, slate-2 fill
```

- Shown once, after the user's first chat activity. *Not now* hides it for 7 days, and two
  dismissals hide it for good. If permission is later denied, *Settings → Notifications* shows
  "Notifications are blocked in your browser" with steps for this browser.

### 5.2 The notification itself

- Title: the chat name (and the sender in groups). Body: the preview, or "New message", or
  "3 new messages". Icon: the sender's photo, or the Huginn mark.
- One notification per chat (it replaces the previous one). Clicking focuses Huginn and opens
  the chat.

### 5.3 In-app

- No toasts for new messages. The chat list badge, the row moving to the top and the tab title
  already say it.
- Toasts are kept for confirmations such as "Chat archived · Undo". Archive, mute, pin and
  delete-for-me offer **Undo** for 5 seconds instead of asking first.

---

## 6. Settings

- A full pane, like the profile editor. On the left, a section list (Profile, Privacy,
  Notifications, Chats, Appearance, Devices and security, Account), and the section on the
  right. On a phone the sections stack.
- **Controls:**
  - switches for on/off settings
  - radio groups for Everyone / Contacts / Nobody
  - a select for durations
- Changes save immediately, with a quiet "Saved" tick beside the control. No Save button,
  except in Profile, which has several fields at once.
- **Blocked people:** rows with an avatar, name and **Unblock**. Empty state: "You haven't
  blocked anyone."

---

## 7. Encryption surfaces (Phase 2)

- **The chat notice** is the first system line in every chat: "🔒 Messages are end-to-end
  encrypted. No one outside this chat, not even Huginn, can read them. *Learn more*"
- **Security code** (in chat info, then Encryption): 12 groups of 5 digits, a QR code,
  *Scan to verify*, and *Mark as verified*. Verified contacts get a shield on their profile
  and in chat info.
- **Key change** posts a system line, "Sam's security code changed. *Verify*", with a neutral
  shield-alert icon. It's never alarming red, since it usually just means a new device.
- **Linking a device:** the new browser shows "Approve this device from a device you already
  use", with a QR code and a short code. The existing device shows "New device wants to
  link · Chrome on Linux · near Ahmedabad (approximate)" with **Approve** and **Deny**.
- **Backup** offers to turn on encrypted backup, then shows a 64-character recovery key once,
  with *Copy* and *Download*. The user must confirm "I've saved my recovery key" before it
  finishes.

---

## 8. Design system additions

All of these follow `/DESIGN.md`: tokens, the One Accent rule, and the Float Only rule (shadow
only on things that float over content).

| Component | Notes |
|---|---|
| Menu | Floating list. 8px padding, 36px rows, icons on the left, shortcut hints muted on the right. Danger items below a divider. Keyboard: arrows, Enter, Esc, type-ahead. |
| Submenu | Opens to the side on hover or →. On a phone, a second sheet. |
| Dialog | Only for destructive or blocking choices. Title, one sentence of consequence, then the actions: primary on the right and danger-coloured when it deletes. Focus is trapped, and Esc means Cancel. |
| Action sheet (phone) | Bottom sheet with large rows and a drag handle; tapping outside closes it. |
| Switch | 36×20 track, accent when on, with a visible focus ring. The label is clickable. |
| Radio group | Stacked rows with label and helper text. The selected row has an accent ring on the dot. |
| Checkbox | 18px with a 4px radius and an accent fill when checked. Used in selection mode and multi-pick. |
| Chip filter | Pill. Selected is accent-soft fill with accent ink; unselected is a slate outline. |
| Badge | Count pill. Accent (unread), grey (muted unread), dot (marked unread), @ (mention). |
| Tick icons | clock, check, check-check, check-check (read, sky), alert. All 14px, drawn on the 24px grid. |
| Banner | A full-width strip inside a pane: info (slate-2) or warning (amber tint). Optional action and dismiss. |
| Snackbar with Undo | The existing toast with an action button and a 5-second countdown. Countdowns respect reduced motion. |
| Highlight flash | A background wash for jump-to-message: 600ms ease-out, static under reduced motion. |
| Skeleton list | Already built; reused for members, search results and message info. |

**New icons** (same stroke set):

- pin, archive, bell-off, reply, pencil, trash, ban
- check-check, more-horizontal, settings, shield, shield-check, lock, qr
- paperclip, image, mic, phone (Phase 6), smile (Phase 4)

---

## 9. Accessibility

- Every action is reachable by keyboard.
  - Menus and dialogs follow the WAI-ARIA patterns.
  - Selection mode supports Space to toggle, and Shift+click or Shift+↑↓ for ranges.
- The message stream is a `log` region. New messages are announced politely, only when the
  chat is open and the user is near the bottom.
- Ticks have text equivalents ("sent", "delivered", "read by Sam"), and so do tombstones.
- Colour never carries meaning alone. Read ticks also differ in the "Info" text, and muted
  chats have an icon.
- Swipe gestures always have a menu equivalent.
- Contrast is at least 4.5:1 for text and 3:1 for icons and focus rings, in both themes.

## 10. Words

- Use plain verbs on actions: *Archive chat*, *Mute notifications*, *Delete for everyone*.
- Confirmations name the result, not the mechanism: "Your copy of these messages will be
  removed. Sam keeps theirs."
- No exclamation marks in system text, and no blame in errors.
- Never reveal a block: a blocked sender sees an ordinary single tick, with no error and no
  "you've been blocked" text.

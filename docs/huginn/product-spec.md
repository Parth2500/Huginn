# Huginn product specification

What every feature does, for whom, and the rules that decide edge cases. The UX document shows
what each one looks like; the architecture document shows how it works under the hood.

**Terms**

- **Chat:** any conversation. A chat is one of three kinds:
  - **Self chat:** just you, your notes to self.
  - **Direct chat:** you and one other person.
  - **Group:** three or more people, with a name.
- **Member:** a person in a chat. Each member has their own *chat state* (pinned, archived,
  muted, cleared, last read), which only they see.
- **Contact:** anyone you share a chat with (an accepted one, not a pending request). Huginn
  has no phone book and no saved-contacts list.
- **Device:** a signed-in browser or app. One person can have several.

Phase numbers refer to [roadmap.md](roadmap.md).

---

## 1. Chat list

### 1.1 Order and sections (Phase 1)

- Pinned chats come first, in the order you pinned them (you can drag to reorder). Everything
  else follows, newest activity first.
- Two folder rows sit above the list when they have something in them:
  - **Message requests · 2**, with an accent dot when there's a new request
  - **Archived · 3**
  Each opens its own view with the same rows, menus and selection as the main list.
- The self chat is pinned automatically the first time you use it, but you can unpin it.
- Each row shows:
  - avatar, name, and the time of the last activity
  - a preview of the last message: "You: …" for your own (with its tick), the plain text in a
    direct chat, "Maya: …" in a group
  - "Draft: …" in place of the preview when you have unsent text, shown in accent ink
  - an unread count, a muted icon, and an @ marker when you were mentioned (Phase 4)

### 1.2 Pin (Phase 1)

- Up to **5** pinned chats, plus the self chat, which doesn't count towards the limit. A sixth
  pin is refused with: "You can pin up to 5 chats. Unpin one to pin this."
- Pins sync across your devices. Pinning an archived chat unarchives it.

### 1.3 Archive (Phase 1)

- Archiving moves a chat out of the main list into **Archived**. The chat stays complete:
  you're still a member and still receive messages.
- **Rule:** an archived chat stays archived when new messages arrive. Unread counts show on the
  Archived row only, and archived chats never notify unless you were @mentioned. A setting,
  *Settings → Chats → Keep chats archived* (on by default), turns this off. When it's off, a new
  message brings the chat back to the main list, as Telegram does.
- **Unarchive** puts the chat back in the main list, in activity order.

### 1.4 Delete chat (Phase 1)

- **Direct or self chat:** removes it from your list and clears your copy of the history. The
  other person keeps theirs. If they send a new message, the chat comes back with only that
  message.
- **Group:** you have to leave first (see 4.7). After leaving, *Delete group* removes it from
  your list. The owner can also *Delete group for everyone* (see 4.8).
- Always confirmed in a dialog: "Delete chat with Sam Rivera? Your copy of these messages will
  be removed. Sam keeps theirs."

### 1.5 Clear chat (Phase 1)

- Removes every message in the chat **for you only** and keeps the chat in your list. Other
  members are unaffected.
- Pinned messages (Phase 4) and media are cleared for you as well. Confirmed in a dialog.

### 1.6 Mute (Phase 1)

- Mute any chat for **8 hours, 1 week, or Always**. Muted chats don't notify. Their unread
  count shows grey instead of accent, and a bell-off icon appears on the row.
- In groups, @mentions and replies to your messages still notify you, unless you turn that off
  under *Settings → Notifications*.
- Mute ends automatically when its time runs out. You can also unmute from the row menu or
  the chat info page.

### 1.7 Mark as read / unread (Phase 1)

- **Mark as read** clears the badge without opening the chat, and sends read receipts if you
  have them enabled.
- **Mark as unread** shows a dot badge until you next open the chat. It doesn't change what
  others see.

### 1.8 Multi-select (Phase 1)

- Enter it with *Select chats* in the list menu, a long-press on a phone, or Ctrl/⌘+click on
  desktop.
- Each row shows a checkbox, and a bar at the bottom shows the count with bulk actions:
  **Archive** (or Unarchive), **Mute**, **Mark as read**, **Pin** (only if it stays within the
  limit), and **Delete**.
- Bulk delete asks once: "Delete 4 chats?" Groups in the selection are listed as "You'll
  leave and delete 1 group."
- Esc, the × button, or ending up with no chats selected leaves selection mode.

### 1.9 Filters (Phase 1, small)

- Chips above the list: **All · Unread · Groups**.
- The Unread filter keeps a chat visible for the moment you open it, so the list doesn't jump
  under your cursor.

---

## 2. Starting chats

### 2.1 Search people and chats (built; regrouped in Phase 1)

One search box, with results grouped like Microsoft Teams:

| Group | What's in it | Picking one |
|---|---|---|
| **Contacts** | People you already share a chat with, matched on display name or username | Opens your direct chat with them |
| **Groups** | Your groups, matched on the group name or a member's name | Opens the group |
| **New people** | Everyone else, matched on display name or username | Opens a draft (see below) |

- Each group shows at most 5 results, with "Show all" to expand it.
- Contacts and groups come from the server, so the results are complete even when your chat
  list hasn't loaded every page.
- Only display names and usernames are shown, never emails.
- The **draft:** picking a new person opens a chat that becomes real on your first message, and
  only then appears on their side (or in their message requests, see 2.3).

### 2.2 Self chat, "Notes to self" (Phase 1)

- A private chat with only you, for notes, links and drafts. It's in search as "Notes to self"
  and pinned automatically the first time you use it.
- It has no ticks, no typing indicator and no presence. It syncs to all your devices, and in
  Phase 2 it's encrypted to your devices only.

### 2.3 Message requests (Phase 1)

- Anyone can find you by username. So the first message from someone you share no chat with
  lands in the **Message requests** folder, which works like Archived (a folder row above the
  list). Requests don't notify you and don't send read receipts.
- Opening a request shows the sender's profile card and their messages. You can:
  - **Accept:** the chat moves to your main list, and you become contacts.
  - **Delete:** it's removed. They aren't told.
  - **Block:** it's removed and they're blocked.
- Until you accept, they see their messages as delivered but not read, and they can't see
  your presence or last seen. You replying also counts as accepting.
- Groups you're added to never go to requests. Who can add you is controlled by
  *Settings → Privacy → Who can add me to groups*.

### 2.4 New group (built; extended in Phase 1)

- A name, an optional photo and description, and at least two other people. You become the
  **owner**.
- Members see the group straight away, with a system message: "Maya created the group."
- Only people who allow it can be added. See *Settings → Privacy → Who can add me to groups*.

---

## 3. Messages

### 3.1 Sending and ticks (Phase 1)

Each of your messages shows one state:

| State | Shown as | Meaning |
|---|---|---|
| Sending | clock | Not yet accepted by the server (offline, or in flight) |
| Sent | ✓ | The server stored it |
| Delivered | ✓✓ | It reached at least one device of the recipient. In a group, it reached every member. |
| Read | ✓✓ in the read colour | The recipient had the chat open and visible. In a group, every member has read it. |
| Failed | ! | The server refused it, e.g. you're blocked or were removed. "Not sent. Tap to see why." |

- **Message info** (on your own messages) lists, per member, when it was delivered and read.
- **Privacy:** turning off read receipts (*Settings → Privacy*) stops you sending them *and*
  stops you seeing other people's, as in WhatsApp. Groups always show "read by N of M" in
  message info, but not who has receipts turned off.
- Messages sent while offline wait in the outbox and go out in order when the connection
  returns.

### 3.2 Reply (Phase 1)

- Reply from the message menu, by swiping right on a phone, or by double-clicking on
  desktop. A quote of the original appears above the composer, with × to cancel.
- The sent message shows the quoted sender and a two-line excerpt (or "Photo" or "File" in
  Phase 3). Clicking the quote jumps to the original, loading older history if needed, and
  highlights it briefly.
- If the original is later deleted, the quote shows "Original message deleted". If you cleared
  your history, it shows "Original message not available".

### 3.3 Edit (Phase 1)

- You can edit your own text messages for **15 minutes** after sending. Choose *Edit* from the
  menu, or press ↑ in an empty composer to edit your last message.
- Edited messages show "edited" next to the time. Earlier versions aren't kept or shown.
- Editing doesn't notify anyone again. Previews in the chat list update.

### 3.4 Delete and unsend (Phase 1)

- **Delete for me:** hides the message on your devices only. Works on any message, any time.
- **Delete for everyone (unsend):** removes it for everyone, leaving a tombstone that says
  "You deleted this message" or "This message was deleted".
  - The sender can do this for **15 minutes** after sending, the same window as editing.
  - In groups, admins can delete anyone's message for everyone, at any time. The tombstone
    then says "Deleted by an admin".
- Both work on several messages at once (see 3.6) and are confirmed when there's more than one.
- Under encryption (Phase 2), unsend is an encrypted instruction. Devices remove the content,
  and the server deletes the stored ciphertext.

### 3.5 Copy and message info (Phase 1)

- **Copy text** is in the message menu. **Info** appears on your own messages (see 3.1).

### 3.6 Select messages (Phase 1)

- *Select messages* in the chat menu, or a long-press on a phone, turns on checkboxes for
  messages. The bar offers **Copy**, **Delete** (for me, or for everyone if every selected
  message is yours and less than 15 minutes old) and **Forward** (Phase 4).

### 3.7 Unread divider and jumping (Phase 1)

- Opening a chat with unread messages scrolls to the first unread one, under a "3 unread
  messages" divider. The divider stays until you leave the chat.
- The jump-to-latest pill (built) shows the number of new messages that arrived while you were
  scrolled up.

### 3.8 Drafts (Phase 1)

- Unsent text is kept per chat, on the device, and survives a reload. The chat list shows it as
  "Draft: …". Drafts sync across devices in Phase 2.

### 3.9 Search in chat (Phase 1, on the device)

- The search button in a chat's header opens a search field. It finds messages containing
  the words, newest first, and shows "3 of 17" with ↑/↓ to step through matches. Each result
  jumps to its message and highlights the match.
- Search runs **on your device**, over the messages stored on it. It works offline, and it
  keeps working unchanged once messages are encrypted.
  - "Search older messages" downloads further history first, and says so.
  - Clear chat and delete-for-me also remove those messages from the device's search.

### 3.10 System messages (Phase 1)

- Centred, quiet lines for changes in the chat, for example:
  - "Maya created the group" and "Maya added Sam"
  - "Chris left" and "Maya removed Tess"
  - "Maya changed the group name to Launch crew"
  - "Maya made Sam an admin"
  - "Messages are end-to-end encrypted" (Phase 2) and "Sam's security code changed" (Phase 2)
- They can't be replied to or deleted.

### 3.11 Formatting (Phase 1, small)

- Links are clickable (built). Line breaks are kept (built).
- Simple markers: `*bold*`, `_italic_`, `~strike~` and `` `code` ``, rendered but never
  turned into HTML. A full markdown editor is out of scope.

---

## 4. Groups

### 4.1 Roles (Phase 1)

| Role | Count | Can |
|---|---|---|
| Owner | exactly 1 | Everything an admin can do, plus promote and demote admins, transfer ownership, change group settings, and delete the group for everyone |
| Admin | any | Edit group info, add and remove members (not other admins), and delete anyone's messages for everyone |
| Member | any | Send messages, leave. Edit group info and add members only if group settings allow it |

**Group settings** (owner only):

- *Who can edit group info:* all members, or only admins (the default).
- *Who can add members:* all members, or only admins (the default).
- *Who can send messages:* all members (the default), or only admins, which turns the group
  into an announcements group.

### 4.2 Group info page (Phase 1)

- Open it by clicking the group's name or photo in the header, or *Group info* in the menu.
- It shows:
  - photo, name and description, each editable if you're allowed
  - "Group · 7 members" and "Created by Maya, 12 Oct 2026"
  - actions: **Add members**, **Search**, **Mute**
  - **Members:** you first, then the owner, then admins, then everyone else alphabetically.
    Each row has a role badge and online dot, and the list is searchable once it has more
    than 10 people.
  - (Phase 3) a **Media, links and files** tab
  - **Group settings:** owner only
  - the danger zone: **Clear chat**, **Leave group**, and **Delete group** (owner)

### 4.3 Edit group info (Phase 1)

- Name: 1–60 characters, required. Description: up to 500 characters. Photo: same rules as
  profile photos.
- Each change posts a system message and updates everyone's list immediately.

### 4.4 Add members (Phase 1)

- Use the same people search, and pick several at once. People already in the group are shown
  as "Already in this group".
- People whose privacy settings block being added can't be selected: "Maya only lets contacts
  add her to groups."
- New members see history from the moment they join only. Under encryption that's inherent;
  before it, it's enforced by the server to match.

### 4.5 Remove members (Phase 1)

- From the member's menu: *Remove from group*, with a confirmation.
- The removed person keeps the chat, read-only, with "You were removed by Maya". They can
  delete it.

### 4.6 Promote and demote (Phase 1)

- The owner can *Make admin* or *Dismiss as admin* from any member's menu. Each change posts a
  system message.

### 4.7 Leave group (Phase 1)

- Anyone can leave, after a confirmation. The group posts "Chris left", and the chat stays
  read-only for you until you delete it.
- **The owner leaving:** they must choose a new owner first. If they leave without choosing,
  ownership passes to the longest-standing admin, or failing that the longest-standing member.
  The last member to leave deletes the group.

### 4.8 Delete group for everyone (Phase 1)

- Owner only, with a two-step confirmation that requires typing the group name.
- Every member's copy becomes read-only with "This group was deleted by Maya", and its history
  is removed from the server.

### 4.9 Invite links (Phase 4)

- Admins can create a link that anyone signed in can use to join, and can revoke it, set it to
  expire, or require approval. The link shows a preview card: name, photo and member count.

### 4.10 Size

- Up to **256 members** at first. Encryption (MLS) supports much larger groups; the limit can
  rise to 1,000 or more after load testing.

---

## 5. People and safety

### 5.1 Profiles (built)

- Photo, display name, @username, bio, join date and presence. Clicking any name or photo
  opens the profile. Emails are never shown to others.

### 5.2 Block (Phase 1)

- From a profile, a direct chat's menu, a message request, or a member's row: **Block @sam**,
  with a confirmation that explains what changes:
  - They can't message you. Their messages show only one tick on their side and are never
    delivered.
  - They can't see your presence, last seen, photo changes, or typing. They see your profile
    as it was when you blocked them.
  - They can't add you to groups. In groups you share, both of you still see each other's
    messages (you can mute the group).
  - They aren't told they've been blocked.
- The chat stays in your list with a bar where the composer was: "You blocked Sam Rivera.
  Unblock".
- *Settings → Privacy → Blocked people* lists everyone you've blocked, with Unblock.

### 5.3 Report (Phase 5)

- *Report* on a message, a profile or a group, with a reason. Reporting sends the selected
  messages, decrypted on your device, to moderators. That's the only way moderators ever see
  message content.

### 5.4 Privacy settings (Phase 1)

| Setting | Options | Default |
|---|---|---|
| Last seen and online | Everyone · Contacts · Nobody | Contacts |
| Profile photo | Everyone · Contacts · Nobody | Everyone |
| Read receipts | On · Off (reciprocal) | On |
| Who can add me to groups | Everyone · Contacts | Contacts |
| Message requests | On (strangers go to requests) · Off | On |

- **Rule:** if you hide your last seen from someone, you can't see theirs either.
- "Last seen today at 14:02" appears in the direct chat header and the profile, and becomes
  "online" while they're connected. It's only visible to contacts (people you share a chat
  with).
- **How it's worked out** (see [architecture.md §6.1](architecture.md#61-presence-and-last-seen)):
  - Going offline is never broadcast. Your contacts only learn your last seen when they look
    (opening your chat or profile).
  - A short drop in connection (under a minute) doesn't count as going offline, so switching
    networks doesn't flicker your status.

---

## 6. Notifications

### 6.1 Browser notifications (Phase 1)

- **Asking for permission:** never on page load. After your first chat, a slim banner offers
  "Get notified about new messages · Turn on". Choosing it shows the browser's prompt.
  - If you decline, the banner offers a short "How to allow notifications" note, then goes away.
  - *Settings → Notifications* always shows the current state and a button to try again.
- **Delivery:**
  - With Huginn open but in a background tab, notifications use the Notification API.
  - With Huginn closed, they use **Web Push** through a service worker.
  - Either way, one notification per chat replaces the last ("Sam Rivera · 3 new messages").
  - Clicking a notification opens that chat.
- **Content:** the sender, chat name and message preview. *Settings → Notifications → Show
  preview* (on by default) switches to "New message". Under encryption (Phase 2), the preview
  is decrypted on your device by the service worker; the server never sees it.
- **Never notify** for:
  - the chat you're looking at
  - muted and archived chats (except mentions, if allowed)
  - message requests
  - your own messages sent from another device
- **Sounds:** a short, quiet sound on new messages, on by default, with an off switch. No
  sound for the chat you're looking at.
- The tab title count (built) and the app badge (installed PWA) show total unread, not counting
  muted chats.

### 6.2 Notification settings (Phase 1)

- Master switch, preview on/off, sounds on/off.
- *Group notifications:* all messages, or only @mentions and replies.
- *Mentions break through mute:* on/off.
- *Do not disturb*, until a chosen time. Phase 4: scheduled quiet hours.

---

## 7. Settings (Phase 1)

| Section | Contents |
|---|---|
| Profile | Photo, display name, username, bio (built) |
| Privacy | The table in 5.4, plus Blocked people |
| Notifications | 6.2, plus permission status |
| Chats | Enter to send (on), Keep chats archived (on), font size (small/default/large) |
| Appearance | Theme: system, light, dark |
| Devices and security (Phase 2) | Linked devices, your security code, encrypted backup, sign out other devices |
| Account | "Sign-in is managed by Heimdall" with a link; export my data (Phase 5); delete my account (Phase 5) |

---

## 8. End-to-end encryption (Phase 2)

What people experience. The mechanism is in [architecture.md](architecture.md#7-end-to-end-encryption).

- **Every chat** is end-to-end encrypted: self, direct and group. There's no "secret chat"
  mode; everything is private by default.
- **Notice:** a system line at the top of each chat says "Messages and calls are end-to-end
  encrypted. No one outside this chat, not even Huginn, can read them." It links to an
  explainer.
- **Security code:** each contact has one, a 60-digit number plus a QR code, in the profile
  under *Encryption*. Compare it in person or over a call to verify the contact; verified
  contacts get a shield on their profile.
- **Key changes:** when someone's security code changes (a new device, a reinstall), the chat
  shows "Sam's security code changed. Tap to verify." Nothing is blocked, but you're told.
- **Devices:** each browser is a device with its own keys.
  - To add a device, you sign in through Heimdall, then approve the new device from one you
    already use (QR code or confirmation), or restore from a backup.
  - A device you remove can no longer read new messages.
- **History on a new device:** messages from before a device was added can't be read on it,
  unless you turned on **encrypted backup** (protected by a recovery key or passphrase that
  only you know).
- **What Huginn can see:**
  - your profile (name, photo, bio, username) and the groups you're in
  - who talked to whom and when, and message sizes
  - **not** what you said, what you sent, or what your files contain
- **Reporting** shares the reported messages from your device. See 5.3.

---

## 9. Media and files (Phase 3)

- **Photos and videos** (send only, no video calls): compressed on the device, with a preview
  before sending and an optional caption. Several can go in one message, shown as a grid.
- **Files** up to 100 MB: name, size and type, with a download button.
- **Voice notes:** hold to record, slide to cancel. Shown as a waveform with a play/pause
  control and speed (1×, 1.5×, 2×).
- **Link previews:** made by the *sender's* device and encrypted with the message, so the server
  never fetches your links. Can be turned off per message and in settings.
- **Shared media:** a tab in chat info with Media, Files and Links.
- Every file is encrypted on the device with its own key before upload. The server stores only
  encrypted blobs.

---

## 10. Expression (Phase 4, nice to have)

- **Reactions:** six quick reactions plus a picker. One reaction per person per message, shown
  under the bubble with counts; click to see who reacted.
- **Forward:** to up to 5 chats at once. Marked "Forwarded", or "Forwarded many times" after
  5 hops, as WhatsApp does.
- **Saved messages:** star any message to save it, then find it in *Saved* in the menu.
- **@mentions:** in groups, an autocomplete of members. Mentions notify even when muted, if
  allowed, and show an @ on the chat row.
- **Polls:** single or multiple choice, with live results. Anonymous or named.
- **Pinned messages:** up to 3 per chat, shown in a bar under the header.

---

## 11. Calls (Phase 6, future)

- **Audio only.** No video calls.
- One-to-one first, then small groups of up to 8.
- Ringing goes through push notifications. Calls are end-to-end encrypted. Call history appears
  in the chat as system messages ("Missed call", "Call · 4 min").

---

## Out of scope

Things Huginn deliberately won't have, so builders don't invent them:

- video calls
- stories or status updates
- channels for broadcasting to strangers
- bots
- phone-number sign-up
- advertising
- server-side reading of messages for any purpose

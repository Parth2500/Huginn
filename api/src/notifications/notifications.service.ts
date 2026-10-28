import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessageDto } from 'src/chat/chat.types';
import { PushSubscription } from './push-subscription.entity';

/** Your notification settings (product-spec.md §6.2). Each device keeps its own on/off switch. */
export interface NotificationSettings {
  notifyPreviews: boolean;
  notifySounds: boolean;
  /** In groups: every message, or only replies to you (and @mentions, once they exist). */
  groupNotifyMode: 'all' | 'mentions';
  mentionsBreakMute: boolean;
  /** Do not disturb until this time; null when off. */
  dndUntil: Date | null;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  notifyPreviews: true,
  notifySounds: true,
  groupNotifyMode: 'all',
  mentionsBreakMute: true,
  dndUntil: null,
};

/**
 * What one person is told about one new message, on every device that needs telling. With
 * previews off, `title` and `body` are null and devices say "New message".
 */
export interface Notice {
  userId: number;
  chatId: number;
  messageId: number;
  title: string | null;
  body: string | null;
  sound: boolean;
}

const PREVIEW_LENGTH = 120;

export class NotificationRuleError extends Error {}

interface RecipientRow {
  userId: number;
  mutedUntil: Date | null;
  archivedAt: Date | null;
  kind: 'self' | 'direct' | 'group';
  title: string | null;
  notifyPreviews: boolean;
  notifySounds: boolean;
  groupNotifyMode: 'all' | 'mentions';
  mentionsBreakMute: boolean;
  dndUntil: Date | null;
}

@Injectable()
export class NotificationsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async settings(userId: number): Promise<NotificationSettings> {
    const [row]: NotificationSettings[] = await this.dataSource.query(
      `SELECT "notifyPreviews", "notifySounds", "groupNotifyMode", "mentionsBreakMute", "dndUntil"
         FROM user_settings WHERE "userId" = $1`,
      [userId],
    );
    return row ?? { ...DEFAULT_NOTIFICATION_SETTINGS };
  }

  /** Changes some of the settings. Unknown or malformed values are refused, not ignored. */
  async update(
    userId: number,
    change: Record<string, unknown>,
  ): Promise<NotificationSettings> {
    const next = { ...(await this.settings(userId)) };
    const flag = (
      key: 'notifyPreviews' | 'notifySounds' | 'mentionsBreakMute',
    ) => {
      if (change[key] === undefined) {
        return;
      }
      if (typeof change[key] !== 'boolean') {
        throw new NotificationRuleError(
          'Say whether that setting is on or off.',
        );
      }
      next[key] = change[key];
    };
    flag('notifyPreviews');
    flag('notifySounds');
    flag('mentionsBreakMute');
    if (change.groupNotifyMode !== undefined) {
      if (
        change.groupNotifyMode !== 'all' &&
        change.groupNotifyMode !== 'mentions'
      ) {
        throw new NotificationRuleError(
          'Choose all messages, or only mentions and replies.',
        );
      }
      next.groupNotifyMode = change.groupNotifyMode;
    }
    if (change.dndUntil !== undefined) {
      next.dndUntil = dndUntil(change.dndUntil);
    }
    await this.dataSource.query(
      `INSERT INTO user_settings ("userId", "notifyPreviews", "notifySounds", "groupNotifyMode", "mentionsBreakMute", "dndUntil")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("userId") DO UPDATE SET
         "notifyPreviews" = EXCLUDED."notifyPreviews", "notifySounds" = EXCLUDED."notifySounds",
         "groupNotifyMode" = EXCLUDED."groupNotifyMode", "mentionsBreakMute" = EXCLUDED."mentionsBreakMute",
         "dndUntil" = EXCLUDED."dndUntil"`,
      [
        userId,
        next.notifyPreviews,
        next.notifySounds,
        next.groupNotifyMode,
        next.mentionsBreakMute,
        next.dndUntil,
      ],
    );
    return next;
  }

  /**
   * Who to tell about a new message (product-spec.md §6.1). Never the sender (also not on their
   * other devices), and nobody in do-not-disturb or with the chat in requests. Muted and archived
   * chats, and groups set to mentions only, stay quiet unless the message replies to you and
   * mentions break through mute.
   */
  async noticesFor(message: MessageDto): Promise<Notice[]> {
    if (message.kind !== 'text' || !message.sender) {
      return [];
    }
    const rows: RecipientRow[] = await this.dataSource.query(
      `SELECT m."userId", m."mutedUntil", m."archivedAt", c.kind, c.title,
              COALESCE(s."notifyPreviews", true) AS "notifyPreviews",
              COALESCE(s."notifySounds", true) AS "notifySounds",
              COALESCE(s."groupNotifyMode", 'all') AS "groupNotifyMode",
              COALESCE(s."mentionsBreakMute", true) AS "mentionsBreakMute",
              s."dndUntil"
         FROM chat_member m
         JOIN chat c ON c.id = m."chatId"
         LEFT JOIN user_settings s ON s."userId" = m."userId"
        WHERE m."chatId" = $1 AND m.status = 'active' AND m."userId" <> $2`,
      [message.chatId, message.sender.Id],
    );
    const now = Date.now();
    const sender = message.sender.displayName || message.sender.username;
    const preview = (message.text ?? '').slice(0, PREVIEW_LENGTH);
    const notices: Notice[] = [];
    for (const row of rows) {
      if (row.dndUntil && row.dndUntil.getTime() > now) {
        continue;
      }
      const repliesToYou = message.replyTo?.senderId === row.userId;
      const breaksThrough = repliesToYou && row.mentionsBreakMute;
      const quiet =
        (row.mutedUntil !== null && row.mutedUntil.getTime() > now) ||
        row.archivedAt !== null ||
        (row.kind === 'group' &&
          row.groupNotifyMode === 'mentions' &&
          !repliesToYou);
      if (quiet && !breaksThrough) {
        continue;
      }
      const group = row.kind === 'group';
      notices.push({
        userId: row.userId,
        chatId: message.chatId,
        messageId: message.id,
        title: row.notifyPreviews ? (group ? row.title : sender) : null,
        body: row.notifyPreviews
          ? group
            ? `${sender}: ${preview}`
            : preview
          : null,
        sound: row.notifySounds,
      });
    }
    return notices;
  }

  // ---- Push subscriptions ----------------------------------------------------------------------

  /** Saves this browser's subscription. The same endpoint moves to the newest session. */
  async subscribe(
    userId: number,
    sessionId: string,
    input: unknown,
  ): Promise<void> {
    const subscription = parseSubscription(input);
    await this.dataSource.query(
      `INSERT INTO push_subscription ("userId", "sessionId", endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET
         "userId" = EXCLUDED."userId", "sessionId" = EXCLUDED."sessionId",
         p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [
        userId,
        sessionId,
        subscription.endpoint,
        subscription.p256dh,
        subscription.auth,
      ],
    );
  }

  async unsubscribe(userId: number, endpoint: unknown): Promise<void> {
    if (typeof endpoint !== 'string') {
      throw new NotificationRuleError('Say which subscription to remove.');
    }
    await this.dataSource.query(
      `DELETE FROM push_subscription WHERE "userId" = $1 AND endpoint = $2`,
      [userId, endpoint],
    );
  }

  /** The subscriptions of these people, except in sessions that have a tab open. */
  async subscriptionsFor(
    userIds: number[],
    openSessionIds: string[],
  ): Promise<PushSubscription[]> {
    if (userIds.length === 0) {
      return [];
    }
    return this.dataSource.query(
      `SELECT * FROM push_subscription
        WHERE "userId" = ANY($1) AND NOT ("sessionId" = ANY($2::uuid[]))`,
      [userIds, openSessionIds],
    );
  }

  /** The push service says the subscription is gone (404 or 410). */
  async forget(endpoint: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM push_subscription WHERE endpoint = $1`,
      [endpoint],
    );
  }
}

function dndUntil(value: unknown): Date | null {
  if (value === null) {
    return null;
  }
  const until = typeof value === 'string' ? new Date(value) : null;
  if (!until || Number.isNaN(until.getTime())) {
    throw new NotificationRuleError('Choose when do not disturb ends.');
  }
  return until.getTime() > Date.now() ? until : null;
}

function parseSubscription(input: unknown) {
  const value = input as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  } | null;
  const endpoint = value?.endpoint;
  const p256dh = value?.keys?.p256dh;
  const auth = value?.keys?.auth;
  const base64url = /^[A-Za-z0-9_-]+={0,2}$/;
  if (
    typeof endpoint !== 'string' ||
    endpoint.length > 2048 ||
    !isPushService(endpoint) ||
    typeof p256dh !== 'string' ||
    p256dh.length > 200 ||
    !base64url.test(p256dh) ||
    typeof auth !== 'string' ||
    auth.length > 100 ||
    !base64url.test(auth)
  ) {
    throw new NotificationRuleError("That isn't a push subscription.");
  }
  return { endpoint, p256dh, auth };
}

/**
 * The push services of the browsers Huginn supports. Any other endpoint is refused, so nobody can
 * make Huginn's server send requests to an address of their choosing. PUSH_SERVICE_HOSTS
 * (comma-separated host suffixes) replaces the list, e.g. for a test push service.
 */
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge (Chromium), Opera, Samsung Internet
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari
  'notify.windows.com', // older Edge
];

export function isPushService(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const hosts =
    process.env.PUSH_SERVICE_HOSTS?.split(',')
      .map((h) => h.trim())
      .filter(Boolean) ?? PUSH_SERVICE_HOSTS;
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    hosts.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  );
}

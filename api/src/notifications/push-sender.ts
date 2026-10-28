import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What happened to one push: delivered, gone for good (404/410), or failed this time. */
export type PushOutcome = 'sent' | 'gone' | 'failed';

/** Sends one encrypted Web Push message. Replaced by a fake in the API end-to-end tests. */
export abstract class PushSender {
  abstract get publicKey(): string | null;
  abstract send(target: PushTarget, payload: object): Promise<PushOutcome>;
}

/** VAPID settings, or null when Web Push isn't set up (in-tab notifications still work). */
export function vapidSettings() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return null;
  }
  // Push services contact this address about problems with Huginn's pushes.
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@huginn.localhost';
  return { publicKey, privateKey, subject };
}

/**
 * Web Push with VAPID (RFC 8292) and payload encryption (RFC 8291), through `web-push`. A push
 * lives for a day at most, and each chat's pushes replace each other at the push service (the
 * Topic header), so a phone that was off gets the latest, not a pile.
 */
@Injectable()
export class WebPushSender extends PushSender {
  private readonly logger = new Logger(WebPushSender.name);

  get publicKey(): string | null {
    return vapidSettings()?.publicKey ?? null;
  }

  async send(target: PushTarget, payload: object & { chatId?: number }) {
    const vapid = vapidSettings();
    if (!vapid) {
      return 'failed' as const;
    }
    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        JSON.stringify(payload),
        {
          vapidDetails: vapid,
          TTL: 24 * 60 * 60,
          urgency: 'high',
          ...(payload.chatId !== undefined
            ? { topic: `chat-${payload.chatId}` }
            : {}),
          timeout: 10_000,
        },
      );
      return 'sent' as const;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        return 'gone' as const;
      }
      this.logger.warn(
        `Push failed (${status ?? 'no response'}) for ${new URL(target.endpoint).host}`,
      );
      return 'failed' as const;
    }
  }
}

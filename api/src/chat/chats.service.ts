import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { toPublicUser } from 'src/user/entities/user.interface';
import { ChatMember } from './entities/chat-member.entity';
import { Chat } from './entities/chat.entity';
import { Message } from './entities/message.entity';
import {
  ChatFolder,
  ChatStateChange,
  ChatSummary,
  MemberDto,
  MyChatState,
  Receipts,
  SystemEvent,
  UpdatePayload,
} from './chat.types';
import { toMessageDto } from './chat.mappers';
import { Addressed, UpdatesService } from './updates.service';

const LIST_PAGE = 30;
/** Pinned chats per person (product-spec.md §1.2). */
export const PIN_LIMIT = 5;
/** "Mute: Always". Postgres could store infinity, but a JavaScript Date can't hold it. */
const MUTED_FOREVER = new Date('9999-12-31T00:00:00Z');
const MUTE_MS = { '8h': 8 * 3600_000, '1w': 7 * 24 * 3600_000 } as const;
const MAX_GROUP_NAME = 60;
const MAX_GROUP_DESCRIPTION = 500;

export class ChatRuleError extends Error {}

/** One member's watermarks and receipts setting, for working out everyone's ticks. */
interface WatermarkRow {
  chatId: number;
  userId: number;
  delivered: number;
  read: number;
  receipts: boolean;
  kind: string;
}

/** What `viewerId` sees: the lowest watermarks among the chat's other members. */
function receiptsOf(rows: WatermarkRow[], viewerId: number): Receipts {
  const others = rows.filter((r) => r.userId !== viewerId);
  if (others.length === 0) {
    return { deliveredUpTo: 0, readUpTo: 0 };
  }
  const viewer = rows.find((r) => r.userId === viewerId);
  // Read receipts off works both ways in a direct chat; groups always count reads (§3.1).
  const hidden =
    others[0].kind === 'direct' &&
    (viewer?.receipts === false || others.some((o) => !o.receipts));
  return {
    deliveredUpTo: Math.min(
      ...others.map((o) => Math.max(o.delivered, o.read)),
    ),
    readUpTo: hidden ? 0 : Math.min(...others.map((o) => o.read)),
  };
}

const directKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

@Injectable()
export class ChatsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Chat) private readonly chats: Repository<Chat>,
    @InjectRepository(ChatMember)
    private readonly members: Repository<ChatMember>,
    private readonly updates: UpdatesService,
  ) {}

  /**
   * Your chats, newest activity first, a page at a time. The first page also carries every
   * pinned chat, so pins show even when they're old.
   */
  async list(
    userId: number,
    before?: { lastActivityAt: string; id: number },
    folder: ChatFolder = 'main',
  ): Promise<{
    chats: ChatSummary[];
    next: { lastActivityAt: string; id: number } | null;
  }> {
    const query = this.members
      .createQueryBuilder('m')
      .innerJoin('m.chat', 'c')
      .select(['m.chatId'])
      .where('m.userId = :userId', { userId })
      .andWhere('c.deletedAt IS NULL')
      .andWhere('(m.hiddenAt IS NULL OR c.lastActivityAt > m.hiddenAt)')
      .andWhere(
        folder === 'archived'
          ? 'm.archivedAt IS NOT NULL'
          : 'm.archivedAt IS NULL',
      )
      .orderBy('c.lastActivityAt', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .limit(LIST_PAGE + 1);
    if (before) {
      query.andWhere('(c.lastActivityAt, c.id) < (:at, :id)', {
        at: before.lastActivityAt,
        id: before.id,
      });
    }
    const page = (await query.getMany()).map((m) => m.chatId);
    const hasMore = page.length > LIST_PAGE;
    const ids = page.slice(0, LIST_PAGE);
    if (!before && folder === 'main') {
      const pinned = await this.members.find({
        where: { userId, pinnedAt: Not(IsNull()) },
        select: { chatId: true },
      });
      for (const { chatId } of pinned) {
        if (!ids.includes(chatId)) {
          ids.push(chatId);
        }
      }
    }
    const chats = await this.summaries(userId, ids);
    const last = chats.find((c) => c.id === ids[LIST_PAGE - 1]);
    return {
      chats,
      next:
        hasMore && last
          ? {
              lastActivityAt: new Date(last.lastActivityAt).toISOString(),
              id: last.id,
            }
          : null,
    };
  }

  /** What the folder rows show: how many archived chats, and how many of them are unread. */
  async folders(userId: number) {
    const [row]: { count: string; unread: string }[] =
      await this.dataSource.query(
        `SELECT COUNT(*) AS count,
                COUNT(*) FILTER (WHERE m."markedUnread" OR EXISTS (
                  SELECT 1 FROM message msg
                   WHERE msg."chatId" = m."chatId"
                     AND msg.id > GREATEST(m."lastReadMessageId", m."clearedBeforeMessageId")
                     AND msg."senderId" IS NOT NULL AND msg."senderId" <> $1
                     AND msg."deletedForAllAt" IS NULL)) AS unread
           FROM chat_member m
           JOIN chat c ON c.id = m."chatId"
          WHERE m."userId" = $1 AND m.status = 'active'
            AND m."archivedAt" IS NOT NULL AND c."deletedAt" IS NULL
            AND (m."hiddenAt" IS NULL OR c."lastActivityAt" > m."hiddenAt")`,
        [userId],
      );
    return {
      archived: { count: Number(row.count), unread: Number(row.unread) },
    };
  }

  /**
   * Pins, archives, mutes or marks chats read or unread for one person, and records a
   * `chat.state` update for each, in one transaction. Rules (product-spec.md §1.2–1.7):
   * at most PIN_LIMIT pins; pinning unarchives; archiving unpins; only direct and self chats
   * can be deleted (a group is left first).
   */
  async changeState(
    userId: number,
    chatIds: number[],
    change: ChatStateChange,
  ): Promise<{ chats: ChatSummary[]; updates: Addressed[] }> {
    return this.dataSource.transaction(async (manager) => {
      // One change at a time per person, so two devices can't pin past the limit together.
      await manager.query('SELECT pg_advisory_xact_lock(1, $1)', [userId]);
      const rows = await manager.find(ChatMember, {
        where: { userId, chatId: In(chatIds), status: 'active' },
      });
      if (rows.length !== chatIds.length) {
        throw new ChatRuleError("You're not a member of that chat.");
      }
      const now = new Date();
      let receipts: { userId: number; payload: UpdatePayload }[] = [];

      if ('pin' in change) {
        if (change.pin) {
          const toPin = rows.filter((r) => !r.pinnedAt);
          const pinned = await manager.find(ChatMember, {
            where: { userId, status: 'active', pinnedAt: Not(IsNull()) },
            select: { chatId: true, pinOrder: true },
          });
          // Notes to self doesn't count towards the limit.
          const selfIds = new Set(
            (
              await manager.find(Chat, {
                where: {
                  id: In([...pinned, ...toPin].map((r) => r.chatId)),
                  kind: 'self',
                },
                select: { id: true },
              })
            ).map((c) => c.id),
          );
          const counted = (list: { chatId: number }[]) =>
            list.filter((r) => !selfIds.has(r.chatId)).length;
          if (counted(pinned) + counted(toPin) > PIN_LIMIT) {
            throw new ChatRuleError(
              `You can pin up to ${PIN_LIMIT} chats. Unpin one to pin this.`,
            );
          }
          let order = Math.max(0, ...pinned.map((p) => p.pinOrder ?? 0));
          for (const row of toPin) {
            await manager.update(
              ChatMember,
              { chatId: row.chatId, userId },
              { pinnedAt: now, pinOrder: ++order, archivedAt: null },
            );
          }
        } else {
          await manager.update(
            ChatMember,
            { chatId: In(chatIds), userId },
            { pinnedAt: null, pinOrder: null },
          );
        }
      } else if ('archive' in change) {
        await manager.update(
          ChatMember,
          { chatId: In(chatIds), userId },
          change.archive
            ? { archivedAt: now, pinnedAt: null, pinOrder: null }
            : { archivedAt: null },
        );
      } else if ('mute' in change) {
        const until =
          change.mute === null
            ? null
            : change.mute === 'always'
              ? MUTED_FOREVER
              : new Date(now.getTime() + MUTE_MS[change.mute]);
        await manager.update(
          ChatMember,
          { chatId: In(chatIds), userId },
          { mutedUntil: until },
        );
      } else if ('clear' in change || 'delete' in change) {
        const chats = await manager.find(Chat, {
          where: { id: In(chatIds) },
          select: { id: true, kind: true },
        });
        if ('delete' in change && chats.some((c) => c.kind === 'group')) {
          throw new ChatRuleError(
            'To delete a group, leave it first. Your other chats were not changed.',
          );
        }
        // Everything so far is cleared and read; a deleted chat also leaves the list.
        receipts = await this.withReceipts(manager, chatIds, async () => {
          await manager.query(
            `UPDATE chat_member m
                SET "clearedBeforeMessageId" = GREATEST(m."clearedBeforeMessageId", COALESCE(c."lastMessageId", 0)),
                    "lastReadMessageId" = GREATEST(m."lastReadMessageId", COALESCE(c."lastMessageId", 0)),
                    "lastDeliveredMessageId" = GREATEST(m."lastDeliveredMessageId", COALESCE(c."lastMessageId", 0)),
                    "markedUnread" = false
               FROM chat c
              WHERE c.id = m."chatId" AND m."userId" = $1 AND m."chatId" = ANY($2)`,
            [userId, chatIds],
          );
        });
        if ('delete' in change) {
          await manager.update(
            ChatMember,
            { chatId: In(chatIds), userId },
            { hiddenAt: now, pinnedAt: null, pinOrder: null, archivedAt: null },
          );
        }
      } else if (change.unread) {
        await manager.update(
          ChatMember,
          { chatId: In(chatIds), userId },
          { markedUnread: true },
        );
      } else {
        // Mark as read: up to each chat's last message.
        receipts = await this.withReceipts(manager, chatIds, async () => {
          await manager.query(
            `UPDATE chat_member m
                SET "lastReadMessageId" = GREATEST(m."lastReadMessageId", COALESCE(c."lastMessageId", 0)),
                    "lastDeliveredMessageId" = GREATEST(m."lastDeliveredMessageId", COALESCE(c."lastMessageId", 0)),
                    "markedUnread" = false
               FROM chat c
              WHERE c.id = m."chatId" AND m."userId" = $1 AND m."chatId" = ANY($2)`,
            [userId, chatIds],
          );
        });
      }

      const chats = await this.summaries(userId, chatIds, manager);
      const updates = await this.updates.append(manager, [
        ...chats.map((chat) => ({
          userId,
          payload: {
            type: 'chat.state' as const,
            data: {
              chatId: chat.id,
              me: chat.me,
              unreadCount: chat.unreadCount,
            },
          },
        })),
        ...receipts,
      ]);
      return { chats, updates };
    });
  }

  /**
   * Puts your pinned chats in a new order. `chatIds` must be exactly the chats pinned now, so a
   * device with a stale list can't drop or add a pin by reordering.
   */
  async reorderPins(
    userId: number,
    chatIds: number[],
  ): Promise<{ chats: ChatSummary[]; updates: Addressed[] }> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(1, $1)', [userId]);
      const pinned = await manager.find(ChatMember, {
        where: { userId, status: 'active', pinnedAt: Not(IsNull()) },
        select: { chatId: true },
      });
      const current = new Set(pinned.map((p) => p.chatId));
      if (
        chatIds.length !== current.size ||
        chatIds.some((id) => !current.has(id))
      ) {
        throw new ChatRuleError(
          'Your pinned chats changed on another device. Try again.',
        );
      }
      for (const [index, chatId] of chatIds.entries()) {
        await manager.update(
          ChatMember,
          { chatId, userId },
          { pinOrder: index + 1 },
        );
      }
      const chats = await this.summaries(userId, chatIds, manager);
      const updates = await this.updates.append(
        manager,
        chats.map((chat) => ({
          userId,
          payload: {
            type: 'chat.state' as const,
            data: {
              chatId: chat.id,
              me: chat.me,
              unreadCount: chat.unreadCount,
            },
          },
        })),
      );
      return { chats, updates };
    });
  }

  private async watermarkRows(
    manager: EntityManager,
    chatIds: number[],
  ): Promise<WatermarkRow[]> {
    if (chatIds.length === 0) {
      return [];
    }
    return manager.query(
      `SELECT m."chatId", m."userId", m."lastDeliveredMessageId" AS delivered,
              m."lastReadMessageId" AS read, COALESCE(s."readReceipts", true) AS receipts, c.kind
         FROM chat_member m
         JOIN chat c ON c.id = m."chatId"
         LEFT JOIN user_settings s ON s."userId" = m."userId"
        WHERE m."chatId" = ANY($1) AND m.status = 'active'`,
      [chatIds],
    );
  }

  /**
   * Runs a change to watermarks (or to who has receipts on) and returns a `receipt` update for
   * every member whose ticks moved because of it.
   */
  async withReceipts(
    manager: EntityManager,
    chatIds: number[],
    run: () => Promise<void>,
  ): Promise<{ userId: number; payload: UpdatePayload }[]> {
    const before = await this.watermarkRows(manager, chatIds);
    await run();
    const after = await this.watermarkRows(manager, chatIds);
    const entries: { userId: number; payload: UpdatePayload }[] = [];
    for (const chatId of chatIds) {
      const was = before.filter((r) => r.chatId === chatId);
      const now = after.filter((r) => r.chatId === chatId);
      for (const { userId } of now) {
        const a = receiptsOf(was, userId);
        const b = receiptsOf(now, userId);
        if (a.deliveredUpTo === b.deliveredUpTo && a.readUpTo === b.readUpTo) {
          continue;
        }
        // Only worth telling them if one of their own messages changed tick.
        const values = [
          a.deliveredUpTo,
          a.readUpTo,
          b.deliveredUpTo,
          b.readUpTo,
        ];
        const theirs: unknown[] = await manager.query(
          `SELECT 1 FROM message WHERE "chatId" = $1 AND "senderId" = $2 AND id > $3 AND id <= $4 LIMIT 1`,
          [chatId, userId, Math.min(...values), Math.max(...values)],
        );
        if (theirs.length > 0) {
          entries.push({
            userId,
            payload: { type: 'receipt', data: { chatId, ...b } },
          });
        }
      }
    }
    return entries;
  }

  /**
   * A device received messages in a chat up to `upTo` (capped at the chat's newest, so a
   * device can't mark future messages delivered). Returns the `receipt` updates for the others.
   */
  async markDelivered(
    manager: EntityManager,
    chatId: number,
    userId: number,
    upTo: number,
  ) {
    return this.withReceipts(manager, [chatId], async () => {
      await manager.query(
        `UPDATE chat_member m
            SET "lastDeliveredMessageId" = GREATEST(m."lastDeliveredMessageId", LEAST($3::int, COALESCE(c."lastMessageId", 0)))
           FROM chat c
          WHERE c.id = m."chatId" AND m."chatId" = $1 AND m."userId" = $2 AND m.status = 'active'`,
        [chatId, userId, upTo],
      );
    });
  }

  async summary(userId: number, chatId: number, manager?: EntityManager) {
    return (await this.summaries(userId, [chatId], manager))[0] ?? null;
  }

  /** Full summaries for one viewer: members, last visible message, unread count and own state. */
  async summaries(
    userId: number,
    chatIds: number[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<ChatSummary[]> {
    if (chatIds.length === 0) {
      return [];
    }
    const chats = await manager.find(Chat, { where: { id: In(chatIds) } });
    const members = await manager.find(ChatMember, {
      where: { chatId: In(chatIds) },
      relations: { user: true },
    });
    const mine = new Map(
      members.filter((m) => m.userId === userId).map((m) => [m.chatId, m]),
    );

    const lastIds = chats
      .map((c) => c.lastMessageId)
      .filter((id): id is number => !!id);
    const lastMessages = lastIds.length
      ? await manager.find(Message, {
          where: { id: In(lastIds) },
          relations: { sender: true },
        })
      : [];
    const byId = new Map(lastMessages.map((m) => [m.id, m]));
    // "Delete for me" on a chat's last message: its preview is the newest one left.
    const hiddenLast: { messageId: number }[] = lastIds.length
      ? await manager.query(
          `SELECT "messageId" FROM message_hidden WHERE "userId" = $1 AND "messageId" = ANY($2)`,
          [userId, lastIds],
        )
      : [];
    for (const { messageId } of hiddenLast) {
      const hidden = byId.get(messageId);
      if (!hidden) {
        continue;
      }
      const before = await manager
        .createQueryBuilder(Message, 'msg')
        .leftJoinAndSelect('msg.sender', 'sender')
        .where('msg.chatId = :chatId', { chatId: hidden.chatId })
        .andWhere(
          `NOT EXISTS (SELECT 1 FROM message_hidden h WHERE h."messageId" = msg.id AND h."userId" = :userId)`,
          { userId },
        )
        .orderBy('msg.id', 'DESC')
        .getOne();
      byId.delete(messageId);
      if (before) {
        byId.set(messageId, before);
      }
    }

    const unread: { chatId: number; count: string }[] = await manager
      .createQueryBuilder(Message, 'msg')
      .innerJoin(
        ChatMember,
        'cm',
        'cm.chatId = msg.chatId AND cm.userId = :userId',
        { userId },
      )
      .select('msg.chatId', 'chatId')
      .addSelect('COUNT(*)', 'count')
      .where('msg.chatId IN (:...chatIds)', { chatIds })
      .andWhere('msg.id > cm.lastReadMessageId')
      .andWhere('msg.id > cm.clearedBeforeMessageId')
      // System messages ("Maya created the group") never count as unread.
      .andWhere('msg.senderId IS NOT NULL AND msg.senderId <> :userId', {
        userId,
      })
      .andWhere('msg.deletedForAllAt IS NULL')
      .groupBy('msg.chatId')
      .getRawMany();
    const unreadBy = new Map(
      unread.map((u) => [Number(u.chatId), Number(u.count)]),
    );

    const watermarks = await this.watermarkRows(manager, chatIds);
    const summaries: ChatSummary[] = [];
    for (const chat of chats) {
      const me = mine.get(chat.id);
      if (!me) {
        continue;
      }
      const last = chat.lastMessageId
        ? byId.get(chat.lastMessageId)
        : undefined;
      const visibleLast =
        last &&
        last.id > me.clearedBeforeMessageId &&
        last.id > me.joinedAfterMessageId
          ? toMessageDto(last)
          : null;
      summaries.push({
        id: chat.id,
        kind: chat.kind,
        title: chat.title,
        description: chat.description,
        avatarUrl: chat.avatarUrl,
        createdAt: chat.createdAt,
        lastActivityAt: chat.lastActivityAt,
        members: members
          .filter((m) => m.chatId === chat.id && m.status === 'active')
          .map((m): MemberDto => ({ ...toPublicUser(m.user), role: m.role })),
        lastMessage: visibleLast,
        unreadCount: unreadBy.get(chat.id) ?? 0,
        me: myState(me),
        receipts: receiptsOf(
          watermarks.filter((w) => w.chatId === chat.id),
          userId,
        ),
        policies: {
          editInfo: chat.editInfoPolicy,
          addMember: chat.addMemberPolicy,
          send: chat.sendPolicy,
        },
      });
    }
    // Keep the caller's order.
    return chatIds
      .map((id) => summaries.find((s) => s.id === id))
      .filter((s): s is ChatSummary => !!s);
  }

  async isActiveMember(chatId: number, userId: number): Promise<boolean> {
    return this.members.exists({ where: { chatId, userId, status: 'active' } });
  }

  async activeMemberIds(
    chatId: number,
    manager: EntityManager = this.dataSource.manager,
  ) {
    const rows = await manager.find(ChatMember, {
      where: { chatId, status: 'active' },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async findDirect(userId: number, otherId: number): Promise<Chat | null> {
    return this.chats.findOne({
      where: { directKey: directKey(userId, otherId) },
    });
  }

  /**
   * Finds or creates your Notes to self (product-spec.md §2.2). A new one is pinned first, and
   * it doesn't count towards the pin limit. Safe when two devices start it at once.
   */
  async findOrCreateSelf(
    manager: EntityManager,
    userId: number,
  ): Promise<{ chat: Chat; created: boolean }> {
    const key = `${userId}`;
    const inserted: { id: number }[] = await manager.query(
      `INSERT INTO "chat" ("kind", "directKey", "createdById") VALUES ('self', $1, $2)
       ON CONFLICT ("directKey") WHERE "directKey" IS NOT NULL DO NOTHING
       RETURNING "id"`,
      [key, userId],
    );
    if (inserted.length) {
      const chatId = inserted[0].id;
      await manager.insert(ChatMember, {
        chatId,
        userId,
        role: 'owner',
        pinnedAt: new Date(),
        pinOrder: 0,
      });
      return {
        chat: await manager.findOneByOrFail(Chat, { id: chatId }),
        created: true,
      };
    }
    return {
      chat: await manager.findOneByOrFail(Chat, { directKey: key }),
      created: false,
    };
  }

  /** Finds or creates the one direct chat for a pair. Safe when both start it at once. */
  async findOrCreateDirect(
    manager: EntityManager,
    userId: number,
    otherId: number,
  ): Promise<{ chat: Chat; created: boolean }> {
    const key = directKey(userId, otherId);
    const inserted: { id: number }[] = await manager.query(
      `INSERT INTO "chat" ("kind", "directKey", "createdById") VALUES ('direct', $1, $2)
       ON CONFLICT ("directKey") WHERE "directKey" IS NOT NULL DO NOTHING
       RETURNING "id"`,
      [key, userId],
    );
    if (inserted.length) {
      const chatId = inserted[0].id;
      await manager.insert(ChatMember, [
        { chatId, userId, role: 'member' },
        { chatId, userId: otherId, role: 'member' },
      ]);
      return {
        chat: await manager.findOneByOrFail(Chat, { id: chatId }),
        created: true,
      };
    }
    return {
      chat: await manager.findOneByOrFail(Chat, { directKey: key }),
      created: false,
    };
  }

  /** Creates a group with its creator as owner, and tells every member (`chat.new`). */
  async createGroup(
    creatorId: number,
    input: { title: string; description?: string | null; memberIds: number[] },
  ): Promise<{ chat: ChatSummary; memberIds: number[]; updates: Addressed[] }> {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const others = [...new Set(input.memberIds)].filter(
      (id) => Number.isInteger(id) && id !== creatorId,
    );
    if (!title || title.length > MAX_GROUP_NAME || others.length < 2) {
      throw new ChatRuleError(
        'A group needs a name of up to 60 characters and at least two other people. To talk to one person, search for them and send a message.',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.count(User, { where: { Id: In(others) } });
      if (existing !== others.length) {
        throw new ChatRuleError("Some of those people couldn't be found.");
      }
      const chat = await manager.save(
        manager.create(Chat, {
          kind: 'group',
          title,
          description:
            input.description?.trim().slice(0, MAX_GROUP_DESCRIPTION) || null,
          createdById: creatorId,
        }),
      );
      await manager.insert(ChatMember, [
        { chatId: chat.id, userId: creatorId, role: 'owner' },
        ...others.map((userId) => ({
          chatId: chat.id,
          userId,
          role: 'member' as const,
        })),
      ]);
      // "Maya created the group" opens the history (§3.10).
      const created = await manager.save(
        manager.create(Message, {
          chatId: chat.id,
          senderId: null,
          kind: 'system',
          body: JSON.stringify({
            type: 'group.created',
            actorId: creatorId,
            title,
          } satisfies SystemEvent),
        }),
      );
      await manager.update(
        Chat,
        { id: chat.id },
        { lastMessageId: created.id, lastActivityAt: created.createdAt },
      );
      const memberIds = [creatorId, ...others];
      const entries = await this.announceNew(manager, chat.id, memberIds);
      const own = await this.summary(creatorId, chat.id, manager);
      return {
        chat: own,
        memberIds,
        updates: await this.updates.append(manager, entries),
      };
    });
  }

  /** `chat.new` for each member, each with their own view of the chat. */
  async announceNew(
    manager: EntityManager,
    chatId: number,
    memberIds: number[],
  ): Promise<{ userId: number; payload: UpdatePayload }[]> {
    const entries: { userId: number; payload: UpdatePayload }[] = [];
    for (const userId of memberIds) {
      const chat = await this.summary(userId, chatId, manager);
      if (chat) {
        entries.push({ userId, payload: { type: 'chat.new', data: { chat } } });
      }
    }
    return entries;
  }

  /**
   * Marks messages up to `upTo` as read (and so delivered) for this person, capped at the chat's
   * newest message. Returns the new state, or null, and the `receipt` updates for the others.
   */
  async markRead(
    manager: EntityManager,
    chatId: number,
    userId: number,
    upTo: number,
  ) {
    let affected = 0;
    const receipts = await this.withReceipts(manager, [chatId], async () => {
      const result: unknown[] = await manager.query(
        `UPDATE chat_member m
            SET "lastReadMessageId" = GREATEST(m."lastReadMessageId", LEAST($3::int, COALESCE(c."lastMessageId", 0))),
                "lastDeliveredMessageId" = GREATEST(m."lastDeliveredMessageId", LEAST($3::int, COALESCE(c."lastMessageId", 0))),
                "markedUnread" = false
           FROM chat c
          WHERE c.id = m."chatId" AND m."chatId" = $1 AND m."userId" = $2 AND m.status = 'active'`,
        [chatId, userId, upTo],
      );
      affected = Number(result[1] ?? 0);
    });
    return {
      chat: affected ? await this.summary(userId, chatId, manager) : null,
      receipts,
    };
  }

  /** Your read receipts setting (product-spec.md §5.4); on unless you turned it off. */
  async readReceipts(userId: number): Promise<boolean> {
    const [row]: { readReceipts: boolean }[] = await this.dataSource.query(
      `SELECT "readReceipts" FROM user_settings WHERE "userId" = $1`,
      [userId],
    );
    return row?.readReceipts ?? true;
  }

  /**
   * Turns read receipts on or off. It works both ways in direct chats, so the ticks on both
   * sides of each of your direct chats may change: those people get `receipt` updates.
   */
  async setReadReceipts(
    userId: number,
    on: boolean,
  ): Promise<{ updates: Addressed[] }> {
    return this.dataSource.transaction(async (manager) => {
      const direct: { chatId: number }[] = await manager.query(
        `SELECT m."chatId" FROM chat_member m JOIN chat c ON c.id = m."chatId"
          WHERE m."userId" = $1 AND m.status = 'active' AND c.kind = 'direct'`,
        [userId],
      );
      const entries = await this.withReceipts(
        manager,
        direct.map((d) => d.chatId),
        async () => {
          await manager.query(
            `INSERT INTO user_settings ("userId", "readReceipts") VALUES ($1, $2)
             ON CONFLICT ("userId") DO UPDATE SET "readReceipts" = EXCLUDED."readReceipts"`,
            [userId, on],
          );
        },
      );
      return { updates: await this.updates.append(manager, entries) };
    });
  }

  /** Everyone who shares at least one chat with the user: the people who see their presence. */
  async contactIds(userId: number): Promise<number[]> {
    const rows: { id: number }[] = await this.dataSource.query(
      `SELECT DISTINCT other."userId" AS id
         FROM chat_member mine
         JOIN chat_member other ON other."chatId" = mine."chatId"
        WHERE mine."userId" = $1 AND other."userId" <> $1
          AND mine.status = 'active' AND other.status = 'active'`,
      [userId],
    );
    return rows.map((row) => Number(row.id));
  }
}

function myState(m: ChatMember): MyChatState {
  return {
    role: m.role,
    status: m.status,
    pinnedAt: m.pinnedAt,
    pinOrder: m.pinOrder,
    archivedAt: m.archivedAt,
    mutedUntil: m.mutedUntil,
    markedUnread: m.markedUnread,
    lastDeliveredMessageId: m.lastDeliveredMessageId,
    lastReadMessageId: m.lastReadMessageId,
    clearedBeforeMessageId: m.clearedBeforeMessageId,
    hiddenAt: m.hiddenAt,
  };
}

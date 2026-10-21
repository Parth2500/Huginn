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
                     AND (msg."senderId" IS NULL OR msg."senderId" <> $1)
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
   * at most PIN_LIMIT pins; pinning unarchives; archiving unpins.
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

      if ('pin' in change) {
        if (change.pin) {
          const toPin = rows.filter((r) => !r.pinnedAt);
          const pinned = await manager.find(ChatMember, {
            where: { userId, status: 'active', pinnedAt: Not(IsNull()) },
            select: { chatId: true, pinOrder: true },
          });
          if (pinned.length + toPin.length > PIN_LIMIT) {
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
      } else if (change.unread) {
        await manager.update(
          ChatMember,
          { chatId: In(chatIds), userId },
          { markedUnread: true },
        );
      } else {
        // Mark as read: up to each chat's last message.
        await manager.query(
          `UPDATE chat_member m
              SET "lastReadMessageId" = GREATEST(m."lastReadMessageId", COALESCE(c."lastMessageId", 0)),
                  "markedUnread" = false
             FROM chat c
            WHERE c.id = m."chatId" AND m."userId" = $1 AND m."chatId" = ANY($2)`,
          [userId, chatIds],
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
      .andWhere('(msg.senderId IS NULL OR msg.senderId <> :userId)', { userId })
      .andWhere('msg.deletedForAllAt IS NULL')
      .groupBy('msg.chatId')
      .getRawMany();
    const unreadBy = new Map(
      unread.map((u) => [Number(u.chatId), Number(u.count)]),
    );

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

  /** Marks messages up to `upTo` as read for this person. Returns the new state, or null. */
  async markRead(
    manager: EntityManager,
    chatId: number,
    userId: number,
    upTo: number,
  ) {
    const result = await manager
      .createQueryBuilder()
      .update(ChatMember)
      .set({
        lastReadMessageId: () => `GREATEST("lastReadMessageId", :upTo)`,
        markedUnread: false,
      })
      .setParameter('upTo', upTo)
      .where('chatId = :chatId AND userId = :userId AND status = :status', {
        chatId,
        userId,
        status: 'active',
      })
      .execute();
    return result.affected ? this.summary(userId, chatId, manager) : null;
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
    lastReadMessageId: m.lastReadMessageId,
    clearedBeforeMessageId: m.clearedBeforeMessageId,
  };
}

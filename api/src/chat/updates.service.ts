import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThan, MoreThan, Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { UserUpdate } from './entities/user-update.entity';
import { UpdateDto, UpdatePayload } from './chat.types';

const PAGE = 200;
/** How long the log keeps an update. A device away for longer reloads its state instead. */
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;

export interface Addressed {
  userId: number;
  update: UpdateDto;
}

/**
 * The per-user update log (architecture.md §5). Appends run inside the caller's transaction, so a
 * change and its updates commit together; the gateway pushes them only after that commit.
 */
@Injectable()
export class UpdatesService implements OnModuleInit, OnModuleDestroy {
  private pruneTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @InjectRepository(UserUpdate)
    private readonly updates: Repository<UserUpdate>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  onModuleInit() {
    this.pruneTimer = setInterval(
      () => void this.prune().catch(() => {}),
      PRUNE_EVERY_MS,
    );
    this.pruneTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.pruneTimer);
  }

  /** Drops updates older than the retention window; `since` then answers `reset` for them. */
  async prune(now = new Date()): Promise<number> {
    const result = await this.updates.delete({
      createdAt: LessThan(new Date(now.getTime() - RETENTION_MS)),
    });
    return result.affected ?? 0;
  }

  /** Gives each recipient the next sequence number(s) and records the updates. */
  async append(
    manager: EntityManager,
    entries: { userId: number; payload: UpdatePayload }[],
  ): Promise<Addressed[]> {
    if (entries.length === 0) {
      return [];
    }
    const counts = new Map<number, number>();
    for (const { userId } of entries) {
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
    }
    // One statement reserves a block of sequence numbers per user (row locks keep it race-free).
    const values = [...counts]
      .map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::int)`)
      .join(', ');
    const result: unknown[] = await manager.query(
      `UPDATE "user" u SET "updateSeq" = u."updateSeq" + v.n
         FROM (VALUES ${values}) AS v(id, n)
        WHERE u."Id" = v.id
        RETURNING u."Id", u."updateSeq"`,
      [...counts].flat(),
    );
    // Postgres returns [rows, affectedCount] for UPDATE ... RETURNING.
    const rows = (Array.isArray(result[0]) ? result[0] : result) as {
      Id: number;
      updateSeq: number;
    }[];
    const next = new Map<number, number>();
    for (const row of rows) {
      next.set(row.Id, row.updateSeq - (counts.get(row.Id) ?? 0) + 1);
    }

    const addressed: Addressed[] = [];
    for (const { userId, payload } of entries) {
      const seq = next.get(userId);
      if (seq === undefined) {
        continue; // user no longer exists
      }
      next.set(userId, seq + 1);
      addressed.push({ userId, update: { ...payload, seq } });
    }
    await manager.insert(
      UserUpdate,
      addressed.map(({ userId, update }) => ({
        userId,
        seq: update.seq,
        type: update.type,
        data: update.data,
      })),
    );
    return addressed;
  }

  async currentSeq(userId: number): Promise<number> {
    const user = await this.users.findOne({
      where: { Id: userId },
      select: { Id: true, updateSeq: true },
    });
    return user?.updateSeq ?? 0;
  }

  /**
   * Updates after `sinceSeq`, a page at a time. `reset` means the device is too far behind (the
   * log was pruned past its position) and must reload its state from scratch.
   */
  async since(
    userId: number,
    sinceSeq: number,
  ): Promise<{
    updates: UpdateDto[];
    seq: number;
    hasMore: boolean;
    reset: boolean;
  }> {
    const seq = await this.currentSeq(userId);
    if (sinceSeq >= seq) {
      return { updates: [], seq, hasMore: false, reset: false };
    }
    const oldest = await this.updates.findOne({
      where: { userId },
      order: { seq: 'ASC' },
      select: { seq: true },
    });
    if (!oldest || oldest.seq > sinceSeq + 1) {
      return { updates: [], seq, hasMore: false, reset: true };
    }
    const rows = await this.updates.find({
      where: { userId, seq: MoreThan(sinceSeq) },
      order: { seq: 'ASC' },
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    return {
      updates: page.map(
        (r) => ({ seq: r.seq, type: r.type, data: r.data }) as UpdateDto,
      ),
      seq,
      hasMore: rows.length > PAGE,
      reset: false,
    };
  }
}

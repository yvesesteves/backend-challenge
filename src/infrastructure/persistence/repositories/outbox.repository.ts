import { EntityManager } from '@mikro-orm/postgresql';
import { OutboxRepositoryPort } from '../../../application/ports/outbox-repository.port';
import { OutboxMessage } from '../../../domain/entities/outbox-message';
import { OutboxMessageOrmEntity } from '../entities/outbox-message.orm-entity';
import { OutboxMessageMapper } from '../mappers/outbox-message.mapper';

export class MikroOutboxRepository implements OutboxRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async enqueue(message: OutboxMessage): Promise<void> {
    const entity = new OutboxMessageOrmEntity();
    OutboxMessageMapper.applyToOrm(message, entity);
    this.em.persist(entity);
    await this.em.flush();
  }

  async claimDueMessages(now: Date, limit: number): Promise<OutboxMessage[]> {
    const rows = await this.em.getConnection().execute<Array<Record<string, unknown>>>(
      `
      SELECT *
      FROM outbox_messages
      WHERE published_at IS NULL
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY occurred_at ASC
      LIMIT ?
      FOR UPDATE SKIP LOCKED
      `,
      [now.toISOString(), limit],
    );

    return rows.map((row) => {
      const mapped = this.em.map(OutboxMessageOrmEntity, row);
      return OutboxMessageMapper.toDomain(mapped);
    });
  }

  async save(message: OutboxMessage): Promise<void> {
    let entity = await this.em.findOne(OutboxMessageOrmEntity, { id: message.id });
    if (!entity) {
      entity = new OutboxMessageOrmEntity();
      OutboxMessageMapper.applyToOrm(message, entity);
      this.em.persist(entity);
    } else {
      OutboxMessageMapper.applyToOrm(message, entity);
    }
    await this.em.flush();
  }

  async countPending(): Promise<number> {
    return this.em.count(OutboxMessageOrmEntity, { publishedAt: null });
  }
}
import { OutboxMessage } from '../../../domain/entities/outbox-message';
import { OutboxMessageOrmEntity } from '../entities/outbox-message.orm-entity';

export class OutboxMessageMapper {
  static toDomain(entity: OutboxMessageOrmEntity): OutboxMessage {
    return OutboxMessage.rehydrate({
      id: entity.id,
      aggregateId: entity.aggregateId,
      eventType: entity.eventType,
      payload: entity.payload,
      occurredAt: entity.occurredAt,
      attempts: entity.attempts,
      nextAttemptAt: entity.nextAttemptAt ?? undefined,
      publishedAt: entity.publishedAt ?? undefined,
    });
  }

  static applyToOrm(
    domain: OutboxMessage,
    target: OutboxMessageOrmEntity,
  ): OutboxMessageOrmEntity {
    target.id = domain.id;
    target.aggregateId = domain.aggregateId;
    target.eventType = domain.eventType;
    target.payload = { ...domain.payload };
    target.occurredAt = domain.occurredAt;
    target.attempts = domain.attempts;
    target.nextAttemptAt = domain.nextAttemptAt ?? null;
    target.publishedAt = domain.publishedAt ?? null;
    return target;
  }
}
import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'outbox_messages' })
export class OutboxMessageOrmEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ fieldName: 'aggregate_id', type: 'uuid' })
  aggregateId!: string;

  @Property({ fieldName: 'event_type', length: 100 })
  eventType!: string;

  @Property({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Property({ fieldName: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Property({ type: 'integer' })
  attempts!: number;

  @Property({ fieldName: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt?: Date | null;

  @Property({ fieldName: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt?: Date | null;
}
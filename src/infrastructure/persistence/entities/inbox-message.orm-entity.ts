import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'inbox_messages' })
export class InboxMessageOrmEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ fieldName: 'message_id', length: 255 })
  messageId!: string;

  @Property({ fieldName: 'consumer_name', length: 100 })
  consumerName!: string;

  @Property({ fieldName: 'payload_hash', length: 64 })
  payloadHash!: string;

  @Property({ fieldName: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Property({ fieldName: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date | null;
}
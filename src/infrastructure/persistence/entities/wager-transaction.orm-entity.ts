import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'wager_transactions' })
export class WagerTransactionOrmEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ fieldName: 'provider_id', length: 100 })
  providerId!: string;

  @Property({ fieldName: 'external_transaction_id', length: 255 })
  externalTransactionId!: string;

  @Property({ fieldName: 'idempotency_key', length: 255 })
  idempotencyKey!: string;

  @Property({ fieldName: 'payload_hash', length: 64 })
  payloadHash!: string;

  @Property({ fieldName: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @Property({ fieldName: 'player_id', type: 'uuid' })
  playerId!: string;

  @Property({ fieldName: 'round_id', length: 255 })
  roundId!: string;

  @Property({ fieldName: 'game_id', length: 255 })
  gameId!: string;

  @Property({ length: 20 })
  kind!: string;

  @Property({ columnType: 'numeric(19, 2)' })
  amount!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({ fieldName: 'reference_external_transaction_id', length: 255, nullable: true })
  referenceExternalTransactionId?: string | null;

  @Property({ fieldName: 'reference_transaction_id', type: 'uuid', nullable: true })
  referenceTransactionId?: string | null;

  @Property({ length: 30 })
  status!: string;

  @Property({ fieldName: 'failure_code', length: 100, nullable: true })
  failureCode?: string | null;

  @Property({ fieldName: 'balance_after', columnType: 'numeric(19, 2)', nullable: true })
  balanceAfter?: string | null;

  @Property({ fieldName: 'retry_count', type: 'integer' })
  retryCount!: number;

  @Property({ fieldName: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt?: Date | null;

  @Property({ fieldName: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Property({ fieldName: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date | null;
}
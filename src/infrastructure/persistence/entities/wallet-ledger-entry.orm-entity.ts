import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'wallet_ledger_entries' })
export class WalletLedgerEntryOrmEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'bigint', autoincrement: true, persist: false })
  seq?: string;

  @Property({ fieldName: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @Property({ fieldName: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @Property({ length: 10 })
  direction!: string;

  @Property({ columnType: 'numeric(19, 2)' })
  amount!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({ fieldName: 'balance_before', columnType: 'numeric(19, 2)' })
  balanceBefore!: string;

  @Property({ fieldName: 'balance_after', columnType: 'numeric(19, 2)' })
  balanceAfter!: string;

  @Property({ fieldName: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
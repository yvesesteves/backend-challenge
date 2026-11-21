import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'wallets' })
export class WalletOrmEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ fieldName: 'player_id', type: 'uuid' })
  playerId!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({ columnType: 'numeric(19, 2)' })
  balance!: string;

  @Property({ type: 'integer' })
  version!: number;

  @Property({ fieldName: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Property({ fieldName: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
import { EntityManager } from '@mikro-orm/postgresql';
import { TransactionRepositoryPort } from '../../../application/ports/transaction-repository.port';
import { WagerTransaction } from '../../../domain/entities/wager-transaction';
import { WagerTransactionKind } from '../../../domain/enums/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../../../domain/enums/wager-transaction-status.enum';
import { WagerTransactionOrmEntity } from '../entities/wager-transaction.orm-entity';
import { WagerTransactionMapper } from '../mappers/wager-transaction.mapper';

export class MikroWagerTransactionRepository implements TransactionRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionOrmEntity, { id });
    return entity ? WagerTransactionMapper.toDomain(entity) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionOrmEntity, { idempotencyKey });
    return entity ? WagerTransactionMapper.toDomain(entity) : null;
  }

  async findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionOrmEntity, {
      providerId,
      externalTransactionId,
    });
    return entity ? WagerTransactionMapper.toDomain(entity) : null;
  }

  async existsProcessedReversal(
    referenceTransactionId: string,
    kind: WagerTransactionKind,
  ): Promise<boolean> {
    const count = await this.em.count(WagerTransactionOrmEntity, {
      referenceTransactionId,
      kind,
      status: WagerTransactionStatus.Processed,
    });
    return count > 0;
  }

  async claimDuePendingReferences(now: Date, limit: number): Promise<WagerTransaction[]> {
    const rows = await this.em.getConnection().execute<Array<Record<string, unknown>>>(
      `
      SELECT *
      FROM wager_transactions
      WHERE status = ?
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
      ORDER BY created_at ASC
      LIMIT ?
      FOR UPDATE SKIP LOCKED
      `,
      [WagerTransactionStatus.PendingReference, now.toISOString(), limit],
    );

    return rows.map((row) => {
      const mapped = this.em.map(WagerTransactionOrmEntity, row);
      return WagerTransactionMapper.toDomain(mapped);
    });
  }

  async save(tx: WagerTransaction): Promise<void> {
    let entity = await this.em.findOne(WagerTransactionOrmEntity, { id: tx.id });
    if (!entity) {
      entity = new WagerTransactionOrmEntity();
      WagerTransactionMapper.applyToOrm(tx, entity);
      this.em.persist(entity);
    } else {
      WagerTransactionMapper.applyToOrm(tx, entity);
    }
    await this.em.flush();
  }
}
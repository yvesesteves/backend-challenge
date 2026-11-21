import { WagerTransaction } from '../../domain/entities/wager-transaction';
import { WagerTransactionKind } from '../../domain/enums/wager-transaction-kind.enum';

export interface TransactionRepositoryPort {
  findById(id: string): Promise<WagerTransaction | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransaction | null>;
  findByProviderAndExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null>;
  existsProcessedReversal(
    referenceTransactionId: string,
    kind: WagerTransactionKind,
  ): Promise<boolean>;
  /** Busca transações PENDING_REFERENCE prontas para retry com FOR UPDATE SKIP LOCKED. */
  claimDuePendingReferences(now: Date, limit: number): Promise<WagerTransaction[]>;
  save(tx: WagerTransaction): Promise<void>;
}

export const TRANSACTION_REPOSITORY = Symbol('TRANSACTION_REPOSITORY');

import { WagerTransaction } from '../../../domain/entities/wager-transaction';
import { FailureCode } from '../../../domain/enums/failure-code.enum';
import { WagerTransactionKind } from '../../../domain/enums/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../../../domain/enums/wager-transaction-status.enum';
import { Money } from '../../../domain/value-objects/money';
import { WagerTransactionOrmEntity } from '../entities/wager-transaction.orm-entity';

export class WagerTransactionMapper {
  static toDomain(entity: WagerTransactionOrmEntity): WagerTransaction {
    return WagerTransaction.rehydrate({
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
      walletId: entity.walletId,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.kind as WagerTransactionKind,
      money: Money.from({ amount: entity.amount, currency: entity.currency }),
      referenceExternalTransactionId: entity.referenceExternalTransactionId ?? undefined,
      referenceTransactionId: entity.referenceTransactionId ?? undefined,
      status: entity.status as WagerTransactionStatus,
      failureCode: (entity.failureCode as FailureCode) ?? undefined,
      balanceAfter: entity.balanceAfter
        ? Money.from({ amount: entity.balanceAfter, currency: entity.currency })
        : undefined,
      retryCount: entity.retryCount,
      nextRetryAt: entity.nextRetryAt ?? undefined,
      createdAt: entity.createdAt,
      processedAt: entity.processedAt ?? undefined,
    });
  }

  static applyToOrm(
    domain: WagerTransaction,
    target: WagerTransactionOrmEntity,
  ): WagerTransactionOrmEntity {
    const moneyJson = domain.money.toJSON();
    target.id = domain.id;
    target.providerId = domain.providerId;
    target.externalTransactionId = domain.externalTransactionId;
    target.idempotencyKey = domain.idempotencyKey;
    target.payloadHash = domain.payloadHash;
    target.walletId = domain.walletId;
    target.playerId = domain.playerId;
    target.roundId = domain.roundId;
    target.gameId = domain.gameId;
    target.kind = domain.kind;
    target.amount = moneyJson.amount;
    target.currency = moneyJson.currency;
    target.referenceExternalTransactionId = domain.referenceExternalTransactionId ?? null;
    target.referenceTransactionId = domain.referenceTransactionId ?? null;
    target.status = domain.status;
    target.failureCode = domain.failureCode ?? null;
    target.balanceAfter = domain.balanceAfter ? domain.balanceAfter.toJSON().amount : null;
    target.retryCount = domain.retryCount;
    target.nextRetryAt = domain.nextRetryAt ?? null;
    target.createdAt = domain.createdAt;
    target.processedAt = domain.processedAt ?? null;
    return target;
  }
}
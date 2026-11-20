import { randomUUID } from 'node:crypto';
import { WagerTransaction } from '../entities/wager-transaction';
import { WagerTransactionKind } from '../enums/wager-transaction-kind.enum';
import { MoneyProps } from '../value-objects/money';
import { EventContext, IntegrationEvent } from './integration.event';

export interface WagerTransactionProcessedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  balanceAfter?: MoneyProps;
  referenceTransactionId?: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  readonly eventType = 'WagerTransactionProcessed';
  readonly version = 1;

  static from(tx: WagerTransaction, ctx: EventContext): WagerTransactionProcessed {
    return new WagerTransactionProcessed({
      eventId: randomUUID(),
      aggregateId: tx.walletId,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      occurredAt: ctx.occurredAt ?? new Date(),
      data: {
        transactionId: tx.id,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        walletId: tx.walletId,
        playerId: tx.playerId,
        roundId: tx.roundId,
        gameId: tx.gameId,
        kind: tx.kind,
        money: tx.money.toJSON(),
        ...(tx.balanceAfter ? { balanceAfter: tx.balanceAfter.toJSON() } : {}),
        ...(tx.referenceTransactionId ? { referenceTransactionId: tx.referenceTransactionId } : {}),
      },
    });
  }
}
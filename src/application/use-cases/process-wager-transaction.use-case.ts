import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InboxMessage } from '../../domain/entities/inbox-message';
import { OutboxMessage } from '../../domain/entities/outbox-message';
import { WagerTransaction } from '../../domain/entities/wager-transaction';
import { Wallet } from '../../domain/entities/wallet';
import { FailureCode } from '../../domain/enums/failure-code.enum';
import { LedgerDirection } from '../../domain/enums/ledger-direction.enum';
import { WagerTransactionKind } from '../../domain/enums/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../../domain/enums/wager-transaction-status.enum';
import {
  IdempotencyConflictError,
  InsufficientFundsError,
  NotFoundError,
} from '../../domain/errors/domain.error';
import { WagerTransactionPendingReference } from '../../domain/events/wager-transaction-pending-reference.event';
import { WagerTransactionProcessed } from '../../domain/events/wager-transaction-processed.event';
import { WagerTransactionRejected } from '../../domain/events/wager-transaction-rejected.event';
import { WalletBalanceChanged } from '../../domain/events/wallet-balance-changed.event';
import { computePayloadHash } from '../../domain/services/payload-hash.service';
import { Money, MoneyProps } from '../../domain/value-objects/money';
import { METRICS_PORT, MetricsPort } from '../ports/metrics.port';
import {
  TransactionalRepositories,
  UNIT_OF_WORK,
  UnitOfWorkPort,
} from '../ports/unit-of-work.port';

export interface ProcessWagerTransactionInput {
  idempotencyKey: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
  correlationId?: string;
  source?: 'http' | 'sqs';
  inbox?: {
    consumerName: string;
    messageId: string;
  };
}

export interface ProcessWagerTransactionOutput {
  transactionId: string;
  status: WagerTransactionStatus;
  balance: MoneyProps;
  idempotentReplay: boolean;
  failureCode?: FailureCode;
}

@Injectable()
export class ProcessWagerTransactionUseCase {
  constructor(
    @Inject(UNIT_OF_WORK)
    private readonly uow: UnitOfWorkPort,
    @Optional()
    @Inject(METRICS_PORT)
    private readonly metrics?: MetricsPort,
  ) {}

  async execute(input: ProcessWagerTransactionInput): Promise<ProcessWagerTransactionOutput> {
    const startMs = Date.now();
    const money = Money.from(input.money);
    const correlationId = input.correlationId ?? randomUUID();
    const source = input.source ?? 'http';

    // Hash canônico apenas dos campos de negócio (sem headers/metadados de transporte)
    const payloadHash = computePayloadHash({
      providerId: input.providerId,
      externalTransactionId: input.externalTransactionId,
      playerId: input.playerId,
      walletId: input.walletId,
      roundId: input.roundId,
      gameId: input.gameId,
      kind: input.kind,
      money: money.toJSON(),
      referenceExternalTransactionId: input.referenceExternalTransactionId,
    });

    try {
      const result = await this.uow.execute(async (repos) => {
        // 1. Deduplicação de Inbox (quando entrada for SQS)
        let inboxEntity: InboxMessage | null = null;
        if (input.inbox) {
          const existingInbox = await repos.inbox.findByConsumerAndMessageId(
            input.inbox.consumerName,
            input.inbox.messageId,
          );
          if (existingInbox?.isProcessed()) {
            this.metrics?.incrementDuplicates('sqs');
            const existingTx = await repos.transactions.findByIdempotencyKey(input.idempotencyKey);
            const wallet = await repos.wallets.findById(input.walletId);
            if (existingTx && wallet) {
              return {
                transactionId: existingTx.id,
                status: existingTx.status,
                balance: (existingTx.balanceAfter ?? wallet.balance).toJSON(),
                idempotentReplay: true,
                ...(existingTx.failureCode ? { failureCode: existingTx.failureCode } : {}),
              };
            }
          }
          inboxEntity =
            existingInbox ??
            InboxMessage.receive({
              consumerName: input.inbox.consumerName,
              messageId: input.inbox.messageId,
              payloadHash,
            });
        }

        // 2. Lock pessimista na wallet (serializa concorrência por walletId entre múltiplas instâncias)
        const wallet = await repos.wallets.findByIdForUpdate(input.walletId);
        if (!wallet) {
          throw new NotFoundError('Wallet', input.walletId);
        }

        // 3. Verificação de idempotência persistente após adquirir o lock
        const existingByKey = await repos.transactions.findByIdempotencyKey(input.idempotencyKey);
        if (existingByKey) {
          if (!existingByKey.matchesPayload(payloadHash)) {
            throw new IdempotencyConflictError(input.idempotencyKey);
          }
          if (inboxEntity) {
            inboxEntity.markProcessed(new Date());
            await repos.inbox.save(inboxEntity);
          }
          this.metrics?.incrementDuplicates(source);
          return {
            transactionId: existingByKey.id,
            status: existingByKey.status,
            balance: (existingByKey.balanceAfter ?? wallet.balance).toJSON(),
            idempotentReplay: true,
            ...(existingByKey.failureCode ? { failureCode: existingByKey.failureCode } : {}),
          };
        }

        // 4. Criar transação de domínio (valida OPENING e exigência de referência)
        const now = new Date();
        const tx = WagerTransaction.create({
          id: randomUUID(),
          providerId: input.providerId,
          externalTransactionId: input.externalTransactionId,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
          walletId: input.walletId,
          playerId: input.playerId,
          roundId: input.roundId,
          gameId: input.gameId,
          kind: input.kind,
          money,
          referenceExternalTransactionId: input.referenceExternalTransactionId,
          createdAt: now,
        });

        // 5. Aplicar regras de negócio
        await this.applyTransaction(tx, wallet, repos, correlationId, now);

        if (inboxEntity) {
          inboxEntity.markProcessed(now);
          await repos.inbox.save(inboxEntity);
        }

        this.metrics?.incrementTransactions(tx.status, tx.kind);

        return {
          transactionId: tx.id,
          status: tx.status,
          balance: (tx.balanceAfter ?? wallet.balance).toJSON(),
          idempotentReplay: false,
          ...(tx.failureCode ? { failureCode: tx.failureCode } : {}),
        };
      });

      return result;
    } finally {
      this.metrics?.observeProcessingDuration('process_wager_transaction', (Date.now() - startMs) / 1000);
    }
  }

  /** Compartilhado também pelo RetryPendingReferenceUseCase. */
  async applyTransaction(
    tx: WagerTransaction,
    wallet: Wallet,
    repos: TransactionalRepositories,
    correlationId: string,
    now: Date,
  ): Promise<void> {
    const ctx = { correlationId, causationId: tx.id, occurredAt: now };

    // Valida vínculo player/wallet e moeda
    if (wallet.playerId !== tx.playerId) {
      return this.rejectAndEnqueue(tx, wallet, FailureCode.PlayerWalletMismatch, repos, ctx, now);
    }
    if (wallet.currency !== tx.money.currency) {
      return this.rejectAndEnqueue(tx, wallet, FailureCode.CurrencyMismatch, repos, ctx, now);
    }

    // Resolver referência quando exigida (REFUND / ROLLBACK) ou opcional (WIN)
    let reference: WagerTransaction | null = null;
    if (tx.requiresReference() || tx.referenceExternalTransactionId) {
      reference = await repos.transactions.findByProviderAndExternalId(
        tx.providerId,
        tx.referenceExternalTransactionId!,
      );

      if (!reference) {
        if (tx.requiresReference()) {
          // Out-of-order: persiste como PENDING_REFERENCE para reprocessamento futuro
          tx.markPendingReference(new Date(now.getTime() + 1000));
          await repos.transactions.save(tx);
          await repos.outbox.enqueue(
            OutboxMessage.enqueue(WagerTransactionPendingReference.from(tx, ctx)),
          );
          return;
        }
      } else if (tx.requiresReference()) {
        const refError = await this.validateReference(tx, reference, repos);
        if (refError) {
          return this.rejectAndEnqueue(tx, wallet, refError, repos, ctx, now);
        }
      }
    }

    // LOSS: não movimenta saldo nem gera ledger
    if (!tx.affectsBalance()) {
      tx.markProcessed(reference?.id, now, wallet.balance);
      await repos.transactions.save(tx);
      await repos.outbox.enqueue(
        OutboxMessage.enqueue(WagerTransactionProcessed.from(tx, ctx)),
      );
      return;
    }

    // Determinar direção do ledger (DEBIT ou CREDIT)
    const direction = tx.ledgerDirectionFor(reference ?? undefined);

    try {
      const entry =
        direction === LedgerDirection.Debit
          ? wallet.debit(tx.id, tx.money, now)
          : wallet.credit(tx.id, tx.money, now);

      tx.markProcessed(reference?.id, now, wallet.balance);

      await repos.wallets.save(wallet);
      await repos.transactions.save(tx);
      await repos.ledger.append(entry);

      await repos.outbox.enqueue(
        OutboxMessage.enqueue(WagerTransactionProcessed.from(tx, ctx)),
      );
      await repos.outbox.enqueue(
        OutboxMessage.enqueue(WalletBalanceChanged.from(wallet, entry, ctx)),
      );
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        // Distingue aposta sem saldo de reversão que causaria saldo negativo (Seção 7.9)
        const failureCode =
          tx.kind === WagerTransactionKind.Rollback
            ? FailureCode.ReversalWouldCauseNegativeBalance
            : FailureCode.InsufficientFunds;
        return this.rejectAndEnqueue(tx, wallet, failureCode, repos, ctx, now);
      }
      throw err;
    }
  }

  private async validateReference(
    tx: WagerTransaction,
    reference: WagerTransaction,
    repos: TransactionalRepositories,
  ): Promise<FailureCode | null> {
    if (reference.status !== WagerTransactionStatus.Processed) {
      return FailureCode.ReferenceNotProcessed;
    }

    if (
      reference.providerId !== tx.providerId ||
      reference.playerId !== tx.playerId ||
      reference.walletId !== tx.walletId ||
      reference.money.currency !== tx.money.currency ||
      reference.roundId !== tx.roundId
    ) {
      return FailureCode.ReferenceMismatch;
    }

    if (tx.kind === WagerTransactionKind.Refund && reference.kind !== WagerTransactionKind.Bet) {
      return FailureCode.ReferenceInvalidKind;
    }

    if (
      tx.kind === WagerTransactionKind.Rollback &&
      ![WagerTransactionKind.Bet, WagerTransactionKind.Win, WagerTransactionKind.Refund].includes(
        reference.kind,
      )
    ) {
      return FailureCode.ReferenceInvalidKind;
    }

    if (!reference.money.equals(tx.money)) {
      return FailureCode.ReferenceAmountMismatch;
    }

    const alreadyReversed = await repos.transactions.existsProcessedReversal(reference.id, tx.kind);
    if (alreadyReversed) {
      return FailureCode.ReferenceAlreadyReversed;
    }

    return null;
  }

  private async rejectAndEnqueue(
    tx: WagerTransaction,
    wallet: Wallet,
    code: FailureCode,
    repos: TransactionalRepositories,
    ctx: { correlationId: string; causationId: string; occurredAt: Date },
    now: Date,
  ): Promise<void> {
    tx.reject(code, now, wallet.balance);
    await repos.transactions.save(tx);
    await repos.outbox.enqueue(OutboxMessage.enqueue(WagerTransactionRejected.from(tx, ctx)));
  }
}
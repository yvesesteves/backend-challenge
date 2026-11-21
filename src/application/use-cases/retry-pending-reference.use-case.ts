import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OutboxMessage } from '../../domain/entities/outbox-message';
import { FailureCode } from '../../domain/enums/failure-code.enum';
import { WagerTransactionStatus } from '../../domain/enums/wager-transaction-status.enum';
import { WagerTransactionRejected } from '../../domain/events/wager-transaction-rejected.event';
import { METRICS_PORT, MetricsPort } from '../ports/metrics.port';
import { UNIT_OF_WORK, UnitOfWorkPort } from '../ports/unit-of-work.port';
import { ProcessWagerTransactionUseCase } from './process-wager-transaction.use-case';

@Injectable()
export class RetryPendingReferenceUseCase {
  private readonly maxRetries = Number(process.env.PENDING_REF_MAX_RETRIES ?? 5);

  constructor(
    @Inject(UNIT_OF_WORK)
    private readonly uow: UnitOfWorkPort,
    private readonly processor: ProcessWagerTransactionUseCase,
    @Optional()
    @Inject(METRICS_PORT)
    private readonly metrics?: MetricsPort,
  ) {}

  async executeBatch(batchSize = 20): Promise<number> {
    return this.uow.execute(async (repos) => {
      const now = new Date();
      const pendingList = await repos.transactions.claimDuePendingReferences(now, batchSize);

      for (const tx of pendingList) {
        const wallet = await repos.wallets.findByIdForUpdate(tx.walletId);
        if (!wallet) continue;

        const reference = await repos.transactions.findByProviderAndExternalId(
          tx.providerId,
          tx.referenceExternalTransactionId!,
        );

        if (!reference) {
          if (tx.retryCount + 1 >= this.maxRetries) {
            tx.reject(FailureCode.ReferenceTimeout, now, wallet.balance);
            await repos.transactions.save(tx);
            await repos.outbox.enqueue(
              OutboxMessage.enqueue(
                WagerTransactionRejected.from(tx, {
                  correlationId: randomUUID(),
                  causationId: tx.id,
                  occurredAt: now,
                }),
              ),
            );
            this.metrics?.incrementTransactions(WagerTransactionStatus.Rejected, tx.kind);
          } else {
            tx.scheduleReferenceRetry(now);
            await repos.transactions.save(tx);
            this.metrics?.incrementRetries('pending_reference');
          }
          continue;
        }

        // Referência chegou: aplica a transação normalmente
        await this.processor.applyTransaction(tx, wallet, repos, randomUUID(), now);
        this.metrics?.incrementTransactions(tx.status, tx.kind);
      }

      return pendingList.length;
    });
  }
}
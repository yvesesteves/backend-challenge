import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { MetricsPort } from '../../application/ports/metrics.port';

@Injectable()
export class PrometheusMetricsService implements MetricsPort {
  private readonly registry: Registry;
  private readonly transactionsTotal: Counter;
  private readonly duplicatesTotal: Counter;
  private readonly retriesTotal: Counter;
  private readonly dlqTotal: Counter;
  private readonly lockConflictsTotal: Counter;
  private readonly reconciliationDivergenceTotal: Counter;
  private readonly outboxLagGauge: Gauge;
  private readonly processingDuration: Histogram;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.transactionsTotal = new Counter({
      name: 'wagering_transactions_total',
      help: 'Total wager transactions processed by status and kind',
      labelNames: ['status', 'kind'],
      registers: [this.registry],
    });

    this.duplicatesTotal = new Counter({
      name: 'wagering_duplicates_detected_total',
      help: 'Total duplicate requests/messages detected',
      labelNames: ['source'],
      registers: [this.registry],
    });

    this.retriesTotal = new Counter({
      name: 'wagering_retries_total',
      help: 'Total retries by worker',
      labelNames: ['worker'],
      registers: [this.registry],
    });

    this.dlqTotal = new Counter({
      name: 'wagering_dlq_messages_total',
      help: 'Total messages routed to DLQ',
      registers: [this.registry],
    });

    this.lockConflictsTotal = new Counter({
      name: 'wagering_lock_conflicts_total',
      help: 'Total database lock conflicts detected',
      registers: [this.registry],
    });

    this.reconciliationDivergenceTotal = new Counter({
      name: 'wagering_reconciliation_divergences_total',
      help: 'Total wallet reconciliation divergences detected',
      registers: [this.registry],
    });

    this.outboxLagGauge = new Gauge({
      name: 'wagering_outbox_pending_messages',
      help: 'Current number of unpublished outbox messages',
      registers: [this.registry],
    });

    this.processingDuration = new Histogram({
      name: 'wagering_processing_duration_seconds',
      help: 'Processing latency in seconds',
      labelNames: ['operation'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });
  }

  incrementTransactions(status: string, kind: string): void {
    this.transactionsTotal.inc({ status, kind });
  }

  incrementDuplicates(source: 'http' | 'sqs'): void {
    this.duplicatesTotal.inc({ source });
  }

  incrementRetries(worker: 'sqs' | 'outbox' | 'pending_reference'): void {
    this.retriesTotal.inc({ worker });
  }

  incrementDlq(): void {
    this.dlqTotal.inc();
  }

  incrementLockConflicts(): void {
    this.lockConflictsTotal.inc();
  }

  incrementReconciliationDivergence(): void {
    this.reconciliationDivergenceTotal.inc();
  }

  setOutboxLag(count: number): void {
    this.outboxLagGauge.set(count);
  }

  observeProcessingDuration(operation: string, durationSeconds: number): void {
    this.processingDuration.observe({ operation }, durationSeconds);
  }

  async getMetricsText(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
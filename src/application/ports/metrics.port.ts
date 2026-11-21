export interface MetricsPort {
  incrementTransactions(status: string, kind: string): void;
  incrementDuplicates(source: 'http' | 'sqs'): void;
  incrementRetries(worker: 'sqs' | 'outbox' | 'pending_reference'): void;
  incrementDlq(): void;
  incrementLockConflicts(): void;
  incrementReconciliationDivergence(): void;
  setOutboxLag(count: number): void;
  observeProcessingDuration(operation: string, durationSeconds: number): void;
}

export const METRICS_PORT = Symbol('METRICS_PORT');
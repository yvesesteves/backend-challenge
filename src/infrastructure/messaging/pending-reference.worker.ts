import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RetryPendingReferenceUseCase } from '../../application/use-cases/retry-pending-reference.use-case';

@Injectable()
export class PendingReferenceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PendingReferenceWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(private readonly retryPending: RetryPendingReferenceUseCase) {}

  onModuleInit(): void {
    if (process.env.DISABLE_WORKERS === 'true') {
      return;
    }
    const intervalMs = Number(process.env.PENDING_REF_POLL_INTERVAL_MS ?? 2000);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.isProcessing) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async tick(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;
    try {
      return await this.retryPending.executeBatch(20);
    } catch (err) {
      this.logger.error({ msg: 'Pending reference worker tick failed', error: String(err) });
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }
}
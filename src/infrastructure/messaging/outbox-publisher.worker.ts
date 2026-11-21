import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { METRICS_PORT, type MetricsPort } from '../../application/ports/metrics.port';
import { UNIT_OF_WORK, type UnitOfWorkPort } from '../../application/ports/unit-of-work.port';
import { SQS_CLIENT } from '../../presentation/controllers/health.controller';

@Injectable()
export class OutboxPublisherWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(
    @Inject(UNIT_OF_WORK)
    private readonly uow: UnitOfWorkPort,
    @Inject(SQS_CLIENT)
    private readonly sqs: SQSClient,
    @Optional()
    @Inject(METRICS_PORT)
    private readonly metrics?: MetricsPort,
  ) {}

  onModuleInit(): void {
    if (process.env.DISABLE_WORKERS === 'true' || !process.env.SQS_EVENTS_QUEUE_URL) {
      return;
    }
    const intervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000);
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

  async tick(batchSize = 20): Promise<number> {
    if (this.isProcessing || !process.env.SQS_EVENTS_QUEUE_URL) return 0;
    this.isProcessing = true;

    try {
      const queueUrl = process.env.SQS_EVENTS_QUEUE_URL;
      const publishedCount = await this.uow.execute(async (repos) => {
        const now = new Date();
        const messages = await repos.outbox.claimDueMessages(now, batchSize);
        let published = 0;

        for (const msg of messages) {
          try {
            await this.sqs.send(
              new SendMessageCommand({
                QueueUrl: queueUrl,
                MessageBody: JSON.stringify(msg.payload),
                MessageGroupId: msg.aggregateId,
                MessageDeduplicationId: msg.id,
              }),
            );
            msg.markPublished(new Date());
            published += 1;
          } catch (err) {
            msg.scheduleRetry(new Date());
            this.metrics?.incrementRetries('outbox');
            this.logger.warn({
              msg: 'Failed to publish outbox message, scheduled retry',
              outboxId: msg.id,
              attempts: msg.attempts,
              error: String(err),
            });
          }
          await repos.outbox.save(msg);
        }

        const pending = await repos.outbox.countPending();
        this.metrics?.setOutboxLag(pending);

        return published;
      });

      return publishedCount;
    } catch (err) {
      this.logger.error({ msg: 'Outbox worker tick failed', error: String(err) });
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }
}
import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { METRICS_PORT, type MetricsPort } from '../../application/ports/metrics.port';
import { ProcessWagerTransactionUseCase } from '../../application/use-cases/process-wager-transaction.use-case';
import { WagerTransactionKind } from '../../domain/enums/wager-transaction-kind.enum';
import { DomainError } from '../../domain/errors/domain.error';
import { SQS_CLIENT } from '../../presentation/controllers/health.controller';

interface SqsWagerPayload {
  idempotencyKey?: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
  correlationId?: string;
}

@Injectable()
export class WagerSqsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WagerSqsConsumer.name);
  private readonly consumerName = 'wager-sqs-consumer';
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    @Inject(SQS_CLIENT)
    private readonly sqs: SQSClient,
    private readonly processWager: ProcessWagerTransactionUseCase,
    @Optional()
    @Inject(METRICS_PORT)
    private readonly metrics?: MetricsPort,
  ) {}

  onModuleInit(): void {
    if (process.env.DISABLE_WORKERS === 'true' || !process.env.SQS_WAGER_QUEUE_URL) {
      return;
    }
    this.running = true;
    this.loopPromise = this.pollLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.loopPromise) {
      await this.loopPromise;
    }
  }

  private async pollLoop(): Promise<void> {
    const queueUrl = process.env.SQS_WAGER_QUEUE_URL!;
    while (this.running) {
      try {
        const response = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 5,
            AttributeNames: ['All'],
          }),
        );

        const messages = response.Messages ?? [];
        for (const msg of messages) {
          if (!this.running) break;
          await this.handleMessage(queueUrl, msg);
        }
      } catch (err) {
        if (this.running) {
          this.logger.error({ msg: 'SQS polling error', error: String(err) });
          await sleep(1000);
        }
      }
    }
  }

  async handleMessage(queueUrl: string, msg: Message): Promise<void> {
    if (!msg.Body || !msg.ReceiptHandle || !msg.MessageId) return;

    let payload: SqsWagerPayload;
    try {
      payload = JSON.parse(msg.Body) as SqsWagerPayload;
    } catch {
      this.logger.error({ msg: 'Malformed JSON in SQS message, leaving for DLQ', messageId: msg.MessageId });
      this.metrics?.incrementDlq();
      return;
    }

    const idempotencyKey =
      payload.idempotencyKey ?? `${payload.providerId}:${payload.externalTransactionId}`;

    try {
      await this.processWager.execute({
        idempotencyKey,
        providerId: payload.providerId,
        externalTransactionId: payload.externalTransactionId,
        playerId: payload.playerId,
        walletId: payload.walletId,
        roundId: payload.roundId,
        gameId: payload.gameId,
        kind: payload.kind,
        money: payload.money,
        referenceExternalTransactionId: payload.referenceExternalTransactionId,
        correlationId: payload.correlationId,
        source: 'sqs',
        inbox: {
          consumerName: this.consumerName,
          messageId: msg.MessageId,
        },
      });

      await this.deleteMessage(queueUrl, msg.ReceiptHandle);
    } catch (err) {
      if (err instanceof DomainError) {
        // Erro determinístico de domínio (ex: conflito de idempotência ou payload inválido): não faz sentido reprocessar
        this.logger.warn({
          msg: 'Deterministic domain error on SQS message, acknowledging to avoid infinite loop',
          messageId: msg.MessageId,
          code: err.code,
        });
        await this.deleteMessage(queueUrl, msg.ReceiptHandle);
        return;
      }

      // Falha transitória: não deleta para o SQS reentregar (e rotear à DLQ após maxReceiveCount)
      this.metrics?.incrementRetries('sqs');
      this.logger.error({
        msg: 'Transient error processing SQS message, will retry',
        messageId: msg.MessageId,
        error: String(err),
      });
    }
  }

  private async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.sqs.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import mikroOrmConfig from '../mikro-orm.config';
import { METRICS_PORT } from './application/ports/metrics.port';
import { UNIT_OF_WORK } from './application/ports/unit-of-work.port';
import { CreateWalletUseCase } from './application/use-cases/create-wallet.use-case';
import { ProcessWagerTransactionUseCase } from './application/use-cases/process-wager-transaction.use-case';
import { WalletQueriesUseCase } from './application/use-cases/queries.use-case';
import { ReconcileWalletUseCase } from './application/use-cases/reconcile-wallet.use-case';
import { RetryPendingReferenceUseCase } from './application/use-cases/retry-pending-reference.use-case';
import { NoOpAuthGuard } from './infrastructure/auth/noop-auth.guard';
import { OutboxPublisherWorker } from './infrastructure/messaging/outbox-publisher.worker';
import { PendingReferenceWorker } from './infrastructure/messaging/pending-reference.worker';
import { createSqsClient } from './infrastructure/messaging/sqs-client.factory';
import { WagerSqsConsumer } from './infrastructure/messaging/wager-sqs.consumer';
import { pinoLoggerConfig } from './infrastructure/observability/logger.config';
import { PrometheusMetricsService } from './infrastructure/observability/prometheus-metrics.service';
import { MikroUnitOfWork } from './infrastructure/persistence/unit-of-work.mikro';
import { HealthController, SQS_CLIENT } from './presentation/controllers/health.controller';
import { MetricsController } from './presentation/controllers/metrics.controller';
import { WageringController } from './presentation/controllers/wagering.controller';
import { WalletsController } from './presentation/controllers/wallets.controller';

@Module({
  imports: [
    LoggerModule.forRoot(pinoLoggerConfig),
    MikroOrmModule.forRoot(mikroOrmConfig),
  ],
  controllers: [
    WalletsController,
    WageringController,
    HealthController,
    MetricsController,
  ],
  providers: [
    NoOpAuthGuard,
    PrometheusMetricsService,
    {
      provide: METRICS_PORT,
      useExisting: PrometheusMetricsService,
    },
    {
      provide: UNIT_OF_WORK,
      useClass: MikroUnitOfWork,
    },
    {
      provide: SQS_CLIENT,
      useFactory: createSqsClient,
    },
    CreateWalletUseCase,
    ProcessWagerTransactionUseCase,
    RetryPendingReferenceUseCase,
    ReconcileWalletUseCase,
    WalletQueriesUseCase,
    WagerSqsConsumer,
    OutboxPublisherWorker,
    PendingReferenceWorker,
  ],
})
export class AppModule {}
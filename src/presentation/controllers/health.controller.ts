import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/postgresql';
import { Controller, Get, HttpStatus, Inject, Optional, Res } from '@nestjs/common';
import { Response } from 'express';

export const SQS_CLIENT = Symbol('SQS_CLIENT');

@Controller('health')
export class HealthController {
  constructor(
    private readonly em: EntityManager,
    @Optional()
    @Inject(SQS_CLIENT)
    private readonly sqs?: SQSClient,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready(@Res() res: Response) {
    const checks: Record<string, 'ok' | 'error'> = {
      postgres: 'error',
      sqs: 'error',
    };

    try {
      await this.em.getConnection().execute('SELECT 1');
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'error';
    }

    try {
      if (this.sqs && process.env.SQS_WAGER_QUEUE_URL) {
        await this.sqs.send(
          new GetQueueAttributesCommand({
            QueueUrl: process.env.SQS_WAGER_QUEUE_URL,
            AttributeNames: ['QueueArn'],
          }),
        );
        checks.sqs = 'ok';
      }
    } catch {
      checks.sqs = 'error';
    }

    const allOk = checks.postgres === 'ok' && checks.sqs === 'ok';
    return res.status(allOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
      status: allOk ? 'ready' : 'not_ready',
      checks,
    });
  }
}
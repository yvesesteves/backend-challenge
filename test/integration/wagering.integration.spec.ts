import 'reflect-metadata';
import {
  ReceiveMessageCommand,
  SQSClient,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/postgresql';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { OutboxPublisherWorker } from '../../src/infrastructure/messaging/outbox-publisher.worker';
import { PendingReferenceWorker } from '../../src/infrastructure/messaging/pending-reference.worker';
import { WagerSqsConsumer } from '../../src/infrastructure/messaging/wager-sqs.consumer';
import { SQS_CLIENT } from '../../src/presentation/controllers/health.controller';
import { DomainExceptionFilter } from '../../src/presentation/filters/domain-exception.filter';

describe('Distributed Wagering Processor — Integration & Concurrency', () => {
  let app: INestApplication;
  let baseUrl: string;
  let em: EntityManager;
  let sqs: SQSClient;
  let outboxWorker: OutboxPublisherWorker;
  let pendingRefWorker: PendingReferenceWorker;
  let sqsConsumer: WagerSqsConsumer;

  beforeAll(async () => {
    process.env.DISABLE_WORKERS = 'true';
    process.env.LOG_LEVEL = 'silent';

    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());

    await app.listen(0);
    const url = await app.getUrl();
    baseUrl = url.replace('[::1]', '127.0.0.1');

    em = app.get(EntityManager);
    sqs = app.get<SQSClient>(SQS_CLIENT);
    outboxWorker = app.get(OutboxPublisherWorker);
    pendingRefWorker = app.get(PendingReferenceWorker);
    sqsConsumer = app.get(WagerSqsConsumer);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function createWallet(initialAmount: string, currency = 'BRL') {
    const playerId = randomUUID();
    const res = await fetch(`${baseUrl}/wallets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playerId,
        initialBalance: { amount: initialAmount, currency },
      }),
    });
    const body = (await res.json()) as {
      id: string;
      playerId: string;
      balance: { amount: string; currency: string };
      version: number;
    };
    return { status: res.status, body, playerId };
  }

  async function submitWager(idempotencyKey: string, payload: Record<string, unknown>) {
    const res = await fetch(`${baseUrl}/wagering/transactions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it('creates wallet with OPENING ledger entry and rejects duplicate player+currency (409)', async () => {
    const { status, body, playerId } = await createWallet('100.00');
    expect(status).toBe(201);
    expect(body.balance).toEqual({ amount: '100.00', currency: 'BRL' });
    expect(body.version).toBe(1);

    // Duplicada para mesmo player + moeda
    const dup = await fetch(`${baseUrl}/wallets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playerId,
        initialBalance: { amount: '50.00', currency: 'BRL' },
      }),
    });
    expect(dup.status).toBe(409);

    // Ledger deve conter 1 lançamento de OPENING
    const ledgerRes = await fetch(`${baseUrl}/wallets/${body.id}/ledger`);
    const ledger = (await ledgerRes.json()) as { items: Array<{ direction: string; money: { amount: string } }> };
    expect(ledger.items.length).toBe(1);
    expect(ledger.items[0].direction).toBe('CREDIT');
    expect(ledger.items[0].money.amount).toBe('100.00');
  });

  it('enforces idempotency: same payload replays cleanly, different payload returns 409', async () => {
    const { body: wallet } = await createWallet('100.00');
    const key = `idem-${randomUUID()}`;
    const extId = `ext-${randomUUID()}`;

    const payload = {
      providerId: 'provider-a',
      externalTransactionId: extId,
      playerId: wallet.playerId,
      walletId: wallet.id,
      roundId: 'round-idem-1',
      gameId: 'slots-1',
      kind: 'BET',
      money: { amount: '25.00', currency: 'BRL' },
    };

    const first = await submitWager(key, payload);
    expect(first.status).toBe(200);
    expect(first.body.idempotentReplay).toBe(false);
    expect(first.body.balance).toEqual({ amount: '75.00', currency: 'BRL' });

    // Replay exato
    const replay = await submitWager(key, payload);
    expect(replay.status).toBe(200);
    expect(replay.body.idempotentReplay).toBe(true);
    expect(replay.body.transactionId).toBe(first.body.transactionId);
    expect(replay.body.balance).toEqual({ amount: '75.00', currency: 'BRL' });

    // Mesmo Idempotency-Key com valor divergente -> 409 Conflict
    const conflict = await submitWager(key, {
      ...payload,
      money: { amount: '30.00', currency: 'BRL' },
    });
    expect(conflict.status).toBe(409);
  });

  it('handles 15 concurrent BETs of 10.00 on a 100.00 wallet without negative balance', async () => {
    const { body: wallet } = await createWallet('100.00');

    const requests = Array.from({ length: 15 }, (_, i) =>
      submitWager(`conc-${wallet.id}-${i}`, {
        providerId: 'provider-conc',
        externalTransactionId: `ext-conc-${wallet.id}-${i}`,
        playerId: wallet.playerId,
        walletId: wallet.id,
        roundId: `round-${i}`,
        gameId: 'crash-1',
        kind: 'BET',
        money: { amount: '10.00', currency: 'BRL' },
      }),
    );

    const results = await Promise.all(requests);
    const processed = results.filter((r) => r.status === 200 && r.body.status === 'PROCESSED');
    const rejected = results.filter(
      (r) => r.status === 422 && r.body.failureCode === 'INSUFFICIENT_FUNDS',
    );

    expect(processed.length).toBe(10);
    expect(rejected.length).toBe(5);

    const reconRes = await fetch(`${baseUrl}/wallets/${wallet.id}/reconciliation`, {
      method: 'POST',
    });
    const recon = (await reconRes.json()) as {
      consistent: boolean;
      storedBalance: { amount: string };
      calculatedBalance: { amount: string };
    };

    expect(recon.consistent).toBe(true);
    expect(recon.storedBalance.amount).toBe('0.00');
    expect(recon.calculatedBalance.amount).toBe('0.00');
  });

  it('handles out-of-order REFUND (PENDING_REFERENCE) and resolves once BET arrives', async () => {
    const { body: wallet } = await createWallet('100.00');
    const betExtId = `bet-ooo-${randomUUID()}`;
    const refundExtId = `ref-ooo-${randomUUID()}`;

    // 1. REFUND chega antes da BET -> 202 PENDING_REFERENCE
    const refundRes = await submitWager(`key-${refundExtId}`, {
      providerId: 'provider-ooo',
      externalTransactionId: refundExtId,
      playerId: wallet.playerId,
      walletId: wallet.id,
      roundId: 'round-ooo',
      gameId: 'roulette',
      kind: 'REFUND',
      money: { amount: '40.00', currency: 'BRL' },
      referenceExternalTransactionId: betExtId,
    });
    expect(refundRes.status).toBe(202);
    expect(refundRes.body.status).toBe('PENDING_REFERENCE');

    // 2. BET chega e debita 40.00 (saldo = 60.00)
    const betRes = await submitWager(`key-${betExtId}`, {
      providerId: 'provider-ooo',
      externalTransactionId: betExtId,
      playerId: wallet.playerId,
      walletId: wallet.id,
      roundId: 'round-ooo',
      gameId: 'roulette',
      kind: 'BET',
      money: { amount: '40.00', currency: 'BRL' },
    });
    expect(betRes.status).toBe(200);
    expect(betRes.body.balance).toEqual({ amount: '60.00', currency: 'BRL' });

    // 3. Força next_retry_at para agora e executa o worker
    await em
      .fork()
      .getConnection()
      .execute(
        `UPDATE wager_transactions SET next_retry_at = NOW() - INTERVAL '1 second' WHERE id = ?`,
        [refundRes.body.transactionId],
      );

    await pendingRefWorker.tick();

    // 4. Saldo volta para 100.00 e transação vira PROCESSED
    const txRes = await fetch(`${baseUrl}/wagering/transactions/${refundRes.body.transactionId}`);
    const tx = (await txRes.json()) as { status: string; balanceAfter: { amount: string } };
    expect(tx.status).toBe('PROCESSED');
    expect(tx.balanceAfter.amount).toBe('100.00');
  });

  it('processes SQS FIFO message with Inbox deduplication and publishes Outbox event', async () => {
    const { body: wallet } = await createWallet('50.00');
    const extId = `sqs-win-${randomUUID()}`;
    const queueUrl = process.env.SQS_WAGER_QUEUE_URL!;
    const eventsQueueUrl = process.env.SQS_EVENTS_QUEUE_URL!;

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageGroupId: wallet.id,
        MessageDeduplicationId: extId,
        MessageBody: JSON.stringify({
          idempotencyKey: `sqs:${extId}`,
          providerId: 'provider-sqs',
          externalTransactionId: extId,
          playerId: wallet.playerId,
          walletId: wallet.id,
          roundId: 'round-sqs',
          gameId: 'blackjack',
          kind: 'WIN',
          money: { amount: '35.00', currency: 'BRL' },
        }),
      }),
    );

    const received = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 2,
      }),
    );

    const targetMsg = (received.Messages ?? []).find((m) => m.Body?.includes(extId));
    expect(targetMsg).toBeDefined();

    await sqsConsumer.handleMessage(queueUrl, targetMsg!);

    // Publica eventos do Outbox na fila wager-events.fifo
    const published = await outboxWorker.tick(50);
    expect(published).toBeGreaterThan(0);

    const walletRes = await fetch(`${baseUrl}/wallets/${wallet.id}`);
    const updatedWallet = (await walletRes.json()) as { balance: { amount: string } };
    expect(updatedWallet.balance.amount).toBe('85.00');

    // Confirma que há eventos na fila wager-events.fifo
    const eventMsgs = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: eventsQueueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 2,
      }),
    );
    expect((eventMsgs.Messages ?? []).length).toBeGreaterThan(0);
  });

  it('blocks UPDATE and DELETE on wallet_ledger_entries via PostgreSQL trigger', async () => {
    const { body: wallet } = await createWallet('20.00');
    const conn = em.fork().getConnection();

    await expect(
      conn.execute(`UPDATE wallet_ledger_entries SET amount = 999.00 WHERE wallet_id = ?`, [
        wallet.id,
      ]),
    ).rejects.toThrow();

    await expect(
      conn.execute(`DELETE FROM wallet_ledger_entries WHERE wallet_id = ?`, [wallet.id]),
    ).rejects.toThrow();
  });
});
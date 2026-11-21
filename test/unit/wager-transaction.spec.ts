import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { WagerTransaction } from '../../src/domain/entities/wager-transaction';
import { FailureCode } from '../../src/domain/enums/failure-code.enum';
import { LedgerDirection } from '../../src/domain/enums/ledger-direction.enum';
import { WagerTransactionKind } from '../../src/domain/enums/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../../src/domain/enums/wager-transaction-status.enum';
import {
  InvalidInputError,
  InvalidTransactionStateError,
} from '../../src/domain/errors/domain.error';
import { Money } from '../../src/domain/value-objects/money';

describe('WagerTransaction', () => {
  const baseProps = () => ({
    id: randomUUID(),
    providerId: 'provider-a',
    externalTransactionId: `ext-${randomUUID()}`,
    idempotencyKey: `provider-a:ext-${randomUUID()}`,
    payloadHash: 'a'.repeat(64),
    walletId: randomUUID(),
    playerId: randomUUID(),
    roundId: 'round-1',
    gameId: 'fortune-chimp',
    money: Money.from({ amount: '25.00', currency: 'BRL' }),
  });

  it('rejects external creation of OPENING transactions', () => {
    expect(() =>
      WagerTransaction.create({
        ...baseProps(),
        kind: WagerTransactionKind.Opening,
      }),
    ).toThrow(InvalidInputError);
  });

  it('requires referenceExternalTransactionId for REFUND and ROLLBACK', () => {
    expect(() =>
      WagerTransaction.create({ ...baseProps(), kind: WagerTransactionKind.Refund }),
    ).toThrow(InvalidInputError);

    expect(() =>
      WagerTransaction.create({ ...baseProps(), kind: WagerTransactionKind.Rollback }),
    ).toThrow(InvalidInputError);
  });

  it('computes correct ledger direction for BET, WIN, REFUND and ROLLBACK', () => {
    const bet = WagerTransaction.create({ ...baseProps(), kind: WagerTransactionKind.Bet });
    const win = WagerTransaction.create({ ...baseProps(), kind: WagerTransactionKind.Win });
    const loss = WagerTransaction.create({ ...baseProps(), kind: WagerTransactionKind.Loss });
    const refund = WagerTransaction.create({
      ...baseProps(),
      kind: WagerTransactionKind.Refund,
      referenceExternalTransactionId: bet.externalTransactionId,
    });
    const rollbackBet = WagerTransaction.create({
      ...baseProps(),
      kind: WagerTransactionKind.Rollback,
      referenceExternalTransactionId: bet.externalTransactionId,
    });
    const rollbackWin = WagerTransaction.create({
      ...baseProps(),
      kind: WagerTransactionKind.Rollback,
      referenceExternalTransactionId: win.externalTransactionId,
    });

    expect(bet.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
    expect(win.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    expect(refund.ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
    expect(rollbackBet.ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
    expect(rollbackWin.ledgerDirectionFor(win)).toBe(LedgerDirection.Debit);
    expect(loss.affectsBalance()).toBe(false);
    expect(() => loss.ledgerDirectionFor()).toThrow(InvalidTransactionStateError);
  });

  it('blocks state transitions once transaction reaches a terminal status', () => {
    const tx = WagerTransaction.create({ ...baseProps(), kind: WagerTransactionKind.Bet });
    expect(tx.status).toBe(WagerTransactionStatus.Pending);

    tx.markProcessed(undefined, new Date(), Money.from({ amount: '75.00', currency: 'BRL' }));
    expect(tx.isTerminal()).toBe(true);

    expect(() => tx.reject(FailureCode.InsufficientFunds)).toThrow(InvalidTransactionStateError);
    expect(() => tx.markPendingReference()).toThrow(InvalidTransactionStateError);
    expect(() => tx.fail(FailureCode.InfrastructureError)).toThrow(InvalidTransactionStateError);
  });
});

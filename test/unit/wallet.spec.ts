import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { Wallet } from '../../src/domain/entities/wallet';
import { LedgerDirection } from '../../src/domain/enums/ledger-direction.enum';
import {
  CurrencyMismatchError,
  InsufficientFundsError,
} from '../../src/domain/errors/domain.error';
import { Money } from '../../src/domain/value-objects/money';

describe('Wallet', () => {
  const openWallet = (amount = '100.00', currency = 'BRL') =>
    Wallet.open({
      id: randomUUID(),
      playerId: randomUUID(),
      initialBalance: Money.from({ amount, currency }),
    });

  it('starts at version 1 and increments version on every debit and credit', () => {
    const wallet = openWallet('100.00');
    expect(wallet.version).toBe(1);
    expect(wallet.balance.toJSON()).toEqual({ amount: '100.00', currency: 'BRL' });

    const debitEntry = wallet.debit(randomUUID(), Money.from({ amount: '25.50', currency: 'BRL' }));
    expect(wallet.version).toBe(2);
    expect(wallet.balance.toJSON().amount).toBe('74.50');
    expect(debitEntry.direction).toBe(LedgerDirection.Debit);
    expect(debitEntry.isBalanced()).toBe(true);

    const creditEntry = wallet.credit(randomUUID(), Money.from({ amount: '50.00', currency: 'BRL' }));
    expect(wallet.version).toBe(3);
    expect(wallet.balance.toJSON().amount).toBe('124.50');
    expect(creditEntry.direction).toBe(LedgerDirection.Credit);
    expect(creditEntry.isBalanced()).toBe(true);
  });

  it('prevents negative balance and keeps state unchanged on InsufficientFundsError', () => {
    const wallet = openWallet('50.00');

    expect(() =>
      wallet.debit(randomUUID(), Money.from({ amount: '50.01', currency: 'BRL' })),
    ).toThrow(InsufficientFundsError);

    expect(wallet.balance.toJSON().amount).toBe('50.00');
    expect(wallet.version).toBe(1);
  });

  it('rejects operations with mismatched currency', () => {
    const wallet = openWallet('100.00', 'BRL');
    const usd = Money.from({ amount: '10.00', currency: 'USD' });

    expect(() => wallet.debit(randomUUID(), usd)).toThrow(CurrencyMismatchError);
    expect(() => wallet.credit(randomUUID(), usd)).toThrow(CurrencyMismatchError);
  });
});

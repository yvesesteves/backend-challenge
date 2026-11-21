import { describe, expect, it } from 'bun:test';
import { CurrencyMismatchError, InvalidMoneyError } from '../../src/domain/errors/domain.error';
import { Money } from '../../src/domain/value-objects/money';

describe('Money', () => {
  it('creates valid money with fixed 2 decimal places', () => {
    const m1 = Money.from({ amount: '25', currency: 'BRL' });
    const m2 = Money.from({ amount: '25.5', currency: 'BRL' });
    const m3 = Money.from({ amount: '25.00', currency: 'BRL' });

    expect(m1.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
    expect(m2.toJSON()).toEqual({ amount: '25.50', currency: 'BRL' });
    expect(m3.toJSON()).toEqual({ amount: '25.00', currency: 'BRL' });
  });

  it('avoids floating point precision bugs (0.10 + 0.20 === 0.30)', () => {
    const a = Money.from({ amount: '0.10', currency: 'BRL' });
    const b = Money.from({ amount: '0.20', currency: 'BRL' });
    const sum = a.add(b);

    expect(sum.toJSON()).toEqual({ amount: '0.30', currency: 'BRL' });
    // Imutabilidade: instâncias originais não mudam
    expect(a.toJSON().amount).toBe('0.10');
    expect(b.toJSON().amount).toBe('0.20');
  });

  it('rejects invalid amounts (negative, >2 decimals, scientific notation, NaN, Infinity, empty)', () => {
    const invalidAmounts = [
      '',
      '   ',
      '-10.00',
      '10.123',
      '1e5',
      '1E-2',
      'NaN',
      'Infinity',
      '-Infinity',
      'abc',
      '10,00',
    ];

    for (const amount of invalidAmounts) {
      expect(() => Money.from({ amount, currency: 'BRL' })).toThrow(InvalidMoneyError);
    }
  });

  it('rejects invalid ISO-4217 currency codes', () => {
    expect(() => Money.from({ amount: '10.00', currency: 'brl' })).toThrow(InvalidMoneyError);
    expect(() => Money.from({ amount: '10.00', currency: 'BR' })).toThrow(InvalidMoneyError);
    expect(() => Money.from({ amount: '10.00', currency: 'BRLX' })).toThrow(InvalidMoneyError);
  });

  it('throws CurrencyMismatchError when operating across different currencies', () => {
    const brl = Money.from({ amount: '10.00', currency: 'BRL' });
    const usd = Money.from({ amount: '10.00', currency: 'USD' });

    expect(() => brl.add(usd)).toThrow(CurrencyMismatchError);
    expect(() => brl.subtract(usd)).toThrow(CurrencyMismatchError);
    expect(() => brl.isLessThan(usd)).toThrow(CurrencyMismatchError);
    expect(brl.equals(usd)).toBe(false);
  });
});

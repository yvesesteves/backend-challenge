import Decimal from 'decimal.js';
import { CurrencyMismatchError, InvalidMoneyError } from '../errors/domain.error';

export interface MoneyProps {
  amount: string;
  currency: string;
}

const NON_NEGATIVE_AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;
const SIGNED_AMOUNT_REGEX = /^-?\d+(\.\d{1,2})?$/;
const ISO_CURRENCY_REGEX = /^[A-Z]{3}$/;

export class Money {
  private constructor(
    private readonly value: Decimal,
    public readonly currency: string,
  ) {}

  /** Factory para contratos de entrada: exige valor não-negativo com no máximo 2 casas decimais. */
  static from(props: MoneyProps): Money {
    Money.assertValidCurrency(props.currency);
    Money.assertValidAmountString(props.amount, NON_NEGATIVE_AMOUNT_REGEX);
    return new Money(new Decimal(props.amount), props.currency);
  }

  /** Factory para diferenças/reconciliação que podem ser negativas. */
  static fromSigned(props: MoneyProps): Money {
    Money.assertValidCurrency(props.currency);
    Money.assertValidAmountString(props.amount, SIGNED_AMOUNT_REGEX);
    return new Money(new Decimal(props.amount), props.currency);
  }

  static zero(currency: string): Money {
    Money.assertValidCurrency(currency);
    return new Money(new Decimal(0), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  negate(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  isNegative(): boolean {
    return this.value.lessThan(0);
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.value.toFixed(2),
      currency: this.currency,
    };
  }

  toString(): string {
    return `${this.value.toFixed(2)} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  private static assertValidCurrency(currency: string): void {
    if (typeof currency !== 'string' || !ISO_CURRENCY_REGEX.test(currency)) {
      throw new InvalidMoneyError(`Invalid ISO-4217 currency: '${currency}'`);
    }
  }

  private static assertValidAmountString(amount: string, regex: RegExp): void {
    if (typeof amount !== 'string' || amount.trim() === '' || !regex.test(amount)) {
      throw new InvalidMoneyError(`Invalid monetary amount: '${amount}'`);
    }
    const parsed = new Decimal(amount);
    if (!parsed.isFinite() || parsed.isNaN()) {
      throw new InvalidMoneyError(`Non-finite monetary amount: '${amount}'`);
    }
  }
}
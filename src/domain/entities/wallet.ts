import { randomUUID } from 'node:crypto';
import { LedgerDirection } from '../enums/ledger-direction.enum';
import {
  CurrencyMismatchError,
  InsufficientFundsError,
  InvalidInputError,
} from '../errors/domain.error';
import { Money } from '../value-objects/money';
import { WalletLedgerEntry } from './wallet-ledger-entry';

export interface OpenWalletProps {
  id: string;
  playerId: string;
  initialBalance: Money;
  now?: Date;
}

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: OpenWalletProps): Wallet {
    if (props.initialBalance.isNegative()) {
      throw new InvalidInputError('Initial balance cannot be negative');
    }
    const now = props.now ?? new Date();
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      now,
      now,
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(transactionId: string, money: Money, at: Date = new Date()): WalletLedgerEntry {
    this.assertSameCurrency(money);
    if (!money.isPositive()) {
      throw new InvalidInputError('Debit amount must be positive');
    }
    if (this._balance.isLessThan(money)) {
      throw new InsufficientFundsError(
        this._balance.toJSON().amount,
        money.toJSON().amount,
        this.currency,
      );
    }

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.subtract(money);

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = at;

    return WalletLedgerEntry.create({
      id: randomUUID(),
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Debit,
      money,
      balanceBefore,
      balanceAfter,
      createdAt: at,
    });
  }

  credit(transactionId: string, money: Money, at: Date = new Date()): WalletLedgerEntry {
    this.assertSameCurrency(money);
    if (!money.isPositive()) {
      throw new InvalidInputError('Credit amount must be positive');
    }

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.add(money);

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = at;

    return WalletLedgerEntry.create({
      id: randomUUID(),
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Credit,
      money,
      balanceBefore,
      balanceAfter,
      createdAt: at,
    });
  }

  private assertSameCurrency(money: Money): void {
    if (money.currency !== this.currency) {
      throw new CurrencyMismatchError(this.currency, money.currency);
    }
  }
}

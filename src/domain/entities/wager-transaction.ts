import { FailureCode } from '../enums/failure-code.enum';
import { LedgerDirection } from '../enums/ledger-direction.enum';
import { WagerTransactionKind } from '../enums/wager-transaction-kind.enum';
import { WagerTransactionStatus } from '../enums/wager-transaction-status.enum';
import { InvalidInputError, InvalidTransactionStateError } from '../errors/domain.error';
import { Money } from '../value-objects/money';

export interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt?: Date;
}

export interface WagerTransactionState {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt: Date;
  status: WagerTransactionStatus;
  referenceTransactionId?: string;
  failureCode?: FailureCode;
  processedAt?: Date;
  balanceAfter?: Money;
  retryCount: number;
  nextRetryAt?: Date;
}

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    private _status: WagerTransactionStatus,
    private _referenceTransactionId?: string,
    private _failureCode?: FailureCode,
    private _processedAt?: Date,
    private _balanceAfter?: Money,
    private _retryCount = 0,
    private _nextRetryAt?: Date,
  ) {}

  /** Nasce em PENDING. Rejeita OPENING (interno) e valida exigência de referência. */
  static create(props: CreateWagerTransactionProps): WagerTransaction {
    if (props.kind === WagerTransactionKind.Opening) {
      throw new InvalidInputError('OPENING transactions are internal and cannot be submitted externally');
    }

    const requiresRef =
      props.kind === WagerTransactionKind.Refund || props.kind === WagerTransactionKind.Rollback;
    if (requiresRef && !props.referenceExternalTransactionId) {
      throw new InvalidInputError(`${props.kind} requires referenceExternalTransactionId`);
    }

    if (props.kind !== WagerTransactionKind.Loss && !props.money.isPositive()) {
      throw new InvalidInputError(`${props.kind} amount must be strictly positive`);
    }

    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId,
      props.createdAt ?? new Date(),
      WagerTransactionStatus.Pending,
    );
  }

  /** Factory interna exclusiva para abertura de wallet com saldo inicial > 0. */
  static createOpening(props: {
    id: string;
    walletId: string;
    playerId: string;
    money: Money;
    payloadHash: string;
    at: Date;
  }): WagerTransaction {
    return new WagerTransaction(
      props.id,
      'system',
      `opening:${props.walletId}`,
      `system:opening:${props.walletId}`,
      props.payloadHash,
      props.walletId,
      props.playerId,
      `opening:${props.walletId}`,
      'system',
      WagerTransactionKind.Opening,
      props.money,
      undefined,
      props.at,
      WagerTransactionStatus.Processed,
      undefined,
      undefined,
      props.at,
      props.money,
      0,
      undefined,
    );
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId,
      state.kind,
      state.money,
      state.referenceExternalTransactionId,
      state.createdAt,
      state.status,
      state.referenceTransactionId,
      state.failureCode,
      state.processedAt,
      state.balanceAfter,
      state.retryCount,
      state.nextRetryAt,
    );
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }

  get failureCode(): FailureCode | undefined {
    return this._failureCode;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  get balanceAfter(): Money | undefined {
    return this._balanceAfter;
  }

  get retryCount(): number {
    return this._retryCount;
  }

  get nextRetryAt(): Date | undefined {
    return this._nextRetryAt;
  }

  markProcessed(referenceTransactionId: string | undefined, at: Date, balanceAfter?: Money): void {
    this.assertNotTerminal('markProcessed');
    this._status = WagerTransactionStatus.Processed;
    this._referenceTransactionId = referenceTransactionId;
    this._processedAt = at;
    this._balanceAfter = balanceAfter;
    this._nextRetryAt = undefined;
  }

  markPendingReference(nextRetryAt?: Date): void {
    this.assertNotTerminal('markPendingReference');
    this._status = WagerTransactionStatus.PendingReference;
    this._nextRetryAt = nextRetryAt;
  }

  scheduleReferenceRetry(now: Date, baseDelayMs = 1000, maxDelayMs = 30000): void {
    if (this._status !== WagerTransactionStatus.PendingReference) {
      throw new InvalidTransactionStateError(
        `Cannot schedule retry when status is ${this._status}`,
      );
    }
    this._retryCount += 1;
    const delay = Math.min(baseDelayMs * 2 ** (this._retryCount - 1), maxDelayMs);
    this._nextRetryAt = new Date(now.getTime() + delay);
  }

  reject(code: FailureCode, at: Date = new Date(), balanceObserved?: Money): void {
    this.assertNotTerminal('reject');
    this._status = WagerTransactionStatus.Rejected;
    this._failureCode = code;
    this._processedAt = at;
    this._balanceAfter = balanceObserved;
    this._nextRetryAt = undefined;
  }

  fail(code: FailureCode, at: Date = new Date()): void {
    this.assertNotTerminal('fail');
    this._status = WagerTransactionStatus.Failed;
    this._failureCode = code;
    this._processedAt = at;
    this._nextRetryAt = undefined;
  }

  isTerminal(): boolean {
    return (
      this._status === WagerTransactionStatus.Processed ||
      this._status === WagerTransactionStatus.Rejected ||
      this._status === WagerTransactionStatus.Failed
    );
  }

  affectsBalance(): boolean {
    return this.kind !== WagerTransactionKind.Loss;
  }

  requiresReference(): boolean {
    return (
      this.kind === WagerTransactionKind.Refund || this.kind === WagerTransactionKind.Rollback
    );
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    switch (this.kind) {
      case WagerTransactionKind.Opening:
      case WagerTransactionKind.Win:
      case WagerTransactionKind.Refund:
        return LedgerDirection.Credit;
      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;
      case WagerTransactionKind.Rollback: {
        if (!reference) {
          throw new InvalidTransactionStateError(
            'Cannot determine ledger direction for ROLLBACK without reference transaction',
          );
        }
        // Inverte o efeito da transação referenciada
        const refDirection = reference.ledgerDirectionFor();
        return refDirection === LedgerDirection.Debit
          ? LedgerDirection.Credit
          : LedgerDirection.Debit;
      }
      case WagerTransactionKind.Loss:
        throw new InvalidTransactionStateError('LOSS transactions do not produce ledger entries');
    }
  }

  private assertNotTerminal(action: string): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(
        `Cannot execute '${action}' on transaction '${this.id}' in terminal status '${this._status}'`,
      );
    }
  }
}

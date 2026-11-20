export abstract class DomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidMoneyError extends DomainError {
  readonly code = 'INVALID_MONEY';
  constructor(message: string) {
    super(message);
  }
}

export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';
  constructor(expected: string, received: string) {
    super(`Currency mismatch: expected ${expected}, received ${received}`);
  }
}

export class InsufficientFundsError extends DomainError {
  readonly code = 'INSUFFICIENT_FUNDS';
  constructor(balance: string, attemptedDebit: string, currency: string) {
    super(`Insufficient funds: balance ${balance} ${currency}, attempted debit ${attemptedDebit} ${currency}`);
  }
}

export class InvalidTransactionStateError extends DomainError {
  readonly code = 'INVALID_TRANSACTION_STATE';
  constructor(message: string) {
    super(message);
  }
}

export class InvalidLedgerEntryError extends DomainError {
  readonly code = 'INVALID_LEDGER_ENTRY';
  constructor(message: string) {
    super(message);
  }
}

export class IdempotencyConflictError extends DomainError {
  readonly code = 'IDEMPOTENCY_CONFLICT';
  constructor(idempotencyKey: string) {
    super(`Idempotency key '${idempotencyKey}' was already used with a different payload`);
  }
}

export class DuplicateWalletError extends DomainError {
  readonly code = 'DUPLICATE_WALLET';
  constructor(playerId: string, currency: string) {
    super(`Wallet already exists for player '${playerId}' and currency '${currency}'`);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  constructor(entity: string, identifier: string) {
    super(`${entity} '${identifier}' not found`);
  }
}

export class InvalidInputError extends DomainError {
  readonly code = 'INVALID_INPUT';
  constructor(message: string) {
    super(message);
  }
}
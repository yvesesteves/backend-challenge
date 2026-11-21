import { InboxRepositoryPort } from './inbox-repository.port';
import { LedgerRepositoryPort } from './ledger-repository.port';
import { OutboxRepositoryPort } from './outbox-repository.port';
import { TransactionRepositoryPort } from './transaction-repository.port';
import { WalletRepositoryPort } from './wallet-repository.port';

export interface TransactionalRepositories {
  wallets: WalletRepositoryPort;
  transactions: TransactionRepositoryPort;
  ledger: LedgerRepositoryPort;
  inbox: InboxRepositoryPort;
  outbox: OutboxRepositoryPort;
}

export interface UnitOfWorkPort {
  execute<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T>;
}

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

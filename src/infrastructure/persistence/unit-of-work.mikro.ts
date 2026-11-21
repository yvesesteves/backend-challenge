import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  TransactionalRepositories,
  UnitOfWorkPort,
} from '../../application/ports/unit-of-work.port';
import { MikroInboxRepository } from './repositories/inbox.repository';
import { MikroOutboxRepository } from './repositories/outbox.repository';
import { MikroWagerTransactionRepository } from './repositories/wager-transaction.repository';
import { MikroWalletLedgerRepository } from './repositories/wallet-ledger.repository';
import { MikroWalletRepository } from './repositories/wallet.repository';

@Injectable()
export class MikroUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly em: EntityManager) {}

  async execute<T>(work: (repos: TransactionalRepositories) => Promise<T>): Promise<T> {
    return this.em.fork().transactional(async (txEm) => {
      const repos: TransactionalRepositories = {
        wallets: new MikroWalletRepository(txEm),
        transactions: new MikroWagerTransactionRepository(txEm),
        ledger: new MikroWalletLedgerRepository(txEm),
        inbox: new MikroInboxRepository(txEm),
        outbox: new MikroOutboxRepository(txEm),
      };
      return work(repos);
    });
  }
}
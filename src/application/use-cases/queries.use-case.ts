import { Inject, Injectable } from '@nestjs/common';
import { WagerTransaction } from '../../domain/entities/wager-transaction';
import { NotFoundError } from '../../domain/errors/domain.error';
import { MoneyProps } from '../../domain/value-objects/money';
import { UNIT_OF_WORK, type UnitOfWorkPort } from '../ports/unit-of-work.port';

@Injectable()
export class WalletQueriesUseCase {
  constructor(
    @Inject(UNIT_OF_WORK)
    private readonly uow: UnitOfWorkPort,
  ) {}

  async getWallet(walletId: string): Promise<{
    id: string;
    playerId: string;
    balance: MoneyProps;
    version: number;
  }> {
    return this.uow.execute(async (repos) => {
      const wallet = await repos.wallets.findById(walletId);
      if (!wallet) {
        throw new NotFoundError('Wallet', walletId);
      }
      return {
        id: wallet.id,
        playerId: wallet.playerId,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
      };
    });
  }

  async getLedger(walletId: string, cursor?: string, limit = 50) {
    return this.uow.execute(async (repos) => {
      const wallet = await repos.wallets.findById(walletId);
      if (!wallet) {
        throw new NotFoundError('Wallet', walletId);
      }
      const page = await repos.ledger.findByWalletPaginated(walletId, cursor, limit);
      return {
        items: page.items.map((e) => ({
          id: e.id,
          walletId: e.walletId,
          transactionId: e.transactionId,
          direction: e.direction,
          money: e.money.toJSON(),
          balanceBefore: e.balanceBefore.toJSON(),
          balanceAfter: e.balanceAfter.toJSON(),
          createdAt: e.createdAt.toISOString(),
        })),
        nextCursor: page.nextCursor,
      };
    });
  }

  async getTransactionById(transactionId: string) {
    return this.uow.execute(async (repos) => {
      const tx = await repos.transactions.findById(transactionId);
      if (!tx) {
        throw new NotFoundError('WagerTransaction', transactionId);
      }
      return formatTransaction(tx);
    });
  }

  async getTransactionByProviderExternalId(providerId: string, externalTransactionId: string) {
    return this.uow.execute(async (repos) => {
      const tx = await repos.transactions.findByProviderAndExternalId(
        providerId,
        externalTransactionId,
      );
      if (!tx) {
        throw new NotFoundError('WagerTransaction', `${providerId}:${externalTransactionId}`);
      }
      return formatTransaction(tx);
    });
  }
}

function formatTransaction(tx: WagerTransaction) {
  return {
    id: tx.id,
    providerId: tx.providerId,
    externalTransactionId: tx.externalTransactionId,
    idempotencyKey: tx.idempotencyKey,
    walletId: tx.walletId,
    playerId: tx.playerId,
    roundId: tx.roundId,
    gameId: tx.gameId,
    kind: tx.kind,
    money: tx.money.toJSON(),
    status: tx.status,
    ...(tx.referenceExternalTransactionId
      ? { referenceExternalTransactionId: tx.referenceExternalTransactionId }
      : {}),
    ...(tx.referenceTransactionId ? { referenceTransactionId: tx.referenceTransactionId } : {}),
    ...(tx.failureCode ? { failureCode: tx.failureCode } : {}),
    ...(tx.balanceAfter ? { balanceAfter: tx.balanceAfter.toJSON() } : {}),
    createdAt: tx.createdAt.toISOString(),
    ...(tx.processedAt ? { processedAt: tx.processedAt.toISOString() } : {}),
  };
}
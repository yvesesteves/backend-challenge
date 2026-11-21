import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { WagerTransaction } from '../../domain/entities/wager-transaction';
import { Wallet } from '../../domain/entities/wallet';
import { WalletLedgerEntry } from '../../domain/entities/wallet-ledger-entry';
import { LedgerDirection } from '../../domain/enums/ledger-direction.enum';
import { DuplicateWalletError } from '../../domain/errors/domain.error';
import { computePayloadHash } from '../../domain/services/payload-hash.service';
import { Money, MoneyProps } from '../../domain/value-objects/money';
import { UNIT_OF_WORK, UnitOfWorkPort } from '../ports/unit-of-work.port';

export interface CreateWalletInput {
  playerId: string;
  initialBalance: MoneyProps;
}

export interface CreateWalletOutput {
  id: string;
  playerId: string;
  balance: MoneyProps;
  version: number;
}

@Injectable()
export class CreateWalletUseCase {
  constructor(
    @Inject(UNIT_OF_WORK)
    private readonly uow: UnitOfWorkPort,
  ) {}

  async execute(input: CreateWalletInput): Promise<CreateWalletOutput> {
    const initialMoney = Money.from(input.initialBalance);
    const now = new Date();
    const walletId = randomUUID();

    try {
      const wallet = await this.uow.execute(async (repos) => {
        const existing = await repos.wallets.findByPlayerAndCurrency(
          input.playerId,
          initialMoney.currency,
        );
        if (existing) {
          throw new DuplicateWalletError(input.playerId, initialMoney.currency);
        }

        const newWallet = Wallet.open({
          id: walletId,
          playerId: input.playerId,
          initialBalance: initialMoney,
          now,
        });

        await repos.wallets.save(newWallet);

        if (initialMoney.isPositive()) {
          const openingTxId = randomUUID();
          const openingTx = WagerTransaction.createOpening({
            id: openingTxId,
            walletId: newWallet.id,
            playerId: newWallet.playerId,
            money: initialMoney,
            payloadHash: computePayloadHash({
              walletId: newWallet.id,
              playerId: newWallet.playerId,
              initialBalance: initialMoney.toJSON(),
            }),
            at: now,
          });

          await repos.transactions.save(openingTx);

          const entry = WalletLedgerEntry.create({
            id: randomUUID(),
            walletId: newWallet.id,
            transactionId: openingTx.id,
            direction: LedgerDirection.Credit,
            money: initialMoney,
            balanceBefore: Money.zero(initialMoney.currency),
            balanceAfter: initialMoney,
            createdAt: now,
          });

          await repos.ledger.append(entry);
        }

        return newWallet;
      });

      return {
        id: wallet.id,
        playerId: wallet.playerId,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
      };
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new DuplicateWalletError(input.playerId, initialMoney.currency);
      }
      throw err;
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string; cause?: { code?: string } }).code ??
    (err as { cause?: { code?: string } }).cause?.code;
  return code === '23505';
}
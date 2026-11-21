import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { LedgerDirection } from '../../domain/enums/ledger-direction.enum';
import { NotFoundError } from '../../domain/errors/domain.error';
import { Money, MoneyProps } from '../../domain/value-objects/money';
import { METRICS_PORT, MetricsPort } from '../ports/metrics.port';
import { UNIT_OF_WORK, UnitOfWorkPort } from '../ports/unit-of-work.port';

export interface ReconcileWalletOutput {
  walletId: string;
  storedBalance: MoneyProps;
  calculatedBalance: MoneyProps;
  difference: MoneyProps;
  consistent: boolean;
  checkedEntries: number;
}

@Injectable()
export class ReconcileWalletUseCase {
  private readonly logger = new Logger(ReconcileWalletUseCase.name);

  constructor(
    @Inject(UNIT_OF_WORK)
    private readonly uow: UnitOfWorkPort,
    @Optional()
    @Inject(METRICS_PORT)
    private readonly metrics?: MetricsPort,
  ) {}

  async execute(walletId: string): Promise<ReconcileWalletOutput> {
    return this.uow.execute(async (repos) => {
      const wallet = await repos.wallets.findById(walletId);
      if (!wallet) {
        throw new NotFoundError('Wallet', walletId);
      }

      const entries = await repos.ledger.findAllByWallet(walletId);
      let calculated = Money.zero(wallet.currency);

      for (const entry of entries) {
        calculated =
          entry.direction === LedgerDirection.Credit
            ? calculated.add(entry.money)
            : calculated.subtract(entry.money);
      }

      const difference = wallet.balance.subtract(calculated);
      const consistent = difference.isZero();

      if (!consistent) {
        this.metrics?.incrementReconciliationDivergence();
        this.logger.error({
          msg: 'Wallet reconciliation divergence detected',
          walletId,
          checkedEntries: entries.length,
        });
      }

      return {
        walletId: wallet.id,
        storedBalance: wallet.balance.toJSON(),
        calculatedBalance: calculated.toJSON(),
        difference: difference.toJSON(),
        consistent,
        checkedEntries: entries.length,
      };
    });
  }
}
import { WalletLedgerEntry } from '../../../domain/entities/wallet-ledger-entry';
import { LedgerDirection } from '../../../domain/enums/ledger-direction.enum';
import { Money } from '../../../domain/value-objects/money';
import { WalletLedgerEntryOrmEntity } from '../entities/wallet-ledger-entry.orm-entity';

export class WalletLedgerEntryMapper {
  static toDomain(entity: WalletLedgerEntryOrmEntity): WalletLedgerEntry {
    return WalletLedgerEntry.rehydrate({
      id: entity.id,
      walletId: entity.walletId,
      transactionId: entity.transactionId,
      direction: entity.direction as LedgerDirection,
      money: Money.from({ amount: entity.amount, currency: entity.currency }),
      balanceBefore: Money.from({ amount: entity.balanceBefore, currency: entity.currency }),
      balanceAfter: Money.from({ amount: entity.balanceAfter, currency: entity.currency }),
      createdAt: entity.createdAt,
    });
  }

  static toOrm(domain: WalletLedgerEntry): WalletLedgerEntryOrmEntity {
    const entity = new WalletLedgerEntryOrmEntity();
    const moneyJson = domain.money.toJSON();
    entity.id = domain.id;
    entity.walletId = domain.walletId;
    entity.transactionId = domain.transactionId;
    entity.direction = domain.direction;
    entity.amount = moneyJson.amount;
    entity.currency = moneyJson.currency;
    entity.balanceBefore = domain.balanceBefore.toJSON().amount;
    entity.balanceAfter = domain.balanceAfter.toJSON().amount;
    entity.createdAt = domain.createdAt;
    return entity;
  }
}
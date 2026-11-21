import { Wallet } from '../../../domain/entities/wallet';
import { Money } from '../../../domain/value-objects/money';
import { WalletOrmEntity } from '../entities/wallet.orm-entity';

export class WalletMapper {
  static toDomain(entity: WalletOrmEntity): Wallet {
    return Wallet.rehydrate({
      id: entity.id,
      playerId: entity.playerId,
      currency: entity.currency,
      balance: Money.from({ amount: entity.balance, currency: entity.currency }),
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static applyToOrm(domain: Wallet, target: WalletOrmEntity): WalletOrmEntity {
    target.id = domain.id;
    target.playerId = domain.playerId;
    target.currency = domain.currency;
    target.balance = domain.balance.toJSON().amount;
    target.version = domain.version;
    target.createdAt = domain.createdAt;
    target.updatedAt = domain.updatedAt;
    return target;
  }
}
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { WalletRepositoryPort } from '../../../application/ports/wallet-repository.port';
import { Wallet } from '../../../domain/entities/wallet';
import { WalletOrmEntity } from '../entities/wallet.orm-entity';
import { WalletMapper } from '../mappers/wallet.mapper';

export class MikroWalletRepository implements WalletRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletOrmEntity, { id });
    return entity ? WalletMapper.toDomain(entity) : null;
  }

  async findByIdForUpdate(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(
      WalletOrmEntity,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    return entity ? WalletMapper.toDomain(entity) : null;
  }

  async findByPlayerAndCurrency(playerId: string, currency: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletOrmEntity, { playerId, currency });
    return entity ? WalletMapper.toDomain(entity) : null;
  }

  async save(wallet: Wallet): Promise<void> {
    let entity = await this.em.findOne(WalletOrmEntity, { id: wallet.id });
    if (!entity) {
      entity = new WalletOrmEntity();
      WalletMapper.applyToOrm(wallet, entity);
      this.em.persist(entity);
    } else {
      WalletMapper.applyToOrm(wallet, entity);
    }
    await this.em.flush();
  }
}
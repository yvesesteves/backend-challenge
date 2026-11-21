import { Wallet } from '../../domain/entities/wallet';

export interface WalletRepositoryPort {
  findById(id: string): Promise<Wallet | null>;
  /** Carrega a wallet com SELECT ... FOR UPDATE (PESSIMISTIC_WRITE) dentro da transação. */
  findByIdForUpdate(id: string): Promise<Wallet | null>;
  findByPlayerAndCurrency(playerId: string, currency: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<void>;
}

export const WALLET_REPOSITORY = Symbol('WALLET_REPOSITORY');

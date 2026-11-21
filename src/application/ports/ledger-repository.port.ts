import { WalletLedgerEntry } from '../../domain/entities/wallet-ledger-entry';

export interface LedgerPage {
  items: WalletLedgerEntry[];
  nextCursor: string | null;
}

export interface LedgerRepositoryPort {
  append(entry: WalletLedgerEntry): Promise<void>;
  findByWalletPaginated(walletId: string, cursor: string | undefined, limit: number): Promise<LedgerPage>;
  findAllByWallet(walletId: string): Promise<WalletLedgerEntry[]>;
}

export const LEDGER_REPOSITORY = Symbol('LEDGER_REPOSITORY');

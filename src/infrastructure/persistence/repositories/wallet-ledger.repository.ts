import { EntityManager } from '@mikro-orm/postgresql';
import { LedgerPage, LedgerRepositoryPort } from '../../../application/ports/ledger-repository.port';
import { WalletLedgerEntry } from '../../../domain/entities/wallet-ledger-entry';
import { InvalidInputError } from '../../../domain/errors/domain.error';
import { WalletLedgerEntryOrmEntity } from '../entities/wallet-ledger-entry.orm-entity';
import { WalletLedgerEntryMapper } from '../mappers/wallet-ledger-entry.mapper';

function encodeCursor(seq: string): string {
  return Buffer.from(JSON.stringify({ seq }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): string {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      seq?: string;
    };
    if (!parsed.seq || !/^\d+$/.test(parsed.seq)) {
      throw new Error('Invalid cursor structure');
    }
    return parsed.seq;
  } catch {
    throw new InvalidInputError('Invalid pagination cursor');
  }
}

export class MikroWalletLedgerRepository implements LedgerRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async append(entry: WalletLedgerEntry): Promise<void> {
    const ormEntity = WalletLedgerEntryMapper.toOrm(entry);
    this.em.persist(ormEntity);
    await this.em.flush();
  }

  async findByWalletPaginated(
    walletId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<LedgerPage> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const params: unknown[] = [walletId];
    let cursorClause = '';

    if (cursor) {
      const seq = decodeCursor(cursor);
      cursorClause = 'AND seq < ?';
      params.push(seq);
    }

    params.push(safeLimit + 1);

    const rows = await this.em.getConnection().execute<Array<Record<string, unknown>>>(
      `
      SELECT *
      FROM wallet_ledger_entries
      WHERE wallet_id = ?
      ${cursorClause}
      ORDER BY seq DESC
      LIMIT ?
      `,
      params,
    );

    const hasMore = rows.length > safeLimit;
    const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;

    const items = pageRows.map((row) => {
      const mapped = this.em.map(WalletLedgerEntryOrmEntity, row);
      return WalletLedgerEntryMapper.toDomain(mapped);
    });

    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && lastRow ? encodeCursor(String(lastRow['seq'])) : null;

    return { items, nextCursor };
  }

  async findAllByWallet(walletId: string): Promise<WalletLedgerEntry[]> {
    const entities = await this.em.find(
      WalletLedgerEntryOrmEntity,
      { walletId },
      { orderBy: { createdAt: 'ASC' } },
    );
    return entities.map(WalletLedgerEntryMapper.toDomain);
  }
}
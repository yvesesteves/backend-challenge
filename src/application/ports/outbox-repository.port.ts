import { OutboxMessage } from '../../domain/entities/outbox-message';

export interface OutboxRepositoryPort {
  enqueue(message: OutboxMessage): Promise<void>;
  /** Busca mensagens pendentes com FOR UPDATE SKIP LOCKED para múltiplos publishers concorrentes. */
  claimDueMessages(now: Date, limit: number): Promise<OutboxMessage[]>;
  save(message: OutboxMessage): Promise<void>;
  countPending(): Promise<number>;
}

export const OUTBOX_REPOSITORY = Symbol('OUTBOX_REPOSITORY');

import { InboxMessage } from '../../domain/entities/inbox-message';

export interface InboxRepositoryPort {
  findByConsumerAndMessageId(consumerName: string, messageId: string): Promise<InboxMessage | null>;
  save(message: InboxMessage): Promise<void>;
}

export const INBOX_REPOSITORY = Symbol('INBOX_REPOSITORY');

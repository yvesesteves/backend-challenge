import { EntityManager } from '@mikro-orm/postgresql';
import { InboxRepositoryPort } from '../../../application/ports/inbox-repository.port';
import { InboxMessage } from '../../../domain/entities/inbox-message';
import { InboxMessageOrmEntity } from '../entities/inbox-message.orm-entity';
import { InboxMessageMapper } from '../mappers/inbox-message.mapper';

export class MikroInboxRepository implements InboxRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async findByConsumerAndMessageId(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null> {
    const entity = await this.em.findOne(InboxMessageOrmEntity, { consumerName, messageId });
    return entity ? InboxMessageMapper.toDomain(entity) : null;
  }

  async save(message: InboxMessage): Promise<void> {
    let entity = await this.em.findOne(InboxMessageOrmEntity, { id: message.id });
    if (!entity) {
      entity = new InboxMessageOrmEntity();
      InboxMessageMapper.applyToOrm(message, entity);
      this.em.persist(entity);
    } else {
      InboxMessageMapper.applyToOrm(message, entity);
    }
    await this.em.flush();
  }
}
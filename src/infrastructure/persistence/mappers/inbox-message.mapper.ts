import { InboxMessage } from '../../../domain/entities/inbox-message';
import { InboxMessageOrmEntity } from '../entities/inbox-message.orm-entity';

export class InboxMessageMapper {
  static toDomain(entity: InboxMessageOrmEntity): InboxMessage {
    return InboxMessage.rehydrate({
      id: entity.id,
      messageId: entity.messageId,
      consumerName: entity.consumerName,
      payloadHash: entity.payloadHash,
      receivedAt: entity.receivedAt,
      processedAt: entity.processedAt ?? undefined,
    });
  }

  static applyToOrm(
    domain: InboxMessage,
    target: InboxMessageOrmEntity,
  ): InboxMessageOrmEntity {
    target.id = domain.id;
    target.messageId = domain.messageId;
    target.consumerName = domain.consumerName;
    target.payloadHash = domain.payloadHash;
    target.receivedAt = domain.receivedAt;
    target.processedAt = domain.processedAt ?? null;
    return target;
  }
}
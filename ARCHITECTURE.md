# **Architecture & Design Decisions**

## **1. Visão Geral**

O **Distributed Wagering Processor** foi projetado seguindo **Arquitetura Hexagonal (Ports & Adapters)** combinada com **Domain-Driven Design (DDD)**. O núcleo de domínio (`src/domain`) é 100% puro — sem dependências de NestJS, MikroORM, HTTP ou AWS SDK — garantindo testabilidade isolada e evolução segura das regras financeiras.

```text
src/
├── domain/          # Entidades puras, Value Objects (Money), Enums, Erros, Eventos e Hash Canônico
├── application/     # Ports (interfaces) e Use Cases transacionais
├── infrastructure/  # Adaptadores: MikroORM (Postgres), SQS/Workers, Auth, Pino e Prometheus
└── presentation/    # Controllers HTTP, DTOs e DomainExceptionFilter
```

---

## **2. Garantias Financeiras e de Consistência**

### 2.1 Precisão Monetária
* Todos os valores monetários são encapsulados pelo Value Object `Money` apoiado em `decimal.js` (aritmética decimal exata, escala fixa de 2 casas).
* No PostgreSQL, valores são armazenados como `NUMERIC(19, 2)`, eliminando erros de ponto flutuante (`0.10 + 0.20 === 0.30`).

### 2.2 Controle de Concorrência (`Pessimistic Row-Level Locking`)
* Toda movimentação de carteira executa dentro de uma transação SQL única (`MikroUnitOfWork`), adquirindo lock pessimista na linha da carteira via `SELECT ... FOR UPDATE` (`LockMode.PESSIMISTIC_WRITE`).
* **Por que Pessimistic Locking em vez de apenas Optimistic?** Em cenários de alta contenção sobre a mesma carteira (ex.: múltiplas apostas simultâneas do mesmo jogador), o lock por linha serializa a execução por `walletId` entre múltiplas instâncias da aplicação sem desperdiçar ciclos com retries em cascata, mantendo paralelismo total entre carteiras distintas.
* A coluna `version` na tabela `wallets` é incrementada a cada movimentação para rastreabilidade e auditoria de estado.

### 2.3 Idempotência Persistente com Hash Canônico
* Cada requisição HTTP exige o header `Idempotency-Key` (e mensagens SQS derivam uma chave determinística caso omitida).
* Um hash SHA-256 canônico (`computePayloadHash`) é calculado exclusivamente sobre os campos de negócio, independente da ordem das chaves JSON.
* **Mesma chave + mesmo hash:** retorna o resultado original com `idempotentReplay: true` sem reexecutar débitos/créditos.
* **Mesma chave + hash divergente:** retorna `409 Conflict` (`IDEMPOTENCY_CONFLICT`).

### 2.4 Ledger Imutável (Append-Only) e Reconciliação
* A tabela `wallet_ledger_entries` aceita apenas inserções. Uma **trigger no PostgreSQL** bloqueia estruturalmente qualquer `UPDATE` ou `DELETE` no banco.
* Carteiras criadas com `initialBalance > 0` geram atomicamente uma transação interna `OPENING` e seu lançamento `CREDIT` correspondente, garantindo que a soma do ledger seja sempre igual ao saldo armazenado.
* O endpoint `POST /wallets/:walletId/reconciliation` recalcula o saldo a partir de todo o histórico do ledger e reporta divergências sem corrigi-las silenciosamente.
* A listagem do ledger (`GET /wallets/:walletId/ledger`) utiliza paginação por cursor opaco em Base64 baseado na coluna monotônica `seq`.

---

## ** 3. Processamento Assíncrono e Resiliência**

### 3.1 Transactional Outbox Pattern
* Eventos de integração (`WagerTransactionProcessed`, `WagerTransactionRejected`, `WagerTransactionPendingReference`, `WalletBalanceChanged`) são gravados na tabela `outbox_messages` **na mesma transação SQL** da atualização da carteira.
* O `OutboxPublisherWorker` consome pendências com `FOR UPDATE SKIP LOCKED` (seguro para múltiplas réplicas) e publica na fila `wager-events.fifo` usando `MessageGroupId = aggregateId` (`walletId`) e `MessageDeduplicationId = outboxId`.

### 3.2 Inbox Pattern (Deduplicação SQS)
* O `WagerSqsConsumer` registra cada `messageId` na tabela `inbox_messages` dentro da mesma transação do processamento, protegendo contra reentregas *at-least-once* do SQS.
* Erros determinísticos de domínio são reconhecidos (deletados da fila) para evitar loops infinitos; falhas transitórias de infraestrutura são mantidas na fila para retry e eventual roteamento à DLQ (`wager-transactions-dlq.fifo`).

### 3.3 Eventos Fora de Ordem (`PENDING_REFERENCE`)
* Quando um `REFUND` ou `ROLLBACK` chega antes da transação original, o sistema persiste o registro com status `PENDING_REFERENCE` (HTTP `202 Accepted`).
* O `PendingReferenceWorker` reavalia periodicamente os registros pendentes com `FOR UPDATE SKIP LOCKED` e backoff exponencial. Caso a referência chegue, aplica a reversão; ao exceder `PENDING_REF_MAX_RETRIES`, rejeita com `REFERENCE_TIMEOUT`.

---

## **4. Autenticação (Ponto de Extensão) e Observabilidade**

* **Auth:** Definida via `ProviderIdentityPort` e `NoOpAuthGuard` nos controllers de negócio, deixando o ponto de extensão explícito para integração futura com IdP externo (Keycloak/Zitadel via OIDC), enquanto `/health/*` e `/metrics` permanecem abertos para probes e scraping.
* **Observabilidade:**
  * Logs estruturados em JSON (`nestjs-pino`) com `correlationId` e redação automática de headers de autenticação e payloads financeiros.
  * Métricas Prometheus em `GET /metrics` (`wagering_transactions_total`, `wagering_duplicates_detected_total`, `wagering_retries_total`, `wagering_dlq_messages_total`, `wagering_outbox_pending_messages`, `wagering_reconciliation_divergences_total` e histograma de latência).

---
*Developed by Yves Esteves*
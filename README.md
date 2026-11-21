# **Distributed Wagering Processor**

Processador distribuído de transações financeiras de apostas (`BET`, `WIN`, `LOSS`, `REFUND`, `ROLLBACK`) construído com **Bun**, **TypeScript (strict)**, **NestJS**, **MikroORM (PostgreSQL)** e **AWS SQS FIFO (LocalStack)**.

Consulte [`ARCHITECTURE.md`](./ARCHITECTURE.md) para detalhes das decisões arquiteturais (concorrência, idempotência, ledger imutável, Outbox/Inbox e tratamento de eventos fora de ordem).

---

## **Requisitos**

* [Bun 1.x](https://bun.sh/)
* [Docker & Docker Compose](https://www.docker.com/)

---

## **Como Executar Localmente**

### 1. Instalar dependências e configurar ambiente

```bash
bun install
cp .env.example .env
```

### 2. Subir infraestrutura (PostgreSQL + LocalStack SQS FIFO)

```bash
docker compose up -d
```

O script em `localstack-init/` cria automaticamente as filas FIFO:
* `wager-transactions.fifo` (com redrive policy para `wager-transactions-dlq.fifo`)
* `wager-events.fifo`

### 3. Rodar migrations do banco de dados

```bash
bun run db:migrate
```

### 4. Iniciar a aplicação

```bash
bun run dev
```

A API sobe em `http://localhost:3000`.

---

## **Testes e Validação**

```bash
# Verificação estática de tipos (TypeScript strict)
bun run typecheck

# Testes unitários (domínio puro: Money, Hash Canônico, Wallet, WagerTransaction)
bun run test:unit

# Testes de integração e concorrência (requer Docker rodando)
bun test test/integration
```

---

## **Principais Endpoints**

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `POST` | `/wallets` | Cria carteira para `(playerId, currency)` com lançamento `OPENING` se saldo > 0 |
| `GET` | `/wallets/:walletId` | Consulta saldo atual e versão da carteira |
| `GET` | `/wallets/:walletId/ledger?cursor=&limit=` | Extrato imutável paginado por cursor |
| `POST` | `/wallets/:walletId/reconciliation` | Reconcilia saldo armazenado vs. soma do ledger |
| `POST` | `/wagering/transactions` | Processa transação (requer header `Idempotency-Key`) |
| `GET` | `/wagering/transactions/:transactionId` | Consulta transação por ID interno |
| `GET` | `/providers/:providerId/wagering/transactions/:externalTransactionId` | Consulta transação por chave do provedor |
| `GET` | `/health/live` | Liveness probe |
| `GET` | `/health/ready` | Readiness probe (valida PostgreSQL e SQS) |
| `GET` | `/metrics` | Métricas no formato Prometheus |

---

## **Exemplo Rápido de Uso**

```bash
# Criar carteira
curl -X POST http://localhost:3000/wallets \
  -H "Content-Type: application/json" \
  -d '{
    "playerId": "11111111-1111-4111-8111-111111111111",
    "initialBalance": { "amount": "100.00", "currency": "BRL" }
  }'

# Submeter aposta (substitua <WALLET_ID>)
curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: bet-req-001" \
  -d '{
    "providerId": "provider-a",
    "externalTransactionId": "ext-bet-001",
    "playerId": "11111111-1111-4111-8111-111111111111",
    "walletId": "<WALLET_ID>",
    "roundId": "round-1",
    "gameId": "slots-1",
    "kind": "BET",
    "money": { "amount": "25.00", "currency": "BRL" }
  }'
```
---
*Developed by Yves Esteves*
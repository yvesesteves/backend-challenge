import { Migration } from '@mikro-orm/migrations';

export class Migration20261120000001_InitialSchema extends Migration {
  override async up(): Promise<void> {
    // 1. WALLETS
    this.addSql(`
      CREATE TABLE wallets (
        id UUID PRIMARY KEY,
        player_id UUID NOT NULL,
        currency VARCHAR(3) NOT NULL,
        balance NUMERIC(19, 2) NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_wallets_player_currency UNIQUE (player_id, currency),
        CONSTRAINT chk_wallets_balance_non_negative CHECK (balance >= 0),
        CONSTRAINT chk_wallets_version_positive CHECK (version >= 1),
        CONSTRAINT chk_wallets_currency_iso CHECK (char_length(currency) = 3)
      );
    `);

    // 2. WAGER TRANSACTIONS
    this.addSql(`
      CREATE TABLE wager_transactions (
        id UUID PRIMARY KEY,
        provider_id VARCHAR(100) NOT NULL,
        external_transaction_id VARCHAR(255) NOT NULL,
        idempotency_key VARCHAR(255) NOT NULL,
        payload_hash VARCHAR(64) NOT NULL,
        wallet_id UUID NOT NULL REFERENCES wallets(id),
        player_id UUID NOT NULL,
        round_id VARCHAR(255) NOT NULL,
        game_id VARCHAR(255) NOT NULL,
        kind VARCHAR(20) NOT NULL,
        amount NUMERIC(19, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        reference_external_transaction_id VARCHAR(255) NULL,
        reference_transaction_id UUID NULL REFERENCES wager_transactions(id),
        status VARCHAR(30) NOT NULL,
        failure_code VARCHAR(100) NULL,
        balance_after NUMERIC(19, 2) NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ NULL,

        CONSTRAINT uq_wager_tx_idempotency_key UNIQUE (idempotency_key),
        CONSTRAINT uq_wager_tx_provider_ext_id UNIQUE (provider_id, external_transaction_id),
        CONSTRAINT chk_wager_tx_amount_non_negative CHECK (amount >= 0),
        CONSTRAINT chk_wager_tx_kind CHECK (kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')),
        CONSTRAINT chk_wager_tx_status CHECK (status IN ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'))
      );

      -- Garante no banco que uma referência não pode ser revertida duas vezes pelo mesmo tipo de operação
      CREATE UNIQUE INDEX uq_wager_tx_single_reversal_per_kind
        ON wager_transactions (reference_transaction_id, kind)
        WHERE status = 'PROCESSED'
          AND reference_transaction_id IS NOT NULL
          AND kind IN ('REFUND', 'ROLLBACK');

      -- Índice para o worker de PENDING_REFERENCE
      CREATE INDEX idx_wager_tx_pending_reference
        ON wager_transactions (next_retry_at)
        WHERE status = 'PENDING_REFERENCE';

      CREATE INDEX idx_wager_tx_wallet_id ON wager_transactions (wallet_id);
    `);

    // 3. WALLET LEDGER ENTRIES (IMUTÁVEL)
    this.addSql(`
      CREATE TABLE wallet_ledger_entries (
        id UUID PRIMARY KEY,
        seq BIGSERIAL NOT NULL UNIQUE,
        wallet_id UUID NOT NULL REFERENCES wallets(id),
        transaction_id UUID NOT NULL REFERENCES wager_transactions(id),
        direction VARCHAR(10) NOT NULL,
        amount NUMERIC(19, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        balance_before NUMERIC(19, 2) NOT NULL,
        balance_after NUMERIC(19, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT uq_ledger_wallet_transaction UNIQUE (wallet_id, transaction_id),
        CONSTRAINT chk_ledger_direction CHECK (direction IN ('DEBIT', 'CREDIT')),
        CONSTRAINT chk_ledger_amount_positive CHECK (amount > 0),
        CONSTRAINT chk_ledger_balance_before_non_negative CHECK (balance_before >= 0),
        CONSTRAINT chk_ledger_balance_after_non_negative CHECK (balance_after >= 0),
        CONSTRAINT chk_ledger_arithmetic CHECK (
          (direction = 'CREDIT' AND balance_after = balance_before + amount) OR
          (direction = 'DEBIT' AND balance_after = balance_before - amount)
        )
      );

      CREATE INDEX idx_ledger_wallet_seq ON wallet_ledger_entries (wallet_id, seq DESC);

      -- Trigger que bloqueia UPDATE e DELETE no ledger (imutabilidade no banco)
      CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'wallet_ledger_entries is immutable: % is not allowed', TG_OP;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_prevent_ledger_mutation
        BEFORE UPDATE OR DELETE ON wallet_ledger_entries
        FOR EACH ROW
        EXECUTE FUNCTION prevent_ledger_mutation();
    `);

    // 4. INBOX MESSAGES
    this.addSql(`
      CREATE TABLE inbox_messages (
        id UUID PRIMARY KEY,
        message_id VARCHAR(255) NOT NULL,
        consumer_name VARCHAR(100) NOT NULL,
        payload_hash VARCHAR(64) NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ NULL,

        CONSTRAINT uq_inbox_consumer_message UNIQUE (consumer_name, message_id)
      );
    `);

    // 5. OUTBOX MESSAGES
    this.addSql(`
      CREATE TABLE outbox_messages (
        id UUID PRIMARY KEY,
        aggregate_id UUID NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NULL,
        published_at TIMESTAMPTZ NULL
      );

      CREATE INDEX idx_outbox_pending
        ON outbox_messages (next_attempt_at NULLS FIRST, occurred_at ASC)
        WHERE published_at IS NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS outbox_messages;`);
    this.addSql(`DROP TABLE IF EXISTS inbox_messages;`);
    this.addSql(`DROP TRIGGER IF EXISTS trg_prevent_ledger_mutation ON wallet_ledger_entries;`);
    this.addSql(`DROP FUNCTION IF EXISTS prevent_ledger_mutation();`);
    this.addSql(`DROP TABLE IF EXISTS wallet_ledger_entries;`);
    this.addSql(`DROP TABLE IF EXISTS wager_transactions;`);
    this.addSql(`DROP TABLE IF EXISTS wallets;`);
  }
}
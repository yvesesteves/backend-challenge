import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { Migration20261120000001_InitialSchema } from './src/infrastructure/persistence/migrations/Migration20261120000001_InitialSchema';

export default defineConfig({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'wagering',
  password: process.env.DB_PASSWORD ?? 'wagering',
  dbName: process.env.DB_NAME ?? 'wagering_db',
  entities: ['./src/infrastructure/persistence/entities/*.orm-entity.ts'],
  discovery: { warnWhenNoEntities: false },
  extensions: [Migrator],
  migrations: {
    migrationsList: [
      {
        name: 'Migration20261120000001_InitialSchema',
        class: Migration20261120000001_InitialSchema,
      },
    ],
    transactional: true,
    allOrNothing: true,
  },
  debug: process.env.NODE_ENV === 'development',
});
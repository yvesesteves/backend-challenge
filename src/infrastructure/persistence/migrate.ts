import { MikroORM } from '@mikro-orm/postgresql';
import config from '../../../mikro-orm.config';

const command = process.argv[2] ?? 'up';

const orm = await MikroORM.init(config);
const migrator = orm.getMigrator();

try {
  if (command === 'up') {
    const executed = await migrator.up();
    console.log(`Migrations UP concluídas (${executed.length} executadas).`);
  } else if (command === 'down') {
    const reverted = await migrator.down();
    console.log(`Migrations DOWN concluídas (${reverted.length} revertidas).`);
  } else if (command === 'fresh') {
    await migrator.down({ to: 0 });
    const executed = await migrator.up();
    console.log(`Migrations FRESH concluídas (${executed.length} executadas).`);
  } else {
    console.error(`Comando inválido: ${command}. Use: up | down | fresh`);
    process.exit(1);
  }
} finally {
  await orm.close(true);
}
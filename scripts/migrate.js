import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');
const fallbackSchema = path.join(root, 'supabase', 'schema.sql');
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL ou SUPABASE_DB_URL precisa estar configurada na Vercel para aplicar migrations.');
  }
  console.log('DATABASE_URL/SUPABASE_DB_URL ausente; migrations ignoradas.');
  process.exit(0);
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function migrationFiles() {
  if (await pathExists(migrationsDir)) {
    const files = await readdir(migrationsDir);
    return files
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => path.join(migrationsDir, file));
  }

  if (await pathExists(fallbackSchema)) {
    return [fallbackSchema];
  }

  return [];
}

function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

await client.connect();

try {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      checksum text not null,
      executed_at timestamptz not null default now()
    )
  `);

  const files = await migrationFiles();
  if (!files.length) {
    console.log('Nenhuma migration SQL encontrada.');
    process.exit(0);
  }

  for (const filePath of files) {
    const version = path.basename(filePath);
    const sql = await readFile(filePath, 'utf8');
    const hash = checksum(sql);
    const { rows } = await client.query('select checksum from schema_migrations where version = $1', [version]);

    if (rows[0]?.checksum === hash) {
      console.log(`skip ${version}`);
      continue;
    }

    if (rows[0] && rows[0].checksum !== hash) {
      throw new Error(`Migration ${version} ja foi aplicada com outro checksum.`);
    }

    console.log(`apply ${version}`);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (version, checksum) values ($1, $2)', [version, hash]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }

  console.log('Migrations concluidas.');
} finally {
  await client.end();
}

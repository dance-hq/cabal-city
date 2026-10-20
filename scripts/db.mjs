#!/usr/bin/env node
// Applies supabase/migrations/*.sql (in order) and optionally supabase/seed.sql
// to the database in POSTGRES_URL_NON_POOLING. Applied migrations are
// recorded in public.cabal_migrations so re-running is safe.
//
//   node scripts/db.mjs migrate
//   node scripts/db.mjs seed
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

loadEnv('.env.local')
loadEnv('.env.development.local')

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL
if (!url) {
  console.error('Set POSTGRES_URL_NON_POOLING (direct Postgres connection string).')
  process.exit(1)
}

const command = process.argv[2] ?? 'migrate'
const client = new pg.Client({
  connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
  ssl: { rejectUnauthorized: false },
})
await client.connect()

try {
  if (command === 'migrate') await migrate()
  else if (command === 'seed') await seed()
  else throw new Error(`Unknown command: ${command}`)
} finally {
  await client.end()
}

async function migrate() {
  await client.query(`create table if not exists public.cabal_migrations (
    name text primary key, applied_at timestamptz not null default now())`)
  await client.query('alter table public.cabal_migrations enable row level security')
  const dir = 'supabase/migrations'
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const { rows } = await client.query('select name from public.cabal_migrations')
  const done = new Set(rows.map((r) => r.name))
  for (const file of files) {
    if (done.has(file)) continue
    console.log(`Applying ${file}`)
    await client.query('begin')
    try {
      await client.query(readFileSync(join(dir, file), 'utf8'))
      await client.query('insert into public.cabal_migrations (name) values ($1)', [file])
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  }
  console.log('Migrations up to date.')
}

async function seed() {
  const sql = readFileSync('supabase/seed.sql', 'utf8')
  await client.query(sql)
  console.log('Seed applied.')
}

function loadEnv(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
}

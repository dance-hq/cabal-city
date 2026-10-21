// Temporary: applies 0017 in one transaction and records it in both ledgers.
const { readFileSync } = require('node:fs')
const pg = require('pg')

const file = '0017_dm_encryption.sql'
const sql = readFileSync(`supabase/migrations/${file}`, 'utf8')
const c = new pg.Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING.replace(/[?&]sslmode=[^&]*/, ''),
  ssl: { rejectUnauthorized: false },
})

;(async () => {
  await c.connect()
  const done = await c.query('select 1 from public.cabal_migrations where name = $1', [file])
  if (done.rowCount) throw new Error(`${file} is already applied`)
  await c.query('begin')
  try {
    await c.query("set local lock_timeout = '5s'")
    await c.query(sql)
    await c.query('insert into public.cabal_migrations (name) values ($1)', [file])
    await c.query(
      'insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)',
      ['20261022000000', 'dm_encryption', [sql]],
    )
    await c.query('commit')
    console.log('APPLIED', file)
  } catch (e) {
    await c.query('rollback')
    throw e
  } finally {
    await c.end()
  }
})().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})

// Apply only the independent QR migration, preserving other work in progress.
import { Client } from 'pg'
import { databaseConfig } from './database-client.mjs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

process.loadEnvFile('.env.local')
const name = '202609271001_independent_qr_friends.sql'
const sql = await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')
const checksum = createHash('sha256').update(sql).digest('hex')
const client = new Client(databaseConfig())
try {
  await client.connect()
  await client.query('begin')
  await client.query("select pg_advisory_xact_lock(hashtextextended('upcatch-schema-migrations',0))")
  const existing = await client.query('select checksum from private.app_schema_migrations where name=$1', [name])
  if (existing.rowCount) {
    if (existing.rows[0].checksum !== checksum) throw new Error('Recorded QR migration checksum differs')
    await client.query('rollback')
    console.log('QR migration already applied')
  } else {
    await client.query(sql.replace(/^\s*(?:--[^\n]*\n)*\s*begin;\s*/i, '').replace(/commit;\s*$/i, ''))
    await client.query('insert into private.app_schema_migrations(name,checksum) values($1,$2)', [name, checksum])
    await client.query('commit')
    console.log('Applied ' + name)
  }
} catch (error) {
  await client.query('rollback').catch(() => {})
  console.error('QR migration not applied: ' + (error.code ?? 'unknown') + '; ' + (error.code === '42723' ? error.message : error.code ? 'database rejected the operation' : error.message))
  process.exitCode = 1
} finally { await client.end() }

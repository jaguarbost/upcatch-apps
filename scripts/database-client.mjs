import { readFileSync } from 'node:fs'
export function databaseConfig(){
 const value=process.env.SUPABASE_DB_URL
 if(!value)throw new Error('SUPABASE_DB_URL is required')
 const url=new URL(value)
 // Keep TLS settings outside the URI so pg cannot replace the verified CA configuration.
 for(const key of ['sslmode','sslrootcert','sslcert','sslkey','ssl'])url.searchParams.delete(key)
 return {connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync(new URL('./supabase-ca.crt',import.meta.url),'utf8')},connectionTimeoutMillis:15000,statement_timeout:60000}
}

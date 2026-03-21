import { Pool, PoolClient } from 'pg';
import { config } from './config';

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000, // Increased from 5000ms to 15000ms
  statement_timeout: 10000,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
});

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
    try {
      const res = await pool.query(text, params);
      // Log UPDATE/INSERT/DELETE operations
      if (!text.trim().toUpperCase().startsWith('SELECT')) {
        console.log(`✅ Query executed: ${text.substring(0, 50)}... | Rows affected: ${res.rowCount}`);
      }
      return { rows: res.rows };
    } catch (err: any) {
      retries++;
      const errorMsg = err?.message || String(err);
      console.error(`❌ Query error (attempt ${retries}/${maxRetries}):`, errorMsg);
      console.error(`   SQL: ${text.substring(0, 100)}`);
      console.error(`   Params:`, params);
      
      if (retries >= maxRetries || !isRetryableError(err)) {
        console.error('❌ Query failed permanently:', err);
        throw err;
      }
      // Exponential backoff: 500ms, 1000ms, 2000ms
      const delay = Math.pow(2, retries - 1) * 500;
      console.warn(`⏳ Retrying in ${delay}ms (attempt ${retries}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Max retries exceeded');
}

function isRetryableError(err: any): boolean {
  const message = err?.message || '';
  return message.includes('timeout') || 
         message.includes('ECONNREFUSED') || 
         message.includes('ENOTFOUND') ||
         message.includes('Connection terminated');
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const results = await query<T>(text, params);
  return results.rows[0] || null;
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    return !!result.rows[0];
  } catch (err) {
    console.error('Database health check failed:', err);
    return false;
  }
}

export default pool;

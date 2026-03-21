const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL environment variable not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
});

async function runMigration() {
  try {
    console.log('🔗 Connecting to database...');
    const client = await pool.connect();
    
    console.log('📖 Reading migration file...');
    const migrationPath = path.join(__dirname, 'src', 'migrations', 'add_video_code_to_sessions.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('🔄 Executing migration...');
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    client.release();
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function testConnection() {
  try {
    console.log('🔄 Testing Neon database connection...');
    console.log(`📍 Host: ${process.env.DB_HOST}`);
    console.log(`📊 Database: ${process.env.DB_NAME}`);
    
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful!');
    console.log(`⏰ Server time: ${result.rows[0].now}`);

    // Test if tables exist
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log(`\n📋 Tables found: ${tables.rows.length}`);
    if (tables.rows.length > 0) {
      console.log('✅ Database schema is set up!');
      tables.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('⚠️  No tables found. Run migrations first:');
      console.log('   psql <connection-string> < migrations/001_initial_schema.sql');
    }

    await pool.end();
  } catch (err) {
    console.error('❌ Database connection failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

testConnection();

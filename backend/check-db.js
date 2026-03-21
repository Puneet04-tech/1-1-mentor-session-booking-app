const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkDatabase() {
  try {
    console.log('🔗 Connecting to database...');
    const client = await pool.connect();
    
    // Check if columns exist
    console.log('\n📋 Checking sessions table columns...');
    const columnsResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'sessions'
      ORDER BY ordinal_position;
    `);
    
    console.log('\nColumns in sessions table:');
    columnsResult.rows.forEach(col => {
      const hasVideoCode = col.column_name === 'video_code' || col.column_name === 'video_code_expires_at';
      const marker = hasVideoCode ? '✅' : '   ';
      console.log(`${marker} ${col.column_name} (${col.data_type}) - Nullable: ${col.is_nullable}`);
    });
    
    // Check if video_code columns exist
    const videoCodeCol = columnsResult.rows.find(c => c.column_name === 'video_code');
    const videoCodeExpiresCol = columnsResult.rows.find(c => c.column_name === 'video_code_expires_at');
    
    if (!videoCodeCol) {
      console.log('\n❌ video_code column NOT FOUND');
    } else {
      console.log('\n✅ video_code column exists');
    }
    
    if (!videoCodeExpiresCol) {
      console.log('❌ video_code_expires_at column NOT FOUND');
    } else {
      console.log('✅ video_code_expires_at column exists');
    }
    
    // Check a sample session
    console.log('\n📊 Sample session data:');
    const sessionsResult = await client.query(`
      SELECT id, video_code, video_code_expires_at FROM sessions LIMIT 3;
    `);
    
    console.log(`Found ${sessionsResult.rows.length} sessions:`);
    sessionsResult.rows.forEach((session, i) => {
      console.log(`  ${i + 1}. ID: ${session.id.substring(0, 8)}...`);
      console.log(`     video_code: ${session.video_code || '(NULL)'}`);
      console.log(`     expires_at: ${session.video_code_expires_at || '(NULL)'}`);
    });
    
    client.release();
    console.log('\n✅ Database check complete');
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
    if (error.code === '42P09') {
      console.log('\n⚠️ Column does not exist - migration may not have run');
    }
  } finally {
    await pool.end();
  }
}

checkDatabase();

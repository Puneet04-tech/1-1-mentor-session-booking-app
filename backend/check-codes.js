const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkCodeStorage() {
  try {
    const client = await pool.connect();
    
    console.log('📊 Checking video codes in database...\n');
    
    const result = await client.query(`
      SELECT 
        id,
        video_code,
        video_code_expires_at,
        updated_at,
        created_at
      FROM sessions 
      WHERE video_code IS NOT NULL
      LIMIT 10;
    `);
    
    if (result.rows.length === 0) {
      console.log('⚠️  WARNING: No sessions have video codes stored!');
      console.log('This means codes are NOT being saved to the database.\n');
    } else {
      console.log(`✅ Found ${result.rows.length} sessions with stored codes:\n`);
      result.rows.forEach((row, i) => {
        console.log(`${i + 1}. Session: ${row.id.substring(0, 8)}...`);
        console.log(`   Code: ${row.video_code}`);
        console.log(`   Expires: ${row.video_code_expires_at}`);
        console.log(`   Updated: ${row.updated_at}\n`);
      });
    }
    
    // Also check all sessions
    console.log('\n📋 All sessions:\n');
    const allSessions = await client.query(`
      SELECT 
        id,
        mentor_id,
        student_id,
        video_code,
        created_at
      FROM sessions 
      LIMIT 5;
    `);
    
    allSessions.rows.forEach((row, i) => {
      console.log(`${i + 1}. ${row.id.substring(0, 8)}... | Code: ${row.video_code || 'NULL'}`);
    });
    
    client.release();
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkCodeStorage();

const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('Checking sessions...');
    const res = await pool.query('SELECT id, title, status, mentor_id, student_id, created_at FROM sessions ORDER BY created_at DESC LIMIT 10');
    console.log('\n=== Sessions in DB ===');
    if (res.rows.length === 0) {
      console.log('No sessions found');
    } else {
      res.rows.forEach((row, i) => {
        console.log(`\n[${i+1}] ${row.title}`);
        console.log(`  ID: ${row.id}`);
        console.log(`  Status: ${row.status}`);
        console.log(`  Mentor: ${row.mentor_id}`);
        console.log(`  Student: ${row.student_id || 'NULL'}`);
        console.log(`  Created: ${row.created_at}`);
      });
    }
    
    // Count by status
    console.log('\n=== Status Distribution ===');
    const countRes = await pool.query('SELECT status, COUNT(*) as count FROM sessions GROUP BY status');
    countRes.rows.forEach(row => {
      console.log(`${row.status}: ${row.count}`);
    });
    
    await pool.end();
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();

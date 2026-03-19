const pg = require('pg');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    // Get a mentor user
    const userRes = await pool.query(`
      SELECT id, email FROM users WHERE role = 'mentor' LIMIT 1
    `);
    
    if (userRes.rows.length === 0) {
      console.log('No mentor user found in DB');
      await pool.end();
      return;
    }
    
    const user = userRes.rows[0];
    console.log('Found mentor:', user.email);
    
    // Create a JWT token
    const token = jwt.sign(
      { sub: user.id, email: user.email },
      process.env.SUPABASE_JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long',
      { expiresIn: '1h' }
    );
    
    console.log('\n✅ Generated Token:');
    console.log(token);
    console.log('\n\n📝 Test command:');
    console.log(`curl.exe -X GET "http://localhost:5000/api/sessions/available" -H "Authorization: Bearer ${token}"`);
    
    await pool.end();
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();

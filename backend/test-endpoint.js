const axios = require('axios');
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
    const userRes = await pool.query(`SELECT id FROM users WHERE role = 'mentor' LIMIT 1`);
    
    const token = jwt.sign(
      { sub: userRes.rows[0].id },
      process.env.SUPABASE_JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long',
      { expiresIn: '1h' }
    );
    
    console.log('🔐 Token:', token);
    console.log('\n🧪 Testing endpoint...\n');
    
    // Test the endpoint
    const response = await axios.get('http://localhost:5000/api/sessions/available', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Endpoint Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    await pool.end();
  } catch(e) {
    console.error('❌ Error:', e.response?.data || e.message);
    process.exit(1);
  }
})();

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
    const userRes = await pool.query(`SELECT id, email FROM users WHERE role = 'mentor' LIMIT 1`);
    
    // Use JWT_SECRET from env (this is what the middleware expects)
    const jwtSecret = process.env.JWT_SECRET || 'mentor-app-jwt-secret-key-change-in-production';
    
    const token = jwt.sign(
      { sub: userRes.rows[0].id, email: userRes.rows[0].email },
      jwtSecret,
      { expiresIn: '1h' }
    );
    
    console.log('🔐 Generated Token with JWT_SECRET');
    console.log('🧪 Testing /api/sessions/available endpoint...\n');
    
    // Test the endpoint
    const response = await axios.get('http://localhost:5000/api/sessions/available', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ SUCCESS! Endpoint returned:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.data && response.data.data.length > 0) {
      console.log(`\n✅ Found ${response.data.data.length} available sessions!`);
    }
    
    await pool.end();
  } catch(e) {
    console.error('❌ Error:', e.response?.data || e.message);
    process.exit(1);
  }
})();

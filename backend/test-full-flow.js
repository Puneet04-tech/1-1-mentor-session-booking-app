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
    console.log('=== Frontend Simulation Test ===\n');
    
    // Step 1: Get a student user (since they would be accessing /browse)
    const studentRes = await pool.query(`SELECT id, email, name, role FROM users WHERE role = 'student' LIMIT 1`);
    
    if (studentRes.rows.length === 0) {
      console.log('❌ No student user found. Creating one...');
      const clientRes = await pool.query(`SELECT id, email, name FROM users WHERE role = 'mentor' LIMIT 1`);
      const studentId = require('uuid').v4();
      await pool.query(
        `INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [studentId, 'student@test.com', 'Test Student', 'student']
      );
      console.log(`✅ Created student user: ${studentId}`);
    }
    
    const student = (await pool.query(`SELECT id, email, name, role FROM users WHERE role = 'student' LIMIT 1`)).rows[0];
    
    console.log(`📍 Student: ${student.name} (${student.email})`);
    
    // Step 2: Create an axios client like the frontend does
    const client = axios.create({
      baseURL: 'http://localhost:5000',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Step 3: Add interceptor to set auth token (like API client does)
    const jwtSecret = process.env.JWT_SECRET || 'mentor-app-jwt-secret-key-change-in-production';
    const token = jwt.sign(
      { id: student.id, email: student.email, role: student.role },
      jwtSecret,
      { expiresIn: '1h' }
    );
    
    console.log(`\n🔐 Generated JWT token`);
    
    client.interceptors.request.use((config) => {
      config.headers.Authorization = `Bearer ${token}`;
      console.log(`📤 Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
      console.log(`   With Authorization header: Bearer ${token.substring(0, 20)}...`);
      return config;
    });
    
    client.interceptors.response.use(
      (response) => {
        console.log(`📥 Response status: ${response.status}`);
        return response.data;
      },
      (error) => {
        console.error(`📥 Response error: ${error.response?.status} - ${error.response?.data?.error || error.message}`);
        return Promise.reject(error);
      }
    );
    
    // Step 4: Call getMentors (like browse page does)
    console.log(`\n🧪 Testing: apiClient.getMentors()`);
    try {
      const mentorsRes = await client.get('/api/users/mentors');
      console.log(`✅ Got ${mentorsRes.data?.length || 0} mentors`);
    } catch (e) {
      console.error(`❌ getMentors failed:`, e.message);
    }
    
    // Step 5: Call getAvailableSessions (like browse page does)
    console.log(`\n🧪 Testing: apiClient.getAvailableSessions()`);
    try {
      const sessionsRes = await client.get('/api/sessions/available');
      console.log(`✅ Got ${sessionsRes.data?.length || 0} sessions`);
      if (sessionsRes.data && sessionsRes.data.length > 0) {
        console.log('\n   Sessions details:');
        sessionsRes.data.forEach((s) => {
          console.log(`   - ${s.title} (Status: ${s.status}, Mentor: ${s.mentor_id})`);
        });
      }
    } catch (e) {
      console.error(`❌ getAvailableSessions failed:`, e.message);
    }
    
    await pool.end();
  } catch(e) {
    console.error('Test error:', e);
    process.exit(1);
  }
})();

import bcrypt from 'bcryptjs';
import { query, closePool } from '@/database';

// Test user credentials
const testUsers = [
  {
    userId: '550e8400-e29b-41d4-a716-446655440001',
    email: 'john_mentor@example.com',
    name: 'John Mentor',
    role: 'mentor',
    password: 'password123'
  },
  {
    userId: '550e8400-e29b-41d4-a716-446655440002',
    email: 'jane_mentor@example.com',
    name: 'Jane Mentor',
    role: 'mentor',
    password: 'password123'
  },
  {
    userId: '550e8400-e29b-41d4-a716-446655440003',
    email: 'bob_student@example.com',
    name: 'Bob Student',
    role: 'student',
    password: 'password123'
  },
  {
    userId: '550e8400-e29b-41d4-a716-446655440004',
    email: 'alice_student@example.com',
    name: 'Alice Student',
    role: 'student',
    password: 'password123'
  }
];

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...\n');

    const now = new Date().toISOString();

    // Step 1: Insert test users into users table
    console.log('👥 Creating test users...');
    for (const user of testUsers) {
      // Check if user already exists
      const existing = await query(
        'SELECT id FROM users WHERE id = $1',
        [user.userId]
      );

      if (existing.rows.length > 0) {
        console.log(`⚠️  User already exists: ${user.email}, skipping...`);
        continue;
      }

      await query(
        `INSERT INTO users (id, email, name, role, timezone, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [user.userId, user.email, user.name, user.role, 'UTC', now, now]
      );

      console.log(`✅ User created: ${user.email}`);
    }
    console.log();

    // Step 2: Generate bcrypt hashes for all test users
    console.log('🔐 Hashing passwords...');
    const hashedUsers = await Promise.all(
      testUsers.map(async (user) => ({
        ...user,
        passwordHash: await bcrypt.hash(user.password, 10)
      }))
    );
    console.log('✅ Passwords hashed\n');

    // Step 3: Insert password hashes
    console.log('💾 Inserting test user passwords...');
    for (const user of hashedUsers) {
      // Check if password already exists
      const existing = await query(
        'SELECT id FROM user_passwords WHERE user_id = $1',
        [user.userId]
      );

      if (existing.rows.length > 0) {
        console.log(`⚠️  Password already exists for ${user.email}, skipping...`);
        continue;
      }

      await query(
        `INSERT INTO user_passwords (user_id, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4)`,
        [user.userId, user.passwordHash, now, now]
      );

      console.log(`✅ Password created for ${user.email}`);
    }

    // Step 4: Create test sessions
    console.log('\n📅 Creating test sessions...');
    const testSessions = [
      {
        id: '650e8400-e29b-41d4-a716-446655440001',
        mentor_id: testUsers[0].userId, // John Mentor
        student_id: testUsers[2].userId, // Bob Student
        title: 'Getting Started with JavaScript',
        description: 'Learn JavaScript fundamentals and best practices',
        topic: 'JavaScript',
        status: 'scheduled',
        scheduled_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        language: 'javascript'
      },
      {
        id: '650e8400-e29b-41d4-a716-446655440002',
        mentor_id: testUsers[1].userId, // Jane Mentor
        student_id: testUsers[3].userId, // Alice Student
        title: 'React Fundamentals',
        description: 'Dive into React hooks, state, and component lifecycle',
        topic: 'React',
        status: 'scheduled',
        scheduled_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        duration_minutes: 90,
        language: 'javascript'
      },
      {
        id: '650e8400-e29b-41d4-a716-446655440003',
        mentor_id: testUsers[0].userId, // John Mentor
        student_id: testUsers[3].userId, // Alice Student
        title: 'Advanced TypeScript Patterns',
        description: 'Master TypeScript generics, decorators, and advanced types',
        topic: 'TypeScript',
        status: 'completed',
        scheduled_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        started_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        ended_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        language: 'typescript'
      },
      {
        id: '650e8400-e29b-41d4-a716-446655440004',
        mentor_id: testUsers[1].userId, // Jane Mentor
        student_id: testUsers[2].userId, // Bob Student
        title: 'Web Development with Express.js',
        description: 'Build scalable backend APIs with Express and Node.js',
        topic: 'Express.js',
        status: 'in_progress',
        scheduled_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        started_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        duration_minutes: 60,
        language: 'javascript'
      }
    ];

    for (const session of testSessions) {
      const existing = await query(
        'SELECT id FROM sessions WHERE id = $1',
        [session.id]
      );

      if (existing.rows.length > 0) {
        console.log(`⚠️  Session already exists: ${session.title}, skipping...`);
        continue;
      }

      await query(
        `INSERT INTO sessions (id, mentor_id, student_id, title, description, topic, status, scheduled_at, started_at, ended_at, duration_minutes, language, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          session.id,
          session.mentor_id,
          session.student_id,
          session.title,
          session.description,
          session.topic,
          session.status,
          session.scheduled_at,
          session.started_at || null,
          session.ended_at || null,
          session.duration_minutes,
          session.language,
          now,
          now
        ]
      );

      console.log(`✅ Session created: ${session.title}`);
    }

    console.log('\n✅ Database seeding completed!\n');
    console.log('📋 Test Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    for (const user of testUsers) {
      console.log(`\n${user.role === 'mentor' ? '👨‍🏫' : '👨‍🎓'} ${user.name}`);
      console.log(`   Email:    ${user.email}`);
      console.log(`   Password: ${user.password}`);
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📅 Test Sessions Created:');
    console.log('   • Scheduled: 2 sessions (in future)');
    console.log('   • In Progress: 1 session');
    console.log('   • Completed: 1 session');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Close the database pool before exiting
    await closePool();
    console.log('✅ Database pool closed');
    process.exit(0);

  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seedDatabase();

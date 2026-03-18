# 🗄️ Database Schema

## ER Diagram

```
┌─────────────────────┐
│       USERS         │
├─────────────────────┤
│ id (UUID)           │
│ email (UNIQUE)      │
│ name                │
│ role (enum)         │◄──────────┐
│ avatar_url          │           │
│ bio                 │           │
│ verified            │           │
│ created_at          │           │
│ updated_at          │           │
└─────────────────────┘           │
         ▲                        │
         │                        │
         │ mentor_id/student_id   │
         │                        │
┌─────────────────────────────────┴─────────┐
│           SESSIONS                        │
├─────────────────────────────────────────┤
│ id (UUID)                               │
│ mentor_id (FK → users)                  │
│ student_id (FK → users)                 │
│ title                                   │
│ description                             │
│ topic                                   │
│ status (scheduled/in_progress/completed)│
│ scheduled_at                            │
│ started_at                              │
│ ended_at                                │
│ duration_minutes                        │
│ language (js/python/etc)                │
│ code_language                           │
│ created_at                              │
│ updated_at                              │
└─────────────────────────────────────────┘
         ▲
         │ session_id
         │
┌─────────────────────────────────────────┐
│           MESSAGES                      │
├─────────────────────────────────────────┤
│ id (UUID)                               │
│ session_id (FK → sessions)              │
│ user_id (FK → users)                    │
│ content                                 │
│ type (text/code_snippet/system)         │
│ code_snippet (optional)                 │
│ created_at                              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│       CODE_SNAPSHOTS                    │
├─────────────────────────────────────────┤
│ id (UUID)                               │
│ session_id (FK → sessions)              │
│ code                                    │
│ language                                │
│ version                                 │
│ user_id (FK → users)                    │
│ saved_at                                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│     USER_AVAILABILITY                   │
├─────────────────────────────────────────┤
│ id (UUID)                               │
│ user_id (FK → users)                    │
│ day_of_week (mon/tue/wed...)           │
│ start_time                              │
│ end_time                                │
│ timezone                                │
├─────────────────────────────────────────┤

┌─────────────────────────────────────────┐
│    SESSION_RECORDINGS (optional)        │
├─────────────────────────────────────────┤
│ id (UUID)                               │
│ session_id (FK → sessions)              │
│ recording_url                           │
│ duration_seconds                        │
│ created_at                              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│      NOTIFICATIONS                      │
├─────────────────────────────────────────┤
│ id (UUID)                               │
│ user_id (FK → users)                    │
│ type (session_invite/msg/etc)           │
│ content                                 │
│ related_session_id (optional)           │
│ read                                    │
│ created_at                              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│       USER_RATINGS                      │
├─────────────────────────────────────────┤
│ id (UUID)                               │
│ rater_id (FK → users)                   │
│ ratee_id (FK → users)                   │
│ session_id (FK → sessions)              │
│ rating (1-5)                            │
│ feedback                                │
│ created_at                              │
└─────────────────────────────────────────┘
```

## Tables Structure

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM ('mentor', 'student') NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Sessions Table
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  topic VARCHAR(255),
  status VARCHAR(50) DEFAULT 'scheduled',
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_minutes INT,
  language VARCHAR(50) DEFAULT 'javascript',
  code_language VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_status CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled'))
);
```

### Messages Table
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'text',
  code_snippet TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Code Snapshots Table
```sql
CREATE TABLE code_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  language VARCHAR(50),
  version INT DEFAULT 1,
  user_id UUID NOT NULL REFERENCES users(id),
  saved_at TIMESTAMP DEFAULT NOW()
);
```

### User Availability Table
```sql
CREATE TABLE user_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week VARCHAR(10) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC'
);
```

### Notifications Table
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  content TEXT,
  related_session_id UUID REFERENCES sessions(id),
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### User Ratings Table
```sql
CREATE TABLE user_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rater_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ratee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Indexes

```sql
-- Performance optimization
CREATE INDEX idx_sessions_mentor_id ON sessions(mentor_id);
CREATE INDEX idx_sessions_student_id ON sessions(student_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_code_snapshots_session_id ON code_snapshots(session_id);
CREATE INDEX idx_user_availability_user_id ON user_availability(user_id);
```

## Known Queries

```sql
-- Get active sessions for user
SELECT * FROM sessions 
WHERE (mentor_id = $1 OR student_id = $1) 
AND status = 'in_progress';

-- Get messages for session
SELECT m.*, u.name, u.avatar_url FROM messages m
JOIN users u ON m.user_id = u.id
WHERE m.session_id = $1
ORDER BY m.created_at ASC;

-- Get latest code snapshot
SELECT * FROM code_snapshots 
WHERE session_id = $1 
ORDER BY saved_at DESC 
LIMIT 1;

-- Get mentor's upcoming sessions
SELECT * FROM sessions 
WHERE mentor_id = $1 
AND status = 'scheduled' 
AND scheduled_at > NOW()
ORDER BY scheduled_at ASC;
```

---

**Database uses PostgreSQL with Neon for managed hosting.**

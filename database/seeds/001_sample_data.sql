-- Sample data for testing

-- Insert sample mentors
INSERT INTO users (id, email, name, role, bio, verified)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'john_mentor@example.com', 'John Mentor', 'mentor', 'Experienced full-stack developer', TRUE),
  ('550e8400-e29b-41d4-a716-446655440002', 'jane_mentor@example.com', 'Jane Mentor', 'mentor', 'Expert in React and Node.js', TRUE);

-- Insert sample students
INSERT INTO users (id, email, name, role, bio, verified)
VALUES
  ('550e8400-e29b-41d4-a716-446655440003', 'bob_student@example.com', 'Bob Student', 'student', 'Learning web development', FALSE),
  ('550e8400-e29b-41d4-a716-446655440004', 'alice_student@example.com', 'Alice Student', 'student', 'Aspiring developer', FALSE);

-- Insert sample sessions
INSERT INTO sessions (id, mentor_id, title, description, topic, status, duration_minutes, language, code_language)
VALUES
  ('650e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'React Basics', 'Learn React fundamentals', 'React', 'scheduled', 60, 'javascript', 'javascript'),
  ('650e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', 'Node.js API Development', 'Build REST APIs with Node.js', 'Node.js', 'scheduled', 90, 'javascript', 'javascript');

-- Insert sample messages
INSERT INTO messages (id, session_id, user_id, content, type)
VALUES
  ('750e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'Welcome to React basics!', 'text');

-- Insert mentor availability
INSERT INTO user_availability (user_id, day_of_week, start_time, end_time, timezone)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Monday', '09:00:00', '17:00:00', 'UTC'),
  ('550e8400-e29b-41d4-a716-446655440001', 'Wednesday', '09:00:00', '17:00:00', 'UTC'),
  ('550e8400-e29b-41d4-a716-446655440001', 'Friday', '09:00:00', '17:00:00', 'UTC');

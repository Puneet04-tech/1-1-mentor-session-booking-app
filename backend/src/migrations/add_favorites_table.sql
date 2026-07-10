-- Bookmark / Favorite Mentors (issue #166)
-- Persists which mentors a student has saved so they can quickly rebook
-- previously-favorited mentors without re-running a search.
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- A student can favorite a given mentor at most once. This constraint is the
  -- source of truth for de-duplication; the API relies on it (23505) rather
  -- than a read-then-write check that would race under concurrent requests.
  UNIQUE (student_id, mentor_id)
);

-- GET /favorites lists a single student's saved mentors, so index by student.
CREATE INDEX IF NOT EXISTS idx_favorites_student ON favorites(student_id);

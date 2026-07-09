-- Group Sessions (Multi-Participant MVP) — issue #169
-- Lets a mentor run a session with multiple students. The legacy sessions.student_id
-- column is retained (it holds the first joiner) for backward compatibility;
-- session_participants is the source of truth for the full participant list.

-- How many students a session can hold. Existing rows default to 1 so all
-- previously-created sessions stay single-participant with no behaviour change.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS max_participants INTEGER NOT NULL DEFAULT 1;

-- Join table tracking every student in a session.
CREATE TABLE IF NOT EXISTS session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- A student can appear in a session at most once; the join handler relies on
  -- this constraint as a backstop against double-inserts under concurrency.
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_session_participants_session ON session_participants(session_id);

-- Backfill: every already-booked session gets a participant row so capacity
-- counts and participant lists are consistent for pre-existing data.
INSERT INTO session_participants (session_id, student_id, joined_at)
SELECT id, student_id, COALESCE(started_at, created_at, CURRENT_TIMESTAMP)
FROM sessions
WHERE student_id IS NOT NULL
ON CONFLICT (session_id, student_id) DO NOTHING;

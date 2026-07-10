-- Student Focus Note on Session Join (issue #168)
-- Captures an optional note the student submits when joining a session, so the
-- mentor can see what the student wants to discuss. Nullable for backward
-- compatibility with sessions booked before this feature existed.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS student_note TEXT;

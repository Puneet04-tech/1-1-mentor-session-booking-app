-- Migration: add reschedule-tracking columns to sessions (issue #145)
--
-- original_scheduled_at : the very first scheduled time, captured on the first
--                         reschedule so history isn't lost across moves.
-- rescheduled_by        : the participant (mentor or student) who last moved it.
-- reschedule_count      : how many times the session has been rescheduled.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS original_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescheduled_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sessions_rescheduled_by ON sessions(rescheduled_by);

COMMENT ON COLUMN sessions.original_scheduled_at IS 'First-ever scheduled time, set on the initial reschedule (issue #145).';
COMMENT ON COLUMN sessions.rescheduled_by IS 'User who performed the most recent reschedule.';
COMMENT ON COLUMN sessions.reschedule_count IS 'Number of times this session has been rescheduled.';

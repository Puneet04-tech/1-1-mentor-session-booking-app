-- Migration: Add 15-minute reminder flag column to sessions table
-- Complements reminder_sent_24h / reminder_sent_30m (see add_reminder_flags.sql)

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reminder_sent_15m BOOLEAN NOT NULL DEFAULT FALSE;

-- Index to make the 15-minute cron query fast (only scans scheduled sessions)
CREATE INDEX IF NOT EXISTS idx_sessions_reminder_15m
  ON sessions (status, scheduled_at, reminder_sent_15m)
  WHERE status = 'scheduled';

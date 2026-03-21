-- Add video_link_token column to sessions table for link-based video conferencing
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS video_link_token VARCHAR(32) UNIQUE,
ADD COLUMN IF NOT EXISTS video_link_expires_at TIMESTAMP WITH TIME ZONE;

-- Create index for quick lookup by link token
CREATE INDEX IF NOT EXISTS idx_sessions_video_link_token ON sessions(video_link_token);

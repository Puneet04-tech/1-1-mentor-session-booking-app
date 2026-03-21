-- Add video code columns to sessions table for video conferencing
ALTER TABLE sessions ADD COLUMN video_code VARCHAR(4) NULL;
ALTER TABLE sessions ADD COLUMN video_code_expires_at TIMESTAMP NULL;

-- Create index for faster code lookups
CREATE INDEX idx_sessions_video_code ON sessions(video_code) WHERE video_code IS NOT NULL;

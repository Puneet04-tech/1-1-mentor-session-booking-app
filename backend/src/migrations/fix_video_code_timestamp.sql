-- Fix timezone issue by converting TIMESTAMP to TIMESTAMP WITH TIME ZONE
-- This ensures the timestamp is always stored and retrieved in UTC without timezone conversion
ALTER TABLE sessions ALTER COLUMN video_code_expires_at TYPE TIMESTAMP WITH TIME ZONE;

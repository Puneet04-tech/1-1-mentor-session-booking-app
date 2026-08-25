-- Fix missing timezone column in users table
-- This migration ensures the timezone column exists with a default value

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'UTC';
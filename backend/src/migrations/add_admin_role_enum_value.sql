-- Migration: add 'admin' as a valid value of the user_role enum.
-- Admin accounts are not self-signup-able (auth.ts signup only allows
-- 'mentor'/'student'); promote a user with a direct UPDATE after this runs, e.g.
--   UPDATE users SET role = 'admin' WHERE email = '...';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';

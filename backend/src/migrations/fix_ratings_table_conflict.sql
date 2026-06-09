-- Rename user_ratings to ratings if exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_ratings') THEN
        ALTER TABLE user_ratings RENAME TO ratings;
    END IF;
END $$;

-- Rename rater_id to student_id if exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'ratings' AND column_name = 'rater_id') THEN
        ALTER TABLE ratings RENAME COLUMN rater_id TO student_id;
    END IF;
END $$;

-- Rename ratee_id to mentor_id if exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'ratings' AND column_name = 'ratee_id') THEN
        ALTER TABLE ratings RENAME COLUMN ratee_id TO mentor_id;
    END IF;
END $$;

-- Rename feedback to review if exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'ratings' AND column_name = 'feedback') THEN
        ALTER TABLE ratings RENAME COLUMN feedback TO review;
    END IF;
END $$;

-- Rename session index if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'idx_user_ratings_session_id' AND n.nspname = 'public') THEN
        ALTER INDEX idx_user_ratings_session_id RENAME TO idx_ratings_session_id;
    END IF;
END $$;

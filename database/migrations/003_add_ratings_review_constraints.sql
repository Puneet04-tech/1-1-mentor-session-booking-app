-- Enforce one review per session (duplicate submissions should be rejected with 409)
ALTER TABLE ratings ADD CONSTRAINT ratings_session_id_unique UNIQUE (session_id);

-- Limit written reviews to 300 characters
ALTER TABLE ratings ADD CONSTRAINT ratings_review_length CHECK (char_length(review) <= 300);

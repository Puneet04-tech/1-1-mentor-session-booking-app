-- Create audit log table
CREATE TABLE IF NOT EXISTS session_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    previous_hash VARCHAR(64) NOT NULL,
    current_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Unique index to prevent tampering
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_hash_chain 
ON session_audit_logs(session_id, current_hash);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_audit_session_id ON session_audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON session_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON session_audit_logs(event_type);

-- Function to verify hash chain integrity
CREATE OR REPLACE FUNCTION verify_audit_chain(session_id_param UUID)
RETURNS TABLE(
    is_valid BOOLEAN,
    tampered_events UUID[]
) LANGUAGE plpgsql AS $$
DECLARE
    rec RECORD;
    prev_hash VARCHAR(64) := '0';
    invalid_events UUID[] := '{}';
BEGIN
    FOR rec IN (
        SELECT 
            id, 
            event_type, 
            event_data, 
            previous_hash, 
            current_hash,
            created_at
        FROM session_audit_logs
        WHERE session_id = session_id_param
        ORDER BY created_at ASC
    ) LOOP
        -- Calculate expected hash
        IF rec.previous_hash != prev_hash THEN
            invalid_events := array_append(invalid_events, rec.id);
        END IF;
        
        -- Update prev_hash for next iteration
        prev_hash := rec.current_hash;
    END LOOP;
    
    is_valid := array_length(invalid_events, 1) IS NULL;
    tampered_events := invalid_events;
    RETURN NEXT;
END;
$$;
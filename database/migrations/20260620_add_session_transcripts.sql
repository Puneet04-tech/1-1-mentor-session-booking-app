-- Create session_transcripts table
CREATE TABLE IF NOT EXISTS session_transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    transcript_data JSONB NOT NULL,
    pdf_url TEXT,
    markdown_url TEXT,
    generated_at TIMESTAMP DEFAULT NOW(),
    delivered_at TIMESTAMP,
    delivery_method TEXT DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add column to sessions table
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS transcript_generated_at TIMESTAMP;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_transcripts_session_id ON session_transcripts(session_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_generated_at ON session_transcripts(generated_at);
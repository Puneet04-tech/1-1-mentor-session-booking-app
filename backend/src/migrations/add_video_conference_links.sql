-- Create video conference links table for link-based video conferencing
CREATE TABLE IF NOT EXISTS video_conference_links (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_by_id VARCHAR(36) NOT NULL REFERENCES users(id),
  link_token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  accessed_by_ids TEXT[], -- Array of user IDs who accessed this link
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_video_conference_links_session_id ON video_conference_links(session_id);
CREATE INDEX idx_video_conference_links_link_token ON video_conference_links(link_token);
CREATE INDEX idx_video_conference_links_expires_at ON video_conference_links(expires_at);

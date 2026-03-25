-- Create passwords table for secure password storage
CREATE TABLE user_passwords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient lookups by user_id
CREATE INDEX idx_user_passwords_user_id ON user_passwords(user_id);

-- Add a comment for documentation
COMMENT ON TABLE user_passwords IS 'Securely stores hashed passwords for user authentication. Each user has at most one password record.';
COMMENT ON COLUMN user_passwords.password_hash IS 'Bcrypt-hashed password (10 rounds). Never store plain text passwords!';

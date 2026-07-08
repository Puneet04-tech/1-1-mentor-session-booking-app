-- Two-Factor Authentication (2FA) support (issue #138)
-- Adds optional TOTP-based 2FA columns to the users table.
--
-- two_factor_enabled       : whether 2FA is fully activated for the account.
-- two_factor_secret        : base32 TOTP secret. Populated at setup time but the
--                            feature is NOT considered active until the user
--                            proves possession of the authenticator (enable step).
-- two_factor_backup_codes  : JSON array of single-use recovery codes. Each entry
--                            is { "hash": "<bcrypt>", "used": false }. Only the
--                            bcrypt hashes are stored — plaintext codes are shown
--                            to the user exactly once at generation time.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS two_factor_secret TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB;

COMMENT ON COLUMN users.two_factor_enabled IS 'TRUE once the user has verified a TOTP code and activated 2FA.';
COMMENT ON COLUMN users.two_factor_secret IS 'Base32 TOTP shared secret (set at setup, kept even before activation).';
COMMENT ON COLUMN users.two_factor_backup_codes IS 'JSON array of { hash, used } single-use, bcrypt-hashed recovery codes.';

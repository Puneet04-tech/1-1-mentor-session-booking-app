import { Router, Response } from 'express';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { query, queryOne } from '@/database';
import authMiddleware, { AuthRequest } from '@/middleware/auth';
import { config } from '@/config';
import { v4 as uuidv4 } from 'uuid';
import {
  generateSecret,
  buildOtpAuthUrl,
  generateQrCodeDataUrl,
  verifyToken,
  generateBackupCodes,
  consumeBackupCode,
  issuePendingToken,
  verifyPendingToken,
  BackupCode,
} from '@/services/twoFactor';

const MAX_TOTP_LENGTH = 20;
const MAX_BACKUP_CODE_LENGTH = 64;

// Rate limiter for login: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,  // Return RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
});

// Rate limiter for signup: 5 accounts per hour per IP
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created from this IP. Please try again after an hour.' },
});

// Rate limiter for 2FA verification: 10 attempts per 15 minutes per IP.
// Prevents brute-forcing the 6-digit TOTP / backup codes at the second step.
const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts. Please try again after 15 minutes.' },
});

const router = Router();
const jwtSecret: Secret = config.JWT_SECRET as Secret;
const jwtOptions: SignOptions = { expiresIn: config.JWT_EXPIRY as any };

const normalizeEmail = (email?: string) => email?.trim().toLowerCase();

/** Sign a full-access session JWT for a fully-authenticated user. */
function issueSessionToken(user: { id: string; email: string; role: string }): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.token_version,
    },
    jwtSecret,
    jwtOptions
  );
}

// Signup
router.post('/signup', signupLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, name, role, timezone } = req.body;

    const normalizedEmail = normalizeEmail(email);

    const normalizedName = typeof name === "string" ? name.trim() : "";

    // Validate input
    if (!normalizedEmail || !password || !normalizedName || !role) {
      return res.status(400).json({ error: 'Missing required fields: email, password, name, role' });
    }

    // Validate password strength (minimum 8 characters)
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Validate role - never trust client input blindly
    if (!['mentor', 'student'].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be 'mentor' or 'student'." });
    }

    let resolvedTimezone = 'UTC';
    if (timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        resolvedTimezone = timezone;
      } catch {
        return res.status(400).json({ error: 'Invalid timezone' });
      }
    }

    // Check if user exists
    const existing = await queryOne(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existing) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password with bcrypt (10 rounds)
    const hashedPassword = await bcrypt.hash(password, config.BCRYPT_SALT_ROUNDS);
    console.log('✅ Password hashed successfully for signup');

    const userId = uuidv4();
    const now = new Date().toISOString();

    // Create user in users table
    await query(
      `INSERT INTO users (id, email, name, role, timezone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, normalizedEmail, normalizedName, role, resolvedTimezone, now, now]
    );
    console.log('✅ User created:', { id: userId, email: normalizedEmail, role });

    // Store hashed password in user_passwords table
    await query(
      `INSERT INTO user_passwords (user_id, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, hashedPassword, now, now]
    );
    await query("COMMIT");
    console.log('✅ Password stored securely in user_passwords table');

    // Generate JWT token
    const token = jwt.sign(
      { id: userId, email: normalizedEmail, role },
      jwtSecret,
      jwtOptions
    );

    res.json({
      success: true,
      message: 'Signup successful',
      data: {
        user: { id: userId, email: normalizedEmail, name: normalizedName, role, timezone: resolvedTimezone },
        token,
      },
    });
  } catch (err) {
    await query("ROLLBACK");

    console.error("❌ Signup error:", err);

    res.status(500).json({
      error: "Signup failed",
    });
  }
});

// Login
router.post('/login', loginLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    // Note: COALESCE handles the case where timezone column might not exist in older databases
    const user = await queryOne(
      'SELECT id, email, name, role, COALESCE(timezone, \'UTC\') as timezone, is_suspended, suspension_reason, two_factor_enabled FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (!user) {
      console.warn('⚠️  Login attempt for non-existent user:', normalizedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get password hash from user_passwords table
    const userPassword = await queryOne(
      'SELECT password_hash FROM user_passwords WHERE user_id = $1',
      [user.id]
    );

    if (!userPassword) {
      console.error('❌ No password found for user:', user.id);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password using bcrypt
    const isPasswordValid = await bcrypt.compare(password, userPassword.password_hash);

    if (!isPasswordValid) {
      console.warn('⚠️  Invalid password for user:', normalizedEmail);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('✅ Password verified successfully for user:', normalizedEmail);

    if (user.is_suspended) {
      console.warn('⚠️  Login attempt for suspended user:', normalizedEmail);
      return res.status(403).json({
        error: user.suspension_reason
          ? `Account suspended: ${user.suspension_reason}`
          : 'Account suspended',
      });
    }

    // If 2FA is active, don't hand out a full session token yet. Issue a
    // short-lived pending token the client must exchange at /2fa/verify with a
    // valid TOTP or backup code (issue #138).
    if (user.two_factor_enabled) {
      const pendingToken = issuePendingToken(user.id);
      return res.json({
        success: true,
        message: 'Two-factor authentication required',
        data: {
          twoFactorRequired: true,
          pendingToken,
        },
      });
    }

    // Generate JWT token
    const token = issueSessionToken(user);

    // Strip internal flags before returning the user object.
    const { is_suspended, suspension_reason, two_factor_enabled, ...safeUser } = user;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: safeUser,
        token,
      },
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await queryOne(
      'SELECT id, email, name, role, COALESCE(timezone, \'UTC\') as timezone FROM users WHERE id = $1',
      [req.user?.id]
    );

    res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Logout
router.post('/logout', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json({ success: true, message: 'Logged out' });
});

// Change password (requires authentication)
router.post('/change-password', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old password and new password required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    if (oldPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from old password' });
    }

    // Get current password hash
    const userPassword = await queryOne(
      'SELECT password_hash FROM user_passwords WHERE user_id = $1',
      [userId]
    );

    if (!userPassword) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(oldPassword, userPassword.password_hash);

    if (!isOldPasswordValid) {
      console.warn('⚠️  Invalid old password for user:', userId);
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, config.BCRYPT_SALT_ROUNDS);
    const now = new Date().toISOString();

    // Update password
    await query(
      `UPDATE user_passwords
   SET password_hash = $1,
       updated_at = $2
   WHERE user_id = $3`,
      [hashedNewPassword, now, userId]
    );

    await query(
      `UPDATE users
   SET token_version = token_version + 1,
       updated_at = $1
   WHERE id = $2`,
      [now, userId]
    );

    console.log('✅ Password changed successfully for user:', userId);

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (err) {
    console.error('❌ Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ---------------------------------------------------------------------------
// Two-Factor Authentication (2FA) — issue #138
// ---------------------------------------------------------------------------

// GET /2fa/status — whether 2FA is currently enabled for the caller.
router.get('/2fa/status', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const row = await queryOne(
      'SELECT two_factor_enabled FROM users WHERE id = $1',
      [req.user?.id]
    );
    res.json({ success: true, data: { enabled: !!row?.two_factor_enabled } });
  } catch (err) {
    console.error('❌ 2FA status error:', err);
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

// POST /2fa/setup — generate a secret + QR code WITHOUT enabling 2FA.
// The secret is persisted so the subsequent /enable call can verify against it,
// but the feature stays inactive until the user proves possession of a code.
router.post('/2fa/setup', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const user = await queryOne(`SELECT email, two_factor_enabled, two_factor_secret FROM users WHERE id = $1`, [userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.two_factor_enabled) {
      return res.status(400).json({ error: '2FA is already enabled. Disable it first to re-configure.' });
    }

    const secret =
      user.two_factor_secret || generateSecret();

    const otpauthUrl = buildOtpAuthUrl(user.email, secret);
    const qrCode = await generateQrCodeDataUrl(otpauthUrl);

    // Only persist a newly generated secret.
    if (!user.two_factor_secret) {
      await query(
        `UPDATE users
     SET two_factor_secret = $1,
         updated_at = $2
     WHERE id = $3`,
        [secret, new Date().toISOString(), userId]
      );
    }

    res.json({
      success: true,
      message: 'Scan the QR code with your authenticator app, then verify a code to enable 2FA.',
      data: { secret, otpauthUrl, qrCode },
    });
  } catch (err) {
    console.error('❌ 2FA setup error:', err);
    res.status(500).json({ error: 'Failed to start 2FA setup' });
  }
});

// POST /2fa/enable — verify a TOTP against the pending secret, then activate
// 2FA and return one-time backup codes (shown to the user exactly once).
router.post('/2fa/enable', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { token } = req.body;

    const normalizedToken =
      typeof token === "string"
        ? token.trim()
        : "";

    if (!normalizedToken) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    const user = await queryOne(
      'SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = $1',
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.two_factor_enabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }

    if (!user.two_factor_secret) {
      return res.status(400).json({ error: 'No 2FA setup in progress. Call /2fa/setup first.' });
    }

    if (!verifyToken(normalizedToken, user.two_factor_secret)) {
      return res.status(401).json({ error: 'Invalid verification code' });
    }

    const { plainCodes, hashedCodes } = await generateBackupCodes();

    await query(
      `UPDATE users
       SET two_factor_enabled = TRUE, two_factor_backup_codes = $1, updated_at = $2
       WHERE id = $3`,
      [JSON.stringify(hashedCodes), new Date().toISOString(), userId]
    );

    console.log('✅ 2FA enabled for user:', userId);

    res.json({
      success: true,
      message: '2FA enabled. Save these backup codes somewhere safe — they will not be shown again.',
      data: { backupCodes: plainCodes },
    });
  } catch (err) {
    console.error('❌ 2FA enable error:', err);
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
});

// POST /2fa/verify — exchange a login pending token + TOTP/backup code for a
// full session JWT. This is the second step of the login flow.
router.post('/2fa/verify', twoFactorLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { pendingToken, token, backupCode } = req.body;

    const normalizedToken =
      typeof token === "string"
        ? token.trim()
        : "";

    const normalizedBackupCode =
      typeof backupCode === "string"
        ? backupCode.trim()
        : "";


    if (normalizedToken.length > MAX_TOTP_LENGTH) {
      return res.status(400).json({
        error: `Verification code must not exceed ${MAX_TOTP_LENGTH} characters`,
      });
    }

    if (normalizedBackupCode.length > MAX_BACKUP_CODE_LENGTH) {
      return res.status(400).json({
        error: `Backup code must not exceed ${MAX_BACKUP_CODE_LENGTH} characters`,
      });
    }

    if (!pendingToken) {
      return res.status(400).json({ error: 'Pending token is required' });
    }
    if (!normalizedToken && !normalizedBackupCode) {
      return res.status(400).json({ error: 'A verification code or backup code is required' });
    }

    const userId = verifyPendingToken(pendingToken);
    if (!userId) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    const user = await queryOne(
      `SELECT id, email, name, role, timezone, is_suspended, suspension_reason,
              two_factor_enabled, two_factor_secret, two_factor_backup_codes
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!user || !user.two_factor_enabled) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    if (user.is_suspended) {
      return res.status(403).json({
        error: user.suspension_reason
          ? `Account suspended: ${user.suspension_reason}`
          : 'Account suspended',
      });
    }

    let verified = false;

    if (normalizedToken) {
      verified = verifyToken(normalizedToken, user.two_factor_secret);
    }

    if (!verified && normalizedBackupCode) {
      const updatedCodes = await consumeBackupCode(
        normalizedBackupCode,
        user.two_factor_backup_codes as BackupCode[] | null
      );
      if (updatedCodes) {
        // Persist the consumed (single-use) backup code immediately.
        await query(
          'UPDATE users SET two_factor_backup_codes = $1, updated_at = $2 WHERE id = $3',
          [JSON.stringify(updatedCodes), new Date().toISOString(), userId]
        );
        verified = true;
      }
    }

    if (!verified) {
      console.warn('⚠️  Failed 2FA verification for user:', userId);
      return res.status(401).json({ error: 'Invalid verification code' });
    }

    const sessionToken = issueSessionToken(user);
    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      timezone: user.timezone,
    };

    res.json({
      success: true,
      message: 'Login successful',
      data: { user: safeUser, token: sessionToken },
    });
  } catch (err) {
    console.error('❌ 2FA verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /2fa/disable — turn off 2FA. Requires BOTH the account password and a
// valid current 2FA (TOTP or backup) code, so a stolen session alone can't
// remove the protection.
router.post('/2fa/disable', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { password, token, backupCode } = req.body;

    const normalizedToken =
      typeof token === "string"
        ? token.trim()
        : "";

    const normalizedBackupCode =
      typeof backupCode === "string"
        ? backupCode.trim()
        : "";

    if (normalizedToken.length > MAX_TOTP_LENGTH) {
      return res.status(400).json({
        error: `Verification code must not exceed ${MAX_TOTP_LENGTH} characters`,
      });
    }

    if (normalizedBackupCode.length > MAX_BACKUP_CODE_LENGTH) {
      return res.status(400).json({
        error: `Backup code must not exceed ${MAX_BACKUP_CODE_LENGTH} characters`,
      });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    if (!normalizedToken && !normalizedBackupCode) {
      return res.status(400).json({ error: 'A current 2FA code or backup code is required' });
    }

    const user = await queryOne(
      `SELECT two_factor_enabled, two_factor_secret, two_factor_backup_codes
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!user || !user.two_factor_enabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    // Verify password.
    const userPassword = await queryOne(
      'SELECT password_hash FROM user_passwords WHERE user_id = $1',
      [userId]
    );
    if (!userPassword || !(await bcrypt.compare(password, userPassword.password_hash))) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Verify a current 2FA code (TOTP or an unused backup code).
    let verified = false;
    let consumedBackupCodes: BackupCode[] | null = null;
    const now = new Date().toISOString();

    if (token) {
      verified = verifyToken(normalizedToken, user.two_factor_secret);
    }

    if (!verified && backupCode) {
      consumedBackupCodes = await consumeBackupCode(
        normalizedBackupCode,
        user.two_factor_backup_codes as BackupCode[] | null
      );
      verified = !!consumedBackupCodes;
    }

    if (!verified) {
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }

    // If a backup code was used successfully, persist its consumption
    // before disabling 2FA so the single-use behavior is recorded.
    if (consumedBackupCodes) {
      await query(
        `UPDATE users
     SET two_factor_backup_codes = $1, updated_at = $2
     WHERE id = $3`,
        [JSON.stringify(consumedBackupCodes), now, userId]
      );
    }

    await query(
      `UPDATE users
   SET two_factor_enabled = FALSE,
       two_factor_secret = NULL,
       two_factor_backup_codes = NULL,
       updated_at = $1
   WHERE id = $2`,
      [now, userId]
    );

    console.log('✅ 2FA disabled for user:', userId);

    res.json({ success: true, message: '2FA has been disabled' });
  } catch (err) {
    console.error('❌ 2FA disable error:', err);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

export default router;
# Password Security Implementation

## Overview
This document describes the secure password authentication system implemented for the Mentor Session Booking App.

## Database Schema

### `user_passwords` Table
A dedicated table for storing password hashes securely:

```sql
CREATE TABLE user_passwords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Key Features:**
- ✅ **One password per user** - `UNIQUE` constraint on `user_id`
- ✅ **Automatic cascade delete** - When user is deleted, password is deleted
- ✅ **Indexed lookup** - `idx_user_passwords_user_id` for fast queries
- ✅ **Never store plain passwords** - Only bcrypt hashes stored

## Security Features

### Password Hashing
- **Algorithm**: bcrypt (industry standard)
- **Salt rounds**: 10 (provides good security/performance balance)
- **Library**: `bcryptjs` (pure JavaScript implementation)

### Password Strength Requirements
- **Minimum length**: 8 characters
- **Enforced at**: Both validation and signup endpoint

### Authentication Flow

#### 1. **Signup** (`POST /api/auth/signup`)
```
Input: { email, password, name, role }
  ↓
1. Validate password (min 8 chars)
2. Check email doesn't exist
3. Hash password with bcrypt
4. Create user in `users` table
5. Store hash in `user_passwords` table
6. Generate JWT token
Output: { user, token }
```

#### 2. **Login** (`POST /api/auth/login`)
```
Input: { email, password }
  ↓
1. Find user by email
2. Get password hash from `user_passwords`
3. Compare input password with hash using bcrypt.compare()
4. If match: Generate JWT token
5. If no match: Return 401 Unauthorized
Output: { user, token } or error
```

#### 3. **Change Password** (`POST /api/auth/change-password`)
```
Requires: Authentication token
Input: { oldPassword, newPassword }
  ↓
1. Get current user from JWT
2. Verify old password
3. Validate new password (min 8 chars, different from old)
4. Hash new password
5. Update in `user_passwords`
Output: { success, message }
```

## API Endpoints

### Signup
**POST** `/api/auth/signup`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "name": "John Doe",
  "role": "mentor"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Signup successful",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "mentor"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Response (Error - 400/500):**
```json
{
  "error": "Password must be at least 8 characters long"
}
```

### Login
**POST** `/api/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "mentor"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Response (Error - 401):**
```json
{
  "error": "Invalid email or password"
}
```

### Change Password
**POST** `/api/auth/change-password`

**Headers:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Request:**
```json
{
  "oldPassword": "SecurePassword123",
  "newPassword": "NewSecurePassword456"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

## Migration Instructions

### 1. Run Database Migration
```bash
# In the backend directory
npm run migrate
```

This will:
- Read all .sql files from `database/migrations/`
- Execute them in alphabetical order
- Skip files that have already been applied (if they exist)
- Report progress for each migration

### 2. Deploy Changes
```bash
# Build the backend
npm run build

# Start the server
npm start
```

## Best Practices Implemented

✅ **Never store plain passwords** - Only hashes stored in database
✅ **Bcrypt hashing** - Industry-standard algorithm
✅ **Safe password comparison** - Use `bcrypt.compare()`, not string equality
✅ **Generic error messages** - "Invalid email or password" instead of revealing which is wrong
✅ **Password validation** - Minimum length enforced
✅ **Unique constraint** - Each user has exactly one password record
✅ **Automatic cleanup** - Password deleted when user is deleted (CASCADE)
✅ **Audit trail** - `created_at` and `updated_at` timestamps for password changes
✅ **JWT tokens** - Stateless authentication (no sessions needed)

## Security Considerations

### What's Protected ✅
- Passwords are never logged or exposed in error messages
- Hashes are salted with bcrypt
- Invalid login returns generic message (timing attack resistance)
- Password change requires old password verification
- JWT tokens expire (default: 24 hours)

### What to Add in Production 🔒
- **HTTPS/TLS** - Encrypt data in transit
- **Rate limiting** - Limit login attempts (prevent brute force)
- **2FA/MFA** - Two-factor authentication
- **Password reset flow** - Secure email-based reset
- **Audit logging** - Log authentication events
- **CORS configuration** - Restrict cross-origin requests
- **SQL injection prevention** - Already done with parameterized queries
- **Session timeout** - Logout inactive users
- **IP whitelisting** - For admin endpoints

## Testing

### Test Signup
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123",
    "name": "Test User",
    "role": "student"
  }'
```

### Test Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123"
  }'
```

### Test Change Password (requires token from login)
```bash
curl -X POST http://localhost:5000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{
    "oldPassword": "TestPassword123",
    "newPassword": "NewPassword456"
  }'
```

## Files Modified

1. **`backend/src/routes/auth.ts`** - Updated signup, login, and added change-password endpoints
2. **`backend/database/migrations/002_add_passwords_table.sql`** - New migration file
3. **`backend/src/migrations.ts`** - New migration runner script
4. **`backend/package.json`** - Added `migrate` npm script

## Rollback (if needed)

To remove the passwords table (not recommended):
```sql
DROP TABLE IF EXISTS user_passwords CASCADE;
```

But this will break authentication! Instead, keep the table and migrate user passwords if needed.

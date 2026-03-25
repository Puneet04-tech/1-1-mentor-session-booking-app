# 🔐 Login Credentials & Database Setup

## Quick Start

Run this command to set up database schema and seed test credentials:

```bash
cd backend
npm run migrate:seed
```

This will:
1. ✅ Create the `user_passwords` table (password migration)
2. ✅ Generate bcrypt hashes for test accounts
3. ✅ Insert test user passwords into the database
4. ✅ Display all credentials in the console

---

## 📋 Test Credentials

After running `npm run migrate:seed`, use these credentials to log in:

### **👨‍🏫 Mentor Accounts**

| Email | Password |
|-------|----------|
| `john_mentor@example.com` | `password123` |
| `jane_mentor@example.com` | `password123` |

### **👨‍🎓 Student Accounts**

| Email | Password |
|-------|----------|
| `bob_student@example.com` | `password123` |
| `alice_student@example.com` | `password123` |

---

## Manual Setup (Alternative)

If you prefer to run commands separately:

### Step 1: Create Password Table
```bash
cd backend
npm run migrate
```

### Step 2: Seed Test Passwords
```bash
npm run seed
```

---

## 🧪 Test Login via API

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john_mentor@example.com",
    "password": "password123"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "email": "john_mentor@example.com",
      "name": "John Mentor",
      "role": "mentor"
    },
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

## 🔄 Change Password (Authenticated)

```bash
curl -X POST http://localhost:5000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "oldPassword": "password123",
    "newPassword": "newPassword456"
  }'
```

---

## 🔧 Database Tables

### `users` Table
- Stores user profile information
- Fields: `id`, `email`, `name`, `role`, `created_at`, `updated_at`

### `user_passwords` Table (New)
- Stores bcrypt password hashes securely
- Fields: `id`, `user_id` (FK), `password_hash`, `created_at`, `updated_at`
- Why separate? 
  - Better security (passwords not in user table)
  - Easy password history tracking
  - Simpler audit trail for password changes
  - Can delete/reset passwords without losing user profile

---

## ⚠️ Security Notes

✅ **Already Implemented:**
- Bcrypt hashing with 10 rounds
- Password min 8 characters
- Generic error messages ("Invalid email or password")
- Secure comparison (no timing attacks)
- Timestamps for audit trail
- Foreign key constraints with cascade delete

🔐 **Not Yet Implemented (Future):**
- Password history (prevent reuse)
- Account lockout after N failed attempts
- Password expiration policies
- Two-factor authentication

---

## 📝 Files Modified/Created

- ✅ `backend/src/migrations.ts` - Migration runner
- ✅ `database/migrations/002_add_passwords_table.sql` - Password table schema
- ✅ `backend/src/seed.ts` - Database seeding script
- ✅ `backend/package.json` - Added `seed` and `migrate:seed` scripts
- ✅ `backend/src/routes/auth.ts` - Updated login & signup with bcrypt
- ✅ `docs/PASSWORD_SECURITY.md` - Complete security documentation


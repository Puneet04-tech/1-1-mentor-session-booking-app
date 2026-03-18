# Database Setup

## Neon PostgreSQL Setup

1. Create a project on [Neon](https://neon.tech)
2. Get your connection string
3. Set `DATABASE_URL` environment variable

## Running Migrations

```bash
cd database
npm install
npm run setup
```

## Manual Setup with psql

```bash
psql $DATABASE_URL -f migrations/001_initial_schema.sql
psql $DATABASE_URL -f seeds/001_sample_data.sql
```

## Schema Overview

- **users**: User profiles (mentor/student)
- **sessions**: Mentoring sessions
- **messages**: Chat messages
- **code_snapshots**: Code versions during sessions
- **user_availability**: Mentor availability for scheduling
- **notifications**: User notifications
- **user_ratings**: Session ratings and feedback

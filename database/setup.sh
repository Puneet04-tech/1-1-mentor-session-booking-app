#!/bin/bash

# Database setup script for PostgreSQL/Neon

DB_URL="${DATABASE_URL:-postgresql://user:password@localhost:5432/mentor_db}"

echo "Creating database schema..."
psql "$DB_URL" -f migrations/001_initial_schema.sql

echo "Seeding sample data..."
psql "$DB_URL" -f seeds/001_sample_data.sql

echo "Database setup complete!"

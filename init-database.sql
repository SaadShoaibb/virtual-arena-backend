-- Virtual Arena Database Initialization Script
-- This script creates a fresh database with all necessary tables and default data
-- Run this ONLY if automatic initialization via server.js fails

-- Create database (uncomment if needed)
-- CREATE DATABASE IF NOT EXISTS arena;
-- USE arena;

-- Note: The server.js file will automatically create all tables and populate default data
-- This file is provided as a backup for manual database initialization only

-- To use automatic initialization (RECOMMENDED):
-- 1. Create an empty database named 'arena'
-- 2. Update .env file with database credentials
-- 3. Run: node server.js
-- 4. The server will automatically create all tables and populate default data

-- If you need to manually initialize the database, run the server once and it will
-- create all necessary tables automatically. The server.js includes:
-- - createTables() function for all table creation
-- - Automatic migrations for schema updates
-- - Default data population for sessions, tournaments, events, etc.
-- - Guest support columns
-- - Payment system tables
-- - Booking system enhancements

-- For a fresh start on new server:
-- 1. DROP DATABASE IF EXISTS arena;
-- 2. CREATE DATABASE arena;
-- 3. Update .env with new database credentials
-- 4. Run: node server.js
-- 5. Server will automatically initialize everything

-- IMPORTANT: Do NOT run migration scripts manually
-- All migrations are handled automatically by server.js on startup

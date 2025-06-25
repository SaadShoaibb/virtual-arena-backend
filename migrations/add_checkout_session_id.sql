-- Add checkout_session_id column to Payments table
ALTER TABLE Payments ADD COLUMN checkout_session_id VARCHAR(255) NULL;

-- Modify payment_intent_id to allow NULL values
ALTER TABLE Payments MODIFY COLUMN payment_intent_id VARCHAR(255) NULL;

-- Update status enum to include 'expired' status
ALTER TABLE Payments MODIFY COLUMN status ENUM('pending', 'succeeded', 'failed', 'expired') DEFAULT 'pending';
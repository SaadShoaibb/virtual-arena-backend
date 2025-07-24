-- Critical Database Fix for VR Arena
-- This fixes the entity_type column in Payments table to support longer values

-- Check current column structure
DESCRIBE Payments;

-- Update entity_type column to support longer values like 'tournament_registration'
ALTER TABLE Payments 
MODIFY COLUMN entity_type VARCHAR(50) DEFAULT 'order';

-- Verify the change
DESCRIBE Payments;

-- Alternative approach if the above fails
-- ALTER TABLE Payments 
-- CHANGE COLUMN entity_type entity_type VARCHAR(50) DEFAULT 'order';

-- Show current data to verify no truncation
SELECT entity_type, COUNT(*) as count FROM Payments GROUP BY entity_type;

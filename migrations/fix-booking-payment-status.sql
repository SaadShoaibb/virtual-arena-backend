-- Fix any bookings that were created with 'paid' status but have no payment record
-- This ensures all bookings without a successful payment are marked as 'pending'

-- Update bookings that have 'paid' status but no corresponding successful payment
UPDATE Bookings b
LEFT JOIN Payments p ON b.booking_id = p.entity_id AND p.entity_type = 'booking' AND p.status = 'succeeded'
SET b.payment_status = 'pending'
WHERE b.payment_status = 'paid' 
  AND p.payment_id IS NULL;

-- Ensure all bookings with successful payments are marked as 'paid'
UPDATE Bookings b
INNER JOIN Payments p ON b.booking_id = p.entity_id AND p.entity_type = 'booking'
SET b.payment_status = 'paid'
WHERE p.status = 'succeeded' 
  AND b.payment_status != 'paid';

-- Report summary
SELECT 
    'Total Bookings' as Category,
    COUNT(*) as Count
FROM Bookings
UNION ALL
SELECT 
    'Pending Bookings',
    COUNT(*)
FROM Bookings
WHERE payment_status = 'pending'
UNION ALL
SELECT 
    'Paid Bookings',
    COUNT(*)
FROM Bookings
WHERE payment_status = 'paid'
UNION ALL
SELECT 
    'Cancelled Bookings',
    COUNT(*)
FROM Bookings
WHERE payment_status = 'cancelled';

const db = require('../config/db');

/**
 * Migration to fix booking payment status
 * This ensures all bookings have correct payment_status based on actual payment records
 */
async function fixBookingPaymentStatus() {
    try {
        console.log('🔄 Starting booking payment status fix...');

        // Step 1: Fix bookings marked as 'paid' without successful payment records
        const [updatePending] = await db.query(`
            UPDATE Bookings b
            LEFT JOIN Payments p ON b.booking_id = p.entity_id AND p.entity_type = 'booking' AND p.status = 'succeeded'
            SET b.payment_status = 'pending'
            WHERE b.payment_status = 'paid' 
              AND p.payment_id IS NULL
        `);

        console.log(`✅ Fixed ${updatePending.affectedRows} bookings: changed from 'paid' to 'pending' (no payment record found)`);

        // Step 2: Ensure bookings with successful payments are marked as 'paid'
        const [updatePaid] = await db.query(`
            UPDATE Bookings b
            INNER JOIN Payments p ON b.booking_id = p.entity_id AND p.entity_type = 'booking'
            SET b.payment_status = 'paid'
            WHERE p.status = 'succeeded' 
              AND b.payment_status != 'paid'
        `);

        console.log(`✅ Fixed ${updatePaid.affectedRows} bookings: changed to 'paid' (payment record exists)`);

        // Step 3: Get summary statistics
        const [summary] = await db.query(`
            SELECT 
                payment_status,
                COUNT(*) as count
            FROM Bookings
            GROUP BY payment_status
            ORDER BY payment_status
        `);

        console.log('\n📊 Booking Payment Status Summary:');
        console.table(summary);

        // Step 4: Verify bookings with payments match payment status
        const [mismatch] = await db.query(`
            SELECT COUNT(*) as mismatch_count
            FROM Bookings b
            INNER JOIN Payments p ON b.booking_id = p.entity_id AND p.entity_type = 'booking'
            WHERE (p.status = 'succeeded' AND b.payment_status != 'paid')
               OR (p.status = 'pending' AND b.payment_status = 'paid')
        `);

        if (mismatch[0].mismatch_count > 0) {
            console.warn(`⚠️ Warning: ${mismatch[0].mismatch_count} bookings still have mismatched payment status`);
        } else {
            console.log('✅ All bookings have correct payment status');
        }

        console.log('\n✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error fixing booking payment status:', error);
        process.exit(1);
    }
}

// Run the migration if this file is executed directly
if (require.main === module) {
    fixBookingPaymentStatus();
}

module.exports = fixBookingPaymentStatus;

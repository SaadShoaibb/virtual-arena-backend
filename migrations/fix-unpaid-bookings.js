/**
 * Fix bookings that were incorrectly marked as 'paid' when payment was not completed
 * This happens when checkout.session.completed webhook fires but payment_status is not 'paid'
 */

const db = require('../config/db');

async function fixUnpaidBookings() {
  console.log('🔍 Checking for bookings incorrectly marked as paid...\n');

  try {
    // Find bookings marked as 'paid' that don't have a payment record
    const [unpaidBookings] = await db.query(`
      SELECT 
        b.booking_id,
        COALESCE(b.guest_email, u.email) as user_email,
        b.machine_type,
        b.payment_status,
        b.start_time,
        p.payment_id
      FROM Bookings b
      LEFT JOIN Users u ON b.user_id = u.user_id
      LEFT JOIN Payments p ON p.entity_id = b.booking_id AND p.entity_type = 'booking' AND p.status = 'succeeded'
      WHERE b.payment_status = 'paid'
      AND p.payment_id IS NULL
      ORDER BY b.booking_id DESC
    `);

    if (unpaidBookings.length === 0) {
      console.log('✅ No incorrectly marked bookings found. All bookings with "paid" status have payment records.\n');
    } else {
      console.log(`⚠️ Found ${unpaidBookings.length} booking(s) marked as 'paid' without payment records:\n`);

      unpaidBookings.forEach(booking => {
        console.log(`  - Booking #${booking.booking_id}: ${booking.user_email} - ${booking.machine_type}`);
        console.log(`    Scheduled: ${booking.start_time}`);
        console.log(`    Status: ${booking.payment_status} (should be 'pending')`);
        console.log('');
      });

      console.log('🔧 Fixing these bookings...\n');

      // Update these bookings to 'pending'
      const bookingIds = unpaidBookings.map(b => b.booking_id);
      const placeholders = bookingIds.map(() => '?').join(',');
      
      const [result] = await db.query(
        `UPDATE Bookings SET payment_status = 'pending' WHERE booking_id IN (${placeholders})`,
        bookingIds
      );

      console.log(`✅ Fixed ${result.affectedRows} booking(s). Status updated to 'pending'.\n`);
    }

    // Show final summary
    const [summary] = await db.query(`
      SELECT 
        payment_status,
        COUNT(*) as count
      FROM Bookings
      GROUP BY payment_status
    `);

    console.log('📊 Current booking status summary:');
    summary.forEach(row => {
      console.log(`  - ${row.payment_status}: ${row.count}`);
    });

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  } finally {
    process.exit();
  }
}

// Run the migration
fixUnpaidBookings();

const db = require('../config/db');

async function fixSessionStatus() {
    try {
        console.log('🔧 Checking session_status column...');
        
        // Check if column exists and its type
        const [columns] = await db.query(
            "SHOW COLUMNS FROM Bookings WHERE Field = 'session_status'"
        );
        
        if (columns.length === 0) {
            console.log('➕ Adding session_status column...');
            await db.query(
                "ALTER TABLE Bookings ADD COLUMN session_status ENUM('pending', 'started', 'completed', 'cancelled') DEFAULT 'pending'"
            );
        } else {
            console.log('🔄 Updating session_status column type...');
            await db.query(
                "ALTER TABLE Bookings MODIFY COLUMN session_status ENUM('pending', 'started', 'completed', 'cancelled') DEFAULT 'pending'"
            );
        }
        
        console.log('✅ Session status column fixed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

fixSessionStatus();

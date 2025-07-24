const mysql = require('mysql2/promise');
require('dotenv').config();

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function addUpdatedAtToPayments() {
    try {
        console.log('Adding updated_at column to Payments table...');

        // Check if updated_at column exists
        const [columns] = await db.query(`SHOW COLUMNS FROM Payments LIKE 'updated_at'`);
        
        if (columns.length === 0) {
            // Add updated_at column
            await db.query(`
                ALTER TABLE Payments 
                ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP 
                AFTER created_at
            `);
            console.log('✓ Added updated_at column to Payments table');
        } else {
            console.log('✓ updated_at column already exists in Payments table');
        }

        console.log('✓ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error adding updated_at column:', error);
        process.exit(1);
    }
}

addUpdatedAtToPayments();

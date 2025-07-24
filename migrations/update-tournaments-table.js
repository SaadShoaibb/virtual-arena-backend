const db = require('../config/db');

async function updateTournamentsTable() {
    try {
        console.log('Starting Tournaments table migration...');

        // Add description column if it doesn't exist
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM Tournaments LIKE 'description'`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE Tournaments ADD COLUMN description TEXT AFTER name`);
                console.log('✓ Added description column to Tournaments table');
            } else {
                console.log('✓ Description column already exists in Tournaments table');
            }
        } catch (error) {
            console.error('Error adding description column:', error.message);
        }

        // Add max_participants column if it doesn't exist
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM Tournaments LIKE 'max_participants'`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE Tournaments ADD COLUMN max_participants INT DEFAULT NULL AFTER ticket_price`);
                console.log('✓ Added max_participants column to Tournaments table');
            } else {
                console.log('✓ Max_participants column already exists in Tournaments table');
            }
        } catch (error) {
            console.error('Error adding max_participants column:', error.message);
        }

        // Add prize_pool column if it doesn't exist
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM Tournaments LIKE 'prize_pool'`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE Tournaments ADD COLUMN prize_pool DECIMAL(10, 2) DEFAULT 0.00 AFTER max_participants`);
                console.log('✓ Added prize_pool column to Tournaments table');
            } else {
                console.log('✓ Prize_pool column already exists in Tournaments table');
            }
        } catch (error) {
            console.error('Error adding prize_pool column:', error.message);
        }

        // Add game_type column if it doesn't exist
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM Tournaments LIKE 'game_type'`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE Tournaments ADD COLUMN game_type VARCHAR(100) AFTER prize_pool`);
                console.log('✓ Added game_type column to Tournaments table');
            } else {
                console.log('✓ Game_type column already exists in Tournaments table');
            }
        } catch (error) {
            console.error('Error adding game_type column:', error.message);
        }

        // Add rules column if it doesn't exist
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM Tournaments LIKE 'rules'`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE Tournaments ADD COLUMN rules TEXT AFTER game_type`);
                console.log('✓ Added rules column to Tournaments table');
            } else {
                console.log('✓ Rules column already exists in Tournaments table');
            }
        } catch (error) {
            console.error('Error adding rules column:', error.message);
        }

        // Add requirements column if it doesn't exist
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM Tournaments LIKE 'requirements'`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE Tournaments ADD COLUMN requirements TEXT AFTER rules`);
                console.log('✓ Added requirements column to Tournaments table');
            } else {
                console.log('✓ Requirements column already exists in Tournaments table');
            }
        } catch (error) {
            console.error('Error adding requirements column:', error.message);
        }

        // Add created_at column if it doesn't exist
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM Tournaments LIKE 'created_at'`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE Tournaments ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER status`);
                console.log('✓ Added created_at column to Tournaments table');
            } else {
                console.log('✓ Created_at column already exists in Tournaments table');
            }
        } catch (error) {
            console.error('Error adding created_at column:', error.message);
        }

        // Add updated_at column if it doesn't exist
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM Tournaments LIKE 'updated_at'`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE Tournaments ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`);
                console.log('✓ Added updated_at column to Tournaments table');
            } else {
                console.log('✓ Updated_at column already exists in Tournaments table');
            }
        } catch (error) {
            console.error('Error adding updated_at column:', error.message);
        }

        // Add event_id column to OrderItems if it doesn't exist
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM OrderItems LIKE 'event_id'`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE OrderItems ADD COLUMN event_id INT NULL AFTER tournament_id`);
                console.log('✓ Added event_id column to OrderItems table');
            } else {
                console.log('✓ Event_id column already exists in OrderItems table');
            }
        } catch (error) {
            console.error('Error adding event_id column to OrderItems:', error.message);
        }

        // Update item_type enum in OrderItems to include 'event'
        try {
            await db.query(`ALTER TABLE OrderItems MODIFY COLUMN item_type ENUM('product', 'tournament', 'event') DEFAULT 'product'`);
            console.log('✓ Updated OrderItems item_type enum to include event');
        } catch (error) {
            console.error('Error updating OrderItems item_type enum:', error.message);
        }

        // Add foreign key constraint for event_id in OrderItems
        try {
            await db.query(`ALTER TABLE OrderItems ADD CONSTRAINT fk_orderitems_event FOREIGN KEY (event_id) REFERENCES Events(event_id) ON DELETE CASCADE`);
            console.log('✓ Added foreign key constraint for event_id in OrderItems');
        } catch (error) {
            console.error('Error adding foreign key constraint for event_id in OrderItems:', error.message);
        }

        console.log('✅ Tournaments table migration completed successfully!');

        // Show final table structure
        const [tableStructure] = await db.query(`DESCRIBE Tournaments`);
        console.log('\n📋 Current Tournaments table structure:');
        console.table(tableStructure);

    } catch (error) {
        console.error('❌ Error during Tournaments table migration:', error);
        throw error;
    }
}

// Run the migration if this file is executed directly
if (require.main === module) {
    updateTournamentsTable()
        .then(() => {
            console.log('Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = updateTournamentsTable;

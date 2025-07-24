const db = require('./config/db');

async function fixEntityTypeColumn() {
    try {
        console.log('🔧 Fixing entity_type column in Payments table...');
        
        // Check current column structure
        const [columns] = await db.query('DESCRIBE Payments');
        const entityTypeColumn = columns.find(col => col.Field === 'entity_type');
        
        console.log('Current entity_type column:', entityTypeColumn);
        
        if (entityTypeColumn) {
            console.log('Updating entity_type column to VARCHAR(50)...');
            
            await db.query(`
                ALTER TABLE Payments 
                MODIFY COLUMN entity_type VARCHAR(50) DEFAULT 'order'
            `);
            
            console.log('✅ Successfully updated entity_type column to VARCHAR(50)');
            
            // Verify the change
            const [updatedColumns] = await db.query('DESCRIBE Payments');
            const updatedEntityTypeColumn = updatedColumns.find(col => col.Field === 'entity_type');
            console.log('Updated entity_type column:', updatedEntityTypeColumn);
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error fixing entity_type column:', error);
        process.exit(1);
    }
}

fixEntityTypeColumn();

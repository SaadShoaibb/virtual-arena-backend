const db = require('../config/db');

async function updateExperiencesTable() {
    try {
        console.log('🔧 Updating Experiences table with new fields...');

        // Add new columns for experience cards
        const newColumns = [
            'capacity VARCHAR(50) NULL',
            'duration VARCHAR(100) NULL', 
            'age_requirement VARCHAR(100) NULL',
            'single_player_price DECIMAL(10,2) NULL',
            'pair_price DECIMAL(10,2) NULL'
        ];

        for (const column of newColumns) {
            const fieldName = column.split(' ')[0];
            try {
                const [existing] = await db.query(`SHOW COLUMNS FROM Experiences LIKE '${fieldName}'`);
                if (existing.length === 0) {
                    await db.query(`ALTER TABLE Experiences ADD COLUMN ${column}`);
                    console.log(`✅ Added ${fieldName} column to Experiences table`);
                }
            } catch (error) {
                console.log(`⚠️ Could not add ${fieldName}:`, error.message);
            }
        }

        console.log('✅ Experiences table updated successfully');
    } catch (error) {
        console.error('❌ Error updating Experiences table:', error);
        throw error;
    }
}

module.exports = updateExperiencesTable;
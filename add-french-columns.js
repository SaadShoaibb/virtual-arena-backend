const db = require('./config/db');

async function addFrenchColumns() {
    try {
        console.log('🔄 Adding French columns to Experiences table...');
        
        await db.query(`
            ALTER TABLE Experiences 
            ADD COLUMN title_fr VARCHAR(255) NULL AFTER title,
            ADD COLUMN description_fr TEXT NULL AFTER description,
            ADD COLUMN features_fr JSON NULL AFTER features
        `);
        
        console.log('✅ French columns added successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error adding French columns:', error);
        process.exit(1);
    }
}

addFrenchColumns();
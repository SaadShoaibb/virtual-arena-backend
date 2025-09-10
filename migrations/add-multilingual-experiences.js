const db = require('../config/db');

async function addMultilingualFields() {
    try {
        console.log('Adding multilingual fields to Experiences table...');
        
        await db.query(`
            ALTER TABLE Experiences 
            ADD COLUMN title_fr VARCHAR(255) NULL AFTER title,
            ADD COLUMN description_fr TEXT NULL AFTER description,
            ADD COLUMN features_fr JSON NULL AFTER features
        `);
        
        console.log('Multilingual fields added successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error adding multilingual fields:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    addMultilingualFields();
}

module.exports = addMultilingualFields;
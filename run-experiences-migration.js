const db = require('./config/db');
const fs = require('fs');
const path = require('path');
const updateExperiencesTable = require('./migrations/update-experiences-table');
const addFrenchColumns = require('./add-french-columns');

async function runExperiencesMigration() {
    try {
        console.log('🔄 Running Experiences table migration...');
        
        // First run the original SQL migration if it exists
        const sqlPath = path.join(__dirname, 'migrations', 'create-experiences-table.sql');
        if (fs.existsSync(sqlPath)) {
            const migrationSQL = fs.readFileSync(sqlPath, 'utf8');
            
            // Split by semicolon and execute each statement
            const statements = migrationSQL.split(';').filter(stmt => stmt.trim());
            
            for (const statement of statements) {
                if (statement.trim()) {
                    try {
                        await db.query(statement);
                        console.log('✅ Executed:', statement.substring(0, 50) + '...');
                    } catch (error) {
                        if (error.code === 'ER_DUP_FIELDNAME' || error.code === 'ER_DUP_KEYNAME' || error.code === 'ER_DUP_ENTRY') {
                            console.log('ℹ️ Skipped (already exists):', statement.substring(0, 50) + '...');
                        } else {
                            throw error;
                        }
                    }
                }
            }
        }
        
        // Run the new experiences table update migration
        console.log('🔧 Running experiences table update migration...');
        await updateExperiencesTable();
        
        // Run the French columns migration
        console.log('🌐 Running French columns migration...');
        await addFrenchColumns();
        
        console.log('✅ All experiences migrations completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runExperiencesMigration();
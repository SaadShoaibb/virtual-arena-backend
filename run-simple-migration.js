const db = require('./config/db');

async function runSimpleMigration() {
    try {
        console.log('🔄 Running simple Experiences migration...');
        
        // Create Experiences table
        await db.query(`
            CREATE TABLE IF NOT EXISTS Experiences (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                slug VARCHAR(255) NOT NULL UNIQUE,
                description TEXT,
                features JSON,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_slug (slug),
                INDEX idx_is_active (is_active)
            )
        `);
        console.log('✅ Created Experiences table');

        // Check if experiences already exist
        const [existingExperiences] = await db.query('SELECT COUNT(*) as count FROM Experiences');
        
        if (existingExperiences[0].count === 0) {
            // Insert default experiences
            const experiences = [
                ['Free Roaming Arena', 'free-roaming-arena', 'Experience unlimited freedom in our spacious VR arena with full-body tracking and wireless headsets.'],
                ['VR Battle', 'vr-battle', 'Challenge your friends in our two-player VR battle arena with competitive multiplayer games.'],
                ['UFO Spaceship', 'ufo-spaceship', 'Immersive cinematic VR experience aboard a UFO spaceship with 360-degree visuals.'],
                ['VR 360', 'vr-360', 'Full 360-degree virtual reality experience with stunning visuals and immersive gameplay.'],
                ['VR Cat', 'vr-cat', 'Fun and family-friendly VR experience perfect for kids with creative and educational content.'],
                ['VR Warrior', 'vr-warrior', 'Child-friendly battle experience designed specifically for younger players aged 6-12.'],
                ['Photo Booth', 'photo-booth', 'Capture memorable moments with our VR photo booth experience in virtual worlds.']
            ];

            for (const [title, slug, description] of experiences) {
                await db.query(`
                    INSERT INTO Experiences (title, slug, description, is_active)
                    VALUES (?, ?, ?, TRUE)
                `, [title, slug, description]);
                console.log(`✅ Added experience: ${title}`);
            }
        }

        // Check if experience_id column exists in ExperienceMedia
        const [columns] = await db.query(`SHOW COLUMNS FROM ExperienceMedia LIKE 'experience_id'`);
        
        if (columns.length === 0) {
            // Add experience_id column
            await db.query(`ALTER TABLE ExperienceMedia ADD COLUMN experience_id INT NULL`);
            console.log('✅ Added experience_id column to ExperienceMedia');
            
            // Link existing media to experiences
            await db.query(`
                UPDATE ExperienceMedia em 
                JOIN Experiences e ON em.experience_name = e.slug 
                SET em.experience_id = e.id
            `);
            console.log('✅ Linked existing media to experiences');
        }

        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runSimpleMigration();
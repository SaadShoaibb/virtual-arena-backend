const db = require('./config/db');

async function migrateExperienceMedia() {
    try {
        console.log('🔄 Starting complete experience media migration...');

        // Clear existing media first
        await db.query('DELETE FROM ExperienceMedia');
        console.log('🗑️ Cleared existing media entries');

        // Complete media mapping for all experiences
        const mediaEntries = [
            // Free Roaming Arena - 6 images
            ['free-roaming-arena', 'image', '/uploads/experiences/arena/arena1.jpeg', 1],
            ['free-roaming-arena', 'image', '/uploads/experiences/arena/arena2.jpeg', 2],
            ['free-roaming-arena', 'image', '/uploads/experiences/arena/arena3.jpeg', 3],
            ['free-roaming-arena', 'image', '/uploads/experiences/arena/arena4.jpeg', 4],
            ['free-roaming-arena', 'image', '/uploads/experiences/arena/arena5.jpeg', 5],
            ['free-roaming-arena', 'image', '/uploads/experiences/arena/arena6.jpeg', 6],

            // VR Battle - 5 images
            ['vr-battle', 'image', '/uploads/experiences/vrbattle/vrbattle.jpeg', 1],
            ['vr-battle', 'image', '/uploads/experiences/vrbattle/vrbattle2.jpeg', 2],
            ['vr-battle', 'image', '/uploads/experiences/vrbattle/vrbattle3.jpeg', 3],
            ['vr-battle', 'image', '/uploads/experiences/vrbattle/vrbattle4.jpeg', 4],
            ['vr-battle', 'image', '/uploads/experiences/vrbattle/vrbattle5.jpeg', 5],

            // UFO Spaceship - 5 images
            ['ufo-spaceship', 'image', '/uploads/experiences/ufo/ufo.jpeg', 1],
            ['ufo-spaceship', 'image', '/uploads/experiences/ufo/ufo1.jpeg', 2],
            ['ufo-spaceship', 'image', '/uploads/experiences/ufo/ufo2.jpeg', 3],
            ['ufo-spaceship', 'image', '/uploads/experiences/ufo/ufo4.jpeg', 4],
            ['ufo-spaceship', 'image', '/uploads/experiences/ufo/ufo5.jpeg', 5],

            // VR 360 - 5 images
            ['vr-360', 'image', '/uploads/experiences/vr360/vr360.jpeg', 1],
            ['vr-360', 'image', '/uploads/experiences/vr360/vr360-2.jpeg', 2],
            ['vr-360', 'image', '/uploads/experiences/vr360/vr360-3.jpeg', 3],
            ['vr-360', 'image', '/uploads/experiences/vr360/vr360-4.jpeg', 4],
            ['vr-360', 'image', '/uploads/experiences/vr360/vr360-5.jpeg', 5],

            // VR Cat - 2 images
            ['vr-cat', 'image', '/uploads/experiences/vrcat/vrcat.jpeg', 1],
            ['vr-cat', 'image', '/uploads/experiences/vrcat/vrcat2.jpeg', 2],

            // VR Warrior - 4 images
            ['vr-warrior', 'image', '/uploads/experiences/vrwarrior/vrwarrior.jpeg', 1],
            ['vr-warrior', 'image', '/uploads/experiences/vrwarrior/vrwarrior2.jpeg', 2],
            ['vr-warrior', 'image', '/uploads/experiences/vrwarrior/vrwarrior3.jpeg', 3],
            ['vr-warrior', 'image', '/uploads/experiences/vrwarrior/vrwarrior4.jpeg', 4],

            // Photo Booth - placeholder (no images available)
            ['photo-booth', 'image', '/assets/experiences/photobooth/photobooth.jpeg', 1]
        ];

        // Insert all media entries
        for (const [experience_name, media_type, media_url, media_order] of mediaEntries) {
            try {
                await db.query(`
                    INSERT INTO ExperienceMedia (experience_name, media_type, media_url, media_order, is_active)
                    VALUES (?, ?, ?, ?, TRUE)
                `, [experience_name, media_type, media_url, media_order]);
                console.log(`✅ Added: ${experience_name} - ${media_url}`);
            } catch (error) {
                console.log(`⚠️ Failed to add ${experience_name} - ${media_url}:`, error.message);
            }
        }

        // Show final results
        const [results] = await db.query(`
            SELECT experience_name, COUNT(*) as count 
            FROM ExperienceMedia 
            GROUP BY experience_name 
            ORDER BY experience_name
        `);
        
        console.log('\n📊 Migration Summary:');
        results.forEach(row => {
            console.log(`${row.experience_name}: ${row.count} images`);
        });

        console.log('\n✅ Experience media migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrateExperienceMedia();
const db = require('../config/db');

// Helper function to generate slug from title
const generateSlug = (title) => {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim('-');
};

// Create new experience
const createExperience = async (req, res) => {
    try {
        const { 
            title, 
            title_fr,
            description, 
            description_fr,
            features, 
            features_fr,
            capacity, 
            duration, 
            age_requirement, 
            single_player_price, 
            pair_price, 
            header_image_url = null, 
            is_active = true 
        } = req.body;
        
        // Handle features as simple text input (one feature per line)
        let normalizedFeatures = [];
        if (typeof features === 'string' && features.trim()) {
            normalizedFeatures = features.split('\n').map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(features)) {
            normalizedFeatures = features;
        }
        
        let normalizedFeaturesFr = [];
        if (typeof features_fr === 'string' && features_fr.trim()) {
            normalizedFeaturesFr = features_fr.split('\n').map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(features_fr)) {
            normalizedFeaturesFr = features_fr;
        }
        
        if (!title) {
            return res.status(400).json({
                success: false,
                message: 'Title is required'
            });
        }

        let slug = generateSlug(title);
        
        // Ensure slug is unique
        let counter = 1;
        let originalSlug = slug;
        while (true) {
            const [existing] = await db.query('SELECT id FROM Experiences WHERE slug = ?', [slug]);
            if (existing.length === 0) break;
            slug = `${originalSlug}-${counter}`;
            counter++;
        }

        const [result] = await db.query(`
            INSERT INTO Experiences (title, title_fr, slug, description, description_fr, features, features_fr, capacity, duration, age_requirement, single_player_price, pair_price, header_image_url, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [title, title_fr, slug, description, description_fr, JSON.stringify(normalizedFeatures), JSON.stringify(normalizedFeaturesFr), capacity, duration, age_requirement, single_player_price, pair_price, header_image_url, is_active]);

        res.status(201).json({
            success: true,
            message: 'Experience created successfully',
            experience: {
                id: result.insertId,
                title,
                title_fr,
                slug,
                description,
                description_fr,
                features: normalizedFeatures,
                features_fr: normalizedFeaturesFr,
                capacity,
                duration,
                age_requirement,
                single_player_price,
                pair_price,
                header_image_url,
                is_active
            }
        });
    } catch (error) {
        console.error('Error creating experience:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating experience',
            error: error.message
        });
    }
};

// Get all experiences
const getAllExperiences = async (req, res) => {
    try {
        const { active_only } = req.query;
        
        let query = 'SELECT * FROM Experiences';
        let params = [];
        
        if (active_only === 'true') {
            query += ' WHERE is_active = TRUE';
        }
        
        query += ' ORDER BY created_at DESC';
        
        const [experiences] = await db.query(query, params);
        
        // Get media for each experience
        const experiencesWithMedia = await Promise.all(
            experiences.map(async (exp) => {
                const [media] = await db.query(`
                    SELECT * FROM ExperienceMedia 
                    WHERE experience_name = ? AND is_active = TRUE 
                    ORDER BY media_order ASC, created_at ASC
                `, [exp.slug]);
                
                let parsed = [];
                if (exp.features) {
                    try {
                        parsed = JSON.parse(exp.features);
                    } catch {
                        // Fallback: treat as comma-separated text
                        parsed = String(exp.features).split(',').map(s => s.trim()).filter(Boolean);
                    }
                }
                
                let parsedFr = [];
                if (exp.features_fr) {
                    try {
                        parsedFr = JSON.parse(exp.features_fr);
                    } catch {
                        // Fallback: treat as comma-separated text
                        parsedFr = String(exp.features_fr).split(',').map(s => s.trim()).filter(Boolean);
                    }
                }
                
                return { ...exp, features: parsed, features_fr: parsedFr, media };
            })
        );

        res.status(200).json({
            success: true,
            experiences: experiencesWithMedia
        });
    } catch (error) {
        console.error('Error fetching experiences:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching experiences',
            error: error.message
        });
    }
};

// Get experience by slug with media
const getExperienceBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        
        const [experiences] = await db.query(`
            SELECT * FROM Experiences WHERE slug = ? AND is_active = TRUE
        `, [slug]);
        
        if (experiences.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Experience not found'
            });
        }
        
        const experience = experiences[0];
        
        // Get associated media using experience slug/name
        const [media] = await db.query(`
            SELECT * FROM ExperienceMedia 
            WHERE experience_name = ? AND is_active = TRUE 
            ORDER BY media_order ASC, created_at ASC
        `, [experience.slug]);
        
        res.status(200).json({
            success: true,
            experience: {
                ...experience,
                features: (() => {
                    if (!experience.features) return [];
                    try {
                        return JSON.parse(experience.features);
                    } catch {
                        return String(experience.features).split(',').map(s => s.trim()).filter(Boolean);
                    }
                })(),
                features_fr: (() => {
                    if (!experience.features_fr) return [];
                    try {
                        return JSON.parse(experience.features_fr);
                    } catch {
                        return String(experience.features_fr).split(',').map(s => s.trim()).filter(Boolean);
                    }
                })(),
                media
            }
        });
    } catch (error) {
        console.error('Error fetching experience:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching experience',
            error: error.message
        });
    }
};

// Update experience
const updateExperience = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            title, 
            title_fr,
            slug, 
            description, 
            description_fr,
            features, 
            features_fr,
            capacity, 
            duration, 
            age_requirement, 
            single_player_price, 
            pair_price, 
            header_image_url = null, 
            is_active 
        } = req.body;
        
        console.log('Update experience payload:', req.body);
        
        // Check if experience exists
        const [existing] = await db.query('SELECT * FROM Experiences WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Experience not found'
            });
        }
        
        // Handle features as simple text input (one feature per line)
        let normalizedFeatures = [];
        if (typeof features === 'string' && features.trim()) {
            normalizedFeatures = features.split('\n').map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(features)) {
            normalizedFeatures = features;
        }
        
        let normalizedFeaturesFr = [];
        if (typeof features_fr === 'string' && features_fr.trim()) {
            normalizedFeaturesFr = features_fr.split('\n').map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(features_fr)) {
            normalizedFeaturesFr = features_fr;
        }
        
        // If slug is provided, ensure it's unique (excluding current experience)
        if (slug) {
            const [slugCheck] = await db.query('SELECT id FROM Experiences WHERE slug = ? AND id != ?', [slug, id]);
            if (slugCheck.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Slug already exists'
                });
            }
        }
        
        console.log('Updating with values:', [title, slug, description, JSON.stringify(normalizedFeatures), capacity, duration, age_requirement, single_player_price, pair_price, header_image_url, is_active, id]);
        
        const [result] = await db.query(`
            UPDATE Experiences 
            SET title = ?, title_fr = ?, slug = ?, description = ?, description_fr = ?, features = ?, features_fr = ?, capacity = ?, duration = ?, age_requirement = ?, single_player_price = ?, pair_price = ?, header_image_url = ?, is_active = ?
            WHERE id = ?
        `, [title, title_fr, slug, description, description_fr, JSON.stringify(normalizedFeatures), JSON.stringify(normalizedFeaturesFr), capacity, duration, age_requirement, single_player_price, pair_price, header_image_url, is_active, id]);
        
        console.log('Update result:', result);
        
        res.status(200).json({
            success: true,
            message: 'Experience updated successfully'
        });
    } catch (error) {
        console.error('Error updating experience:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating experience',
            error: error.message
        });
    }
};

// Delete experience
const deleteExperience = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [result] = await db.query('DELETE FROM Experiences WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Experience not found'
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'Experience deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting experience:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting experience',
            error: error.message
        });
    }
};

module.exports = {
    createExperience,
    getAllExperiences,
    getExperienceBySlug,
    updateExperience,
    deleteExperience
};
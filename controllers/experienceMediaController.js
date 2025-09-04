const db = require('../config/db');

// Get all media for a specific experience
const getExperienceMedia = async (req, res) => {
    try {
        const { experienceName } = req.params;
        
        const [media] = await db.query(`
            SELECT * FROM ExperienceMedia 
            WHERE experience_name = ? AND is_active = TRUE 
            ORDER BY media_order ASC, created_at ASC
        `, [experienceName]);

        res.status(200).json({
            success: true,
            message: 'Experience media retrieved successfully',
            media
        });
    } catch (error) {
        console.error('Error fetching experience media:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching experience media',
            error: error.message
        });
    }
};

// Get all experiences with their media (for admin)
const getAllExperiencesMedia = async (req, res) => {
    try {
        const [experiences] = await db.query(`
            SELECT 
                experience_name,
                COUNT(*) as media_count,
                GROUP_CONCAT(
                    CASE WHEN media_type = 'image' THEN media_url END 
                    ORDER BY media_order ASC 
                    SEPARATOR ','
                ) as images,
                GROUP_CONCAT(
                    CASE WHEN media_type = 'video' THEN media_url END 
                    ORDER BY media_order ASC 
                    SEPARATOR ','
                ) as videos
            FROM ExperienceMedia 
            WHERE is_active = TRUE 
            GROUP BY experience_name
            ORDER BY experience_name ASC
        `);

        res.status(200).json({
            success: true,
            message: 'All experiences media retrieved successfully',
            experiences
        });
    } catch (error) {
        console.error('Error fetching all experiences media:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching experiences media',
            error: error.message
        });
    }
};

// Add new media to an experience
const addExperienceMedia = async (req, res) => {
    try {
        const { experience_name, media_type, media_order } = req.body;
        
        // Handle file upload
        let media_url;
        if (req.file) {
            // File was uploaded, use the uploaded file path
            media_url = `/uploads/${req.file.filename}`;
        } else if (req.body.media_url) {
            // URL was provided directly
            media_url = req.body.media_url;
        } else {
            return res.status(400).json({
                success: false,
                message: 'Either upload a file or provide a media URL'
            });
        }

        if (!experience_name) {
            return res.status(400).json({
                success: false,
                message: 'Experience name is required'
            });
        }

        // Determine media type from file if not provided
        let finalMediaType = media_type;
        if (!finalMediaType && req.file) {
            finalMediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
        }

        const [result] = await db.query(`
            INSERT INTO ExperienceMedia (experience_name, media_type, media_url, media_order, is_active)
            VALUES (?, ?, ?, ?, TRUE)
        `, [experience_name, finalMediaType || 'image', media_url, media_order || 0]);

        res.status(201).json({
            success: true,
            message: 'Media added successfully',
            media_id: result.insertId,
            media_url: media_url
        });
    } catch (error) {
        console.error('Error adding experience media:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding experience media',
            error: error.message
        });
    }
};

// Update existing media
const updateExperienceMedia = async (req, res) => {
    try {
        const { media_id } = req.params;
        const { media_order, is_active } = req.body;

        console.log('Updating media:', { media_id, media_order, is_active });

        const [result] = await db.query(`
            UPDATE ExperienceMedia 
            SET media_order = ?, is_active = ?
            WHERE media_id = ?
        `, [media_order, is_active, media_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Media not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Media updated successfully'
        });
    } catch (error) {
        console.error('Error updating experience media:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating experience media',
            error: error.message
        });
    }
};

// Delete media
const deleteExperienceMedia = async (req, res) => {
    try {
        const { media_id } = req.params;

        const [result] = await db.query(`
            DELETE FROM ExperienceMedia WHERE media_id = ?
        `, [media_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Media not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Media deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting experience media:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting experience media',
            error: error.message
        });
    }
};

// Bulk update media order
const updateMediaOrder = async (req, res) => {
    try {
        const { experience_name } = req.params;
        const { mediaOrder } = req.body; // Array of {media_id, order}

        if (!Array.isArray(mediaOrder)) {
            return res.status(400).json({
                success: false,
                message: 'Media order must be an array'
            });
        }

        // Update each media item's order
        for (const item of mediaOrder) {
            await db.query(`
                UPDATE ExperienceMedia 
                SET media_order = ? 
                WHERE media_id = ? AND experience_name = ?
            `, [item.order, item.media_id, experience_name]);
        }

        res.status(200).json({
            success: true,
            message: 'Media order updated successfully'
        });
    } catch (error) {
        console.error('Error updating media order:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating media order',
            error: error.message
        });
    }
};

module.exports = {
    getExperienceMedia,
    getAllExperiencesMedia,
    addExperienceMedia,
    updateExperienceMedia,
    deleteExperienceMedia,
    updateMediaOrder
};
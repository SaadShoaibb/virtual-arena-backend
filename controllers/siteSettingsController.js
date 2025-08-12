const db = require('../config/db');

// Get site setting by key
const getSiteSetting = async (req, res) => {
    try {
        const { key } = req.params;
        
        const [rows] = await db.query(
            'SELECT * FROM SiteSettings WHERE setting_key = ?',
            [key]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Setting not found'
            });
        }

        const setting = rows[0];
        let value = setting.setting_value;

        // Parse value based on type
        switch (setting.setting_type) {
            case 'number':
                value = parseFloat(value);
                break;
            case 'boolean':
                value = value === 'true';
                break;
            case 'date':
                value = new Date(value);
                break;
            default:
                // string - keep as is
                break;
        }

        res.json({
            success: true,
            setting: {
                ...setting,
                setting_value: value
            }
        });
    } catch (error) {
        console.error('Error fetching site setting:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch site setting'
        });
    }
};

// Get grand opening date specifically
const getGrandOpeningDate = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT setting_value FROM SiteSettings WHERE setting_key = ?',
            ['grand_opening_date']
        );

        if (rows.length === 0) {
            // Return default date (100 days from now)
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 100);
            
            return res.json({
                success: true,
                date: defaultDate.toISOString().split('T')[0]
            });
        }

        res.json({
            success: true,
            date: rows[0].setting_value // full ISO string in UTC
        });
    } catch (error) {
        console.error('Error fetching grand opening date:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch grand opening date'
        });
    }
};

// Update site setting
const updateSiteSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const { value, type = 'string', description } = req.body;

        // Convert value to string for storage
        let stringValue = value;
        if (type === 'boolean') {
            stringValue = value ? 'true' : 'false';
        } else if (type === 'number') {
            stringValue = value.toString();
        } else if (type === 'date') {
            // Preserve full ISO datetime (UTC) so countdown respects time, not just date
            stringValue = new Date(value).toISOString();
        }

        // Check if setting exists
        const [existing] = await db.query(
            'SELECT setting_id FROM SiteSettings WHERE setting_key = ?',
            [key]
        );

        if (existing.length > 0) {
            // Update existing setting
            await db.query(
                'UPDATE SiteSettings SET setting_value = ?, setting_type = ?, description = ? WHERE setting_key = ?',
                [stringValue, type, description, key]
            );
        } else {
            // Create new setting
            await db.query(
                'INSERT INTO SiteSettings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?)',
                [key, stringValue, type, description]
            );
        }

        res.json({
            success: true,
            message: 'Site setting updated successfully'
        });
    } catch (error) {
        console.error('Error updating site setting:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update site setting'
        });
    }
};

// Get all site settings
const getAllSiteSettings = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM SiteSettings ORDER BY setting_key');

        const settings = rows.map(setting => {
            let value = setting.setting_value;

            // Parse value based on type
            switch (setting.setting_type) {
                case 'number':
                    value = parseFloat(value);
                    break;
                case 'boolean':
                    value = value === 'true';
                    break;
                case 'date':
                    value = new Date(value);
                    break;
                default:
                    // string - keep as is
                    break;
            }

            return {
                ...setting,
                setting_value: value
            };
        });

        res.json({
            success: true,
            settings
        });
    } catch (error) {
        console.error('Error fetching site settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch site settings'
        });
    }
};

// Delete site setting
const deleteSiteSetting = async (req, res) => {
    try {
        const { key } = req.params;

        const [result] = await db.query(
            'DELETE FROM SiteSettings WHERE setting_key = ?',
            [key]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Setting not found'
            });
        }

        res.json({
            success: true,
            message: 'Site setting deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting site setting:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete site setting'
        });
    }
};

module.exports = {
    getSiteSetting,
    getGrandOpeningDate,
    updateSiteSetting,
    getAllSiteSettings,
    deleteSiteSetting
};

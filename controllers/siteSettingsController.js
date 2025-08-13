const db = require('../config/db');

// Get site setting by key
const getSiteSetting = async (req, res) => {
    try {
        const { key } = req.params;
        console.log(`🔧 CRITICAL: Fetching setting: ${key}`);

        // Check if table exists
        const [tables] = await db.query("SHOW TABLES LIKE 'SiteSettings'");
        console.log('🔧 CRITICAL: SiteSettings table exists:', tables.length > 0);

        if (tables.length === 0) {
            console.error('❌ CRITICAL: SiteSettings table does not exist!');
            return res.status(500).json({ success: false, message: 'SiteSettings table not found' });
        }

        const [rows] = await db.query(
            'SELECT * FROM SiteSettings WHERE setting_key = ?',
            [key]
        );
        console.log(`🔧 CRITICAL: Found ${rows.length} rows for setting: ${key}`);

        if (rows.length > 0) {
            console.log(`🔧 CRITICAL: Setting value: ${key} = ${rows[0].setting_value}`);
        }

        if (rows.length === 0) {
            console.log(`⚠️ CRITICAL: Setting not found: ${key}`);
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
        console.log('🔧 CRITICAL: Fetching grand_opening_date...');

        // Check if table exists
        const [tables] = await db.query("SHOW TABLES LIKE 'SiteSettings'");
        console.log('🔧 CRITICAL: SiteSettings table exists for grand opening:', tables.length > 0);

        if (tables.length === 0) {
            console.error('❌ CRITICAL: SiteSettings table does not exist for grand opening!');
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 100);
            return res.json({
                success: true,
                date: defaultDate.toISOString().split('T')[0]
            });
        }

        // Try both key formats for backward compatibility
        const [rows] = await db.query(
            'SELECT setting_value FROM SiteSettings WHERE setting_key IN (?, ?)',
            ['grand_opening_date', 'grand-opening-date']
        );
        console.log('🔧 CRITICAL: grand_opening_date query result:', rows);

        if (rows.length === 0) {
            console.log('⚠️ CRITICAL: No grand_opening_date found in database, returning default');
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

        console.log(`🔧 Updating site setting: ${key}`, { value, type, description });

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

        console.log(`📝 Converted value for storage: ${stringValue}`);

        // Check if setting exists
        const [existing] = await db.query(
            'SELECT setting_id FROM SiteSettings WHERE setting_key = ?',
            [key]
        );

        if (existing.length > 0) {
            // Update existing setting
            console.log(`🔄 Updating existing setting: ${key}`);
            await db.query(
                'UPDATE SiteSettings SET setting_value = ?, setting_type = ?, description = ? WHERE setting_key = ?',
                [stringValue, type, description, key]
            );
        } else {
            // Create new setting
            console.log(`➕ Creating new setting: ${key}`);
            await db.query(
                'INSERT INTO SiteSettings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?)',
                [key, stringValue, type, description]
            );
        }

        console.log(`✅ Successfully updated site setting: ${key} = ${stringValue}`);

        res.json({
            success: true,
            message: 'Site setting updated successfully'
        });
    } catch (error) {
        console.error('❌ Error updating site setting:', error);
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

const express = require('express');
const router = express.Router();
const {
    getSiteSetting,
    getGrandOpeningDate,
    updateSiteSetting,
    getAllSiteSettings,
    deleteSiteSetting
} = require('../controllers/siteSettingsController');
const isAuthenticated = require('../middlewares/authMiddleware');
const isAdmin = require('../middlewares/adminMiddleware');

// Public routes
router.get('/grand-opening-date', getGrandOpeningDate);
router.get('/grand_opening_date', getGrandOpeningDate);
router.get('/countdown-enabled', async (req, res) => {
    const db = require('../config/db');
    try {
        console.log('🔧 CRITICAL: Fetching countdown_enabled setting...');

        // Check if table exists
        const [tables] = await db.query("SHOW TABLES LIKE 'SiteSettings'");
        console.log('🔧 CRITICAL: SiteSettings table exists:', tables.length > 0);

        if (tables.length === 0) {
            console.error('❌ CRITICAL: SiteSettings table does not exist!');
            return res.json({ success: true, setting: { setting_value: 'true' } });
        }

        const [rows] = await db.query(
            'SELECT setting_value FROM SiteSettings WHERE setting_key IN (?, ?) LIMIT 1',
            ['countdown_enabled', 'countdown-enabled']
        );
        console.log('🔧 CRITICAL: countdown_enabled query result:', rows);

        const result = rows[0] || { setting_value: 'true' };
        console.log('🔧 CRITICAL: Returning countdown_enabled:', result);

        res.json({ success: true, setting: result });
    } catch (e) {
        console.error('❌ CRITICAL: Error fetching countdown_enabled:', e);
        res.json({ success: true, setting: { setting_value: 'true' } });
    }
});

// Also support the underscore version
router.get('/countdown_enabled', async (req, res) => {
    const db = require('../config/db');
    try {
        console.log('🔧 CRITICAL: Fetching countdown_enabled setting (underscore version)...');
        const [rows] = await db.query(
            'SELECT setting_value FROM SiteSettings WHERE setting_key IN (?, ?) LIMIT 1',
            ['countdown_enabled', 'countdown-enabled']
        );
        console.log('🔧 CRITICAL: countdown_enabled (underscore) query result:', rows);
        res.json({ success: true, setting: rows[0] || { setting_value: 'true' } });
    } catch (e) {
        console.error('❌ CRITICAL: Error fetching countdown_enabled (underscore):', e);
        res.json({ success: true, setting: { setting_value: 'true' } });
    }
});

// Admin routes (require authentication and admin privileges)
router.get('/', isAuthenticated, isAdmin, getAllSiteSettings);
router.get('/:key', isAuthenticated, isAdmin, getSiteSetting);
router.put('/:key', isAuthenticated, isAdmin, updateSiteSetting);
router.delete('/:key', isAuthenticated, isAdmin, deleteSiteSetting);

module.exports = router;

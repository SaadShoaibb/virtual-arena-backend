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
router.get('/countdown-enabled', async (req, res) => {
    const db = require('../config/db');
    try {
        const [rows] = await db.query(
            'SELECT setting_value FROM SiteSettings WHERE setting_key = ? LIMIT 1',
            ['countdown_enabled']
        );
        res.json({ success: true, setting: rows[0] || { setting_value: 'true' } });
    } catch (e) {
        res.json({ success: true, setting: { setting_value: 'true' } });
    }
});

// Admin routes (require authentication and admin privileges)
router.get('/', isAuthenticated, isAdmin, getAllSiteSettings);
router.get('/:key', isAuthenticated, isAdmin, getSiteSetting);
router.put('/:key', isAuthenticated, isAdmin, updateSiteSetting);
router.delete('/:key', isAuthenticated, isAdmin, deleteSiteSetting);

module.exports = router;

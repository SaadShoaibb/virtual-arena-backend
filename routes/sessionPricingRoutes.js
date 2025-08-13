const express = require('express');
const router = express.Router();
const {
    getAllSessionPricing,
    getSessionPricing,
    updateSessionPricing,
    deleteSessionPricing,
    getAllTimeSlots,
    updateTimeSlot,
    createTimeSlot,
    deleteTimeSlot,
    getAllSessionsEnhanced,
    updateSessionEnhanced,
    getSessionDurationPricing
} = require('../controllers/sessionPricingController');
const isAuthenticated = require('../middlewares/authMiddleware');
const isAdmin = require('../middlewares/adminMiddleware');
const db = require('../config/db');

// Session Pricing Routes
router.get('/pricing', isAuthenticated, isAdmin, getAllSessionPricing);
router.get('/pricing/:sessionId', isAuthenticated, isAdmin, getSessionPricing);
router.put('/pricing/:sessionId', isAuthenticated, isAdmin, updateSessionPricing);
router.delete('/pricing/:pricingId', isAuthenticated, isAdmin, deleteSessionPricing);

// Time Slots Routes
router.get('/time-slots', isAuthenticated, isAdmin, getAllTimeSlots);
router.post('/time-slots', isAuthenticated, isAdmin, createTimeSlot);
router.put('/time-slots/:slotId', isAuthenticated, isAdmin, updateTimeSlot);
router.delete('/time-slots/:slotId', isAuthenticated, isAdmin, deleteTimeSlot);

// Enhanced Session Management Routes
router.get('/enhanced', isAuthenticated, isAdmin, getAllSessionsEnhanced);
router.put('/enhanced/:sessionId', isAuthenticated, isAdmin, updateSessionEnhanced);
router.get('/duration-pricing/:sessionId', isAuthenticated, isAdmin, getSessionDurationPricing);

// Public routes for frontend
router.get('/public/pricing', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM SessionPricing WHERE is_active = TRUE');
        res.json({ success: true, pricing: rows });
    } catch (error) {
        console.error('Error fetching session pricing:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch pricing' });
    }
});

router.get('/public/group-discounts', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM GroupDiscounts WHERE is_active = TRUE ORDER BY min_players ASC');
        res.json({ success: true, discounts: rows });
    } catch (error) {
        console.error('Error fetching group discounts:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch discounts' });
    }
});

// Admin routes for group discounts management
router.put('/group-discounts/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { min_players, max_players, discount_percentage, discount_name, is_active } = req.body;

        await db.query(
            'UPDATE GroupDiscounts SET min_players = ?, max_players = ?, discount_percentage = ?, discount_name = ?, is_active = ? WHERE discount_id = ?',
            [min_players, max_players, discount_percentage, discount_name, is_active, id]
        );

        res.json({ success: true, message: 'Group discount updated successfully' });
    } catch (error) {
        console.error('Error updating group discount:', error);
        res.status(500).json({ success: false, message: 'Failed to update group discount' });
    }
});

router.post('/group-discounts', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { min_players, max_players, discount_percentage, discount_name, is_active } = req.body;

        await db.query(
            'INSERT INTO GroupDiscounts (min_players, max_players, discount_percentage, discount_name, is_active) VALUES (?, ?, ?, ?, ?)',
            [min_players, max_players, discount_percentage, discount_name, is_active]
        );

        res.json({ success: true, message: 'Group discount created successfully' });
    } catch (error) {
        console.error('Error creating group discount:', error);
        res.status(500).json({ success: false, message: 'Failed to create group discount' });
    }
});

// Update session pricing
router.put('/admin-pricing', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { session_id, session_count, price } = req.body;

        // Check if pricing exists
        const [existing] = await db.query(
            'SELECT pricing_id FROM SessionPricing WHERE session_id = ? AND session_count = ?',
            [session_id, session_count]
        );

        if (existing.length > 0) {
            // Update existing
            await db.query(
                'UPDATE SessionPricing SET price = ? WHERE session_id = ? AND session_count = ?',
                [price, session_id, session_count]
            );
        } else {
            // Create new
            await db.query(
                'INSERT INTO SessionPricing (session_id, session_count, price, is_active) VALUES (?, ?, ?, TRUE)',
                [session_id, session_count, price]
            );
        }

        res.json({ success: true, message: 'Session pricing updated successfully' });
    } catch (error) {
        console.error('Error updating session pricing:', error);
        res.status(500).json({ success: false, message: 'Failed to update session pricing' });
    }
});

module.exports = router;

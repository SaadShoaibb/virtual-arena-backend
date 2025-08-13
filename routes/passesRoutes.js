const express = require('express');
const router = express.Router();
const db = require('../config/db');
const isAuthenticated = require('../middlewares/authMiddleware');
const isAdmin = require('../middlewares/adminMiddleware');

// Get all passes
router.get('/', isAuthenticated, isAdmin, async (req, res) => {
    try {
        console.log('📋 Fetching all passes...');
        const [rows] = await db.query('SELECT * FROM TimePasses ORDER BY duration_hours ASC');
        console.log('📋 Found passes:', rows.length);
        res.json({ success: true, passes: rows });
    } catch (error) {
        console.error('Error fetching passes:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch passes' });
    }
});

// Test route to verify passes routes are working
router.get('/test', async (req, res) => {
    res.json({ success: true, message: 'Passes routes are working!' });
});

// Create new pass
router.post('/', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { name, duration_hours, price, description } = req.body;
        
        await db.query(
            'INSERT INTO TimePasses (name, duration_hours, price, description, is_active) VALUES (?, ?, ?, ?, TRUE)',
            [name, duration_hours, price, description]
        );
        
        res.json({ success: true, message: 'Pass created successfully' });
    } catch (error) {
        console.error('Error creating pass:', error);
        res.status(500).json({ success: false, message: 'Failed to create pass' });
    }
});

// Update pass
router.put('/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, duration_hours, price, description, is_active } = req.body;

        // Handle new passes (with 'new' prefix)
        if (id.startsWith('new')) {
            const duration = parseInt(id.replace('new', ''));

            // Check if pass with this duration already exists
            const [existing] = await db.query('SELECT * FROM TimePasses WHERE duration_hours = ?', [duration]);

            if (existing.length > 0) {
                // Update existing pass
                await db.query(
                    'UPDATE TimePasses SET name = ?, price = ?, description = ?, is_active = ? WHERE duration_hours = ?',
                    [name, price, description, is_active, duration]
                );
            } else {
                // Create new pass
                await db.query(
                    'INSERT INTO TimePasses (name, duration_hours, price, description, is_active) VALUES (?, ?, ?, ?, ?)',
                    [name, duration, price, description, is_active]
                );
            }
        } else {
            // Update existing pass by ID
            await db.query(
                'UPDATE TimePasses SET name = ?, duration_hours = ?, price = ?, description = ?, is_active = ? WHERE pass_id = ?',
                [name, duration_hours, price, description, is_active, id]
            );
        }

        res.json({ success: true, message: 'Pass updated successfully' });
    } catch (error) {
        console.error('Error updating pass:', error);
        res.status(500).json({ success: false, message: 'Failed to update pass' });
    }
});

// Delete pass
router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        await db.query('UPDATE TimePasses SET is_active = FALSE WHERE pass_id = ?', [id]);
        
        res.json({ success: true, message: 'Pass deleted successfully' });
    } catch (error) {
        console.error('Error deleting pass:', error);
        res.status(500).json({ success: false, message: 'Failed to delete pass' });
    }
});

// Public route for frontend
router.get('/public', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM TimePasses WHERE is_active = TRUE ORDER BY duration_hours ASC');
        res.json({ success: true, passes: rows });
    } catch (error) {
        console.error('Error fetching public passes:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch passes' });
    }
});

module.exports = router;

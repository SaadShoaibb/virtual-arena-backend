const db = require('../config/db');

// Get all session pricing
const getAllSessionPricing = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT sp.*, vs.name as session_name 
            FROM SessionPricing sp
            LEFT JOIN VRSessions vs ON sp.session_id = vs.session_id
            ORDER BY vs.name, sp.session_count
        `);

        res.json({
            success: true,
            pricing: rows
        });
    } catch (error) {
        console.error('Error fetching session pricing:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch session pricing'
        });
    }
};

// Get pricing for a specific session
const getSessionPricing = async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const [rows] = await db.query(`
            SELECT sp.*, vs.name as session_name 
            FROM SessionPricing sp
            LEFT JOIN VRSessions vs ON sp.session_id = vs.session_id
            WHERE sp.session_id = ?
            ORDER BY sp.session_count
        `, [sessionId]);

        res.json({
            success: true,
            pricing: rows
        });
    } catch (error) {
        console.error('Error fetching session pricing:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch session pricing'
        });
    }
};

// Update or create session pricing
const updateSessionPricing = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { sessionCount, price, isActive } = req.body;

        // Check if pricing already exists
        const [existing] = await db.query(
            'SELECT pricing_id FROM SessionPricing WHERE session_id = ? AND session_count = ?',
            [sessionId, sessionCount]
        );

        if (existing.length > 0) {
            // Update existing pricing
            await db.query(
                'UPDATE SessionPricing SET price = ?, is_active = ? WHERE session_id = ? AND session_count = ?',
                [price, isActive, sessionId, sessionCount]
            );
        } else {
            // Create new pricing
            await db.query(
                'INSERT INTO SessionPricing (session_id, session_count, price, is_active) VALUES (?, ?, ?, ?)',
                [sessionId, sessionCount, price, isActive]
            );
        }

        res.json({
            success: true,
            message: 'Session pricing updated successfully'
        });
    } catch (error) {
        console.error('Error updating session pricing:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update session pricing'
        });
    }
};

// Delete session pricing
const deleteSessionPricing = async (req, res) => {
    try {
        const { pricingId } = req.params;

        const [result] = await db.query(
            'DELETE FROM SessionPricing WHERE pricing_id = ?',
            [pricingId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pricing not found'
            });
        }

        res.json({
            success: true,
            message: 'Session pricing deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting session pricing:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete session pricing'
        });
    }
};

// Get all time slots
const getAllTimeSlots = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM TimeSlots ORDER BY start_hour');

        res.json({
            success: true,
            timeSlots: rows
        });
    } catch (error) {
        console.error('Error fetching time slots:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch time slots'
        });
    }
};

// Update time slot
const updateTimeSlot = async (req, res) => {
    try {
        const { slotId } = req.params;
        const { startHour, endHour, isActive } = req.body;

        await db.query(
            'UPDATE TimeSlots SET start_hour = ?, end_hour = ?, is_active = ? WHERE slot_id = ?',
            [startHour, endHour, isActive, slotId]
        );

        res.json({
            success: true,
            message: 'Time slot updated successfully'
        });
    } catch (error) {
        console.error('Error updating time slot:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update time slot'
        });
    }
};

// Create new time slot
const createTimeSlot = async (req, res) => {
    try {
        const { startHour, endHour, isActive = true } = req.body;

        await db.query(
            'INSERT INTO TimeSlots (start_hour, end_hour, is_active) VALUES (?, ?, ?)',
            [startHour, endHour, isActive]
        );

        res.json({
            success: true,
            message: 'Time slot created successfully'
        });
    } catch (error) {
        console.error('Error creating time slot:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create time slot'
        });
    }
};

// Delete time slot
const deleteTimeSlot = async (req, res) => {
    try {
        const { slotId } = req.params;

        const [result] = await db.query(
            'DELETE FROM TimeSlots WHERE slot_id = ?',
            [slotId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Time slot not found'
            });
        }

        res.json({
            success: true,
            message: 'Time slot deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting time slot:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete time slot'
        });
    }
};

// Get all sessions with enhanced details
const getAllSessionsEnhanced = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT vs.*,
                   GROUP_CONCAT(
                       CONCAT(sdp.duration_hours, ':', sdp.price, ':', sdp.is_active)
                       ORDER BY sdp.duration_hours SEPARATOR '|'
                   ) as duration_pricing
            FROM VRSessions vs
            LEFT JOIN SessionDurationPricing sdp ON vs.session_id = sdp.session_id
            GROUP BY vs.session_id
            ORDER BY vs.name
        `);

        res.json({
            success: true,
            sessions: rows
        });
    } catch (error) {
        console.error('Error fetching enhanced sessions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sessions'
        });
    }
};

// Update session with enhanced fields
const updateSessionEnhanced = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const {
            name,
            description,
            duration_hours,
            min_duration_hours,
            max_duration_hours,
            hourly_rate,
            setup_time_minutes,
            cleanup_time_minutes,
            max_players,
            is_active,
            duration_pricing = []
        } = req.body;

        // Update main session details
        await db.query(`
            UPDATE VRSessions
            SET name = ?, description = ?, duration_hours = ?, min_duration_hours = ?,
                max_duration_hours = ?, hourly_rate = ?, setup_time_minutes = ?,
                cleanup_time_minutes = ?, max_players = ?, is_active = ?
            WHERE session_id = ?
        `, [
            name, description, duration_hours, min_duration_hours,
            max_duration_hours, hourly_rate, setup_time_minutes,
            cleanup_time_minutes, max_players, is_active, sessionId
        ]);

        // Update duration pricing
        if (duration_pricing && duration_pricing.length > 0) {
            // Delete existing pricing
            await db.query('DELETE FROM SessionDurationPricing WHERE session_id = ?', [sessionId]);

            // Insert new pricing
            for (const pricing of duration_pricing) {
                await db.query(`
                    INSERT INTO SessionDurationPricing (session_id, duration_hours, price, is_active)
                    VALUES (?, ?, ?, ?)
                `, [sessionId, pricing.duration_hours, pricing.price, pricing.is_active]);
            }
        }

        res.json({
            success: true,
            message: 'Session updated successfully'
        });
    } catch (error) {
        console.error('Error updating session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update session'
        });
    }
};

// Get session duration pricing
const getSessionDurationPricing = async (req, res) => {
    try {
        const { sessionId } = req.params;

        const [rows] = await db.query(`
            SELECT * FROM SessionDurationPricing
            WHERE session_id = ?
            ORDER BY duration_hours
        `, [sessionId]);

        res.json({
            success: true,
            pricing: rows
        });
    } catch (error) {
        console.error('Error fetching session duration pricing:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch session duration pricing'
        });
    }
};

module.exports = {
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
};

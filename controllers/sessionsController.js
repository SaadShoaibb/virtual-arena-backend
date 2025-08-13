const db = require('../config/db'); // Import your DB connection

// ✅ Create a new session with pricing
const createSession = async (req, res) => {
    try {
        const { name, description, duration_minutes, max_players, price_1_session, price_2_sessions, is_active } = req.body;

        // Insert the session
        const [result] = await db.query(`
            INSERT INTO VRSessions (name, description, duration_minutes, max_players, price, is_active)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [name, description, duration_minutes, max_players, price_1_session || 0, is_active || true]
        );

        const sessionId = result.insertId;

        // Create pricing entries for 1 and 2 sessions
        if (price_1_session) {
            await db.query(`
                INSERT INTO SessionPricing (session_id, session_count, price, is_active)
                VALUES (?, 1, ?, ?)`,
                [sessionId, price_1_session, true]
            );
        }

        if (price_2_sessions) {
            await db.query(`
                INSERT INTO SessionPricing (session_id, session_count, price, is_active)
                VALUES (?, 2, ?, ?)`,
                [sessionId, price_2_sessions, true]
            );
        }

        res.status(201).json({
            success: true,
            message: 'Session created successfully with pricing',
            session_id: sessionId,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error creating session',
            error,
        });
    }
};

// ✅ Get all sessions
const getAllSessions = async (req, res) => {
    try {
        const [sessions] = await db.query(`
            SELECT 
                s.*, 
                (s.max_players - IFNULL(b.currentBookings, 0)) AS available_slots,
                IFNULL(b.currentBookings, 0) AS booking_count
            FROM VRSessions s
            LEFT JOIN (
                SELECT session_id, COUNT(*) AS currentBookings 
                FROM Bookings 
                WHERE payment_status IN ('pending', 'paid')
                GROUP BY session_id
            ) b ON s.session_id = b.session_id
        `);

        res.status(200).json({
            success: true,
            message: 'Sessions retrieved successfully',
            sessions,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching sessions',
            error,
        });
    }
};

// ✅ Get one session by ID
const getSessionById = async (req, res) => {
    try {
        const { session_id } = req.params;

        const [session] = await db.query(`
            SELECT 
                s.*, 
                (s.max_players - IFNULL(b.currentBookings, 0)) AS available_slots,
                IFNULL(b.currentBookings, 0) AS booking_count
            FROM VRSessions s
            LEFT JOIN (
                SELECT session_id, COUNT(*) AS currentBookings 
                FROM Bookings 
                WHERE payment_status IN ('pending', 'paid')
                GROUP BY session_id
            ) b ON s.session_id = b.session_id
            WHERE s.session_id = ?
        `, [session_id]);

        if (session.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Session retrieved successfully',
            session: session[0],
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching session',
            error,
        });
    }
};


// ✅ Update session by ID
const updateSession = async (req, res) => {
    try {
        const { session_id } = req.params;
        const { name, description, duration_minutes, max_players, price, is_active } = req.body;

        const [result] = await db.query(`
            UPDATE VRSessions 
            SET name = ?, description = ?, duration_minutes = ?, max_players = ?, price = ?, is_active = ? 
            WHERE session_id = ?`,
            [name, description, duration_minutes, max_players, price, is_active, session_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found or no changes made',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Session updated successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error updating session',
            error,
        });
    }
};

// ✅ Delete session by ID
const deleteSession = async (req, res) => {
    try {
        const { session_id } = req.params;

        const [result] = await db.query(`DELETE FROM VRSessions WHERE session_id = ?`, [session_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Session deleted successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error deleting session',
            error,
        });
    }
};

module.exports = {
    createSession,
    getAllSessions,
    getSessionById,
    updateSession,
    deleteSession,
};

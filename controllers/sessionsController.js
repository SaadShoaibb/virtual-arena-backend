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
        const { name, description, duration_minutes, max_players, price, is_active, price_1_session, price_2_sessions } = req.body;

        const [result] = await db.query(`
            UPDATE VRSessions 
            SET name = ?, description = ?, duration_minutes = ?, max_players = ?, price = ?, is_active = ? 
            WHERE session_id = ?`,
            [name, description, duration_minutes, max_players, price || price_1_session || 0, is_active, session_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found or no changes made',
            });
        }

        // Update pricing if provided
        if (price_1_session !== undefined) {
            await db.query(`
                INSERT INTO SessionPricing (session_id, session_count, price, is_active)
                VALUES (?, 1, ?, TRUE)
                ON DUPLICATE KEY UPDATE price = VALUES(price)`,
                [session_id, price_1_session]
            );
        }

        if (price_2_sessions !== undefined) {
            await db.query(`
                INSERT INTO SessionPricing (session_id, session_count, price, is_active)
                VALUES (?, 2, ?, TRUE)
                ON DUPLICATE KEY UPDATE price = VALUES(price)`,
                [session_id, price_2_sessions]
            );
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

// ✅ Update session media (images/videos)
const updateSessionMedia = async (req, res) => {
    try {
        const { session_id } = req.params;
        const { image_url, video_url } = req.body;

        // Check if session exists
        const [session] = await db.query('SELECT * FROM VRSessions WHERE session_id = ?', [session_id]);
        if (session.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        // Update media fields
        const [result] = await db.query(`
            UPDATE VRSessions 
            SET image_url = ?, video_url = ?
            WHERE session_id = ?`,
            [image_url || null, video_url || null, session_id]
        );

        res.status(200).json({
            success: true,
            message: 'Session media updated successfully',
            session_id: session_id
        });
    } catch (error) {
        console.error('Error updating session media:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating session media',
            error: error.message
        });
    }
};

// ✅ Delete session by ID
const deleteSession = async (req, res) => {
    try {
        const { session_id } = req.params;
        console.log(`🗑️ Attempting to delete session ${session_id}`);

        // Check if session exists first
        const [sessionExists] = await db.query('SELECT session_id, name FROM VRSessions WHERE session_id = ?', [session_id]);
        if (sessionExists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found',
            });
        }
        console.log(`📋 Session found: ${sessionExists[0].name}`);

        // Check if session has any bookings (with detailed info)
        const [bookings] = await db.query(
            'SELECT booking_id, payment_status, session_status FROM Bookings WHERE session_id = ?',
            [session_id]
        );
        console.log(`📋 Found ${bookings.length} bookings for session ${session_id}:`, bookings);

        if (bookings.length > 0) {
            // Only block deletion for pending or started bookings
            const blockingBookings = bookings.filter(b => 
                b.payment_status !== 'cancelled' && 
                (b.session_status === 'pending' || b.session_status === 'started')
            );
            console.log(`📋 Blocking bookings: ${blockingBookings.length}`);
            
            if (blockingBookings.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot delete session. It has ${blockingBookings.length} active/pending booking(s). Please complete or cancel them first.`,
                    blockingBookings: blockingBookings
                });
            }
            
            console.log(`ℹ️ Found ${bookings.length} completed/cancelled bookings - deletion allowed`);
            
            // For completed/cancelled bookings, set session_id to NULL to preserve booking history
            const completedBookings = bookings.filter(b => 
                b.payment_status === 'cancelled' || b.session_status === 'completed'
            );
            
            if (completedBookings.length > 0) {
                await db.query(
                    'UPDATE Bookings SET session_id = NULL WHERE booking_id IN (?)',
                    [completedBookings.map(b => b.booking_id)]
                );
                console.log(`✅ Unlinked ${completedBookings.length} completed/cancelled bookings from session`);
            }
        }

        // Check if session has any pricing entries and delete them first
        const [pricingEntries] = await db.query('SELECT * FROM SessionPricing WHERE session_id = ?', [session_id]);
        console.log(`📋 Found ${pricingEntries.length} pricing entries for session ${session_id}`);
        
        if (pricingEntries.length > 0) {
            await db.query('DELETE FROM SessionPricing WHERE session_id = ?', [session_id]);
            console.log(`✅ Deleted ${pricingEntries.length} pricing entries`);
        }

        // Now delete the session
        const [result] = await db.query(`DELETE FROM VRSessions WHERE session_id = ?`, [session_id]);
        console.log(`📋 Delete result:`, result);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found or could not be deleted',
            });
        }

        console.log(`✅ Successfully deleted session ${session_id}`);
        res.status(200).json({
            success: true,
            message: 'Session deleted successfully',
        });
    } catch (error) {
        console.error('❌ Error deleting session:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting session',
            error: error.message,
        });
    }
};

module.exports = {
    createSession,
    getAllSessions,
    getSessionById,
    updateSession,
    updateSessionMedia,
    deleteSession,
};

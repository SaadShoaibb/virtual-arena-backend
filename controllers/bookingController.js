const Pusher = require('pusher');
const db = require('../config/db'); // Import DB connection
const { sendNotification, sendAdminNotification } = require('../services/services');

// Helper function to format datetime for MySQL
const formatDateTimeForMySQL = (isoString) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    return date.toISOString().slice(0, 19).replace('T', ' ');
};
const pusher = new Pusher({
    appId: "1960022",
    key: "a230b3384874418b8baa",
    secret: "3d633a30352f120f0cc6",
    cluster: "ap2",
    useTLS: true
});
// ✅ Create a new booking
const createBooking = async (req, res) => {
    try {
        const user_id = req.user.id; // Get the logged-in user's ID
        const {
            session_id,
            pass_id,
            booking_type,
            duration_hours,
            machine_type,
            start_time,
            end_time,
            payment_status,
            payment_method,
            session_count = 1,
            player_count = 1,
            total_amount = 0
        } = req.body;

        const isPassBooking = !!pass_id && !session_id;

        // 1️⃣ Check for existing active booking for this session (only for session bookings)
        if (!isPassBooking && session_id) {
            const [existingBookings] = await db.query(
                `SELECT * FROM Bookings
                 WHERE user_id = ? AND session_id = ?
                 AND session_status IN ('pending', 'started')
                 AND payment_status != 'cancelled'`,
                [user_id, session_id]
            );

            if (existingBookings.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'You already have an active or pending booking for this session.',
                });
            }
        }

        // 2️⃣ For session bookings, validate capacity; skip for passes
        if (!isPassBooking && session_id) {
            const [session] = await db.query(
                `SELECT max_players FROM VRSessions WHERE session_id = ?`,
                [session_id]
            );

            if (session.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Session not found',
                });
            }

            const maxPlayers = session[0].max_players;

            const [bookedCount] = await db.query(
                `SELECT COUNT(*) AS currentBookings
                 FROM Bookings
                 WHERE session_id = ? AND payment_status IN ('pending', 'paid')`,
                [session_id]
            );

            const currentBookings = bookedCount[0].currentBookings;

            if (currentBookings >= maxPlayers) {
                return res.status(400).json({
                    success: false,
                    message: 'No seats are available for this session',
                });
            }
        }

        // 3️⃣ Proceed with booking
        const formattedStartTime = formatDateTimeForMySQL(start_time);
        const formattedEndTime = formatDateTimeForMySQL(end_time);

        console.log('📝 Creating booking with data:', {
            user_id, session_id, pass_id, machine_type,
            session_count, player_count, total_amount,
            payment_status: 'pending',
            payment_method: payment_method || 'online',
            booking_type: isPassBooking ? 'pass' : (booking_type || 'session'),
            duration_hours: isPassBooking ? (duration_hours || 1) : null
        });

        // Try with all columns first, fallback to basic columns if pass_id doesn't exist
        let result;
        try {
            result = await db.query(
                `INSERT INTO Bookings (user_id, session_id, pass_id, machine_type, start_time, end_time, payment_status, payment_method, session_count, player_count, total_amount, booking_type, duration_hours)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [user_id, session_id || null, isPassBooking ? pass_id : null, machine_type, formattedStartTime, formattedEndTime, 'pending', payment_method || 'online', session_count, player_count, total_amount, isPassBooking ? 'pass' : (booking_type || 'session'), isPassBooking ? (duration_hours || 1) : null]
            );
        } catch (error) {
            if (error.message.includes('Unknown column')) {
                console.log('⚠️ Pass columns not available, using basic booking format');
                if (isPassBooking) {
                    return res.status(500).json({
                        success: false,
                        message: 'Pass bookings not supported yet. Please run database migration first.',
                        error: 'Database schema needs updating for pass bookings'
                    });
                }
                // Fallback for regular sessions
                result = await db.query(
                    `INSERT INTO Bookings (user_id, session_id, machine_type, start_time, end_time, payment_status, payment_method, session_count, player_count, total_amount)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [user_id, session_id, machine_type, formattedStartTime, formattedEndTime, 'pending', payment_method || 'online', session_count, player_count, total_amount]
                );
            } else {
                throw error;
            }
        }

        const booking_id = result[0].insertId;

        await sendNotification(
            user_id,
            'booking_confirmation',
            'Booking Confirmation',
            'Your booking has been created and is pending payment.',
            'push',
            `/bookings?booking_id=${booking_id}`
        );

        await sendAdminNotification(
            'booking_confirmation',
            'New Booking',
            `A new booking has been made by user ${user_id}.`,
            'push',
            `/bookings/all-bookings?booking_id=${booking_id}`
        );

        pusher.trigger('my-channel', 'my-event', {
            message: 'New Booking created',
            bookingId: booking_id,
            userId: user_id,
        });

        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            booking: {
                booking_id,
                user_id,
                session_id: session_id || null,
                pass_id: isPassBooking ? pass_id : null,
                machine_type,
                start_time: formattedStartTime,
                end_time: formattedEndTime,
                payment_status: 'pending',
                payment_method: payment_method || 'online'
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error creating booking',
            error,
        });
    }
};

const updateBookingStatus = async (bookingId) => {
    const now = new Date(); // Get the current time

    // Fetch the booking details
    const [booking] = await db.query(`
        SELECT start_time, end_time 
        FROM Bookings 
        WHERE booking_id = ?
    `, [bookingId]);

    if (!booking.length) {
        throw new Error('Booking not found');
    }

    const { start_time, end_time } = booking[0];

    let status = 'pending'; // Default status

    if (now >= new Date(start_time) && now <= new Date(end_time)) {
        status = 'started'; // If current time is between start and end time
    } else if (now > new Date(end_time)) {
        status = 'completed'; // If current time is after end time
    }

    // Update the booking status
    await db.query(`
        UPDATE Bookings 
        SET session_status = ? 
        WHERE booking_id = ?
    `, [status, bookingId]);
};
// ✅ Get all bookings
const getAllBookings = async (req, res) => {
    try {
        console.log('📋 Fetching all bookings...');

        // Use basic query that works with existing columns
        const [bookings] = await db.query(`
            SELECT
                b.*,
                COALESCE(u.name, b.guest_name) AS user_name,
                COALESCE(u.email, b.guest_email) AS user_email,
                COALESCE(u.phone, b.guest_phone) AS user_phone,
                s.name AS session_name,
                s.duration_minutes AS session_duration
            FROM Bookings b
            LEFT JOIN Users u ON b.user_id = u.user_id
            LEFT JOIN VRSessions s ON b.session_id = s.session_id
            ORDER BY b.created_at DESC
        `);

        console.log(`📋 Found ${bookings.length} bookings`);

        // Update status for each booking
        for (const booking of bookings) {
            await updateBookingStatus(booking.booking_id);
        }

        // Process bookings to calculate correct durations and end times
        const processedBookings = bookings.map(booking => {
            try {
                let calculatedEndTime = booking.end_time;
                let actualDuration = 0;

                // Check if session_count column exists and use it
                const sessionCount = booking.session_count || 1;

                // Calculate duration based on session duration and session count
                if (booking.session_duration) {
                    actualDuration = booking.session_duration * sessionCount;
                    if (booking.start_time) {
                        const startTime = new Date(booking.start_time);
                        calculatedEndTime = new Date(startTime.getTime() + (actualDuration * 60 * 1000));
                    }
                } else if (booking.start_time && booking.end_time) {
                    // Fallback: calculate from start and end time
                    const startTime = new Date(booking.start_time);
                    const endTime = new Date(booking.end_time);
                    actualDuration = Math.round((endTime - startTime) / (1000 * 60)); // Convert to minutes
                }

                return {
                    ...booking,
                    calculated_end_time: calculatedEndTime,
                    actual_duration_minutes: actualDuration,
                    display_duration: actualDuration > 0 ? `${Math.floor(actualDuration / 60)}h ${actualDuration % 60}m` : `${booking.session_duration || 15}min`,
                    session_count_display: sessionCount
                };
            } catch (error) {
                console.error('Error processing booking:', booking.booking_id, error);
                return {
                    ...booking,
                    calculated_end_time: booking.end_time,
                    actual_duration_minutes: 0,
                    display_duration: 'N/A',
                    session_count_display: 1
                };
            }
        });

        res.status(200).json({
            success: true,
            message: 'Bookings retrieved successfully',
            bookings: processedBookings,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching bookings',
            error,
        });
    }
};

// ✅ Get a booking by ID
const getBookingById = async (req, res) => {
    try {
        const { booking_id } = req.params;

        const [booking] = await db.query(`
            SELECT 
                b.*, 
                u.name AS user_name, 
                u.email AS user_email, 
                u.phone AS user_phone, 
                s.name AS session_name,
                s.price AS session_price 
            FROM Bookings b
            JOIN Users u ON b.user_id = u.user_id
            JOIN VRSessions s ON b.session_id = s.session_id
            WHERE b.booking_id = ?`,
            [booking_id]
        );

        if (booking.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Booking retrieved successfully',
            booking: booking[0],
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching booking',
            error,
        });
    }
};

// ✅ Update a booking
const updateBooking = async (req, res) => {
    try {
        const user_id = req.user.id;
        const { booking_id } = req.params;
        const { machine_type, start_time, end_time, payment_status } = req.body;

        const [result] = await db.query(`
            UPDATE Bookings 
            SET  machine_type = ?, start_time = ?, end_time = ?, payment_status = ? 
            WHERE booking_id = ?`,
            [machine_type, start_time, end_time, payment_status, booking_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found or no changes made',
            });
        }

        // Step 6: Trigger Pusher event
        pusher.trigger('my-channel', 'my-event', {
            message: 'New Session created',
            bookingId: booking_id,
            userId: user_id
        });
        res.status(200).json({
            success: true,
            message: 'Booking updated successfully',
            booking: booking_id
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error updating booking',
            error,
        });
    }
};

// ✅ Cancel a booking (update payment status to "cancelled")
const cancelBooking = async (req, res) => {
    try {
        const { booking_id } = req.params;
        const user_id = req.user.id;
        const [result] = await db.query(`
            UPDATE Bookings SET payment_status = 'cancelled' WHERE booking_id = ?`,
            [booking_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found',
            });
        }


        // Send notification to user
        await sendNotification(
            user_id, // User ID
            'booking_cancellation', // Notification type
            'Booking Cancelled', // Subject
            'Your booking has been cancelled.', // Message
            'email', // Delivery method
            `/bookings?booking_id=${booking_id}` // Link
        );

        // Send notification to admin
        await sendAdminNotification(
            'booking_cancellation', // Notification type
            'Booking Cancelled', // Subject
            `Booking ${booking_id} has been cancelled by user ${user_id}.`, // Message
            'email', // Delivery method
            `/bookings/all-bookings?booking_id=${booking_id}` // Link
        );
        // Step 6: Trigger Pusher event
        pusher.trigger('my-channel', 'my-event', {
            message: 'Booking cancelled',
            bookingId: booking_id,
            userId: user_id
        });
        res.status(200).json({
            success: true,
            message: 'Booking cancelled successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error cancelling booking',
            error,
        });
    }
};

// ✅ Delete a booking
const deleteBooking = async (req, res) => {
    try {
        const { booking_id } = req.params;
        const user_id = req.user.id;
        const [result] = await db.query(`DELETE FROM Bookings WHERE booking_id = ?`, [booking_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found',
            });
        }
        // Step 6: Trigger Pusher event
        pusher.trigger('my-channel', 'my-event', {
            message: 'Booking Deleted',
            bookingId: booking_id,
            userId: user_id
        });
        res.status(200).json({
            success: true,
            message: 'Booking deleted successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error deleting booking',
            error,
        });
    }
};

const getAllUserBookings = async (req, res) => {
    try {
        const userId = req.user.id; // Get the logged-in user's ID

        const [bookings] = await db.query(`
            SELECT b.*, u.name AS user_name, s.name AS session_name 
            FROM Bookings b
            JOIN Users u ON b.user_id = u.user_id
            JOIN VRSessions s ON b.session_id = s.session_id
            WHERE b.user_id = ?
        `, [userId]);

        // Update status for each booking
        for (const booking of bookings) {
            await updateBookingStatus(booking.booking_id);
        }

        // Fetch updated bookings
        const [updatedBookings] = await db.query(`
            SELECT b.*, u.name AS user_name, s.name AS session_name 
            FROM Bookings b
            JOIN Users u ON b.user_id = u.user_id
            JOIN VRSessions s ON b.session_id = s.session_id
            WHERE b.user_id = ?
        `, [userId]);

        res.status(200).json({
            success: true,
            message: 'User bookings retrieved successfully',
            bookings: updatedBookings,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user bookings',
            error,
        });
    }
};

// ✅ Get booking availability for calendar view
const getBookingAvailability = async (req, res) => {
    try {
        const { date, session_id } = req.query;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Date parameter is required'
            });
        }

        // Parse the date and get start/end of day
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // Format for MySQL
        const formattedStartOfDay = formatDateTimeForMySQL(startOfDay.toISOString());
        const formattedEndOfDay = formatDateTimeForMySQL(endOfDay.toISOString());

        let query = `
            SELECT
                b.booking_id,
                b.session_id,
                b.machine_type,
                b.start_time,
                b.end_time,
                b.payment_status,
                b.session_status,
                b.is_guest_booking,
                b.guest_name,
                COALESCE(u.name, b.guest_name) as customer_name,
                s.name as session_name,
                s.max_players
            FROM Bookings b
            LEFT JOIN Users u ON b.user_id = u.user_id
            LEFT JOIN VRSessions s ON b.session_id = s.session_id
            WHERE b.start_time >= ? AND b.start_time <= ?
            AND b.payment_status != 'cancelled'
        `;

        const params = [formattedStartOfDay, formattedEndOfDay];

        if (session_id) {
            query += ' AND b.session_id = ?';
            params.push(session_id);
        }

        query += ' ORDER BY b.start_time ASC';

        const [bookings] = await db.query(query, params);

        // Get all sessions for reference
        const [sessions] = await db.query('SELECT * FROM VRSessions WHERE is_active = TRUE');

        res.status(200).json({
            success: true,
            date,
            bookings,
            sessions,
            total_bookings: bookings.length
        });
    } catch (error) {
        console.error('Error fetching booking availability:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching booking availability',
            error: error.message
        });
    }
};

// ✅ Create guest booking
const createGuestBooking = async (req, res) => {
    try {
        const {
            session_id,
            pass_id,
            booking_type,
            duration_hours,
            machine_type,
            start_time,
            end_time,
            guest_name,
            guest_email,
            guest_phone,
            payment_status,
            payment_method,
            session_count = 1,
            player_count = 1,
            total_amount = 0
        } = req.body;

        const isPassBooking = !!pass_id && !session_id;

        // Validate required fields
        if ((!isPassBooking && !session_id) || !machine_type || !start_time || !end_time || !guest_name || !guest_email) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: session_id or pass_id, machine_type, start_time, end_time, guest_name, guest_email'
            });
        }

        // Generate unique booking reference
        const booking_reference = `GUEST-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        // Check for conflicting bookings (only applicable for session bookings)
        if (!isPassBooking && session_id) {
            const [conflictingBookings] = await db.query(
                `SELECT * FROM Bookings
                 WHERE session_id = ?
                 AND machine_type = ?
                 AND payment_status != 'cancelled'
                 AND (
                     (start_time <= ? AND end_time > ?) OR
                     (start_time < ? AND end_time >= ?) OR
                     (start_time >= ? AND end_time <= ?)
                 )`,
                [session_id, machine_type, start_time, start_time, end_time, end_time, start_time, end_time]
            );

            if (conflictingBookings.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Time slot is already booked. Please choose a different time.'
                });
            }
        }

        // Create the guest booking
        const formattedStartTime = formatDateTimeForMySQL(start_time);
        const formattedEndTime = formatDateTimeForMySQL(end_time);

        console.log('📝 Creating guest booking with data:', {
            session_id, pass_id, machine_type, guest_name, guest_email,
            session_count, player_count, total_amount,
            payment_status: 'pending',
            payment_method: payment_method || 'online',
            booking_type: isPassBooking ? 'pass' : (booking_type || 'session'),
            duration_hours: isPassBooking ? (duration_hours || 1) : null
        });

        // Try with all columns first, fallback to basic columns if pass_id doesn't exist
        let result;
        try {
            result = await db.query(
                `INSERT INTO Bookings (
                    session_id, pass_id, machine_type, start_time, end_time,
                    guest_name, guest_email, guest_phone,
                    is_guest_booking, booking_reference, payment_status, payment_method,
                    session_count, player_count, total_amount, booking_type, duration_hours
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [session_id || null, isPassBooking ? pass_id : null, machine_type, formattedStartTime, formattedEndTime, guest_name, guest_email, guest_phone, booking_reference, 'pending', payment_method || 'online', session_count, player_count, total_amount, isPassBooking ? 'pass' : (booking_type || 'session'), isPassBooking ? (duration_hours || 1) : null]
            );
        } catch (error) {
            if (error.message.includes('Unknown column')) {
                console.log('⚠️ Pass columns not available, using basic guest booking format');
                if (isPassBooking) {
                    return res.status(500).json({
                        success: false,
                        message: 'Pass bookings not supported yet. Please run database migration first.',
                        error: 'Database schema needs updating for pass bookings'
                    });
                }
                // Fallback for regular guest sessions
                result = await db.query(
                    `INSERT INTO Bookings (
                        session_id, machine_type, start_time, end_time,
                        guest_name, guest_email, guest_phone,
                        is_guest_booking, booking_reference, payment_status, payment_method,
                        session_count, player_count, total_amount
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?, ?, ?, ?)`,
                    [session_id, machine_type, formattedStartTime, formattedEndTime, guest_name, guest_email, guest_phone, booking_reference, 'pending', payment_method || 'online', session_count, player_count, total_amount]
                );
            } else {
                throw error;
            }
        }

        const booking_id = result[0].insertId;

        res.status(201).json({
            success: true,
            message: 'Guest booking created successfully',
            booking: {
                booking_id,
                booking_reference,
                session_id,
                machine_type,
                start_time: formattedStartTime,
                end_time: formattedEndTime,
                guest_name,
                guest_email,
                payment_status: payment_status || 'pending',
                payment_method: payment_method || 'online'
            }
        });
    } catch (error) {
        console.error('Error creating guest booking:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating guest booking',
            error: error.message
        });
    }
};

// ✅ Get guest booking by reference
const getGuestBooking = async (req, res) => {
    try {
        const { booking_reference } = req.params;

        const [bookings] = await db.query(
            `SELECT
                b.*,
                s.name as session_name,
                s.description as session_description,
                s.price as session_price
             FROM Bookings b
             LEFT JOIN VRSessions s ON b.session_id = s.session_id
             WHERE b.booking_reference = ? AND b.is_guest_booking = TRUE`,
            [booking_reference]
        );

        if (bookings.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Guest booking not found'
            });
        }

        res.status(200).json({
            success: true,
            booking: bookings[0]
        });
    } catch (error) {
        console.error('Error fetching guest booking:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching guest booking',
            error: error.message
        });
    }
};

module.exports = {
    createBooking,
    getAllBookings,
    getBookingById,
    updateBooking,
    cancelBooking,
    deleteBooking,
    getAllUserBookings,
    getBookingAvailability,
    createGuestBooking,
    getGuestBooking
};

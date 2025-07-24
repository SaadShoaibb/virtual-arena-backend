const db = require('../config/db');

// Add Event controller
const addEvent = async (req, res) => {
    try {
        const { 
            name, 
            description, 
            start_date, 
            end_date, 
            city, 
            country, 
            state, 
            ticket_price, 
            max_participants, 
            event_type, 
            status 
        } = req.body;

        const [result] = await db.query(`
            INSERT INTO Events (
                name, description, start_date, end_date, city, country, state, 
                ticket_price, max_participants, event_type, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name, 
            description, 
            start_date, 
            end_date, 
            city, 
            country, 
            state, 
            ticket_price, 
            max_participants, 
            event_type || 'other', 
            status || 'upcoming'
        ]);

        res.status(201).json({
            success: true,
            message: 'Event created successfully',
            event_id: result.insertId,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error creating event',
            error,
        });
    }
};

// Get all events
const getAllEvents = async (req, res) => {
    try {
        const [events] = await db.query(`
            SELECT e.*,
                   COUNT(er.registration_id) as registered_count
            FROM Events e
            LEFT JOIN EventRegistrations er ON e.event_id = er.event_id
                AND er.status != 'cancelled'
            GROUP BY e.event_id
            ORDER BY e.start_date ASC
        `);

        res.status(200).json({
            success: true,
            events,
        });
    } catch (error) {
        console.error('Error in getAllEvents:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching events',
            error,
        });
    }
};

// Get event by ID
const getEventById = async (req, res) => {
    try {
        const { event_id } = req.params;

        const [events] = await db.query(`
            SELECT e.*, 
                   COUNT(er.registration_id) as registered_count
            FROM Events e
            LEFT JOIN EventRegistrations er ON e.event_id = er.event_id 
                AND er.status != 'cancelled'
            WHERE e.event_id = ?
            GROUP BY e.event_id
        `, [event_id]);

        if (events.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Event not found',
            });
        }

        res.status(200).json({
            success: true,
            event: events[0],
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching event',
            error,
        });
    }
};

// Update event
const updateEvent = async (req, res) => {
    try {
        const { event_id } = req.params;
        const { 
            name, 
            description, 
            start_date, 
            end_date, 
            city, 
            country, 
            state, 
            ticket_price, 
            max_participants, 
            event_type, 
            status 
        } = req.body;

        const [result] = await db.query(`
            UPDATE Events 
            SET name = ?, description = ?, start_date = ?, end_date = ?, 
                city = ?, country = ?, state = ?, ticket_price = ?, 
                max_participants = ?, event_type = ?, status = ?
            WHERE event_id = ?
        `, [
            name, 
            description, 
            start_date, 
            end_date, 
            city, 
            country, 
            state, 
            ticket_price, 
            max_participants, 
            event_type, 
            status, 
            event_id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Event not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Event updated successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error updating event',
            error,
        });
    }
};

// Delete event
const deleteEvent = async (req, res) => {
    try {
        const { event_id } = req.params;

        // Check if there are any registrations
        const [registrations] = await db.query(`
            SELECT COUNT(*) as count FROM EventRegistrations 
            WHERE event_id = ? AND status != 'cancelled'
        `, [event_id]);

        if (registrations[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete event with active registrations',
            });
        }

        const [result] = await db.query(`
            DELETE FROM Events WHERE event_id = ?
        `, [event_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Event not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Event deleted successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error deleting event',
            error,
        });
    }
};

// Register for event
const registerForEvent = async (req, res) => {
    try {
        const { event_id } = req.params;
        const { user_id } = req.user;
        const { payment_option = 'online' } = req.body;

        // Check if event exists and is upcoming
        const [events] = await db.query(`
            SELECT * FROM Events WHERE event_id = ? AND status = 'upcoming'
        `, [event_id]);

        if (events.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Event not found or not available for registration',
            });
        }

        const event = events[0];

        // Check if user is already registered
        const [existingRegistration] = await db.query(`
            SELECT * FROM EventRegistrations 
            WHERE user_id = ? AND event_id = ? AND status != 'cancelled'
        `, [user_id, event_id]);

        if (existingRegistration.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'You are already registered for this event',
            });
        }

        // Check if event is full
        if (event.max_participants) {
            const [registrationCount] = await db.query(`
                SELECT COUNT(*) as count FROM EventRegistrations 
                WHERE event_id = ? AND status != 'cancelled'
            `, [event_id]);

            if (registrationCount[0].count >= event.max_participants) {
                return res.status(400).json({
                    success: false,
                    message: 'Event is full',
                });
            }
        }

        // Register user for event
        const [result] = await db.query(`
            INSERT INTO EventRegistrations (user_id, event_id, payment_option, payment_status)
            VALUES (?, ?, ?, ?)
        `, [user_id, event_id, payment_option, payment_option === 'online' ? 'pending' : 'paid']);

        res.status(201).json({
            success: true,
            message: 'Successfully registered for event',
            registration_id: result.insertId,
            payment_required: payment_option === 'online',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error registering for event',
            error,
        });
    }
};

// Get all event registrations (admin)
const getAllEventRegistrations = async (req, res) => {
    try {
        const [registrations] = await db.query(`
            SELECT er.*, e.name as event_name, u.name as user_name, u.email as user_email
            FROM EventRegistrations er
            JOIN Events e ON er.event_id = e.event_id
            JOIN Users u ON er.user_id = u.user_id
            ORDER BY er.registration_date DESC
        `);

        res.status(200).json({
            success: true,
            registrations,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching event registrations',
            error,
        });
    }
};

// Get user's event registrations
const getUserEventRegistrations = async (req, res) => {
    try {
        const { user_id } = req.user;

        const [registrations] = await db.query(`
            SELECT er.*, e.name, e.start_date, e.end_date, e.city, e.state, e.country
            FROM EventRegistrations er
            JOIN Events e ON er.event_id = e.event_id
            WHERE er.user_id = ?
            ORDER BY e.start_date ASC
        `, [user_id]);

        res.status(200).json({
            success: true,
            registrations,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user event registrations',
            error,
        });
    }
};

// Get event registration by ID
const getEventRegistrationById = async (req, res) => {
    try {
        const { registration_id } = req.params;

        const [registrations] = await db.query(`
            SELECT er.*, e.name as event_name, u.name as user_name, u.email as user_email
            FROM EventRegistrations er
            JOIN Events e ON er.event_id = e.event_id
            JOIN Users u ON er.user_id = u.user_id
            WHERE er.registration_id = ?
        `, [registration_id]);

        if (registrations.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Event registration not found',
            });
        }

        res.status(200).json({
            success: true,
            registration: registrations[0],
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching event registration',
            error,
        });
    }
};

// Update event registration
const updateEventRegistration = async (req, res) => {
    try {
        const { registration_id } = req.params;
        const { status, payment_status } = req.body;

        const [result] = await db.query(`
            UPDATE EventRegistrations
            SET status = ?, payment_status = ?
            WHERE registration_id = ?
        `, [status, payment_status, registration_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Event registration not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Event registration updated successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error updating event registration',
            error,
        });
    }
};

// Delete event registration
const deleteEventRegistration = async (req, res) => {
    try {
        const { registration_id } = req.params;

        const [result] = await db.query(`
            DELETE FROM EventRegistrations WHERE registration_id = ?
        `, [registration_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Event registration not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Event registration deleted successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error deleting event registration',
            error,
        });
    }
};

module.exports = {
    addEvent,
    getAllEvents,
    getEventById,
    updateEvent,
    deleteEvent,
    registerForEvent,
    getAllEventRegistrations,
    getUserEventRegistrations,
    getEventRegistrationById,
    updateEventRegistration,
    deleteEventRegistration
};

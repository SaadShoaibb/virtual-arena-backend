const Pusher = require("pusher");
const db = require("../config/db");
const { sendNotification, sendAdminNotification } = require("../services/services");
const pusher = new Pusher({
    appId: "1960022",
    key: "a230b3384874418b8baa",
    secret: "3d633a30352f120f0cc6",
    cluster: "ap2",
    useTLS: true
});
// Add Tournament controller
const addTournament = async (req, res) => {
    try {
        const {
            name,
            description,
            start_date,
            end_date,
            status,
            city,
            country,
            state,
            ticket_price,
            max_participants,
            prize_pool,
            game_type,
            rules,
            requirements
        } = req.body;

        const [result] = await db.query(`
            INSERT INTO Tournaments (
                name, description, start_date, end_date, status, city, country, state,
                ticket_price, max_participants, prize_pool, game_type, rules, requirements
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name,
            description,
            start_date,
            end_date,
            status || 'upcoming',
            city,
            country,
            state,
            ticket_price,
            max_participants,
            prize_pool,
            game_type,
            rules,
            requirements
        ]);

        res.status(201).json({
            success: true,
            message: 'Tournament created successfully',
            tournament_id: result.insertId,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error creating tournament',
            error,
        });
    }
};


// Get all tournaments
const getAllTournaments = async (req, res) => {
    try {
        const [tournaments] = await db.query(`
            SELECT t.*,
                   COUNT(tr.registration_id) as registered_count
            FROM Tournaments t
            LEFT JOIN TournamentRegistrations tr ON t.tournament_id = tr.tournament_id
                AND tr.status != 'disqualified'
            GROUP BY t.tournament_id
            ORDER BY t.start_date ASC
        `);

        res.status(200).json({
            success: true,
            message: 'Tournaments retrieved successfully',
            tournaments,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching tournaments',
            error,
        });
    }
};


// get one tournament 
const getTournamentById = async (req, res) => {
    try {
        const { tournament_id } = req.params;

        const [tournament] = await db.query(`
            SELECT * FROM Tournaments WHERE tournament_id = ?
        `, [tournament_id]);

        if (tournament.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Tournament retrieved successfully',
            tournament: tournament[0],
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching tournament',
            error,
        });
    }
};


// update tournament
const updateTournament = async (req, res) => {
    try {
        const { tournament_id } = req.params;
        const {
            name,
            description,
            start_date,
            end_date,
            status,
            city,
            country,
            state,
            ticket_price,
            max_participants,
            prize_pool,
            game_type,
            rules,
            requirements
        } = req.body;

        const [result] = await db.query(`
            UPDATE Tournaments
            SET name = ?, description = ?, start_date = ?, end_date = ?, status = ?,
                city = ?, country = ?, state = ?, ticket_price = ?, max_participants = ?,
                prize_pool = ?, game_type = ?, rules = ?, requirements = ?
            WHERE tournament_id = ?
        `, [
            name,
            description,
            start_date,
            end_date,
            status,
            city,
            country,
            state,
            ticket_price,
            max_participants,
            prize_pool,
            game_type,
            rules,
            requirements,
            tournament_id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Tournament updated successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error updating tournament',
            error,
        });
    }
};


// delete tournament
const deleteTournament = async (req, res) => {
    try {
        const { tournament_id } = req.params;

        const [result] = await db.query(`
            DELETE FROM Tournaments WHERE tournament_id = ?
        `, [tournament_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Tournament deleted successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error deleting tournament',
            error,
        });
    }
};


//register for tournament 
const registerForTournament = async (req, res) => {
    try {
        const { tournament_id, payment_status, payment_option } = req.body;
        const user_id = req.user?.id; // Get user ID from authenticated request

        // Validate required fields
        if (!tournament_id || !user_id) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: tournament_id or user_id',
            });
        }

        // Check if the user is already registered
        const [existing] = await db.query(`
            SELECT * FROM TournamentRegistrations 
            WHERE user_id = ? AND tournament_id = ?
        `, [user_id, tournament_id]);

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'User is already registered for this tournament',
            });
        }

        // Set payment status (default to 'pending' if not provided)
        const paymentStatus = payment_status || 'pending';
        // Set payment option (default to 'online' if not provided)
        const paymentOption = payment_option || 'online';

        // Register the user for the tournament with payment status and payment option
        const [result] = await db.query(`
            INSERT INTO TournamentRegistrations (user_id, tournament_id, status, payment_status, payment_option) 
            VALUES (?, ?, 'registered', ?, ?)
        `, [user_id, tournament_id, paymentStatus, paymentOption]);

        // Send notification to user
        await sendNotification(
            user_id, // User ID
            'booking_confirmation', // Notification type
            'Tournament Registration', // Subject
            `You have been registered for the tournament. Payment status: ${paymentStatus}.`, // Message
            'email', // Delivery method
            `/tournaments?tournament_id=${tournament_id}` // Link
        );

        // Send notification to admin
        await sendAdminNotification(
            'booking_confirmation', // Notification type
            'Tournament Registration', // Subject
            `A new tournament registration has been made by user ${user_id}.`, // Message
            'email', // Delivery method
            `/tournaments/all-tournaments?tournament_id=${tournament_id}` // Link
        );
        // Step 6: Trigger Pusher event
        pusher.trigger('my-channel', 'my-event', {
            message: 'New Tournament Registration',
            tournamentId: tournament_id,
            userId: user_id
        });

        res.status(201).json({
            success: true,
            message: 'Successfully registered for tournament',
            registration_id: result.insertId,
            payment_status: paymentStatus,
            payment_option: paymentOption
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error registering for tournament',
            error: error.message, // Return only the error message for security
        });
    }
};


// Get all tournament registrations
const getAllRegistrations = async (req, res) => {
    try {
        // Query to fetch all registrations with user and tournament details
        const [registrations] = await db.query(`
            SELECT 
                r.*, 
                u.name AS user_name, 
                t.name AS tournament_name,
                t.status AS tournament_status,
                r.payment_status,
                r.payment_option
            FROM 
                TournamentRegistrations r
            JOIN 
                Users u ON r.user_id = u.user_id
            JOIN 
                Tournaments t ON r.tournament_id = t.tournament_id
        `);

        // Send success response
        res.status(200).json({
            success: true,
            message: 'Registrations retrieved successfully',
            registrations,
        });
    } catch (error) {
        console.error('Error fetching registrations:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error fetching registrations',
            error: error.message,
        });
    }
};

// Get tournament registrations for a specific user
const getUserRegistrations = async (req, res) => {
    try {
        const user_id = req.user.id; // Assuming user ID is available in the request object

        // Query to fetch registrations for the logged-in user
        const [registrations] = await db.query(`
            SELECT 
                r.*, 
                t.name AS tournament_name, 
                t.ticket_price AS ticket_price, 
                u.name AS user_name,
                t.status AS tournament_status
            FROM 
                TournamentRegistrations r
            JOIN 
                Tournaments t ON r.tournament_id = t.tournament_id
            JOIN 
                Users u ON r.user_id = u.user_id
            WHERE 
                r.user_id = ?
        `, [user_id]);

        // Send success response
        res.status(200).json({
            success: true,
            message: 'User tournament registrations retrieved successfully',
            registrations,
        });
    } catch (error) {
        console.error('Error fetching user registrations:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error fetching user registrations',
            error: error.message,
        });
    }
};


// get single registration by id 
const getRegistrationById = async (req, res) => {
    try {
        const { registration_id } = req.params;

        const [registration] = await db.query(`
            SELECT * FROM TournamentRegistrations WHERE registration_id = ?
        `, [registration_id]);

        if (registration.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Registration retrieved successfully',
            registration: registration[0],
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching registration',
            error,
        });
    }
};


//delete registration
const deleteRegistration = async (req, res) => {
    try {
        const { registration_id } = req.params;

        const [result] = await db.query(`
            DELETE FROM TournamentRegistrations WHERE registration_id = ?
        `, [registration_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Registration deleted successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error deleting registration',
            error,
        });
    }
};


// Update registration
const updateRegistration = async (req, res) => {
    try {
        const { registration_id } = req.params;
        const { status, payment_status, payment_option } = req.body;

        // Build the SQL query dynamically based on provided fields
        let updateFields = [];
        let queryParams = [];

        if (status) {
            updateFields.push('status = ?');
            queryParams.push(status);
        }

        if (payment_status) {
            updateFields.push('payment_status = ?');
            queryParams.push(payment_status);
        }

        if (payment_option) {
            updateFields.push('payment_option = ?');
            queryParams.push(payment_option);
        }

        // If no fields to update, return error
        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields provided for update',
            });
        }

        // Add registration_id to query params
        queryParams.push(registration_id);

        const [result] = await db.query(`
            UPDATE TournamentRegistrations 
            SET ${updateFields.join(', ')} 
            WHERE registration_id = ?
        `, queryParams);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Registration not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Registration updated successfully',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error updating registration',
            error: error.message,
        });
    }
};

module.exports = {
    addTournament,
    getAllTournaments,
    getTournamentById,
    updateTournament,
    deleteTournament,
    registerForTournament,
    getAllRegistrations,
    getUserRegistrations,
    getRegistrationById,
    deleteRegistration,
    updateRegistration
}
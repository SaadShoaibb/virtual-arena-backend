const express = require('express')

const isAuthenticated = require('../middlewares/authMiddleware')
const { addDeal, getDeals, updateDeal, deleteDeal } = require('../controllers/dealsController');
const upload = require('../middlewares/uploadMiddleware');
const isAdmin = require('../middlewares/adminMiddleware');
const { getSessionById, getAllSessions, updateSession, createSession } = require('../controllers/sessionsController');
const { getAllBookings, updateBooking, deleteBooking, getBookingById } = require('../controllers/bookingController');
const { addTournament, getAllTournaments, getTournamentById, updateTournament, deleteTournament, getAllRegistrations, getRegistrationById, deleteRegistration, updateRegistration } = require('../controllers/tournamentController');
const { addEvent, getAllEvents, getEventById, updateEvent, deleteEvent, getAllEventRegistrations, getEventRegistrationById, updateEventRegistration, deleteEventRegistration } = require('../controllers/eventsController');
const { addProduct, getAllProducts, getProductById, updateProduct, deleteProduct } = require('../controllers/productController');
const { createOrder, getAllOrders, getOrderById, updateOrderStatus, deleteOrder, getOrderItemsByOrderId, deleteOrderItem } = require('../controllers/orderController');
const { getAllUsers, updateUserByAdmin, deleteUser } = require('../controllers/authController');
const { getUserNotifications, markNotificationAsRead, markAllNotificationsAsRead } = require('../controllers/notificationController');
const { getAllGiftCards, createGiftCard, getGiftCardById, updateGiftCard, deleteGiftCard } = require('../controllers/giftCardController');
const { getReviewsByEntity } = require('../controllers/reviewController');
const { getDashboardMetrics, getRevenueReport, getRevenueData, getRecentTransactions, getTopSessions, getUserGrowth, getDashboardStats, getOrderStats } = require('../controllers/dashboardController');
const { runMigrations } = require('../controllers/tablesController');
const db = require('../config/db');

const router = express.Router()

// VR Sessions - Now fully manageable from admin panel
router.post('/add-session',isAuthenticated,isAdmin,createSession)
router.get('/get-sessions',isAuthenticated,isAdmin,getAllSessions)
router.get("/get-session/:session_id",isAuthenticated,isAdmin,getSessionById)
router.put('/update-session/:session_id',isAuthenticated,isAdmin,updateSession)


// booking Sessions
router.get('/get-bookings/',isAuthenticated,isAdmin,getAllBookings)
router.get('/get-Bookings/',isAuthenticated,isAdmin,getAllBookings) // Support both cases for compatibility
router.put('/update-booking/:booking_id/',isAuthenticated,isAdmin,updateBooking)
router.get('/get-booking/:booking_id/',isAuthenticated,isAdmin,getBookingById)
router.delete('/delete-booking/:booking_id/',isAuthenticated,isAdmin,deleteBooking)

// Update booking payment status
router.put('/booking/:booking_id/payment-status', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { booking_id } = req.params;
        const { payment_status } = req.body;

        console.log(`📋 Updating booking ${booking_id} payment status to ${payment_status}`);

        const [result] = await db.query(
            'UPDATE Bookings SET payment_status = ? WHERE booking_id = ?',
            [payment_status, booking_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        res.json({ success: true, message: 'Payment status updated successfully' });
    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ success: false, message: 'Failed to update payment status' });
    }
});


// Events
router.post('/add-event/',isAuthenticated,isAdmin,addEvent)
router.get('/get-events/',isAuthenticated,isAdmin,getAllEvents)
router.get('/get-event/:event_id/',isAuthenticated,isAdmin,getEventById)
router.put('/update-event/:event_id',isAuthenticated,isAdmin,updateEvent)
router.delete('/delete-event/:event_id',isAuthenticated,isAdmin,deleteEvent)

// Tournaments
router.post('/add-tournament/',isAuthenticated,isAdmin,addTournament)
router.get('/get-tournaments/',isAuthenticated,isAdmin,getAllTournaments)
router.get('/get-tournament/:tournament_id/',isAuthenticated,isAdmin,getTournamentById)
router.put('/update-tournament/:tournament_id',isAuthenticated,isAdmin,updateTournament)
router.delete('/delete-tournament/:tournament_id',isAuthenticated,isAdmin,deleteTournament)

// Event Registrations
router.get('/event-registrations/',isAuthenticated,isAdmin,getAllEventRegistrations)
router.get('/event-registration/:registration_id',isAuthenticated,isAdmin,getEventRegistrationById)
router.put('/update-event-registration/:registration_id',isAuthenticated,isAdmin,updateEventRegistration)
router.delete('/delete-event-registration/:registration_id',isAuthenticated,isAdmin,deleteEventRegistration)

// tournament Registrations
router.get('/tournament-registrations/',isAuthenticated,isAdmin,getAllRegistrations)
router.get('/tournament-registration/:registration_id',isAuthenticated,isAdmin,getRegistrationById)
router.put('/update-registration/:registration_id',isAuthenticated,isAdmin,updateRegistration)
router.delete('/delete-registration/:registration_id',isAuthenticated,isAdmin,deleteRegistration)


// Products
router.post('/add-products/',upload.array('images', 5),isAuthenticated,isAdmin,addProduct)
router.get('/products/',isAuthenticated,isAdmin,getAllProducts)
router.get('/product/:id',isAuthenticated,isAdmin,getProductById)
router.put('/product/:id',upload.array('images', 5),isAuthenticated,isAdmin,updateProduct)
router.delete('/product/:id',isAuthenticated,isAdmin,deleteProduct)

// orders
router.get('/orders', isAuthenticated,isAdmin,getAllOrders); // Get all orders
router.get('/orders/:order_id', isAuthenticated,isAdmin,getOrderById); // Get order by ID
router.put('/orders/:order_id/status', isAuthenticated,isAdmin,updateOrderStatus); // Update order status
router.delete('/orders/:order_id', isAuthenticated,isAdmin,deleteOrder);

// OrderItems Routes
router.get('/order-items/:order_id', isAuthenticated,isAdmin,getOrderItemsByOrderId);
router.delete('/order-items/:order_item_id', isAuthenticated,isAdmin,deleteOrderItem);

// GiftCards Routes
// router.post('/gift-cards', isAuthenticated,isAdmin,createGiftCard);
// router.get('/gift-cards/:code', isAuthenticated,isAdmin,getGiftCardByCode);
// router.delete('/gift-cards/:gift_card_id', isAuthenticated,isAdmin,deleteGiftCard);


// users/
router.get('/users', isAuthenticated,isAdmin,getAllUsers);
router.put('/user/:user_id', isAuthenticated,isAdmin,updateUserByAdmin);
router.delete('/user/:user_id', isAuthenticated,isAdmin,deleteUser);


//notification
router.get('/notifications',isAuthenticated,isAdmin,getUserNotifications)
router.put('/notification/:notification_id/read',isAuthenticated,isAdmin,markNotificationAsRead)
router.put('/notifications/mark-all-read',isAuthenticated,isAdmin,markAllNotificationsAsRead)


//gift cards
router.post('/create', isAuthenticated,isAdmin,createGiftCard);
router.get('/get-all', isAuthenticated,isAdmin,getAllGiftCards);
router.get('/:id', isAuthenticated,isAdmin,getGiftCardById);
router.put('/:id', isAuthenticated,isAdmin,updateGiftCard);
router.delete('/:gift_card_id', isAuthenticated,isAdmin,deleteGiftCard);



//review routes
router.get('/reviews/:entity_type/:entity_id', getReviewsByEntity);



// In your router
// In your router
router.get('/dashboard/stats', getDashboardStats);
router.get('/dashboard/orders', getOrderStats);


//add deals
// Route to add a new deal with multiple images
router.post('/add-deal', upload.array('images', 5), addDeal); 

///get deals
router.get('/get-deals',getDeals)

//update deal
router.put('/update-deal/:id',updateDeal)

//delete deal
router.delete('/delete-deal/:id',deleteDeal)

// Manual migration route
router.post('/run-migrations', isAdmin, runMigrations)

// Time Passes Management
router.get('/passes', isAuthenticated, isAdmin, async (req, res) => {
    try {
        console.log('📋 Admin: Fetching all passes...');
        const [rows] = await db.query('SELECT * FROM TimePasses ORDER BY duration_hours ASC');
        console.log('📋 Admin: Found passes:', rows.length);
        res.json({ success: true, passes: rows });
    } catch (error) {
        console.error('Error fetching passes:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch passes' });
    }
});

router.put('/passes/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, duration_hours, price, description, is_active } = req.body;

        // Validate that id is a number for existing passes
        if (id !== 'new1' && id !== 'new2' && id !== 'new4' && id !== 'new8' && isNaN(parseInt(id))) {
            return res.status(400).json({ success: false, message: 'Invalid pass ID' });
        }

        // If it's a new pass (starts with 'new'), create it
        if (id.startsWith('new')) {
            const duration = parseInt(id.replace('new', ''));
            await db.query(
                'INSERT INTO TimePasses (name, duration_hours, price, description, is_active) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), description = VALUES(description), is_active = VALUES(is_active)',
                [name, duration, price, description, is_active]
            );
        } else {
            // Update existing pass
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

router.post('/passes', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { name, duration_hours, price, description, is_active } = req.body;

        await db.query(
            'INSERT INTO TimePasses (name, duration_hours, price, description, is_active) VALUES (?, ?, ?, ?, ?)',
            [name, duration_hours, price, description, is_active]
        );

        res.json({ success: true, message: 'Pass created successfully' });
    } catch (error) {
        console.error('Error creating pass:', error);
        res.status(500).json({ success: false, message: 'Failed to create pass' });
    }
});

// Update pass pricing specifically for pricing management
router.put('/passes/:passId/pricing', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { passId } = req.params;
        const { price } = req.body;

        console.log(`📋 Updating pass ${passId} price to ${price}`);

        // Update the pass price in TimePasses table
        const [result] = await db.query(
            'UPDATE TimePasses SET price = ? WHERE pass_id = ?',
            [price, passId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Pass not found' });
        }

        // Also update PassPricing table if it exists
        await db.query(
            'UPDATE PassPricing SET price = ? WHERE pass_id = ?',
            [price, passId]
        );

        res.json({ success: true, message: 'Pass pricing updated successfully' });
    } catch (error) {
        console.error('Error updating pass pricing:', error);
        res.status(500).json({ success: false, message: 'Failed to update pass pricing' });
    }
});

module.exports = router
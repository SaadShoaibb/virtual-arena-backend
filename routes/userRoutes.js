const express = require('express')
const isAuthenticated = require('../middlewares/authMiddleware')
const {  getCarts, deleteMultipleCarts, getOneDeal, getDeals } = require('../controllers/dealsController')
const { createBooking, getBookingById, cancelBooking, getAllUserBookings, updateBooking, getBookingAvailability, createGuestBooking, getGuestBooking } = require('../controllers/bookingController')
const {  getRegistrationById, getUserRegistrations, registerForTournament, registerForTournamentGuest, getAllTournaments } = require('../controllers/tournamentController')
const { getAllEvents, getEventById, registerForEvent, registerForEventGuest, getUserEventRegistrations } = require('../controllers/eventsController')
const { getAllProducts, getProductById } = require('../controllers/productController')
const { createOrderWithItems, getOrderById, getOrdersByUserId, addToCart, getCartByUserId, updateCartItemQuantity, removeFromCart, getUserOrders, addToGuestCart, getGuestCart, createGuestOrder, getGuestOrders } = require('../controllers/orderController')
const { getAllSessions } = require('../controllers/sessionsController')
const { getWishlistProducts, addToWishlist, removeFromWishlist, getUserAddress, updateUserAddress } = require('../controllers/authController')
const { getUserNotifications, markNotificationAsRead, markAllNotificationsAsRead } = require('../controllers/notificationController')
const { purchaseGiftCard, getUserGiftCards, redeemGiftCard, getAllGiftCards, getUserGiftCardByCode } = require('../controllers/giftCardController')
const { addReview, getReviewsByEntity, getReviewById } = require('../controllers/reviewController')

const router = express.Router()
// routes


//sessions (Public route for guest booking)
router.get('/get-sessions', getAllSessions) // Removed isAuthenticated to allow guest access
// Bookings
router.post('/book-session/',isAuthenticated,createBooking),
router.get('/get-bookings/',isAuthenticated,getAllUserBookings)
router.get('/get-booking/:booking_id/',isAuthenticated,getBookingById)
router.put('/cancel-booking/:booking_id/',isAuthenticated,cancelBooking)
router.put('/update-booking/:booking_id/',isAuthenticated,updateBooking)

// Booking Availability & Guest Bookings (Public routes)
router.get('/booking-availability', getBookingAvailability) // Public route for calendar
router.post('/guest-booking', createGuestBooking) // Public route for guest bookings
router.get('/guest-booking/:booking_reference', getGuestBooking) // Public route to check guest booking

// Guest Orders (Public routes)
router.post('/guest-order', createGuestOrder) // Public route for guest orders
router.get('/guest-orders', getGuestOrders) // Public route to get guest orders by email

// Debug route to check Orders table structure
router.get('/debug-orders-table', async (req, res) => {
    try {
        const db = require('../config/db');
        const [columns] = await db.query('SHOW COLUMNS FROM Orders');
        const [sampleOrders] = await db.query('SELECT * FROM Orders WHERE is_guest_order = true LIMIT 3');

        res.json({
            success: true,
            columns: columns,
            sampleOrders: sampleOrders,
            message: 'Orders table debug info'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Events
router.get('/get-events',getAllEvents)
router.get('/get-event/:event_id',getEventById)
router.post('/register-for-event/:event_id',isAuthenticated,registerForEvent)
router.post('/guest-event-registration/:event_id', registerForEventGuest) // Guest event registration
router.get('/event-registrations/',isAuthenticated,getUserEventRegistrations)

// Tournament Registrations
router.get('/get-tournaments',getAllTournaments)
router.post('/register-for-tournament/',isAuthenticated,registerForTournament)
router.post('/guest-tournament-registration', registerForTournamentGuest) // Guest tournament registration
router.get('/tournament-registrations/',isAuthenticated,getUserRegistrations)
router.get('/tournament-registration/:registration_id',isAuthenticated,getRegistrationById)


// products
router.get('/products/',getAllProducts)
router.get('/product/:id',getProductById)


// orders
router.post('/create-order', isAuthenticated,createOrderWithItems);  // Get all orders
router.get('/orders/:order_id', isAuthenticated,getOrderById); // Get order by ID
router.get('/orders/', isAuthenticated,getUserOrders); 
router.get('/address',isAuthenticated,getUserAddress)
router.put('/address',isAuthenticated,updateUserAddress)


// Cart Routes
router.post('/cart', isAuthenticated,addToCart);
router.get('/carts/', isAuthenticated,getCartByUserId);
router.put('/cart/:cart_id', isAuthenticated,updateCartItemQuantity);
router.delete('/cart/:cart_id', isAuthenticated,removeFromCart);

// Guest Cart Routes (Public routes)
router.post('/guest-cart', addToGuestCart); // Add item to guest cart
router.get('/guest-cart/:guest_session_id', getGuestCart); // Get guest cart

// wishlist
// Get all wishlist products for a user
router.get('/wishlist',isAuthenticated, getWishlistProducts);
// Add a product to the wishlist
router.post('/wishlist/:product_id', isAuthenticated,addToWishlist);
// Remove a product from the wishlist
router.delete('/wishlist/:product_id',isAuthenticated, removeFromWishlist);


//Notification
router.get('/notifications',isAuthenticated,getUserNotifications)
router.put('/notification/:notification_id/read',isAuthenticated,markNotificationAsRead)
router.put('/notifications/read-all',isAuthenticated,markAllNotificationsAsRead)


//gift cards
router.get('/gift-cards', isAuthenticated,getAllGiftCards);
router.post('/purchase', isAuthenticated,purchaseGiftCard);
router.get('/:user_id', isAuthenticated,getUserGiftCards);
router.get('/card/:code', isAuthenticated,getUserGiftCardByCode);
router.post('/redeem', isAuthenticated,redeemGiftCard);


//review routes
router.post('/reviews', addReview);
router.get('/reviews/:entity_type/:entity_id', getReviewsByEntity);
router.get('/reviews/:review_id', getReviewById);







// router.get('/get-all-users',getAllUsers)
//get all deals
router.get('/get-deals',getDeals)

// get one deal
router.get('/get-deal/:id',getOneDeal)

// router.post('/add-cart', isAuthenticated, addToCart)
// router.post('/login', loginUser);
router.get('/get-cart', isAuthenticated,getCarts);

router.delete('/delete-carts', isAuthenticated,deleteMultipleCarts);

module.exports = router
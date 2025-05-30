const express = require('express')

const isAuthenticated = require('../middlewares/authMiddleware')
const { addDeal, getDeals, updateDeal, deleteDeal } = require('../controllers/dealsController');
const upload = require('../middlewares/uploadMiddleware');
const isAdmin = require('../middlewares/adminMiddleware');
const { createSession, getSessionById, getAllSessions, updateSession, deleteSession } = require('../controllers/sessionsController');
const { getAllBookings, updateBooking, deleteBooking, getBookingById } = require('../controllers/bookingController');
const { addTournament, getAllTournaments, getTournamentById, updateTournament, deleteTournament, getAllRegistrations, getRegistrationById, deleteRegistration } = require('../controllers/tournamentController');
const { addProduct, getAllProducts, getProductById, updateProduct, deleteProduct } = require('../controllers/productController');
const { createOrder, getAllOrders, getOrderById, updateOrderStatus, deleteOrder, getOrderItemsByOrderId, deleteOrderItem } = require('../controllers/orderController');
const { getAllUsers, updateUserByAdmin, deleteUser } = require('../controllers/authController');
const { getUserNotifications } = require('../controllers/notificationController');
const { getAllGiftCards, createGiftCard, getGiftCardById, updateGiftCard, deleteGiftCard } = require('../controllers/giftCardController');
const { getReviewsByEntity } = require('../controllers/reviewController');
const { getDashboardMetrics, getRevenueReport, getRevenueData, getRecentTransactions, getTopSessions, getUserGrowth, getDashboardStats, getOrderStats } = require('../controllers/dashboardController');

const router = express.Router()

// VR Sessions
router.post('/add-session',isAuthenticated,isAdmin,createSession)
router.get('/get-sessions',isAuthenticated,isAdmin,getAllSessions)
router.get("/get-session/:session_id",isAuthenticated,isAdmin,getSessionById)
router.put('/update-session/:session_id',isAuthenticated,isAdmin,updateSession)
router.delete('/delete-session/:session_id',isAuthenticated,isAdmin,deleteSession)


// booking Sessions
router.get('/get-bookings/',isAuthenticated,isAdmin,getAllBookings)
router.put('/update-booking/:booking_id/',isAuthenticated,isAdmin,updateBooking)
router.get('/get-booking/:booking_id/',isAuthenticated,isAdmin,getBookingById)
router.delete('/delete-booking/:booking_id/',isAuthenticated,isAdmin,deleteBooking)


// Tournaments
router.post('/add-tournament/',isAuthenticated,isAdmin,addTournament)
router.get('/get-tournaments/',isAuthenticated,isAdmin,getAllTournaments)
router.get('/get-tournament/:tournament_id/',isAuthenticated,isAdmin,getTournamentById)
router.put('/update-tournament/:tournament_id',isAuthenticated,isAdmin,updateTournament)
router.delete('/delete-tournament/:tournament_id',isAuthenticated,isAdmin,deleteTournament)


// tournament Registrations
router.get('/tournament-registrations/',isAuthenticated,isAdmin,getAllRegistrations)
router.get('/tournament-registration/:registration_id',isAuthenticated,isAdmin,getRegistrationById)
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



module.exports = router
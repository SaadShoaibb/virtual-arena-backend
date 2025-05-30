const express = require('express');
const router = express.Router();
const isAuthenticated = require('../middlewares/authMiddleware');
const { createPaymentIntent, confirmPayment, getPaymentDetails } = require('../controllers/paymentController');
const isAdmin = require('../middlewares/adminMiddleware');
// Stripe Payment Routes
router.post('/create-payment-intent', isAuthenticated, createPaymentIntent);
router.post('/confirm_payment',isAuthenticated,confirmPayment );
router.get('/payment-details',isAuthenticated,isAdmin,getPaymentDetails );

module.exports = router;
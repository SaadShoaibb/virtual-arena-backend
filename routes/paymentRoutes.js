const express = require('express');
const router = express.Router();
const isAuthenticated = require('../middlewares/authMiddleware');
const paymentController = require('../controllers/paymentController');

// Stripe Payment Routes

/**
 * Checkout session route - requires authentication
 * This ensures only authenticated users can create checkout sessions
 */
router.post('/create-checkout-session', paymentController.createCheckoutSession);

/**
 * Confirm payment route - can be used by client after successful checkout
 * This is used to update the payment status in the database
 */
router.post('/confirm-payment', isAuthenticated, paymentController.confirmPayment);

/**
 * Get all payment details route - requires authentication
 * This is used by the admin panel to view all payments
 */
router.get('/payment-details', isAuthenticated, paymentController.getAllPayments);

/**
 * Get payment details route - requires authentication
 * This is used by the client to view payment details
 */
router.get('/payment-details/:paymentId', isAuthenticated, paymentController.getPaymentDetails);

/**
 * Test route to verify backend routing
 */
router.get('/test', (req, res) => {
  res.json({ message: 'Payment routes working!' });
});

module.exports = router;
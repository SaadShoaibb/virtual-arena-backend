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
 * Manual payment status update route - requires authentication
 * This is for admin/testing purposes
 */
router.put('/update-payment-status', isAuthenticated, paymentController.updatePaymentStatus);

/**
 * Debug route to check order payment status
 */
router.get('/debug-order/:order_id', async (req, res) => {
  try {
    const { order_id } = req.params;
    const db = require('../config/db');

    // Get order details
    const [orderResult] = await db.query(
      'SELECT order_id, payment_status, payment_method, total_amount, guest_name, guest_email FROM Orders WHERE order_id = ?',
      [order_id]
    );

    // Get payment records
    const [paymentResult] = await db.query(
      'SELECT payment_id, status, checkout_session_id, entity_type, entity_id FROM Payments WHERE entity_id = ? AND entity_type = "order"',
      [order_id]
    );

    res.json({
      success: true,
      order: orderResult[0] || null,
      payments: paymentResult,
      message: `Debug info for order ${order_id}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test route to verify backend routing
 */
router.get('/test', (req, res) => {
  res.json({ message: 'Payment routes working!' });
});

module.exports = router;
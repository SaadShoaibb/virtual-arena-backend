const express = require('express');
const router = express.Router();
const isAuthenticated = require('../middlewares/authMiddleware');
const { createPaymentIntent, confirmPayment, getPaymentDetails, createCheckoutSession } = require('../controllers/paymentController');
const { handleStripeWebhook } = require('../controllers/webhookController');
const isAdmin = require('../middlewares/adminMiddleware');

// Import the connected accounts controller
const connectedAccountsController = require('../controllers/connectedAccountsExample');

// Stripe Payment Routes
router.post('/create-payment-intent', isAuthenticated, createPaymentIntent);
router.post('/create-checkout-session', isAuthenticated, createCheckoutSession);
router.post('/confirm_payment', isAuthenticated, confirmPayment);
router.get('/payment-details', isAuthenticated, isAdmin, getPaymentDetails);

// Stripe Webhook - No authentication middleware as it's called by Stripe
// The express.raw middleware is important to preserve the raw body for signature verification
router.post('/webhook', express.raw({type: 'application/json'}), handleStripeWebhook);

// Add a route to verify webhook configuration
router.get('/webhook-status', (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const serverConfig = {
        raw_body_parser: true, // Assuming express.raw middleware is correctly configured
        body_parser_skipped: true // Assuming body-parser is skipped for webhook route
    };
    
    res.json({
        webhook_url: `${req.protocol}://${req.get('host')}/api/v1/payment/webhook`,
        webhook_secret_status: webhookSecret ? 'configured' : 'not configured',
        server_configuration: serverConfig,
        status: webhookSecret ? 'ready' : 'missing webhook secret',
        documentation: '/STRIPE_WEBHOOK_SETUP.md'
    });
});

// Connected Accounts routes
// Create a connected account
router.post('/connected-accounts', connectedAccountsController.createConnectedAccount);

// List connected accounts
router.get('/connected-accounts', connectedAccountsController.listConnectedAccounts);

// Create a checkout session for a connected account
router.post('/connected-accounts/create-checkout-session', connectedAccountsController.createConnectedAccountCheckoutSession);

// Create a payment intent for a connected account
router.post('/connected-accounts/create-payment-intent', connectedAccountsController.createConnectedAccountPaymentIntent);

module.exports = router;
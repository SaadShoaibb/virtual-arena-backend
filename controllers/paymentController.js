require('dotenv').config(); // Load environment variables from .env
const db = require('../config/db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Use Stripe secret key from .env

/**
 * Create a Stripe Checkout Session
 * This is the main payment method for Virtual Arena
 * It creates a checkout session and returns the session ID to the client
 */
const createCheckoutSession = async (req, res) => {
  try {
    console.log('Received checkout session request:', req.body);
    const { user_id, amount, connected_account_id, entity_type, entity_id } = req.body;
    const numericAmount = Number(amount);
    
    // Validate required fields
    if (!user_id || Number.isNaN(numericAmount)) {
      console.log('Missing required fields:', { user_id, amount });
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: user_id and amount are required' 
      });
    }

    // Validate amount is a number and at least 0.50
    if (Number.isNaN(numericAmount) || numericAmount < 0.5) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a number and at least 0.50 USD'
      });
    }

    // Check that FRONTEND_URL is set
    if (!process.env.FRONTEND_URL) {
      return res.status(500).json({
        success: false,
        message: 'FRONTEND_URL environment variable is not set'
      });
    }

    // Get user info
    const [userRows] = await db.query('SELECT * FROM Users WHERE user_id = ?', [user_id]);
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = userRows[0];
    const userEmail = user.email;
    const userName = user.username;

    // Create a generic line item
    const lineItems = [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Generic Payment',
          description: 'Virtual Arena Payment',
        },
        unit_amount: Math.round(numericAmount * 100), // Convert to cents
      },
      quantity: 1,
    }];

    const successUrl = `${process.env.FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.FRONTEND_URL}/checkout/cancel`;

    // Create Stripe checkout session parameters
    const sessionParams = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: userEmail,
      metadata: {
        user_id,
        user_name: userName,
      },
    };

    // Use connected account if specified
    if (connected_account_id) {
      sessionParams.payment_intent_data = {
        application_fee_amount: Math.round(numericAmount * 0.1 * 100),
        transfer_data: {
          destination: connected_account_id,
        },
      };
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    // Create a payment record in the database
    const [paymentResult] = await db.query(
      'INSERT INTO Payments (user_id, entity_type, entity_id, amount, currency, checkout_session_id, connected_account_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        user_id,
        entity_type || 'order',
        entity_id || 0,
        numericAmount,
        'usd', // default currency
        session.id,
        connected_account_id || null
      ]
    );

    // Then, if there's an entity (booking, tournament, etc.), update it with payment_id
    // For example, if we have a booking:
    if (entity_type === 'booking') {
      await db.query(
        'UPDATE Bookings SET payment_id = ? WHERE booking_id = ?',
        [paymentResult.insertId, entity_id]
      );
    }

    // Similarly for tournament registration
    if (entity_type === 'tournament') {
      await db.query(
        'UPDATE TournamentRegistrations SET payment_id = ? WHERE registration_id = ?',
        [paymentResult.insertId, entity_id]
      );
    }

    res.status(200).json({ 
      success: true, 
      sessionId: session.id 
    });
  } catch (err) {
    console.error('Error creating checkout session:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

/**
 * Confirm a payment after successful checkout
 * This is called by the client after a successful checkout
 */
const confirmPayment = async (req, res) => {
  try {
    const { session_id } = req.body;
    
    if (!session_id) {
      return res.status(400).json({ success: false, message: 'Session ID is required' });
    }
    
    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    
    // Check if payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment not completed', 
        status: session.payment_status 
      });
    }
    
    // Update payment status in database
    await db.query(
      'UPDATE Payments SET status = ? WHERE checkout_session_id = ?',
      ['succeeded', session_id]
    );

    // Retrieve user_id linked to this payment and clear their cart
    const [paymentRows] = await db.query(
      'SELECT user_id FROM Payments WHERE checkout_session_id = ?',
      [session_id]
    );
    if (paymentRows.length) {
      const userId = paymentRows[0].user_id;
      await db.query('DELETE FROM Cart WHERE user_id = ?', [userId]);
    }
    
    res.status(200).json({
      success: true,
      message: 'Payment confirmed successfully',
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm payment',
      error: error.message
    });
  }
};

/**
 * Get payment details
 * This is used by the admin dashboard to view payment details
 */
const getPaymentDetails = async (req, res) => {
  try {
    const { payment_id, checkout_session_id, payment_intent_id } = req.query;
    
    let query = 'SELECT * FROM Payments WHERE 1=1';
    const params = [];
    
    if (payment_id) {
      query += ' AND payment_id = ?';
      params.push(payment_id);
    }
    
    if (checkout_session_id) {
      query += ' AND checkout_session_id = ?';
      params.push(checkout_session_id);
    }
    
    if (payment_intent_id) {
      query += ' AND payment_intent_id = ?';
      params.push(payment_intent_id);
    }
    
    if (params.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one filter parameter is required' });
    }
    
    const [paymentRows] = await db.query(query, params);
    
    if (paymentRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }
    
    const payment = paymentRows[0];
    
    // If payment has a checkout session ID, get additional details from Stripe
    if (payment.checkout_session_id) {
      try {
        const session = await stripe.checkout.sessions.retrieve(payment.checkout_session_id);
        payment.stripe_details = session;
      } catch (stripeError) {
        console.error('Error retrieving Stripe session:', stripeError);
        payment.stripe_error = 'Could not retrieve Stripe session details';
      }
    }
    
    // If payment has a payment intent ID, get additional details from Stripe
    if (payment.payment_intent_id) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(payment.payment_intent_id);
        payment.stripe_details = paymentIntent;
      } catch (stripeError) {
        console.error('Error retrieving Stripe payment intent:', stripeError);
        payment.stripe_error = 'Could not retrieve Stripe payment intent details';
      }
    }
    
    res.status(200).json({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Error getting payment details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment details',
      error: error.message
    });
  }
};

module.exports = {
  createCheckoutSession,
  confirmPayment,
  getPaymentDetails
};
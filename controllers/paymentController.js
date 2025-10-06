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
    console.log('🔄 Creating checkout session...');
    console.log('Request body:', req.body);
    console.log('Environment check:', {
      nodeEnv: process.env.NODE_ENV,
      stripeKey: process.env.STRIPE_SECRET_KEY ? 'Present' : 'Missing',
      frontendUrl: process.env.FRONTEND_URL || 'Missing'
    });
    const { user_id, amount, connected_account_id, entity_type, entity_id, guest_info } = req.body;
    const numericAmount = Number(amount);
    
    // Validate required fields - user_id can be 0 for guest bookings
    if (user_id === undefined || user_id === null || Number.isNaN(numericAmount)) {
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

    // Get user info - handle guest bookings (user_id = 0)
    let userEmail = 'guest@vrtualarena.ca';
    let userName = 'Guest User';

    if (user_id > 0) {
      const [userRows] = await db.query('SELECT * FROM Users WHERE user_id = ?', [user_id]);
      if (userRows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      const user = userRows[0];
      userEmail = user.email;
      userName = user.username;
    } else {
      // For guest users, try to get info from various sources
      if (guest_info && guest_info.email) {
        // Use provided guest info
        userEmail = guest_info.email;
        userName = guest_info.name || 'Guest User';
      } else if (entity_type === 'booking' && entity_id) {
        // For guest bookings, get email from the booking
        const [bookingRows] = await db.query('SELECT guest_email, guest_name FROM Bookings WHERE booking_id = ?', [entity_id]);
        if (bookingRows.length > 0 && bookingRows[0].guest_email) {
          userEmail = bookingRows[0].guest_email;
          userName = bookingRows[0].guest_name || 'Guest User';
        }
      } else if (entity_type === 'tournament_registration' && entity_id) {
        // For guest tournament registrations
        const [regRows] = await db.query('SELECT guest_email, guest_name FROM TournamentRegistrations WHERE registration_id = ?', [entity_id]);
        if (regRows.length > 0 && regRows[0].guest_email) {
          userEmail = regRows[0].guest_email;
          userName = regRows[0].guest_name || 'Guest User';
        }
      } else if (entity_type === 'event_registration' && entity_id) {
        // For guest event registrations
        const [regRows] = await db.query('SELECT guest_email, guest_name FROM EventRegistrations WHERE registration_id = ?', [entity_id]);
        if (regRows.length > 0 && regRows[0].guest_email) {
          userEmail = regRows[0].guest_email;
          userName = regRows[0].guest_name || 'Guest User';
        }
      }
    }

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
        entity_type: entity_type || 'order',
        entity_id: entity_id || '0',
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
    console.log('🔄 Creating Stripe session with metadata:', sessionParams.metadata);
    const session = await stripe.checkout.sessions.create(sessionParams);
    console.log('✅ Stripe session created:', session.id);

    // Create a payment record in the database
    // Use NULL for guest bookings (user_id = 0) to avoid foreign key constraint issues
    const paymentUserId = user_id > 0 ? user_id : null;
    console.log('💾 Creating payment record:', {
      user_id: paymentUserId,
      entity_type: entity_type || 'order',
      entity_id: entity_id || 0,
      amount: numericAmount,
      session_id: session.id
    });

    const [paymentResult] = await db.query(
      'INSERT INTO Payments (user_id, entity_type, entity_id, amount, currency, checkout_session_id, connected_account_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        paymentUserId,
        entity_type || 'order',
        entity_id || 0,
        numericAmount,
        'usd', // default currency
        session.id,
        connected_account_id || null
      ]
    );

    console.log('✅ Payment record created with ID:', paymentResult.insertId);

    // Then, if there's an entity (booking, tournament, etc.), update it with payment_id
    // For example, if we have a booking:
    if (entity_type === 'booking') {
      await db.query(
        'UPDATE Bookings SET payment_id = ? WHERE booking_id = ?',
        [paymentResult.insertId, entity_id]
      );
    }

    // Update tournament registration with payment_id
    if (entity_type === 'tournament' || entity_type === 'tournament_registration') {
      try {
        await db.query(
          'UPDATE TournamentRegistrations SET payment_id = ? WHERE registration_id = ?',
          [paymentResult.insertId, entity_id]
        );
        console.log(`✅ Updated TournamentRegistrations payment_id for registration ${entity_id}`);
      } catch (error) {
        console.log(`❌ Error updating TournamentRegistrations payment_id:`, error.message);
      }
    }

    // Update event registration with payment_id
    if (entity_type === 'event' || entity_type === 'event_registration') {
      try {
        await db.query(
          'UPDATE EventRegistrations SET payment_id = ? WHERE registration_id = ?',
          [paymentResult.insertId, entity_id]
        );
        console.log(`✅ Updated EventRegistrations payment_id for registration ${entity_id}`);
      } catch (error) {
        console.log(`❌ Error updating EventRegistrations payment_id:`, error.message);
      }
    }

    res.status(200).json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

    // Development fallback: COMPLETELY REMOVED to prevent false payment confirmations
    // Payments will only be confirmed through proper Stripe webhooks
    console.log('ℹ️ Payment created successfully. Awaiting Stripe webhook confirmation.');
  } catch (err) {
    console.error('Error creating checkout session:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      stripeKey: process.env.STRIPE_SECRET_KEY ? 'Present' : 'Missing',
      frontendUrl: process.env.FRONTEND_URL || 'Missing'
    });
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: err.message // Add error details for debugging
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
    
    // Retrieve the session from Stripe to verify actual payment status
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    
    console.log(`🔍 Confirming payment for session ${session_id}: status=${session.status}, payment_status=${session.payment_status}`);
    
    // Check if payment was successful - CRITICAL: Only proceed if actually paid
    if (session.payment_status !== 'paid') {
      console.log(`❌ Payment confirmation rejected: session ${session_id} has payment_status='${session.payment_status}', not 'paid'`);
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

/**
 * Get all payments for admin panel
 */
const getAllPayments = async (req, res) => {
  try {
    console.log('Fetching all payments for admin panel');

    const [payments] = await db.query(`
      SELECT
        p.*,
        CASE
          WHEN p.entity_type = 'booking' THEN COALESCE(u.name, b.guest_name)
          WHEN p.entity_type = 'order' THEN COALESCE(u.name, o.guest_name)
          WHEN p.entity_type = 'tournament' THEN COALESCE(u.name, tr.guest_name)
          WHEN p.entity_type = 'event' THEN COALESCE(u.name, er.guest_name)
          ELSE u.name
        END as customer_name,
        CASE
          WHEN p.entity_type = 'booking' THEN COALESCE(u.email, b.guest_email)
          WHEN p.entity_type = 'order' THEN COALESCE(u.email, o.guest_email)
          WHEN p.entity_type = 'tournament' THEN COALESCE(u.email, tr.guest_email)
          WHEN p.entity_type = 'event' THEN COALESCE(u.email, er.guest_email)
          ELSE u.email
        END as customer_email,
        p.status as stripe_payment_status
      FROM Payments p
      LEFT JOIN Users u ON p.user_id = u.user_id
      LEFT JOIN Bookings b ON p.entity_type = 'booking' AND p.entity_id = b.booking_id
      LEFT JOIN Orders o ON p.entity_type = 'order' AND p.entity_id = o.order_id
      LEFT JOIN TournamentRegistrations tr ON p.entity_type = 'tournament' AND p.entity_id = tr.registration_id
      LEFT JOIN EventRegistrations er ON p.entity_type = 'event' AND p.entity_id = er.registration_id
      ORDER BY p.created_at DESC
    `);

    res.status(200).json({
      success: true,
      message: 'Payments retrieved successfully',
      payments
    });
  } catch (error) {
    console.error('Error getting all payments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payments',
      error: error.message
    });
  }
};

/**
 * Manual payment status update for testing/admin purposes
 */
const updatePaymentStatus = async (req, res) => {
  try {
    const { order_id, payment_status } = req.body;

    if (!order_id || !payment_status) {
      return res.status(400).json({
        success: false,
        message: 'order_id and payment_status are required'
      });
    }

    console.log(`🔧 Manual update: Setting order ${order_id} payment status to ${payment_status}`);

    // Update order payment status
    const [result] = await db.query(
      'UPDATE Orders SET payment_status = ? WHERE order_id = ?',
      [payment_status, order_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.log(`✅ Order ${order_id} payment status updated to ${payment_status}`);

    res.status(200).json({
      success: true,
      message: `Order ${order_id} payment status updated to ${payment_status}`
    });

  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment status'
    });
  }
};

module.exports = {
  createCheckoutSession,
  confirmPayment,
  getPaymentDetails,
  getAllPayments,
  updatePaymentStatus
};
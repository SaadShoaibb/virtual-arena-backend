require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../config/db');

/**
 * Handle Stripe webhook events
 * This controller processes incoming webhook events from Stripe
 * It verifies the webhook signature and updates the payment status in the database
 */
const handleWebhook = async (req, res) => {
  const payload = req.body;
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Log the event type for debugging
  console.log('Webhook received:', event.type);

  try {
    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await handleExpiredCheckoutSession(event.data.object);
        break;
      case 'checkout.session.async_payment_failed':
        await handleFailedCheckoutSession(event.data.object);
        break;
      case 'checkout.session.async_payment_succeeded':
        await handleSucceededCheckoutSession(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await handleSuccessfulPaymentIntent(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handleFailedPaymentIntent(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.status(200).json({ received: true });
  } catch (error) {
    console.error(`Error processing webhook (${event.type}):`, error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

/**
 * Handle checkout.session.completed event
 * This is triggered when a customer completes the checkout process
 */
async function handleCheckoutSessionCompleted(session) {
  try {
    console.log('🎉 Processing checkout.session.completed:', session.id);
    console.log('💳 Session details:', {
      id: session.id,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      metadata: session.metadata
    });

    // Extract metadata from the session
    const { user_id, entity_id, entity_type } = session.metadata || {};

    console.log('Webhook metadata:', { user_id, entity_id, entity_type });

    // For guest bookings, user_id might be 0, which is valid
    if (user_id === undefined || user_id === null) {
      console.error('Missing user_id in checkout session:', session.id);
      return;
    }

    // If this is an order payment (from cart checkout), handle it differently
    if (entity_type === 'order' && entity_id) {
      // Update the existing order status
      await updateOrderStatus(entity_id, 'paid');
      await clearUserCart(user_id);
      console.log(`Order ${entity_id} marked as paid and cart cleared for user ${user_id}`);
      return;
    }

    // For direct payments (tournament/event), we need entity_id and entity_type
    if (!entity_id || !entity_type) {
      console.error('Missing required metadata for direct payment in checkout session:', session.id);
      return;
    }

    // Update payment record in database
    const updateQuery = `
      UPDATE Payments 
      SET status = 'succeeded', 
          checkout_session_id = ?, 
          updated_at = NOW() 
      WHERE user_id = ? 
        AND entity_id = ? 
        AND entity_type = ? 
        AND status = 'pending'
    `;

    await db.query(updateQuery, [session.id, user_id, entity_id, entity_type]);
    
    // Update entity status based on entity_type
    console.log(`🔄 Processing payment success for entity_type: ${entity_type}, entity_id: ${entity_id}, user_id: ${user_id}`);

    switch (entity_type) {
      case 'order':
        await updateOrderStatus(entity_id, 'paid');
        // Clear user's cart after successful order payment
        await clearUserCart(user_id);
        break;
      case 'booking':
        console.log(`📅 Updating booking ${entity_id} status to paid`);
        await updateBookingStatus(entity_id, 'paid');
        break;
      case 'tournament':
        await updateTournamentRegistrationStatus(entity_id, 'paid');
        break;
      case 'event':
        await updateEventRegistrationStatus(entity_id, 'paid');
        break;
      default:
        console.log(`⚠️ No specific handler for entity_type: ${entity_type}`);
    }

    console.log(`Payment for ${entity_type} ${entity_id} marked as succeeded`);
  } catch (error) {
    console.error('Error handling checkout.session.completed:', error);
    throw error;
  }
}

/**
 * Handle checkout.session.expired event
 * This is triggered when a checkout session expires without being completed
 */
async function handleExpiredCheckoutSession(session) {
  try {
    console.log('Processing checkout.session.expired:', session.id);
    
    // Extract metadata from the session
    const { user_id, entity_id, entity_type } = session.metadata || {};
    
    if (!user_id || !entity_id || !entity_type) {
      console.error('Missing required metadata in checkout session:', session.id);
      return;
    }

    // Update payment record in database
    const updateQuery = `
      UPDATE Payments 
      SET status = 'expired', 
          checkout_session_id = ?, 
          updated_at = NOW() 
      WHERE user_id = ? 
        AND entity_id = ? 
        AND entity_type = ? 
        AND status = 'pending'
    `;

    await db.query(updateQuery, [session.id, user_id, entity_id, entity_type]);
    
    console.log(`Payment for ${entity_type} ${entity_id} marked as expired`);
  } catch (error) {
    console.error('Error handling checkout.session.expired:', error);
    throw error;
  }
}

/**
 * Handle checkout.session.async_payment_failed event
 * This is triggered when an asynchronous payment fails
 */
async function handleFailedCheckoutSession(session) {
  try {
    console.log('Processing checkout.session.async_payment_failed:', session.id);
    
    // Extract metadata from the session
    const { user_id, entity_id, entity_type } = session.metadata || {};
    
    if (!user_id || !entity_id || !entity_type) {
      console.error('Missing required metadata in checkout session:', session.id);
      return;
    }

    // Update payment record in database
    const updateQuery = `
      UPDATE Payments 
      SET status = 'failed', 
          checkout_session_id = ?, 
          updated_at = NOW() 
      WHERE user_id = ? 
        AND entity_id = ? 
        AND entity_type = ? 
        AND status = 'pending'
    `;

    await db.query(updateQuery, [session.id, user_id, entity_id, entity_type]);
    
    console.log(`Payment for ${entity_type} ${entity_id} marked as failed`);
  } catch (error) {
    console.error('Error handling checkout.session.async_payment_failed:', error);
    throw error;
  }
}

/**
 * Handle checkout.session.async_payment_succeeded event
 * This is triggered when an asynchronous payment succeeds
 */
async function handleSucceededCheckoutSession(session) {
  try {
    console.log('Processing checkout.session.async_payment_succeeded:', session.id);
    
    // Extract metadata from the session
    const { user_id, entity_id, entity_type } = session.metadata || {};
    
    if (!user_id || !entity_id || !entity_type) {
      console.error('Missing required metadata in checkout session:', session.id);
      return;
    }

    // Update payment record in database
    const updateQuery = `
      UPDATE Payments 
      SET status = 'succeeded', 
          checkout_session_id = ?, 
          updated_at = NOW() 
      WHERE user_id = ? 
        AND entity_id = ? 
        AND entity_type = ? 
        AND status = 'pending'
    `;

    await db.query(updateQuery, [session.id, user_id, entity_id, entity_type]);
    
    // Update entity status based on entity_type
    switch (entity_type) {
      case 'order':
        await updateOrderStatus(entity_id, 'paid');
        break;
      case 'booking':
        await updateBookingStatus(entity_id, 'paid');
        break;
      case 'tournament':
        await updateTournamentRegistrationStatus(entity_id, 'paid');
        break;
      default:
        console.log(`No specific handler for entity_type: ${entity_type}`);
    }

    console.log(`Payment for ${entity_type} ${entity_id} marked as succeeded`);
  } catch (error) {
    console.error('Error handling checkout.session.async_payment_succeeded:', error);
    throw error;
  }
}

/**
 * Handle payment_intent.succeeded event
 * This is triggered when a payment intent is successful
 */
async function handleSuccessfulPaymentIntent(paymentIntent) {
  try {
    console.log('Processing payment_intent.succeeded:', paymentIntent.id);
    
    // Extract metadata from the payment intent
    const { user_id, entity_id, entity_type } = paymentIntent.metadata || {};
    
    if (!user_id || !entity_id || !entity_type) {
      console.error('Missing required metadata in payment intent:', paymentIntent.id);
      return;
    }

    // Update payment record in database
    const updateQuery = `
      UPDATE Payments 
      SET status = 'succeeded', 
          payment_intent_id = ?, 
          updated_at = NOW() 
      WHERE user_id = ? 
        AND entity_id = ? 
        AND entity_type = ? 
        AND status = 'pending'
    `;

    await db.query(updateQuery, [paymentIntent.id, user_id, entity_id, entity_type]);
    
    // Update entity status based on entity_type
    switch (entity_type) {
      case 'order':
        await updateOrderStatus(entity_id, 'paid');
        break;
      case 'booking':
        await updateBookingStatus(entity_id, 'paid');
        break;
      case 'tournament':
        await updateTournamentRegistrationStatus(entity_id, 'paid');
        break;
      default:
        console.log(`No specific handler for entity_type: ${entity_type}`);
    }

    console.log(`Payment for ${entity_type} ${entity_id} marked as succeeded`);
  } catch (error) {
    console.error('Error handling payment_intent.succeeded:', error);
    throw error;
  }
}

/**
 * Handle payment_intent.payment_failed event
 * This is triggered when a payment intent fails
 */
async function handleFailedPaymentIntent(paymentIntent) {
  try {
    console.log('Processing payment_intent.payment_failed:', paymentIntent.id);
    
    // Extract metadata from the payment intent
    const { user_id, entity_id, entity_type } = paymentIntent.metadata || {};
    
    if (!user_id || !entity_id || !entity_type) {
      console.error('Missing required metadata in payment intent:', paymentIntent.id);
      return;
    }

    // Update payment record in database
    const updateQuery = `
      UPDATE Payments 
      SET status = 'failed', 
          payment_intent_id = ?, 
          updated_at = NOW() 
      WHERE user_id = ? 
        AND entity_id = ? 
        AND entity_type = ? 
        AND status = 'pending'
    `;

    await db.query(updateQuery, [paymentIntent.id, user_id, entity_id, entity_type]);
    
    console.log(`Payment for ${entity_type} ${entity_id} marked as failed`);
  } catch (error) {
    console.error('Error handling payment_intent.payment_failed:', error);
    throw error;
  }
}

/**
 * Helper function to update order status
 */
async function updateOrderStatus(orderId, status) {
  try {
    const updateQuery = `
      UPDATE Orders 
      SET payment_status = ? 
      WHERE order_id = ?
    `;
    
    await db.query(updateQuery, [status, orderId]);
    console.log(`Order ${orderId} status updated to ${status}`);
  } catch (error) {
    console.error(`Error updating order status: ${error.message}`);
    throw error;
  }
}

/**
 * Helper function to update booking status
 */
async function updateBookingStatus(bookingId, paymentStatus) {
  try {
    console.log(`Attempting to update booking ${bookingId} payment_status to ${paymentStatus}`);

    const updateQuery = `
      UPDATE Bookings
      SET payment_status = ?
      WHERE booking_id = ?
    `;

    const [result] = await db.query(updateQuery, [paymentStatus, bookingId]);
    console.log(`Booking ${bookingId} payment_status updated to ${paymentStatus}. Affected rows: ${result.affectedRows}`);

    if (result.affectedRows === 0) {
      console.warn(`No booking found with ID ${bookingId}`);
    }
  } catch (error) {
    console.error(`Error updating booking payment status: ${error.message}`);
    throw error;
  }
}

/**
 * Helper function to update tournament registration status
 */
async function updateTournamentRegistrationStatus(registrationId, status) {
  try {
    const updateQuery = `
      UPDATE TournamentRegistrations 
      SET payment_status = ? 
      WHERE registration_id = ?
    `;
    
    await db.query(updateQuery, [status, registrationId]);
    console.log(`Tournament registration ${registrationId} payment status updated to ${status}`);
  } catch (error) {
    console.error(`Error updating tournament registration status: ${error.message}`);
    throw error;
  }
}

/**
 * Get webhook status
 * This is used for debugging webhook issues
 */
const getWebhookStatus = (req, res) => {
  try {
    // Return webhook configuration details
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    res.status(200).json({
      success: true,
      webhook: {
        endpoint: `${req.protocol}://${req.get('host')}/api/v1/payment/webhook`,
        secret: webhookSecret ? 'Configured' : 'Not configured',
        server_configuration: {
          raw_body_parser: true,
          body_parser_skipped: true
        },
        status: webhookSecret ? 'ready' : 'missing webhook secret',
        events: [
          'checkout.session.completed',
          'checkout.session.expired',
          'checkout.session.async_payment_failed',
          'checkout.session.async_payment_succeeded',
          'payment_intent.succeeded',
          'payment_intent.payment_failed'
        ]
      }
    });
  } catch (error) {
    console.error('Error getting webhook status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get webhook status',
      error: error.message
    });
  }
};

/**
 * Clear user's cart after successful payment
 */
async function clearUserCart(user_id) {
  try {
    await db.query('DELETE FROM Cart WHERE user_id = ?', [user_id]);
    console.log(`Cart cleared for user ${user_id}`);
  } catch (error) {
    console.error('Error clearing cart:', error);
  }
}

/**
 * Update event registration status
 */
async function updateEventRegistrationStatus(registration_id, status) {
  try {
    await db.query(
      'UPDATE EventRegistrations SET payment_status = ? WHERE registration_id = ?',
      [status, registration_id]
    );
    console.log(`Event registration ${registration_id} status updated to ${status}`);
  } catch (error) {
    console.error('Error updating event registration status:', error);
  }
}

module.exports = {
  handleStripeWebhook: handleWebhook,
  handleWebhook,
  getWebhookStatus
};
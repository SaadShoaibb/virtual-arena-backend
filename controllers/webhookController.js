require('dotenv').config();
const db = require('../config/db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Stripe Webhook Handler
 * Processes Stripe webhook events, particularly for successful checkout sessions
 */
const handleStripeWebhook = async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    // Get the signature from the headers
    const signature = req.headers['stripe-signature'];
    const payload = req.body;
    
    if (!signature) {
        console.error('No Stripe signature found in webhook request');
        return res.status(400).json({ success: false, message: 'No signature found' });
    }
    
    let event;
    
    try {
        // Verify the event came from Stripe
        event = stripe.webhooks.constructEvent(
            payload,
            signature,
            webhookSecret
        );
        
        // Log the event for debugging
        console.log(`Webhook received: ${event.type}`);
        console.log(`Event ID: ${event.id}`);
        
        // Check if this is a connected account event
        const connectedAccountId = event.account;
        if (connectedAccountId) {
            console.log(`Event from connected account: ${connectedAccountId}`);
            
            // Log the connected account event to the database
            try {
                await db.query(
                    "INSERT INTO ConnectedAccountWebhookEvents (connected_account_id, event_id, event_type, event_data, processed) VALUES (?, ?, ?, ?, ?)",
                    [connectedAccountId, event.id, event.type, JSON.stringify(event.data), false]
                );
            } catch (err) {
                console.error('Error logging connected account event:', err);
                // Continue processing the event even if logging fails
            }
        }
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ success: false, message: 'Invalid signature' });
    }
    
    // Handle the event
    try {
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                console.log('Processing payment_intent.succeeded:', paymentIntent.id);
                await handleSuccessfulPayment(paymentIntent);
                break;
                
            case 'checkout.session.completed':
                const session = event.data.object;
                console.log('Processing checkout.session.completed:', session.id);
                await handleCheckoutSession(session);
                break;
                
            case 'checkout.session.async_payment_succeeded':
                const asyncSuccessSession = event.data.object;
                console.log('Processing checkout.session.async_payment_succeeded:', asyncSuccessSession.id);
                await handleCheckoutSession(asyncSuccessSession);
                break;
                
            case 'checkout.session.async_payment_failed':
                const asyncFailedSession = event.data.object;
                console.log('Processing checkout.session.async_payment_failed:', asyncFailedSession.id);
                await handleFailedCheckoutSession(asyncFailedSession);
                break;
                
            case 'checkout.session.expired':
                const expiredSession = event.data.object;
                console.log('Processing checkout.session.expired:', expiredSession.id);
                await handleExpiredCheckoutSession(expiredSession);
                break;
            
            case 'payment_intent.payment_failed':
                const failedPaymentIntent = event.data.object;
                console.log('Processing payment_intent.payment_failed:', failedPaymentIntent.id);
                await handleFailedPaymentIntent(failedPaymentIntent);
                break;
                
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        
        return res.status(200).json({ success: true, message: 'Webhook processed successfully' });
    } catch (err) {
        console.error('Error processing webhook:', err);
        return res.status(500).json({ success: false, message: 'Error processing webhook' });
    }
};

/**
 * Handle successful payment intent
 */
async function handleSuccessfulPayment(paymentIntent) {
    console.log('Payment Intent Metadata:', JSON.stringify(paymentIntent.metadata, null, 2));
    
    const { user_id, entity_type, entity_id, connected_account_id } = paymentIntent.metadata || {};
    
    if (!user_id || !entity_type || !entity_id) {
        console.error('Missing required metadata in payment intent:', paymentIntent.id);
        return;
    }
    
    // Update payment status in database
    try {
        await db.query(
            "UPDATE Payments SET status = 'succeeded' WHERE payment_intent_id = ?",
            [paymentIntent.id]
        );
        console.log(`Updated payment status for payment_intent_id: ${paymentIntent.id}`);
    } catch (err) {
        console.error('Error updating payment status:', err);
    }
    
    // If this is a connected account payment, update the connected account balance
    if (connected_account_id) {
        try {
            // Get the account balance from Stripe
            const balance = await stripe.balance.retrieve({
                stripeAccount: connected_account_id
            });
            
            // Extract available and pending balances for USD
            const availableBalance = balance.available.find(b => b.currency === 'usd')?.amount || 0;
            const pendingBalance = balance.pending.find(b => b.currency === 'usd')?.amount || 0;
            
            // Update or insert the balance record
            await db.query(
                `INSERT INTO ConnectedAccountBalances (connected_account_id, available_balance, pending_balance, currency) 
                 VALUES (?, ?, ?, 'usd') 
                 ON DUPLICATE KEY UPDATE available_balance = ?, pending_balance = ?, last_updated = CURRENT_TIMESTAMP`,
                [connected_account_id, availableBalance / 100, pendingBalance / 100, availableBalance / 100, pendingBalance / 100]
            );
            console.log(`Updated balance for connected account: ${connected_account_id}`);
        } catch (err) {
            console.error('Error updating connected account balance:', err);
            // Continue processing the payment even if balance update fails
        }
    }
    
    // Handle entity-specific logic based on what was purchased
    try {
        switch (entity_type) {
            case 'order':
                await db.query(
                    "UPDATE Orders SET payment_status = 'completed', status = 'processing' WHERE order_id = ?",
                    [entity_id]
                );
                console.log(`Updated order status for order_id: ${entity_id}`);
                break;
                
            case 'gift_card':
                await db.query(
                    "UPDATE UserGiftCards SET status = 'active' WHERE gift_card_id = ? AND user_id = ?",
                    [entity_id, user_id]
                );
                console.log(`Activated gift card for gift_card_id: ${entity_id}, user_id: ${user_id}`);
                break;
                
            case 'booking':
                await db.query(
                    "UPDATE Bookings SET status = 'confirmed', payment_status = 'paid' WHERE booking_id = ?",
                    [entity_id]
                );
                console.log(`Confirmed booking for booking_id: ${entity_id}`);
                break;
                
            case 'tournament':
                await db.query(
                    "UPDATE TournamentRegistrations SET payment_status = 'paid', status = 'registered' WHERE tournament_id = ? AND user_id = ?",
                    [entity_id, user_id]
                );
                console.log(`Registered user for tournament_id: ${entity_id}, user_id: ${user_id}`);
                break;
                
            case 'product':
                await db.query(
                    "UPDATE ProductOrders SET payment_status = 'completed', status = 'processing' WHERE order_id = ?",
                    [entity_id]
                );
                console.log(`Updated product order status for order_id: ${entity_id}`);
                break;
                
            case 'event':
                await db.query(
                    "UPDATE EventRegistrations SET payment_status = 'paid', status = 'confirmed' WHERE event_id = ? AND user_id = ?",
                    [entity_id, user_id]
                );
                console.log(`Confirmed event registration for event_id: ${entity_id}, user_id: ${user_id}`);
                break;
                
            default:
                console.log(`Unhandled entity type: ${entity_type}`);
        }
    } catch (err) {
        console.error(`Error updating ${entity_type} with ID ${entity_id}:`, err);
    }
}

/**
 * Handle checkout session completed
 */
async function handleCheckoutSession(session) {
    console.log('Checkout Session Data:', JSON.stringify({
        id: session.id,
        payment_status: session.payment_status,
        payment_intent: session.payment_intent,
        metadata: session.metadata
    }, null, 2));
    
    // If you're using Checkout Sessions instead of Payment Intents directly
    if (session.payment_status === 'paid') {
        // Update the database with the checkout session information
        try {
            await db.query(
                "UPDATE Payments SET status = 'succeeded' WHERE checkout_session_id = ?",
                [session.id]
            );
            console.log(`Updated payment status for checkout_session_id: ${session.id}`);
        } catch (err) {
            console.error('Error updating payment status for checkout session:', err);
        }
        
        // Check if there's a payment intent associated with this session
        if (session.payment_intent) {
            try {
                const paymentIntentId = session.payment_intent;
                console.log(`Retrieving payment intent: ${paymentIntentId}`);
                
                // Get the payment intent to access its metadata
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                
                // Process the successful payment using payment intent metadata
                await handleSuccessfulPayment(paymentIntent);
            } catch (err) {
                console.error('Error retrieving or processing payment intent:', err);
            }
        } else {
            // If no payment intent, use the metadata from the session directly
            console.log('No payment intent found, using session metadata directly');
            const { user_id, entity_type, entity_id, connected_account_id } = session.metadata || {};
            
            if (!user_id || !entity_type || !entity_id) {
                console.error('Missing required metadata in checkout session:', session.id);
                return;
            }
            
            // If this is a connected account payment, update the connected account balance
            if (connected_account_id) {
                try {
                    // Get the account balance from Stripe
                    const balance = await stripe.balance.retrieve({
                        stripeAccount: connected_account_id
                    });
                    
                    // Extract available and pending balances for USD
                    const availableBalance = balance.available.find(b => b.currency === 'usd')?.amount || 0;
                    const pendingBalance = balance.pending.find(b => b.currency === 'usd')?.amount || 0;
                    
                    // Update or insert the balance record
                    await db.query(
                        `INSERT INTO ConnectedAccountBalances (connected_account_id, available_balance, pending_balance, currency) 
                         VALUES (?, ?, ?, 'usd') 
                         ON DUPLICATE KEY UPDATE available_balance = ?, pending_balance = ?, last_updated = CURRENT_TIMESTAMP`,
                        [connected_account_id, availableBalance / 100, pendingBalance / 100, availableBalance / 100, pendingBalance / 100]
                    );
                    console.log(`Updated balance for connected account: ${connected_account_id}`);
                } catch (err) {
                    console.error('Error updating connected account balance:', err);
                    // Continue processing the payment even if balance update fails
                }
            }
            
            // Handle entity-specific logic based on what was purchased
            try {
                switch (entity_type) {
                    case 'order':
                        await db.query(
                            "UPDATE Orders SET payment_status = 'completed', status = 'processing' WHERE order_id = ?",
                            [entity_id]
                        );
                        console.log(`Updated order status for order_id: ${entity_id}`);
                        break;
                        
                    case 'gift_card':
                        await db.query(
                            "UPDATE UserGiftCards SET status = 'active' WHERE gift_card_id = ? AND user_id = ?",
                            [entity_id, user_id]
                        );
                        console.log(`Activated gift card for gift_card_id: ${entity_id}, user_id: ${user_id}`);
                        break;
                        
                    case 'booking':
                        await db.query(
                            "UPDATE Bookings SET status = 'confirmed', payment_status = 'paid' WHERE booking_id = ?",
                            [entity_id]
                        );
                        console.log(`Confirmed booking for booking_id: ${entity_id}`);
                        break;
                        
                    case 'tournament':
                        await db.query(
                            "UPDATE TournamentRegistrations SET payment_status = 'paid', status = 'registered' WHERE tournament_id = ? AND user_id = ?",
                            [entity_id, user_id]
                        );
                        console.log(`Registered user for tournament_id: ${entity_id}, user_id: ${user_id}`);
                        break;
                        
                    case 'product':
                        await db.query(
                            "UPDATE ProductOrders SET payment_status = 'completed', status = 'processing' WHERE order_id = ?",
                            [entity_id]
                        );
                        console.log(`Updated product order status for order_id: ${entity_id}`);
                        break;
                        
                    case 'event':
                        await db.query(
                            "UPDATE EventRegistrations SET payment_status = 'paid', status = 'confirmed' WHERE event_id = ? AND user_id = ?",
                            [entity_id, user_id]
                        );
                        console.log(`Confirmed event registration for event_id: ${entity_id}, user_id: ${user_id}`);
                        break;
                        
                    default:
                        console.log(`Unhandled entity type: ${entity_type}`);
                }
            } catch (err) {
                console.error(`Error updating ${entity_type} with ID ${entity_id}:`, err);
            }
        }
    } else {
        console.log(`Checkout session ${session.id} not paid, current status: ${session.payment_status}`);
    }
}

/**
 * Handle failed checkout session
 */
async function handleFailedCheckoutSession(session) {
    console.log('Failed Checkout Session Data:', JSON.stringify({
        id: session.id,
        payment_status: session.payment_status,
        metadata: session.metadata
    }, null, 2));
    
    // Update the payment status in the database
    try {
        await db.query(
            "UPDATE Payments SET status = 'failed' WHERE checkout_session_id = ?",
            [session.id]
        );
        console.log(`Updated payment status to 'failed' for checkout_session_id: ${session.id}`);
    } catch (err) {
        console.error('Error updating payment status for failed checkout session:', err);
    }
    
    // Get the metadata from the session
    const { entity_type, entity_id, user_id } = session.metadata || {};
    
    if (!entity_type || !entity_id) {
        console.error('Missing required metadata in failed checkout session:', session.id);
        return;
    }
    
    // Update the entity status based on the entity type
    try {
        switch (entity_type) {
            case 'order':
                await db.query(
                    "UPDATE Orders SET payment_status = 'failed' WHERE order_id = ?",
                    [entity_id]
                );
                console.log(`Updated order payment status to 'failed' for order_id: ${entity_id}`);
                break;
                
            case 'booking':
                await db.query(
                    "UPDATE Bookings SET status = 'payment_failed', payment_status = 'failed' WHERE booking_id = ?",
                    [entity_id]
                );
                console.log(`Updated booking status to 'payment_failed' for booking_id: ${entity_id}`);
                break;
                
            case 'tournament':
                await db.query(
                    "UPDATE TournamentRegistrations SET payment_status = 'failed', status = 'payment_failed' WHERE tournament_id = ? AND user_id = ?",
                    [entity_id, user_id]
                );
                console.log(`Updated tournament registration status to 'payment_failed' for tournament_id: ${entity_id}, user_id: ${user_id}`);
                break;
                
            case 'product':
                await db.query(
                    "UPDATE ProductOrders SET payment_status = 'failed', status = 'payment_failed' WHERE order_id = ?",
                    [entity_id]
                );
                console.log(`Updated product order status to 'payment_failed' for order_id: ${entity_id}`);
                break;
                
            case 'event':
                await db.query(
                    "UPDATE EventRegistrations SET payment_status = 'failed', status = 'payment_failed' WHERE event_id = ? AND user_id = ?",
                    [entity_id, user_id]
                );
                console.log(`Updated event registration status to 'payment_failed' for event_id: ${entity_id}, user_id: ${user_id}`);
                break;
                
            default:
                console.log(`Unhandled entity type in failed checkout: ${entity_type}`);
        }
    } catch (err) {
        console.error(`Error updating ${entity_type} with ID ${entity_id} after payment failure:`, err);
    }
}

/**
 * Handle expired checkout session
 */
async function handleExpiredCheckoutSession(session) {
    console.log('Expired Checkout Session Data:', JSON.stringify({
        id: session.id,
        payment_status: session.payment_status,
        metadata: session.metadata
    }, null, 2));
    
    // Update the payment status in the database
    try {
        await db.query(
            "UPDATE Payments SET status = 'expired' WHERE checkout_session_id = ?",
            [session.id]
        );
        console.log(`Updated payment status to 'expired' for checkout_session_id: ${session.id}`);
    } catch (err) {
        console.error('Error updating payment status for expired checkout session:', err);
    }
    
    // Get the metadata from the session
    const { entity_type, entity_id, user_id } = session.metadata || {};
    
    if (!entity_type || !entity_id) {
        console.error('Missing required metadata in expired checkout session:', session.id);
        return;
    }
    
    // Update the entity status based on the entity type
    try {
        switch (entity_type) {
            case 'order':
                await db.query(
                    "UPDATE Orders SET payment_status = 'expired' WHERE order_id = ?",
                    [entity_id]
                );
                console.log(`Updated order payment status to 'expired' for order_id: ${entity_id}`);
                break;
                
            case 'booking':
                await db.query(
                    "UPDATE Bookings SET status = 'payment_expired', payment_status = 'expired' WHERE booking_id = ?",
                    [entity_id]
                );
                console.log(`Updated booking status to 'payment_expired' for booking_id: ${entity_id}`);
                break;
                
            case 'tournament':
                await db.query(
                    "UPDATE TournamentRegistrations SET payment_status = 'expired', status = 'payment_expired' WHERE tournament_id = ? AND user_id = ?",
                    [entity_id, user_id]
                );
                console.log(`Updated tournament registration status to 'payment_expired' for tournament_id: ${entity_id}, user_id: ${user_id}`);
                break;
                
            case 'product':
                await db.query(
                    "UPDATE ProductOrders SET payment_status = 'expired', status = 'payment_expired' WHERE order_id = ?",
                    [entity_id]
                );
                console.log(`Updated product order status to 'payment_expired' for order_id: ${entity_id}`);
                break;
                
            case 'event':
                await db.query(
                    "UPDATE EventRegistrations SET payment_status = 'expired', status = 'payment_expired' WHERE event_id = ? AND user_id = ?",
                    [entity_id, user_id]
                );
                console.log(`Updated event registration status to 'payment_expired' for event_id: ${entity_id}, user_id: ${user_id}`);
                break;
                
            default:
                console.log(`Unhandled entity type in expired checkout: ${entity_type}`);
        }
    } catch (err) {
        console.error(`Error updating ${entity_type} with ID ${entity_id} after payment expiration:`, err);
    }
}

/**
 * Handle failed payment intent
 */
async function handleFailedPaymentIntent(paymentIntent) {
    console.log('Failed Payment Intent Data:', JSON.stringify({
        id: paymentIntent.id,
        status: paymentIntent.status,
        metadata: paymentIntent.metadata
    }, null, 2));
    
    // Update the payment status in the database
    try {
        await db.query(
            "UPDATE Payments SET status = 'failed' WHERE payment_intent_id = ?",
            [paymentIntent.id]
        );
        console.log(`Updated payment status to 'failed' for payment_intent_id: ${paymentIntent.id}`);
    } catch (err) {
        console.error('Error updating payment status for failed payment intent:', err);
    }
    
    // Get the metadata from the payment intent
    const { user_id, entity_type, entity_id } = paymentIntent.metadata || {};
    
    if (!user_id || !entity_type || !entity_id) {
        console.error('Missing required metadata in failed payment intent:', paymentIntent.id);
        return;
    }
    
    // Update the entity status based on the entity type
    try {
        switch (entity_type) {
            case 'order':
                await db.query(
                    "UPDATE Orders SET payment_status = 'failed' WHERE order_id = ?",
                    [entity_id]
                );
                console.log(`Updated order payment status to 'failed' for order_id: ${entity_id}`);
                break;
                
            case 'booking':
                await db.query(
                    "UPDATE Bookings SET status = 'payment_failed', payment_status = 'failed' WHERE booking_id = ?",
                    [entity_id]
                );
                console.log(`Updated booking status to 'payment_failed' for booking_id: ${entity_id}`);
                break;
                
            case 'tournament':
                await db.query(
                    "UPDATE TournamentRegistrations SET payment_status = 'failed', status = 'payment_failed' WHERE tournament_id = ? AND user_id = ?",
                    [entity_id, user_id]
                );
                console.log(`Updated tournament registration status to 'payment_failed' for tournament_id: ${entity_id}, user_id: ${user_id}`);
                break;
                
            case 'product':
                await db.query(
                    "UPDATE ProductOrders SET payment_status = 'failed', status = 'payment_failed' WHERE order_id = ?",
                    [entity_id]
                );
                console.log(`Updated product order status to 'payment_failed' for order_id: ${entity_id}`);
                break;
                
            case 'event':
                await db.query(
                    "UPDATE EventRegistrations SET payment_status = 'failed', status = 'payment_failed' WHERE event_id = ? AND user_id = ?",
                    [entity_id, user_id]
                );
                console.log(`Updated event registration status to 'payment_failed' for event_id: ${entity_id}, user_id: ${user_id}`);
                break;
                
            default:
                console.log(`Unhandled entity type in failed payment intent: ${entity_type}`);
        }
    } catch (err) {
        console.error(`Error updating ${entity_type} with ID ${entity_id} after payment failure:`, err);
    }
}

module.exports = {
    handleStripeWebhook
};
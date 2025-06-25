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
                await handleSuccessfulPayment(paymentIntent);
                break;
                
            case 'checkout.session.completed':
                const session = event.data.object;
                await handleCheckoutSession(session);
                break;
                
            case 'checkout.session.async_payment_succeeded':
                const asyncSuccessSession = event.data.object;
                console.log('Async payment succeeded for session:', asyncSuccessSession.id);
                await handleCheckoutSession(asyncSuccessSession);
                break;
                
            case 'checkout.session.async_payment_failed':
                const asyncFailedSession = event.data.object;
                console.log('Async payment failed for session:', asyncFailedSession.id);
                await handleFailedCheckoutSession(asyncFailedSession);
                break;
                
            case 'checkout.session.expired':
                const expiredSession = event.data.object;
                console.log('Checkout session expired:', expiredSession.id);
                await handleExpiredCheckoutSession(expiredSession);
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
    const { user_id, entity_type, entity_id, connected_account_id } = paymentIntent.metadata;
    
    // Update payment status in database
    await db.query(
        "UPDATE Payments SET status = 'succeeded' WHERE payment_intent_id = ?",
        [paymentIntent.id]
    );
    
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
        } catch (err) {
            console.error('Error updating connected account balance:', err);
            // Continue processing the payment even if balance update fails
        }
    }
    
    // Handle entity-specific logic based on what was purchased
    switch (entity_type) {
        case 'order':
            await db.query(
                "UPDATE Orders SET payment_status = 'completed', status = 'processing' WHERE order_id = ?",
                [entity_id]
            );
            break;
            
        case 'gift_card':
            await db.query(
                "UPDATE UserGiftCards SET status = 'active' WHERE gift_card_id = ? AND user_id = ?",
                [entity_id, user_id]
            );
            break;
            
        case 'booking':
            await db.query(
                "UPDATE Bookings SET status = 'confirmed', payment_status = 'paid' WHERE booking_id = ?",
                [entity_id]
            );
            break;
            
        case 'tournament':
            await db.query(
                "UPDATE TournamentRegistrations SET payment_status = 'paid', status = 'registered' WHERE tournament_id = ? AND user_id = ?",
                [entity_id, user_id]
            );
            break;
            
        default:
            console.log(`Unhandled entity type: ${entity_type}`);
    }
}

/**
 * Handle checkout session completed
 */
async function handleCheckoutSession(session) {
    // If you're using Checkout Sessions instead of Payment Intents directly
    if (session.payment_status === 'paid') {
        // Update the database with the checkout session information
        await db.query(
            "UPDATE Payments SET status = 'succeeded' WHERE checkout_session_id = ?",
            [session.id]
        );
        
        // Check if there's a payment intent associated with this session
        if (session.payment_intent) {
            const paymentIntentId = session.payment_intent;
            
            // Get the payment intent to access its metadata
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            
            // Process the successful payment using payment intent metadata
            await handleSuccessfulPayment(paymentIntent);
        } else {
            // If no payment intent, use the metadata from the session directly
            const { user_id, entity_type, entity_id, connected_account_id } = session.metadata;
            
            if (!user_id || !entity_type || !entity_id) {
                console.error('Missing metadata in checkout session:', session.id);
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
                } catch (err) {
                    console.error('Error updating connected account balance:', err);
                    // Continue processing the payment even if balance update fails
                }
            }
            
            // Handle entity-specific logic based on what was purchased
            switch (entity_type) {
                case 'order':
                    await db.query(
                        "UPDATE Orders SET payment_status = 'completed', status = 'processing' WHERE order_id = ?",
                        [entity_id]
                    );
                    break;
                    
                case 'gift_card':
                    await db.query(
                        "UPDATE UserGiftCards SET status = 'active' WHERE gift_card_id = ? AND user_id = ?",
                        [entity_id, user_id]
                    );
                    break;
                    
                case 'booking':
                    await db.query(
                        "UPDATE Bookings SET status = 'confirmed', payment_status = 'paid' WHERE booking_id = ?",
                        [entity_id]
                    );
                    break;
                    
                case 'tournament':
                    await db.query(
                        "UPDATE TournamentRegistrations SET payment_status = 'paid', status = 'registered' WHERE tournament_id = ? AND user_id = ?",
                        [entity_id, user_id]
                    );
                    break;
                    
                default:
                    console.log(`Unhandled entity type: ${entity_type}`);
            }
        }
    }
}

/**
 * Handle failed checkout session
 */
async function handleFailedCheckoutSession(session) {
    try {
        // Update the payment status to failed in the database
        await db.query(
            "UPDATE Payments SET status = 'failed' WHERE checkout_session_id = ?",
            [session.id]
        );
        
        // If there's metadata, we can update the related entity status
        const { user_id, entity_type, entity_id } = session.metadata || {};
        
        if (user_id && entity_type && entity_id) {
            // Handle entity-specific logic based on what was attempted to be purchased
            switch (entity_type) {
                case 'order':
                    await db.query(
                        "UPDATE Orders SET payment_status = 'failed' WHERE order_id = ?",
                        [entity_id]
                    );
                    break;
                    
                case 'booking':
                    await db.query(
                        "UPDATE Bookings SET payment_status = 'failed' WHERE booking_id = ?",
                        [entity_id]
                    );
                    break;
                    
                case 'tournament':
                    await db.query(
                        "UPDATE TournamentRegistrations SET payment_status = 'failed' WHERE tournament_id = ? AND user_id = ?",
                        [entity_id, user_id]
                    );
                    break;
                    
                default:
                    console.log(`Unhandled entity type for failed payment: ${entity_type}`);
            }
        }
    } catch (error) {
        console.error('Error handling failed checkout session:', error);
    }
}

/**
 * Handle expired checkout session
 */
async function handleExpiredCheckoutSession(session) {
    try {
        // Update the payment status to expired in the database
        await db.query(
            "UPDATE Payments SET status = 'expired' WHERE checkout_session_id = ?",
            [session.id]
        );
        
        // If there's metadata, we can update the related entity status
        const { user_id, entity_type, entity_id } = session.metadata || {};
        
        if (user_id && entity_type && entity_id) {
            // Handle entity-specific logic based on what was attempted to be purchased
            switch (entity_type) {
                case 'order':
                    await db.query(
                        "UPDATE Orders SET payment_status = 'expired' WHERE order_id = ?",
                        [entity_id]
                    );
                    break;
                    
                case 'booking':
                    await db.query(
                        "UPDATE Bookings SET payment_status = 'expired' WHERE booking_id = ?",
                        [entity_id]
                    );
                    break;
                    
                case 'tournament':
                    await db.query(
                        "UPDATE TournamentRegistrations SET payment_status = 'expired' WHERE tournament_id = ? AND user_id = ?",
                        [entity_id, user_id]
                    );
                    break;
                    
                default:
                    console.log(`Unhandled entity type for expired payment: ${entity_type}`);
            }
        }
    } catch (error) {
        console.error('Error handling expired checkout session:', error);
    }
}

module.exports = {
    handleStripeWebhook
};
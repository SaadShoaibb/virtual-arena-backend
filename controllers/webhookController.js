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
    const { user_id, entity_type, entity_id } = paymentIntent.metadata;
    
    // Update payment status in database
    await db.query(
        "UPDATE Payments SET status = 'succeeded' WHERE payment_intent_id = ?",
        [paymentIntent.id]
    );
    
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
            const { user_id, entity_type, entity_id } = session.metadata;
            
            if (!user_id || !entity_type || !entity_id) {
                console.error('Missing metadata in checkout session:', session.id);
                return;
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

module.exports = {
    handleStripeWebhook
};
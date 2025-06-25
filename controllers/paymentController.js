require('dotenv').config(); // Load environment variables from .env
const db = require('../config/db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Use Stripe secret key from .env

// Create a Stripe Payment Intent
const createPaymentIntent = async (req, res) => {
    try {
        const { user_id, entity_type, entity_id, amount, connected_account_id } = req.body;

        // Validate input
        if (!user_id || !entity_type || !entity_id || !amount) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Get user information for better metadata (if available)
        let userEmail = 'customer@example.com';
        let userName = 'Customer';
        try {
            const [userRows] = await db.query(
                "SELECT email, username, full_name FROM Users WHERE user_id = ?",
                [user_id]
            );
            if (userRows.length > 0) {
                userEmail = userRows[0].email || userEmail;
                userName = userRows[0].full_name || userRows[0].username || userName;
            }
        } catch (err) {
            console.log('Could not fetch user details:', err);
            // Continue with default values if user details can't be fetched
        }

        // Create payment intent options
        const paymentIntentOptions = {
            amount: Math.round(amount * 100), // Convert to cents and ensure it's an integer
            currency: 'usd',
            metadata: { 
                user_id, 
                entity_type, 
                entity_id,
                user_email: userEmail,
                user_name: userName,
                connected_account_id: connected_account_id || null
            },
            receipt_email: userEmail, // Send receipt email
            description: `Payment for ${entity_type} #${entity_id}`,
        };
        
        // If connected account is provided, add application fee and transfer data
        if (connected_account_id) {
            // Calculate application fee amount (e.g., 10% of the total)
            const applicationFeeAmount = Math.round(amount * 100 * 0.1); // 10% fee in cents
            
            paymentIntentOptions.application_fee_amount = applicationFeeAmount;
            paymentIntentOptions.transfer_data = {
                destination: connected_account_id,
            };
        }
        
        // Create a Stripe Payment Intent with enhanced metadata
        const paymentIntent = await stripe.paymentIntents.create(paymentIntentOptions);

        // Save the payment intent to the database
        await db.query(
            "INSERT INTO Payments (user_id, entity_type, entity_id, payment_intent_id, amount, currency, status, connected_account_id) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
            [user_id, entity_type, entity_id, paymentIntent.id, amount, 'usd', connected_account_id || null]
        );

        // Return the client secret to the frontend
        res.status(200).json({ 
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });
    } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Confirm Payment (Dummy Data)
const confirmPayment = async (req, res) => {
    try {
        const { payment_intent_id, entity_type, entity_id, user_id } = req.body;

        // Simulate payment success (for testing)
        await db.query(
            "UPDATE Payments SET status = 'succeeded' WHERE payment_intent_id = ?",
            [payment_intent_id]
        );

        // Handle entity-specific logic (dummy data for testing)
        switch (entity_type) {
            case 'gift_card':
                await db.query(
                    "INSERT INTO UserGiftCards (user_id, gift_card_id, remaining_balance) VALUES (?, ?, ?)",
                    [user_id, entity_id, 100] // Dummy balance
                );
                break;

            case 'order':
                await db.query(
                    "UPDATE Orders SET status = 'paid' WHERE order_id = ?",
                    [entity_id]
                );
                break;

            case 'booking':
                await db.query(
                    "UPDATE Bookings SET status = 'confirmed' WHERE booking_id = ?",
                    [entity_id]
                );
                break;

            case 'ticket':
                await db.query(
                    "INSERT INTO UserTickets (user_id, ticket_id) VALUES (?, ?)",
                    [user_id, entity_id]
                );
                break;

            default:
                console.warn(`Unhandled entity type: ${entity_type}`);
        }

        res.status(200).json({ message: "Payment confirmed successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Get Payment Details
// Get All Payment Details (Admin)
const getPaymentDetails = async (req, res) => {
    try {
        // Fetch all payments from the database
        const [payments] = await db.query(`
            SELECT * FROM Payments
        `);

        if (!payments.length) {
            return res.status(404).json({ message: "No payments found" });
        }

        // Fetch additional details from Stripe for each payment
        const paymentDetails = await Promise.all(
            payments.map(async (payment) => {
                const stripePayment = await stripe.paymentIntents.retrieve(payment.payment_intent_id);
                return {
                    ...payment,
                    stripe_payment_status: stripePayment.status,
                    stripe_payment_amount: stripePayment.amount / 100, // Convert back to dollars
                    stripe_payment_currency: stripePayment.currency,
                };
            })
        );

        res.status(200).json({
            success: true,
            message: "All payment details retrieved successfully",
            payments: paymentDetails,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

// Create a Stripe Checkout Session
const createCheckoutSession = async (req, res) => {
    try {
        const { user_id, entity_type, entity_id, amount, connected_account_id } = req.body;

        // Validate input
        if (!user_id || !entity_type || !entity_id || !amount) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Get user information
        let userEmail = 'customer@example.com';
        let userName = 'Customer';
        try {
            const [userRows] = await db.query(
                "SELECT email, username, full_name FROM Users WHERE user_id = ?",
                [user_id]
            );
            if (userRows.length > 0) {
                userEmail = userRows[0].email || userEmail;
                userName = userRows[0].full_name || userRows[0].username || userName;
            }
        } catch (err) {
            console.log('Could not fetch user details:', err);
            // Continue with default values if user details can't be fetched
        }

        // Create line items based on entity type
        let lineItems = [];
        
        if (entity_type === 'order') {
            // For orders, get cart items
            const [cartItems] = await db.query(
                'SELECT ci.*, p.name, p.price FROM CartItems ci JOIN Products p ON ci.product_id = p.id WHERE ci.user_id = ?',
                [user_id]
            );
            
            if (!cartItems || cartItems.length === 0) {
                return res.status(400).json({ message: 'No items in cart' });
            }
            
            // Create line items for each product
            lineItems = cartItems.map(item => ({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: item.name,
                    },
                    unit_amount: Math.round(item.price * 100), // Convert to cents
                },
                quantity: item.quantity,
            }));
        } else {
            // For other entity types, create a single line item
            lineItems = [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `Payment for ${entity_type} #${entity_id}`,
                        },
                        unit_amount: Math.round(amount * 100), // Convert to cents
                    },
                    quantity: 1,
                },
            ];
        }

        // Create checkout session options
        const sessionOptions = {
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout?canceled=true`,
            customer_email: userEmail,
            metadata: {
                user_id,
                entity_id,
                entity_type,
                user_name: userName,
                connected_account_id: connected_account_id || null,
                created_at: new Date().toISOString()
            },
            // Ensure we get a payment_intent object with the checkout session
            payment_intent_data: {
                metadata: {
                    user_id,
                    entity_id,
                    entity_type,
                    user_name: userName,
                    connected_account_id: connected_account_id || null
                }
            }
        };
        
        // If connected account is provided, add application fee and transfer data
        if (connected_account_id) {
            // Calculate application fee amount (e.g., 10% of the total)
            const applicationFeeAmount = Math.round(amount * 100 * 0.1); // 10% fee in cents
            
            sessionOptions.payment_intent_data = {
                application_fee_amount: applicationFeeAmount,
                transfer_data: {
                    destination: connected_account_id,
                },
            };
        }
        
        // Create a checkout session
        const session = await stripe.checkout.sessions.create(sessionOptions);

        // Save the checkout session to the database
        await db.query(
            "INSERT INTO Payments (user_id, entity_type, entity_id, payment_intent_id, checkout_session_id, amount, currency, status, connected_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
            [user_id, entity_type, entity_id, null, session.id, amount, 'usd', connected_account_id || null]
        );

        res.status(200).json({
            sessionId: session.id
        });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        
        // Provide more detailed error information
        let errorMessage = "Internal Server Error";
        let statusCode = 500;
        
        if (error.type) {
            // This is a Stripe error
            console.error('Stripe error type:', error.type);
            
            switch (error.type) {
                case 'StripeCardError':
                    // Card was declined
                    errorMessage = error.message || 'Your card was declined';
                    statusCode = 400;
                    break;
                case 'StripeInvalidRequestError':
                    // Invalid parameters were supplied to Stripe's API
                    errorMessage = error.message || 'Invalid payment information';
                    statusCode = 400;
                    break;
                case 'StripeAPIError':
                    // An error occurred internally with Stripe's API
                    errorMessage = 'Payment processing error';
                    statusCode = 500;
                    break;
                case 'StripeConnectionError':
                    // Some kind of error occurred during the HTTPS communication
                    errorMessage = 'Payment service connection error';
                    statusCode = 503;
                    break;
                case 'StripeAuthenticationError':
                    // Authentication with Stripe's API failed
                    errorMessage = 'Payment service authentication error';
                    statusCode = 500;
                    break;
                case 'StripeRateLimitError':
                    // Too many requests made to the API too quickly
                    errorMessage = 'Payment service temporarily unavailable';
                    statusCode = 429;
                    break;
                default:
                    errorMessage = error.message || 'Payment processing error';
                    statusCode = 500;
            }
        }
        
        res.status(statusCode).json({ 
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    createPaymentIntent,
    confirmPayment,
    getPaymentDetails,
    createCheckoutSession
};
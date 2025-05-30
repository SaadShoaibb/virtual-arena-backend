require('dotenv').config(); // Load environment variables from .env
const db = require('../config/db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Use Stripe secret key from .env

// Create a Stripe Payment Intent
const createPaymentIntent = async (req, res) => {
    try {
        const { user_id, entity_type, entity_id, amount } = req.body;

        // Validate input
        if (!user_id || !entity_type || !entity_id || !amount) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Create a Stripe Payment Intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Convert to cents
            currency: 'usd',
            metadata: { user_id, entity_type, entity_id },
        });

        // Save the payment intent to the database (dummy data for testing)
        await db.query(
            "INSERT INTO Payments (user_id, entity_type, entity_id, payment_intent_id, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
            [user_id, entity_type, entity_id, paymentIntent.id, amount, 'usd']
        );

        res.status(200).json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error(error);
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

module.exports = {
    createPaymentIntent,
    confirmPayment,
    getPaymentDetails
};
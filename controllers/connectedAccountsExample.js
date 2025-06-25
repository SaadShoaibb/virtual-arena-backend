/**
 * Example implementation for Stripe Connected Accounts
 * 
 * This file demonstrates how to modify your existing payment controllers
 * to support Stripe Connected Accounts, allowing clients to receive payments directly.
 */

require('dotenv').config();
const db = require('../config/db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Create a checkout session that pays out to a connected account
 */
const createConnectedAccountCheckoutSession = async (req, res) => {
    try {
        const { user_id, entity_type, entity_id, amount, connected_account_id } = req.body;

        // Validate input
        if (!user_id || !entity_type || !entity_id || !amount || !connected_account_id) {
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

        // Calculate application fee amount (e.g., 10% of the total)
        // You can adjust this based on your business model
        const applicationFeeAmount = Math.round(amount * 100 * 0.1); // 10% fee in cents

        // Create a checkout session for the connected account
        const session = await stripe.checkout.sessions.create({
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
                connected_account_id
            },
            payment_intent_data: {
                application_fee_amount: applicationFeeAmount,
                transfer_data: {
                    destination: connected_account_id,
                },
            },
            // Specify the connected account
            stripe_account: connected_account_id
        });

        // Save the checkout session to the database
        await db.query(
            "INSERT INTO Payments (user_id, entity_type, entity_id, payment_intent_id, checkout_session_id, amount, currency, status, connected_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
            [user_id, entity_type, entity_id, null, session.id, amount, 'usd', connected_account_id]
        );

        res.status(200).json({
            sessionId: session.id
        });
    } catch (error) {
        console.error('Error creating connected account checkout session:', error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * Create a direct charge payment intent for a connected account
 */
const createConnectedAccountPaymentIntent = async (req, res) => {
    try {
        const { user_id, entity_type, entity_id, amount, connected_account_id } = req.body;

        // Validate input
        if (!user_id || !entity_type || !entity_id || !amount || !connected_account_id) {
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

        // Calculate application fee amount (e.g., 10% of the total)
        const applicationFeeAmount = Math.round(amount * 100 * 0.1); // 10% fee in cents

        // Create a Stripe Payment Intent with enhanced metadata for the connected account
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents and ensure it's an integer
            currency: 'usd',
            application_fee_amount: applicationFeeAmount,
            transfer_data: {
                destination: connected_account_id,
            },
            metadata: { 
                user_id, 
                entity_type, 
                entity_id,
                user_email: userEmail,
                user_name: userName,
                connected_account_id
            },
            receipt_email: userEmail, // Send receipt email
            description: `Payment for ${entity_type} #${entity_id}`,
        }, {
            stripeAccount: connected_account_id // Specify the connected account
        });

        // Save the payment intent to the database
        await db.query(
            "INSERT INTO Payments (user_id, entity_type, entity_id, payment_intent_id, amount, currency, status, connected_account_id) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
            [user_id, entity_type, entity_id, paymentIntent.id, amount, 'usd', connected_account_id]
        );

        // Return the client secret to the frontend
        res.status(200).json({ 
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });
    } catch (error) {
        console.error('Error creating connected account payment intent:', error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * List all connected accounts for the platform
 */
const listConnectedAccounts = async (req, res) => {
    try {
        const accounts = await stripe.accounts.list({
            limit: 100,
        });

        res.status(200).json({
            success: true,
            accounts: accounts.data
        });
    } catch (error) {
        console.error('Error listing connected accounts:', error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

/**
 * Create a new connected account (Express account type)
 */
const createConnectedAccount = async (req, res) => {
    try {
        const { email, name, business_type = 'individual' } = req.body;

        // Create a new Express connected account
        const account = await stripe.accounts.create({
            type: 'express',
            country: 'US', // Change as needed
            email: email,
            business_type: business_type,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
            business_profile: {
                name: name,
                url: process.env.FRONTEND_URL || 'http://localhost:3000',
            },
        });

        // Create an account link for onboarding
        const accountLink = await stripe.accountLinks.create({
            account: account.id,
            refresh_url: `${process.env.FRONTEND_URL}/account/reauth`,
            return_url: `${process.env.FRONTEND_URL}/account/return`,
            type: 'account_onboarding',
        });

        // Save the connected account to your database
        await db.query(
            "INSERT INTO ConnectedAccounts (account_id, email, name, status) VALUES (?, ?, ?, 'pending')",
            [account.id, email, name]
        );

        res.status(200).json({
            success: true,
            account_id: account.id,
            onboarding_url: accountLink.url
        });
    } catch (error) {
        console.error('Error creating connected account:', error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

module.exports = {
    createConnectedAccountCheckoutSession,
    createConnectedAccountPaymentIntent,
    listConnectedAccounts,
    createConnectedAccount
};
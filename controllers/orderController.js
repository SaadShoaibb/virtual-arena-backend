const db = require('../config/db');
const { sendNotification, sendAdminNotification } = require('../services/services');
const Pusher = require("pusher");

const pusher = new Pusher({
    appId: "1960022",
    key: "a230b3384874418b8baa",
    secret: "3d633a30352f120f0cc6",
    cluster: "ap2",
    useTLS: true
});
const createOrderWithItems = async (req, res) => {
    const { total_amount, status, items, shipping_cost, shipping_address, payment_method, payment_status } = req.body;
    // Make sure we have the correct user_id from the authenticated user
    const user_id = req.user.user_id || req.user.id; // Support both formats for backward compatibility

    // Validate required fields with detailed error messages
    console.log('Create order request data:', { user_id, total_amount, shipping_cost, items, shipping_address, payment_method, payment_status });

    if (!user_id) {
        console.log('Missing user_id');
        return res.status(400).json({ success: false, message: 'Missing user_id' });
    }
    if (!total_amount) {
        console.log('Missing total_amount');
        return res.status(400).json({ success: false, message: 'Missing total_amount' });
    }
    if (shipping_cost === undefined || shipping_cost === null) {
        console.log('Missing shipping_cost');
        return res.status(400).json({ success: false, message: 'Missing shipping_cost' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
        console.log('Missing or invalid items');
        return res.status(400).json({ success: false, message: 'Missing or invalid items' });
    }
    if (!shipping_address) {
        console.log('Missing shipping_address');
        return res.status(400).json({ success: false, message: 'Missing shipping_address' });
    }

    // Validate shipping address fields before starting transaction
    const { full_name, address, city, state, zip_code, country } = shipping_address;
    if (!full_name || !address || !city || !state || !zip_code || !country) {
        console.log('Missing shipping address fields:', { full_name, address, city, state, zip_code, country });
        return res.status(400).json({ success: false, message: 'Missing required shipping address fields' });
    }

    try {
        // Start a database transaction
        await db.query('START TRANSACTION');

        // Step 1: Create the shipping address

        const [addressResult] = await db.query(
            `INSERT INTO ShippingAddresses (user_id, full_name, address, city, state, zip_code, country)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user_id, full_name, address, city, state, zip_code, country]
        );
        const shippingAddressId = addressResult.insertId;

        // Step 2: Create the order
        const [orderResult] = await db.query(
            `INSERT INTO Orders (user_id, total_amount, shipping_cost, status, payment_method, payment_status, shipping_address_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user_id, total_amount, shipping_cost, status || 'pending', payment_method || 'cod', payment_status || 'pending', shippingAddressId] // Default status is 'pending'
        );
        const orderId = orderResult.insertId;

        // Step 3: Add order items and process tournament/event registrations if payment is complete
        const tournamentRegistrations = [];
        const eventRegistrations = [];

        for (const item of items) {
            const { product_id, tournament_id, event_id, quantity, price, item_type, payment_option } = item;

            if (item_type === 'tournament') {
                // Handle tournament item
                if (!tournament_id || !quantity || !price) {
                    // Rollback the transaction if any item is invalid
                    await db.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: 'Invalid tournament item data' });
                }

                // Insert the order item for tournament
                await db.query(
                    `INSERT INTO OrderItems (order_id, tournament_id, quantity, price, item_type) 
                     VALUES (?, ?, ?, ?, 'tournament')`,
                    [orderId, tournament_id, quantity, price]
                );

                // If payment is complete, add to tournament registrations to process later
                if (payment_status === 'completed') {
                    tournamentRegistrations.push({
                        tournament_id,
                        user_id,
                        payment_option: payment_option || 'online' // Default to online if not specified
                    });
                }
            } else if (item_type === 'event') {
                // Handle event item
                if (!event_id || !quantity || !price) {
                    // Rollback the transaction if any item is invalid
                    await db.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: 'Invalid event item data' });
                }

                // Insert the order item for event
                await db.query(
                    `INSERT INTO OrderItems (order_id, event_id, quantity, price, item_type)
                     VALUES (?, ?, ?, ?, 'event')`,
                    [orderId, event_id, quantity, price]
                );

                // If payment is complete, add to event registrations to process later
                if (payment_status === 'completed') {
                    eventRegistrations.push({
                        event_id,
                        user_id,
                        payment_option: payment_option || 'online' // Default to online if not specified
                    });
                }
            } else {
                // Handle regular product item
                if (!product_id || !quantity || !price) {
                    // Rollback the transaction if any item is invalid
                    await db.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: 'Invalid order item data' });
                }

                // Insert the order item for product
                await db.query(
                    `INSERT INTO OrderItems (order_id, product_id, quantity, price, item_type) 
                     VALUES (?, ?, ?, ?, 'product')`,
                    [orderId, product_id, quantity, price]
                );
            }
        }

        // Step 4: Process tournament and event registrations if payment is complete
        if (payment_status === 'completed') {
            // Process tournament registrations
            for (const registration of tournamentRegistrations) {
                // Register the user for the tournament
                await db.query(
                    `INSERT INTO TournamentRegistrations (user_id, tournament_id, status, payment_status, payment_option)
                     VALUES (?, ?, 'registered', 'paid', ?)`,
                    [registration.user_id, registration.tournament_id, registration.payment_option || 'online']
                );

                // Send notification for tournament registration
                await sendNotification(
                    user_id,
                    'booking_confirmation',
                    'Tournament Registration',
                    'You have been registered for the tournament.',
                    'email',
                    `/tournaments?tournament_id=${registration.tournament_id}`
                );

                // Send notification to admin for tournament registration
                await sendAdminNotification(
                    'booking_confirmation',
                    'Tournament Registration',
                    `A new tournament registration has been made by user ${user_id}.`,
                    'email',
                    `/tournaments/all-tournaments?tournament_id=${registration.tournament_id}`
                );

                // Trigger Pusher event for tournament registration
                pusher.trigger('my-channel', 'my-event', {
                    message: 'Registered For tournament',
                    tournamentId: registration.tournament_id,
                    userId: user_id
                });
            }

            // Process event registrations
            for (const registration of eventRegistrations) {
                // Register the user for the event
                await db.query(
                    `INSERT INTO EventRegistrations (user_id, event_id, status, payment_status, payment_option)
                     VALUES (?, ?, 'registered', 'paid', ?)`,
                    [registration.user_id, registration.event_id, registration.payment_option || 'online']
                );

                // Send notification for event registration
                await sendNotification(
                    user_id,
                    'booking_confirmation',
                    'Event Registration',
                    'You have been registered for the event.',
                    'email',
                    `/events?event_id=${registration.event_id}`
                );

                // Send notification to admin for event registration
                await sendAdminNotification(
                    'booking_confirmation',
                    'Event Registration',
                    `A new event registration has been made by user ${user_id}.`,
                    'email',
                    `/events/all-events?event_id=${registration.event_id}`
                );

                // Trigger Pusher event for event registration
                pusher.trigger('my-channel', 'my-event', {
                    message: 'Registered For event',
                    eventId: registration.event_id,
                    userId: user_id
                });
            }
        }

        // Step 5: Send notification to user for order
        await sendNotification(
            user_id, // User ID
            'booking_confirmation', // Notification type
            'Order Confirmation', // Subject
            'Your order has been confirmed.', // Message
            'email', // Delivery method
            `/orders?order_id=${orderId}` // Link
        );

        // Step 6: Send notification to admin for order
        await sendAdminNotification(
            'booking_confirmation', // Notification type
            'New Order', // Subject
            `A new order has been made by user ${user_id}.`, // Message
            'email', // Delivery method
            `/orders?order_id=${orderId}` // Link
        );

        // Step 7: Trigger Pusher event for order
        pusher.trigger('my-channel', 'my-event', {
            message: 'New order created',
            orderId: orderId,
            userId: user_id
        });

        // Commit the transaction
        await db.query('COMMIT');

        res.status(201).json({ success: true, message: 'Order and items created successfully', orderId, order_id: orderId });
    } catch (err) {
        // Rollback the transaction in case of an error
        await db.query('ROLLBACK');
        console.error('Error creating order with items:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

const getAllOrders = async (req, res) => {
    try {
        // Query to fetch all orders including guest orders with user, item, and shipping address details
        const [orders] = await db.query(`
            SELECT
                Orders.order_id,
                Orders.total_amount,
                Orders.status,
                Orders.payment_method,
                Orders.payment_status,
                Orders.shipping_cost,
                Orders.created_at AS order_created_at,
                -- Guest order fields
                Orders.guest_name,
                Orders.guest_email,
                Orders.guest_phone,
                Orders.is_guest_order,
                Orders.order_reference,
                -- User fields (NULL for guest orders)
                Users.user_id,
                Users.name AS user_name,
                Users.email AS user_email,
                -- Shipping address fields
                ShippingAddresses.shipping_address_id,
                ShippingAddresses.full_name AS shipping_full_name,
                ShippingAddresses.address AS shipping_address,
                ShippingAddresses.city AS shipping_city,
                ShippingAddresses.state AS shipping_state,
                ShippingAddresses.zip_code AS shipping_zip_code,
                ShippingAddresses.country AS shipping_country,
                -- Order items
                OrderItems.order_item_id,
                OrderItems.quantity,
                OrderItems.price AS item_price,
                -- Product details
                Products.product_id,
                Products.name AS product_name,
                Products.description AS product_description,
                Products.original_price,
                Products.discount_price,
                Products.discount,
                Products.shipping_info,
                Products.color,
                Products.size,
                Products.stock,
                Products.is_active
            FROM Orders
            LEFT JOIN Users ON Orders.user_id = Users.user_id
            LEFT JOIN ShippingAddresses ON Orders.shipping_address_id = ShippingAddresses.shipping_address_id
            INNER JOIN OrderItems ON Orders.order_id = OrderItems.order_id
            INNER JOIN Products ON OrderItems.product_id = Products.product_id
            ORDER BY Orders.created_at DESC;
        `);

        // Group orders and their items
        const groupedOrders = orders.reduce((acc, row) => {
            const orderId = row.order_id;

            // If the order doesn't exist in the accumulator, add it
            if (!acc[orderId]) {
                acc[orderId] = {
                    order_id: row.order_id,
                    total_amount: row.total_amount,
                    status: row.status,
                    payment_method: row.payment_method || 'online', // Include payment method with fallback
                    payment_status: row.payment_status, // Include payment status
                    shipping_cost: row.shipping_cost, // Include shipping cost
                    created_at: row.order_created_at,
                    // Guest order fields
                    is_guest_order: row.is_guest_order || false,
                    guest_name: row.guest_name,
                    guest_email: row.guest_email,
                    guest_phone: row.guest_phone,
                    order_reference: row.order_reference,
                    // User data (will be null for guest orders)
                    user: row.user_id ? {
                        user_id: row.user_id,
                        name: row.user_name,
                        email: row.user_email,
                    } : null,
                    // Shipping address (may be null for guest orders)
                    shipping_address: row.shipping_address_id ? {
                        shipping_address_id: row.shipping_address_id,
                        full_name: row.shipping_full_name,
                        address: row.shipping_address,
                        city: row.shipping_city,
                        state: row.shipping_state,
                        zip_code: row.shipping_zip_code,
                        country: row.shipping_country,
                    } : null,
                    items: [],
                };
            }

            // Add the product details to the order's items
            acc[orderId].items.push({
                order_item_id: row.order_item_id,
                product_id: row.product_id,
                product_name: row.product_name,
                description: row.product_description,
                original_price: row.original_price,
                discount_price: row.discount_price,
                discount: row.discount,
                shipping_info: row.shipping_info,
                color: row.color,
                size: row.size,
                stock: row.stock,
                is_active: row.is_active,
                quantity: row.quantity,
                item_price: row.item_price,
            });

            return acc;
        }, {});

        // Convert the grouped orders object into an array
        const result = Object.values(groupedOrders);

        res.status(200).json({ success: true, orders: result });
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

const getOrderById = async (req, res) => {
    const { order_id } = req.params;
    try {
        const [order] = await db.query('SELECT * FROM Orders WHERE order_id = ?', [order_id]);
        if (order.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        res.status(200).json(order[0]);
    } catch (err) {
        console.error('Error fetching order:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

const getOrdersByUserId = async (req, res) => {
    // Make sure we have the correct user_id from the authenticated user
    const user_id = req.user.user_id || req.user.id; // Support both formats for backward compatibility
    try {
        const [orders] = await db.query('SELECT * FROM Orders WHERE user_id = ?', [user_id]);
        res.status(200).json(orders);
    } catch (err) {
        console.error('Error fetching orders:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};


const updateOrderStatus = async (req, res) => {
    const { order_id } = req.params;
    const { status } = req.body;

    try {
        // Update the order status
        await db.query(
            `UPDATE Orders SET status = ? WHERE order_id = ?`,
            [status, order_id]
        );

        // Fetch the user_id associated with the order
        const [order] = await db.query(
            `SELECT user_id FROM Orders WHERE order_id = ?`,
            [order_id]
        );
        const user_id = order[0].user_id;

        // Determine the notification message based on the status
        let userMessage, adminMessage, notificationType;

        switch (status) {
            case 'processing':
                userMessage = 'Your order is now being processed.';
                adminMessage = `Order ${order_id} is now being processed.`;
                notificationType = 'booking_confirmation';
                break;
            case 'shipped':
                userMessage = 'Your order has been shipped.';
                adminMessage = `Order ${order_id} has been shipped.`;
                notificationType = 'booking_confirmation';
                break;
            case 'delivered':
                userMessage = 'Your order has been delivered.';
                adminMessage = `Order ${order_id} has been delivered.`;
                notificationType = 'booking_confirmation';
                break;
            default:
                userMessage = 'Your order status has been updated.';
                adminMessage = `Order ${order_id} status has been updated to ${status}.`;
                notificationType = 'booking_confirmation';
        }

        // Send notification to the user
        await sendNotification(
            user_id, // User ID
            notificationType, // Notification type
            'Order Status Update', // Subject
            userMessage, // Message
            'email', // Delivery method
            `/orders?order_id=${order_id}` // Link
        );

        // Send notification to the admin
        await sendAdminNotification(
            notificationType, // Notification type
            'Order Status Update', // Subject
            adminMessage, // Message
            'email', // Delivery method
            `/orders?order_id=${order_id}` // Link
        );
        // Step 6: Trigger Pusher event
        pusher.trigger('my-channel', 'my-event', {
            message: ' order updated',
            orderId: order_id,
            userId: user_id
        });
        res.status(200).json({ success: true, message: 'Order status updated and notifications sent' });
    } catch (err) {
        console.error('Error updating order status:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

const deleteOrder = async (req, res) => {
    const { order_id } = req.params;
    try {
        // Get the user_id associated with the order before deleting it
        const [order] = await db.query('SELECT user_id FROM Orders WHERE order_id = ?', [order_id]);
        if (order.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        const user_id = order[0].user_id;
        
        await db.query('DELETE FROM Orders WHERE order_id = ?', [order_id]);
        res.status(200).json({ success: true, message: 'Order deleted' });
        
        // Step 6: Trigger Pusher event
        pusher.trigger('my-channel', 'my-event', {
            message: 'order deleted',
            orderId: order_id,
            userId: user_id
        });
    } catch (err) {
        console.error('Error deleting order:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};



const getOrderItemsByOrderId = async (req, res) => {
    const { order_id } = req.params;
    try {
        const [orderItems] = await db.query(
            `SELECT * FROM OrderItems WHERE order_id = ?`,
            [order_id]
        );
        res.status(200).json(orderItems);
    } catch (err) {
        console.error('Error fetching order items:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};
const getUserOrders = async (req, res) => {
    // Make sure we have the correct user_id from the authenticated user
    const user_id = req.user.user_id || req.user.id; // Support both formats for backward compatibility

    try {
        // Query to fetch orders and associated order items with product details
        const [orders] = await db.query(`
            SELECT 
                Orders.order_id,
                Orders.total_amount,
                Orders.status,
                Orders.created_at AS order_created_at,
                OrderItems.order_item_id,
                OrderItems.quantity,
                OrderItems.price AS item_price,
                Products.product_id,
                Products.name AS product_name,
                Products.description AS product_description,
                Products.original_price,
                Products.discount_price,
                Products.discount,
                Products.shipping_info,
                Products.color,
                Products.size,
                Products.stock,
                Products.is_active
            FROM Orders
            INNER JOIN OrderItems ON Orders.order_id = OrderItems.order_id
            INNER JOIN Products ON OrderItems.product_id = Products.product_id
            WHERE Orders.user_id = ?
            ORDER BY Orders.created_at DESC;
        `, [user_id]);

        // Group orders and their items
        const groupedOrders = orders.reduce((acc, row) => {
            const orderId = row.order_id;

            // If the order doesn't exist in the accumulator, add it
            if (!acc[orderId]) {
                acc[orderId] = {
                    order_id: row.order_id,
                    total_amount: row.total_amount,
                    status: row.status,
                    created_at: row.order_created_at,
                    items: [],
                };
            }

            // Add the product details to the order's items
            acc[orderId].items.push({
                order_item_id: row.order_item_id,
                product_id: row.product_id,
                product_name: row.product_name,
                description: row.product_description,
                original_price: row.original_price,
                discount_price: row.discount_price,
                discount: row.discount,
                shipping_info: row.shipping_info,
                color: row.color,
                size: row.size,
                stock: row.stock,
                is_active: row.is_active,
                quantity: row.quantity,
                item_price: row.item_price,
            });

            return acc;
        }, {});

        // Convert the grouped orders object into an array
        const result = Object.values(groupedOrders);

        res.status(200).json({ success: true, orders: result });
    } catch (err) {
        console.error('Error fetching user orders:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};
const deleteOrderItem = async (req, res) => {
    const { order_item_id } = req.params;
    try {
        await db.query('DELETE FROM OrderItems WHERE order_item_id = ?', [order_item_id]);
        res.status(200).json({ success: true, message: 'Order item deleted' });
    } catch (err) {
        console.error('Error deleting order item:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

const createGiftCard = async (req, res) => {
    const { code, amount, user_id } = req.body;
    try {
        const [result] = await db.query(
            `INSERT INTO GiftCards (code, amount, user_id) 
             VALUES (?, ?, ?)`,
            [code, amount, user_id]
        );
           // Step 6: Trigger Pusher event
           pusher.trigger('my-channel', 'my-event', {
            message: 'Gift Card created',
            // orderId: orderId,
            userId: user_id
        });
        res.status(201).json({ success: true, message: 'Gift card created', giftCardId: result.insertId });
    } catch (err) {
        console.error('Error creating gift card:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

const getGiftCardByCode = async (req, res) => {
    const { code } = req.params;
    try {
        const [giftCard] = await db.query(
            `SELECT * FROM GiftCards WHERE code = ?`,
            [code]
        );
        if (giftCard.length === 0) {
            return res.status(404).json({ success: false, message: 'Gift card not found' });
        }
        res.status(200).json(giftCard[0]);
    } catch (err) {
        console.error('Error fetching gift card:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

const deleteGiftCard = async (req, res) => {
    const { gift_card_id } = req.params;
    try {
        await db.query('DELETE FROM GiftCards WHERE gift_card_id = ?', [gift_card_id]);
           // Step 6: Trigger Pusher event
           pusher.trigger('my-channel', 'my-event', {
            message: 'Gift Card Deleted',
            userId: gift_card_id
        });
        res.status(200).json({ success: true, message: 'Gift card deleted' });
    } catch (err) {
        console.error('Error deleting gift card:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};


const addToCart = async (req, res) => {
    // Make sure we have the correct user_id from the authenticated user
    const user_id = req.user.user_id || req.user.id; // Support both formats for backward compatibility
    const { product_id, quantity, item_type, tournament_id, event_id, payment_option } = req.body; // Extract product_id, quantity, item_type, and payment_option from the request body

    try {
        // Validate request
        if (!item_type) {
            return res.status(400).json({ success: false, message: "Item type is required" });
        }

        if (item_type === 'product' && !product_id) {
            return res.status(400).json({ success: false, message: "Product ID is required" });
        }

        if (item_type === 'tournament' && !tournament_id) {
            return res.status(400).json({ success: false, message: "Tournament ID is required" });
        }

        if (!quantity || quantity <= 0) {
            return res.status(400).json({ success: false, message: "Valid quantity is required" });
        }
        
        if (item_type === 'tournament') {
            // Handle tournament ticket as cart item
            // First, check if the tournament exists
            const [tournament] = await db.query(
                `SELECT * FROM Tournaments WHERE tournament_id = ?`,
                [tournament_id]
            );

            if (tournament.length === 0) {
                return res.status(404).json({ success: false, message: 'Tournament not found' });
            }

            // Set default payment option to 'online' if not provided
            const paymentOption = payment_option || 'online';
            
            // If payment option is 'at_event', directly register the user for the tournament
            if (paymentOption === 'at_event') {
                try {
                    // Register the user for the tournament with pending payment status
                    await db.query(
                        `INSERT INTO TournamentRegistrations (user_id, tournament_id, status, payment_status, payment_option) 
                         VALUES (?, ?, 'registered', 'pending', 'at_event')`,
                        [user_id, tournament_id]
                    );
                    
                    // Send notification for tournament registration
                    await sendNotification(
                        user_id,
                        'booking_confirmation',
                        'Tournament Registration',
                        'You have been registered for the tournament. Payment will be collected at the event.',
                        'email',
                        `/tournaments?tournament_id=${tournament_id}`
                    );
                    
                    // Send notification to admin for tournament registration
                    await sendAdminNotification(
                        'booking_confirmation',
                        'Tournament Registration',
                        `A new tournament registration has been made by user ${user_id} with payment at event.`,
                        'email',
                        `/tournaments/all-tournaments?tournament_id=${tournament_id}`
                    );
                    
                    // Trigger Pusher event for tournament registration
                    pusher.trigger('my-channel', 'my-event', {
                        message: 'Registered For tournament',
                        tournamentId: tournament_id,
                        userId: user_id
                    });
                    
                    return res.status(201).json({ 
                        success: true, 
                        message: 'You have been registered for the tournament. Payment will be collected at the event.' 
                    });
                } catch (err) {
                    console.error('Error registering for tournament:', err);
                    return res.status(500).json({ success: false, message: 'Error registering for tournament', error: err.message });
                }
            }
            
            // For online payment, proceed with cart addition
            // Check if the tournament ticket already exists in the user's cart
            const [existingCartItem] = await db.query(
                `SELECT * FROM Cart 
                 WHERE user_id = ? AND tournament_id = ?`,
                [user_id, tournament_id]
            );

            if (existingCartItem.length > 0) {
                // If the tournament ticket already exists, update the quantity and payment_option
                const newQuantity = existingCartItem[0].quantity + quantity;
                await db.query(
                    `UPDATE Cart 
                     SET quantity = ?, payment_option = ? 
                     WHERE user_id = ? AND tournament_id = ?`,
                    [newQuantity, paymentOption, user_id, tournament_id]
                );
                res.status(200).json({ success: true, message: 'Tournament ticket quantity updated', newQuantity, payment_option: paymentOption });
            } else {
                // If the tournament ticket does not exist, insert a new row with payment_option
                // Explicitly set product_id to NULL for tournament items
                const [result] = await db.query(
                    `INSERT INTO Cart (user_id, tournament_id, quantity, item_type, payment_option, product_id) 
                     VALUES (?, ?, ?, 'tournament', ?, NULL)`,
                    [user_id, tournament_id, quantity, paymentOption]
                );
                
                // Log successful insertion for debugging
                console.log('Tournament added to cart successfully:', {
                    user_id,
                    tournament_id,
                    quantity,
                    item_type: 'tournament',
                    payment_option: paymentOption,
                    cart_id: result.insertId
                });
                res.status(201).json({ success: true, message: 'Tournament ticket added to cart', cartId: result.insertId, payment_option: paymentOption });
            }
        } else if (item_type === 'event') {
            // Handle event items
            console.log('Processing event item:', { user_id, event_id, quantity, payment_option });

            // Validate event_id
            if (!event_id) {
                return res.status(400).json({ success: false, message: 'Event ID is required for event items' });
            }

            // Check if the event exists
            const [eventExists] = await db.query(
                `SELECT event_id, name, ticket_price FROM Events WHERE event_id = ?`,
                [event_id]
            );

            if (eventExists.length === 0) {
                return res.status(404).json({ success: false, message: 'Event not found' });
            }

            // Check if user is already registered for this event
            const [existingRegistration] = await db.query(
                `SELECT registration_id FROM EventRegistrations
                 WHERE user_id = ? AND event_id = ? AND status != 'cancelled'`,
                [user_id, event_id]
            );

            if (existingRegistration.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'You are already registered for this event'
                });
            }

            // Set default payment option if not provided
            const paymentOption = payment_option || 'online';

            // If payment option is 'at_event', register the user directly
            if (paymentOption === 'at_event') {
                try {
                    await db.query(
                        `INSERT INTO EventRegistrations (user_id, event_id, payment_option, payment_status)
                         VALUES (?, ?, 'at_event', 'paid')`,
                        [user_id, event_id]
                    );

                    return res.status(201).json({
                        success: true,
                        message: 'You have been registered for the event. Payment will be collected at the event.'
                    });
                } catch (err) {
                    console.error('Error registering for event:', err);
                    return res.status(500).json({ success: false, message: 'Error registering for event', error: err.message });
                }
            }

            // For online payment, proceed with cart addition
            // Check if the event ticket already exists in the user's cart
            const [existingCartItem] = await db.query(
                `SELECT * FROM Cart
                 WHERE user_id = ? AND event_id = ?`,
                [user_id, event_id]
            );

            if (existingCartItem.length > 0) {
                // If the event ticket already exists, update the quantity and payment_option
                const newQuantity = existingCartItem[0].quantity + quantity;
                await db.query(
                    `UPDATE Cart
                     SET quantity = ?, payment_option = ?
                     WHERE user_id = ? AND event_id = ?`,
                    [newQuantity, paymentOption, user_id, event_id]
                );
                res.status(200).json({ success: true, message: 'Event ticket quantity updated', newQuantity, payment_option: paymentOption });
            } else {
                // If the event ticket does not exist, insert a new row with payment_option
                // Explicitly set product_id to NULL for event items
                const [result] = await db.query(
                    `INSERT INTO Cart (user_id, event_id, quantity, item_type, payment_option, product_id)
                     VALUES (?, ?, ?, 'event', ?, NULL)`,
                    [user_id, event_id, quantity, paymentOption]
                );

                // Log successful insertion for debugging
                console.log('Event added to cart successfully:', {
                    user_id,
                    event_id,
                    quantity,
                    item_type: 'event',
                    payment_option: paymentOption,
                    cart_id: result.insertId
                });
                res.status(201).json({ success: true, message: 'Event ticket added to cart', cartId: result.insertId, payment_option: paymentOption });
            }
        } else {
            // Handle regular product as cart item
            // Check if the product already exists in the user's cart
            const [existingCartItem] = await db.query(
                `SELECT * FROM Cart 
                 WHERE user_id = ? AND product_id = ?`,
                [user_id, product_id]
            );

            if (existingCartItem.length > 0) {
                // If the product already exists, update the quantity
                const newQuantity = existingCartItem[0].quantity + quantity; // Increase the quantity
                await db.query(
                    `UPDATE Cart 
                     SET quantity = ? 
                     WHERE user_id = ? AND product_id = ?`,
                    [newQuantity, user_id, product_id]
                );
                res.status(200).json({ success: true, message: 'Cart item quantity updated', newQuantity });
            } else {
                // If the product does not exist, insert a new row
                const [result] = await db.query(
                    `INSERT INTO Cart (user_id, product_id, quantity, item_type) 
                     VALUES (?, ?, ?, 'product')`,
                    [user_id, product_id, quantity]
                );
                res.status(201).json({ success: true, message: 'Item added to cart', cartId: result.insertId });
            }
        }
    } catch (err) {
        console.error('Error adding to cart:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};
const getCartByUserId = async (req, res) => {
    // Make sure we have the correct user_id from the authenticated user
    const user_id = req.user.user_id || req.user.id; // Support both formats for backward compatibility
    try {
        // Get product items from cart
        const [productItems] = await db.query(
            `SELECT 
                c.*, 
                p.name, 
                p.discount_price, 
                GROUP_CONCAT(pi.image_url) AS images, -- Aggregate image URLs
                'product' AS item_type
             FROM Cart c 
             JOIN Products p ON c.product_id = p.product_id 
             LEFT JOIN ProductImages pi ON p.product_id = pi.product_id -- Join ProductImages table
             WHERE c.user_id = ? AND (c.item_type = 'product' OR c.item_type IS NULL)
             GROUP BY c.cart_id`, // Group by cart item to avoid duplicates
            [user_id]
        );

        // Get tournament items from cart
        const [tournamentItems] = await db.query(
            `SELECT
                c.*,
                t.name,
                t.ticket_price AS discount_price,
                '/images/tournament.jpg' AS images, -- Default image for tournaments
                'tournament' AS item_type,
                IFNULL(c.payment_option, 'online') AS payment_option,
                t.rules,
                t.requirements,
                t.description,
                t.start_date,
                t.end_date,
                t.game_type,
                t.prize_pool
             FROM Cart c
             JOIN Tournaments t ON c.tournament_id = t.tournament_id
             WHERE c.user_id = ? AND c.item_type = 'tournament'
             GROUP BY c.cart_id`, // Group by cart item to avoid duplicates
            [user_id]
        );

        // Get event items from cart
        const [eventItems] = await db.query(
            `SELECT
                c.*,
                e.name,
                e.ticket_price AS discount_price,
                '/images/event.jpg' AS images, -- Default image for events
                'event' AS item_type,
                IFNULL(c.payment_option, 'online') AS payment_option
             FROM Cart c
             JOIN Events e ON c.event_id = e.event_id
             WHERE c.user_id = ? AND c.item_type = 'event'
             GROUP BY c.cart_id`, // Group by cart item to avoid duplicates
            [user_id]
        );

        // Format the product items images field as an array
        const formattedProductItems = productItems.map((item) => ({
            ...item,
            images: item.images ? item.images.split(",") : [], // Split the concatenated image URLs
        }));

        // Format the tournament items images field as an array
        const formattedTournamentItems = tournamentItems.map((item) => ({
            ...item,
            images: [item.images], // Make it an array for consistency
        }));

        // Format the event items images field as an array
        const formattedEventItems = eventItems.map((item) => ({
            ...item,
            images: [item.images], // Make it an array for consistency
        }));

        // Combine all types of items
        const allCartItems = [...formattedProductItems, ...formattedTournamentItems, ...formattedEventItems];

        res.status(200).json(allCartItems);
    } catch (err) {
        console.error("Error fetching cart:", err);
        res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
};

const updateCartItemQuantity = async (req, res) => {
    const { cart_id } = req.params;
    const { quantity } = req.body;
    try {
        await db.query(
            `UPDATE Cart SET quantity = ? WHERE cart_id = ?`,
            [quantity, cart_id]
        );
        res.status(200).json({ success: true, message: 'Cart item quantity updated' });
    } catch (err) {
        console.error('Error updating cart item:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};


const removeFromCart = async (req, res) => {
    const { cart_id } = req.params;
    try {
        await db.query('DELETE FROM Cart WHERE cart_id = ?', [cart_id]);
        res.status(200).json({ success: true, message: 'Item removed from cart' });
    } catch (err) {
        console.error('Error removing from cart:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

// ✅ Add item to guest cart
const addToGuestCart = async (req, res) => {
    try {
        const {
            guest_session_id,
            product_id,
            tournament_id,
            event_id,
            quantity,
            item_type,
            guest_name,
            guest_email,
            guest_phone
        } = req.body;

        if (!guest_session_id) {
            return res.status(400).json({
                success: false,
                message: 'Guest session ID is required'
            });
        }

        // Check if item already exists in guest cart
        let existingCartQuery = `
            SELECT * FROM Cart
            WHERE guest_session_id = ? AND item_type = ? AND is_guest_cart = TRUE
        `;
        let queryParams = [guest_session_id, item_type];

        if (item_type === 'product') {
            existingCartQuery += ' AND product_id = ?';
            queryParams.push(product_id);
        } else if (item_type === 'tournament') {
            existingCartQuery += ' AND tournament_id = ?';
            queryParams.push(tournament_id);
        } else if (item_type === 'event') {
            existingCartQuery += ' AND event_id = ?';
            queryParams.push(event_id);
        }

        const [existingItems] = await db.query(existingCartQuery, queryParams);

        if (existingItems.length > 0) {
            // Update quantity if item exists
            const newQuantity = existingItems[0].quantity + (quantity || 1);
            await db.query(
                'UPDATE Cart SET quantity = ?, guest_name = ?, guest_email = ?, guest_phone = ? WHERE cart_id = ?',
                [newQuantity, guest_name, guest_email, guest_phone, existingItems[0].cart_id]
            );

            return res.status(200).json({
                success: true,
                message: 'Guest cart updated successfully',
                cart_id: existingItems[0].cart_id
            });
        } else {
            // Add new item to guest cart
            const [result] = await db.query(
                `INSERT INTO Cart (
                    guest_session_id, product_id, tournament_id, event_id,
                    quantity, item_type, is_guest_cart,
                    guest_name, guest_email, guest_phone
                ) VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?)`,
                [guest_session_id, product_id, tournament_id, event_id, quantity || 1, item_type, guest_name, guest_email, guest_phone]
            );

            return res.status(201).json({
                success: true,
                message: 'Item added to guest cart successfully',
                cart_id: result.insertId
            });
        }
    } catch (error) {
        console.error('Error adding to guest cart:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding item to guest cart',
            error: error.message
        });
    }
};

// ✅ Get guest cart by session ID
const getGuestCart = async (req, res) => {
    try {
        const { guest_session_id } = req.params;

        const [cartItems] = await db.query(`
            SELECT
                c.*,
                p.name as product_name,
                p.price as product_price,
                p.image_url as product_image,
                t.name as tournament_name,
                t.ticket_price as tournament_price,
                e.name as event_name,
                e.ticket_price as event_price
            FROM Cart c
            LEFT JOIN Products p ON c.product_id = p.product_id
            LEFT JOIN Tournaments t ON c.tournament_id = t.tournament_id
            LEFT JOIN Events e ON c.event_id = e.event_id
            WHERE c.guest_session_id = ? AND c.is_guest_cart = TRUE
            ORDER BY c.createdAt DESC
        `, [guest_session_id]);

        // Calculate total
        let total = 0;
        cartItems.forEach(item => {
            let itemPrice = 0;
            if (item.item_type === 'product') {
                itemPrice = item.product_price;
            } else if (item.item_type === 'tournament') {
                itemPrice = item.tournament_price;
            } else if (item.item_type === 'event') {
                itemPrice = item.event_price;
            }
            total += itemPrice * item.quantity;
        });

        res.status(200).json({
            success: true,
            cart: cartItems,
            total: total.toFixed(2),
            item_count: cartItems.length
        });
    } catch (error) {
        console.error('Error fetching guest cart:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching guest cart',
            error: error.message
        });
    }
};

// Create guest order
const createGuestOrder = async (req, res) => {
    try {
        const {
            guest_name,
            guest_email,
            guest_phone,
            items,
            total_amount,
            shipping_address,
            shipping_cost = 0,
            payment_method = 'online',
            is_guest_order = true
        } = req.body;

        // Validate required fields
        if (!guest_name || !guest_email || !items || !total_amount) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: guest_name, guest_email, items, total_amount'
            });
        }

        // Generate order reference
        const order_reference = `GORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        // Create the order with fallback for missing columns
        let orderResult;
        try {
            // Set payment status based on payment method
            const paymentStatus = payment_method === 'cod' ? 'cod' : 'pending';

            // Try with all columns first (including shipping_cost and payment_method)
            [orderResult] = await db.query(`
                INSERT INTO Orders (
                    guest_name, guest_email, guest_phone, total_amount,
                    shipping_address, shipping_cost, is_guest_order, order_reference,
                    status, payment_status, payment_method
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
            `, [
                guest_name,
                guest_email,
                guest_phone,
                total_amount,
                shipping_address || null,
                shipping_cost || 0.00,
                is_guest_order,
                order_reference,
                paymentStatus,
                payment_method
            ]);
        } catch (error) {
            if (error.code === 'ER_BAD_FIELD_ERROR') {
                // Fallback: try with minimal columns
                console.log('Some columns not found, using fallback...');
                [orderResult] = await db.query(`
                    INSERT INTO Orders (
                        guest_name, guest_email, guest_phone, total_amount,
                        is_guest_order, order_reference,
                        status, payment_status
                    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'pending')
                `, [
                    guest_name,
                    guest_email,
                    guest_phone,
                    total_amount,
                    is_guest_order,
                    order_reference
                ]);
            } else {
                throw error;
            }
        }

        const order_id = orderResult.insertId;

        // Add order items
        for (const item of items) {
            await db.query(`
                INSERT INTO OrderItems (order_id, product_id, quantity, price)
                VALUES (?, ?, ?, ?)
            `, [order_id, item.product_id, item.quantity, item.price]);
        }

        res.status(201).json({
            success: true,
            message: 'Guest order created successfully',
            order: {
                order_id,
                order_reference,
                guest_name,
                guest_email,
                total_amount,
                status: 'pending',
                payment_status: 'pending'
            }
        });

    } catch (error) {
        console.error('Error creating guest order:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating guest order',
            error: error.message
        });
    }
};

// Get guest orders by email
const getGuestOrders = async (req, res) => {
    try {
        const { email } = req.query;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        console.log('🔍 Fetching guest orders for email:', email);

        // First, check if any guest orders exist at all
        const [allGuestOrders] = await db.query(`
            SELECT COUNT(*) as total FROM Orders WHERE is_guest_order = true
        `);
        console.log('📊 Total guest orders in database:', allGuestOrders[0].total);

        // Get guest orders with basic columns first
        const [orders] = await db.query(`
            SELECT
                order_id,
                guest_name,
                guest_email,
                guest_phone,
                total_amount,
                status,
                payment_status,
                order_reference,
                created_at
            FROM Orders
            WHERE is_guest_order = true
            AND guest_email = ?
            ORDER BY created_at DESC
        `, [email]);

        console.log(`📦 Found ${orders.length} guest orders for email: ${email}`);

        // Add missing fields with fallback values
        for (let order of orders) {
            // Add missing fields that might not exist in all databases
            order.shipping_cost = 0;
            order.shipping_address = '';
            order.payment_method = 'online';

            // Get additional fields if they exist
            try {
                const [additionalFields] = await db.query(`
                    SELECT shipping_cost, shipping_address, payment_method
                    FROM Orders
                    WHERE order_id = ?
                `, [order.order_id]);

                if (additionalFields.length > 0) {
                    order.shipping_cost = additionalFields[0].shipping_cost || 0;
                    order.shipping_address = additionalFields[0].shipping_address || '';
                    order.payment_method = additionalFields[0].payment_method || 'online';
                }
            } catch (fieldError) {
                console.log(`ℹ️ Some fields not available for order ${order.order_id}`);
            }

            // Get order items
            try {
                const [orderItems] = await db.query(`
                    SELECT
                        oi.order_item_id,
                        oi.product_id,
                        oi.quantity,
                        oi.price,
                        p.name as product_name,
                        p.images as product_image,
                        p.description as product_description
                    FROM OrderItems oi
                    LEFT JOIN Products p ON oi.product_id = p.product_id
                    WHERE oi.order_id = ?
                `, [order.order_id]);

                order.items = orderItems;
                console.log(`📋 Order ${order.order_id} has ${orderItems.length} items`);
            } catch (itemError) {
                console.error(`❌ Error fetching items for order ${order.order_id}:`, itemError);
                order.items = [];
            }
        }

        res.status(200).json({
            success: true,
            orders: orders,
            debug: {
                totalGuestOrders: allGuestOrders[0].total,
                searchEmail: email,
                foundOrders: orders.length
            }
        });

    } catch (error) {
        console.error('❌ Error fetching guest orders:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);

        res.status(500).json({
            success: false,
            message: 'Failed to fetch guest orders',
            error: error.message
        });
    }
};

module.exports = {
    createOrderWithItems,
    getAllOrders,
    getOrderById,
    getOrdersByUserId,
    updateOrderStatus,
    deleteOrder,
    getOrderItemsByOrderId,
    deleteOrderItem,
    createGiftCard,
    getGiftCardByCode,
    deleteGiftCard,
    addToCart,
    getCartByUserId,
    updateCartItemQuantity,
    removeFromCart,
    getUserOrders,
    addToGuestCart,
    getGuestCart,
    createGuestOrder,
    getGuestOrders
}
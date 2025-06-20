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

    // Validate required fields
    if (!user_id || !total_amount || !shipping_cost || !items || !Array.isArray(items) || items.length === 0 || !shipping_address) {
        return res.status(400).json({ success: false, message: 'Missing or invalid fields' });
    }

    try {
        // Start a database transaction
        await db.query('START TRANSACTION');

        // Step 1: Create the shipping address
        const { full_name, address, city, state, zip_code, country } = shipping_address;
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

        // Step 3: Add order items and process tournament registrations if payment is complete
        const tournamentRegistrations = [];

        for (const item of items) {
            const { product_id, tournament_id, quantity, price, item_type, payment_option } = item;

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

        // Step 4: Process tournament registrations if payment is complete
        if (payment_status === 'completed') {
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

        res.status(201).json({ success: true, message: 'Order and items created successfully', orderId });
    } catch (err) {
        // Rollback the transaction in case of an error
        await db.query('ROLLBACK');
        console.error('Error creating order with items:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
};

const getAllOrders = async (req, res) => {
    try {
        // Query to fetch all orders with user, item, and shipping address details
        const [orders] = await db.query(`
            SELECT 
                Orders.order_id,
                Orders.total_amount,
                Orders.status,
                Orders.payment_method,
                Orders.payment_status,
                Orders.shipping_cost,
                Orders.created_at AS order_created_at,
                Users.user_id,
                Users.name AS user_name,
                Users.email AS user_email,
                ShippingAddresses.shipping_address_id,
                ShippingAddresses.full_name AS shipping_full_name,
                ShippingAddresses.address AS shipping_address,
                ShippingAddresses.city AS shipping_city,
                ShippingAddresses.state AS shipping_state,
                ShippingAddresses.zip_code AS shipping_zip_code,
                ShippingAddresses.country AS shipping_country,
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
            INNER JOIN Users ON Orders.user_id = Users.user_id
            INNER JOIN ShippingAddresses ON Orders.shipping_address_id = ShippingAddresses.shipping_address_id
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
                    payment_method: row.payment_method, // Include payment method
                    payment_status: row.payment_status, // Include payment status
                    shipping_cost: row.shipping_cost, // Include shipping cost
                    created_at: row.order_created_at,
                    user: {
                        user_id: row.user_id,
                        name: row.user_name,
                        email: row.user_email,
                    },
                    shipping_address: {
                        shipping_address_id: row.shipping_address_id,
                        full_name: row.shipping_full_name,
                        address: row.shipping_address,
                        city: row.shipping_city,
                        state: row.shipping_state,
                        zip_code: row.shipping_zip_code,
                        country: row.shipping_country,
                    },
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
    const { product_id, quantity, item_type, tournament_id, payment_option } = req.body; // Extract product_id, quantity, item_type, and payment_option from the request body

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
                IFNULL(c.payment_option, 'online') AS payment_option
             FROM Cart c 
             JOIN Tournaments t ON c.tournament_id = t.tournament_id 
             WHERE c.user_id = ? AND c.item_type = 'tournament'
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

        // Combine both types of items
        const allCartItems = [...formattedProductItems, ...formattedTournamentItems];

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
    getUserOrders
}
const db = require('../config/db'); // Import your database connection


const createTables = async () => {
    try {

        //Users Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS Users (
                user_id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                phone VARCHAR(15),
                password VARCHAR(255) NOT NULL,
                birthday DATE,
                is_active BOOLEAN DEFAULT TRUE,
                is_blocked BOOLEAN DEFAULT FALSE,
                role ENUM('admin', 'staff', 'customer') DEFAULT 'customer',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`
        )

        //VR Sessions
        await db.query(`
            CREATE TABLE IF NOT EXISTS VRSessions (
                session_id INT AUTO_INCREMENT PRIMARY KEY,
                 name ENUM(
                    'Free Roaming VR Arena 2.0',
                    'VR UFO 5 Players',
                    'VR 360° Motion Chair',
                    'HTC VIVE VR Standing Platform',
                    'VR Warrior 2players',
                    'VR CAT'
                 ),
                description TEXT, 
                duration_minutes INT NOT NULL,
                max_players INT, 
                price DECIMAL(10, 2) NOT NULL,   
                is_active BOOLEAN DEFAULT TRUE
            );`
        )

        // Hero Cards Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS HeroCards (
                card_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                balance DECIMAL(10, 2) DEFAULT 0.00,
                points INT DEFAULT 0,
                last_activity TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(user_id)
            );`
        )

        // VR Session Booking Table
        await db.query(`
             CREATE TABLE IF NOT EXISTS Bookings (
                 booking_id INT AUTO_INCREMENT PRIMARY KEY,
                 user_id INT,
                 session_id INT,
                 machine_type ENUM(
                     'Free Roaming VR Arena 2.0',
                     'VR UFO 5 Players',
                     'VR 360° Motion Chair',
                     'HTC VIVE VR Standing Platform',
                     'VR Warrior 2players',
                     'VR CAT'
                  ),
                 start_time DATETIME,
                 end_time DATETIME,
                 payment_status ENUM('pending', 'paid', 'cancelled') DEFAULT 'pending',
                 session_status ENUM('pending', 'started', 'completed') DEFAULT 'pending',
                 FOREIGN KEY (user_id) REFERENCES Users(user_id),
                 FOREIGN KEY (session_id) REFERENCES VRSessions(session_id)
    );`
        )


        // Add payment_id column to Bookings if it doesn't exist
        try {
            // Check if column exists first
            const [columns] = await db.query(`SHOW COLUMNS FROM Bookings LIKE 'payment_id';`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE Bookings ADD COLUMN payment_id INT NULL AFTER session_status;`);
                await db.query(`ALTER TABLE Bookings ADD CONSTRAINT fk_bookings_payment FOREIGN KEY (payment_id) REFERENCES Payments(payment_id) ON DELETE SET NULL;`);
                console.log('payment_id column added to Bookings successfully');
            }
        } catch (error) {
            console.log('Error adding payment_id column to Bookings:', error.message);
        }

        // Tournaments Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS Tournaments (
                tournament_id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                start_date DATETIME,
                city VARCHAR(255) NOT NULL,
                country VARCHAR(255) NOT NULL,
                state VARCHAR(255) NOT NULL,
                end_date DATETIME,
                ticket_price DECIMAL(10, 2) NOT NULL, 
                status ENUM('upcoming', 'ongoing', 'completed') DEFAULT 'upcoming'
            );`
        )


        //Tournaments Registrations
        await db.query(`
            CREATE TABLE IF NOT EXISTS TournamentRegistrations (
                registration_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                tournament_id INT,
                status ENUM('registered', 'completed'),
                payment_status ENUM('pending', 'paid') DEFAULT 'pending',
                payment_option ENUM('online', 'at_event') DEFAULT 'online',
                FOREIGN KEY (user_id) REFERENCES Users(user_id),
                FOREIGN KEY (tournament_id) REFERENCES Tournaments(tournament_id)
            );`
        )
        
        // Add payment_status column to TournamentRegistrations if it doesn't exist
        try {
            // Check if column exists first
            const [columns] = await db.query(`
                SHOW COLUMNS FROM TournamentRegistrations LIKE 'payment_status';
            `);
            
            if (columns.length === 0) {
                await db.query(`
                    ALTER TABLE TournamentRegistrations
                    ADD COLUMN payment_status ENUM('pending', 'paid') DEFAULT 'pending';
                `);
                console.log('payment_status column added successfully');
            }
        } catch (error) {
            console.log('Error adding payment_status column:', error.message);
        }
        
        // Add payment_option column to TournamentRegistrations if it doesn't exist
        try {
            // Check if column exists first
            const [columns] = await db.query(`
                SHOW COLUMNS FROM TournamentRegistrations LIKE 'payment_option';
            `);
            
            if (columns.length === 0) {
                await db.query(`
                    ALTER TABLE TournamentRegistrations
                    ADD COLUMN payment_option ENUM('online', 'at_event') DEFAULT 'online';
                `);
                console.log('payment_option column added successfully');
            }
        } catch (error) {
            console.log('Error adding payment_option column:', error.message);
        }

        // Products
        await db.query(`
            CREATE TABLE IF NOT EXISTS Products (
                product_id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                original_price DECIMAL(10, 2) NOT NULL,
                discount_price DECIMAL(10, 2) NOT NULL,
                discount DECIMAL(10, 2) NOT NULL,
                shipping_info VARCHAR(50),
                color VARCHAR(50),
                size VARCHAR(50),
                stock INT DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                category VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`
        )

        // Create Product Images Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS ProductImages (
                Image_id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                image_url VARCHAR(255) NOT NULL,
                FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
            );`
        );

        // Shipping Addresses
        await db.query(`
            CREATE TABLE IF NOT EXISTS ShippingAddresses (
                shipping_address_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT, -- Link to the user who provided the address
                full_name VARCHAR(255) NOT NULL,
                address VARCHAR(255) NOT NULL,
                city VARCHAR(100) NOT NULL,
                state VARCHAR(100) NOT NULL,
                zip_code VARCHAR(20) NOT NULL,
                country VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(user_id)
            );`
        );
        
        // Orders
        await db.query(`
            CREATE TABLE IF NOT EXISTS Orders (
                order_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                total_amount DECIMAL(10, 2) NOT NULL,
                shipping_cost DECIMAL(10, 2) NOT NULL,
                status ENUM('pending', 'processing', 'shipped', 'delivered') DEFAULT 'pending',
                payment_method ENUM('cod', 'online') DEFAULT 'cod', -- Payment method
                payment_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending', -- Payment status
                shipping_address_id INT, -- Foreign key to ShippingAddresses table
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(user_id),
                FOREIGN KEY (shipping_address_id) REFERENCES ShippingAddresses(shipping_address_id)
            );`
        );

        

        // Order Items
        await db.query(`
            CREATE TABLE IF NOT EXISTS OrderItems  (
                order_item_id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT,
                product_id INT,
                tournament_id INT,
                quantity INT NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                item_type ENUM('product', 'tournament') DEFAULT 'product',
                FOREIGN KEY (order_id) REFERENCES Orders(order_id),
                FOREIGN KEY (product_id) REFERENCES Products(product_id),
                FOREIGN KEY (tournament_id) REFERENCES Tournaments(tournament_id)
            );`
        )
        
        // Add item_type column to OrderItems if it doesn't exist
        try {
            // Check if column exists first
            const [columns] = await db.query(`
                SHOW COLUMNS FROM OrderItems LIKE 'item_type';
            `);
            
            if (columns.length === 0) {
                await db.query(`
                    ALTER TABLE OrderItems
                    ADD COLUMN item_type ENUM('product', 'tournament') DEFAULT 'product';
                `);
                console.log('item_type column added to OrderItems successfully');
            }
        } catch (error) {
            console.log('Error adding item_type column to OrderItems:', error.message);
        }

        // CheckoutPayment
        // Ensure payment_intent_id column is nullable in Payments (safe migration)
        try {
            const [piCol] = await db.query(`SHOW COLUMNS FROM Payments WHERE Field = 'payment_intent_id';`);
            if (piCol.length && piCol[0].Null === 'NO') {
                await db.query(`ALTER TABLE Payments MODIFY COLUMN payment_intent_id VARCHAR(255) NULL;`);
                console.log('Modified payment_intent_id to allow NULL');
            }
        } catch (error) {
            console.error('Error modifying payment_intent_id column:', error.message);
        }
        // Ensure checkout_session_id column exists in Payments (safe migration)
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM Payments LIKE 'checkout_session_id';`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE Payments ADD COLUMN checkout_session_id VARCHAR(255) NULL AFTER payment_intent_id;`);
                console.log('Added checkout_session_id column to Payments');
            }
        } catch (err) {
            if (!err.message.includes('ER_NO_SUCH_TABLE')) {
                console.error('Error adding checkout_session_id column:', err);
            }
        }

        await db.query(`
            
        CREATE TABLE IF NOT EXISTS Payments (
            payment_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL, -- User making the payment
            entity_type ENUM('gift_card', 'order', 'booking', 'ticket') NOT NULL, -- Type of entity being paid for
            entity_id INT NOT NULL, -- ID of the entity (e.g., gift_card_id, order_id, etc.)
            payment_intent_id VARCHAR(255) NULL, -- Stripe Payment Intent ID
            checkout_session_id VARCHAR(255) NULL, -- Stripe Checkout Session ID
            amount DECIMAL(10, 2) NOT NULL, -- Amount paid
            currency VARCHAR(10) NOT NULL, -- Currency (e.g., USD)
            status ENUM('pending', 'succeeded', 'failed', 'expired') DEFAULT 'pending',
            connected_account_id VARCHAR(255) NULL, -- Stripe connected account ID if applicable
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
            INDEX (connected_account_id)
        );`
        )




        // ShippingInformation
        await db.query(`
            CREATE TABLE IF NOT EXISTS ShippingInformation (
                shipping_id INT AUTO_INCREMENT PRIMARY KEY, -- Unique ID for each shipping entry
                order_id INT NOT NULL, -- Foreign key to link to the order
                full_name VARCHAR(255) NOT NULL, -- Full name of the user
                address VARCHAR(255) NOT NULL, -- Shipping address
                city VARCHAR(100) NOT NULL, -- City
                state VARCHAR(100) NOT NULL, -- State
                zip_code VARCHAR(20) NOT NULL, -- ZIP code
                country VARCHAR(100) NOT NULL, -- Country
                shipping_method VARCHAR(50) NOT NULL, -- Shipping method (e.g., Standard Shipping)
                shipping_cost DECIMAL(10, 2) NOT NULL, -- Shipping cost
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Timestamp of when the shipping info was created
                FOREIGN KEY (order_id) REFERENCES Orders(order_id) -- Link to the Orders table
            );`
        )

        // Gifts Card Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS GiftCards (
                gift_card_id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                category VARCHAR(100) DEFAULT 'Gift Cards',
                issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status ENUM('active', 'redeemed', 'expired') DEFAULT 'active',
                created_by INT NOT NULL, -- Admin user ID
                FOREIGN KEY (created_by) REFERENCES Users(user_id) ON DELETE CASCADE
            );`
        )
        // User Gifts Card Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS UserGiftCards (
                user_gift_card_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                gift_card_id INT NOT NULL,
                remaining_balance DECIMAL(10,2) NOT NULL,
                code VARCHAR(50) UNIQUE NOT NULL,
                purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (gift_card_id) REFERENCES GiftCards(gift_card_id) ON DELETE CASCADE
            );`
        )

        //Cart Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS Cart (
                cart_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                product_id INT,
                tournament_id INT,
                quantity INT NOT NULL DEFAULT 1,
                item_type ENUM('product', 'tournament') DEFAULT 'product',
                payment_option ENUM('online', 'at_event') DEFAULT 'online',
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE,
                FOREIGN KEY (tournament_id) REFERENCES Tournaments(tournament_id) ON DELETE CASCADE
            );`
        );
        
        // Ensure product_id in Cart is nullable for tournament entries
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM Cart LIKE 'product_id';`);
            if (columns.length && columns[0].Null !== 'YES') {
                await db.query(`ALTER TABLE Cart MODIFY COLUMN product_id INT NULL;`);
                console.log('product_id column in Cart set to NULLABLE successfully');
            }
        } catch (error) {
            console.log('Error altering product_id column in Cart:', error.message);
        }

        // Add tournament_id column to Cart if it doesn't exist
        try {
            // Check if column exists first
            const [columns] = await db.query(`
                SHOW COLUMNS FROM Cart LIKE 'tournament_id';
            `);
            
            if (columns.length === 0) {
                // Add the column
                await db.query(`
                    ALTER TABLE Cart
                    ADD COLUMN tournament_id INT NULL AFTER product_id;
                `);

                // Add the foreign-key constraint separately to avoid errors if FK exists
                await db.query(`
                    ALTER TABLE Cart
                    ADD CONSTRAINT fk_cart_tournament FOREIGN KEY (tournament_id) REFERENCES Tournaments(tournament_id) ON DELETE CASCADE;
                `);
                console.log('tournament_id column added to Cart successfully');
            }
        } catch (error) {
            console.log('Error adding tournament_id column to Cart:', error.message);
        }

        // Add payment_option column to Cart if it doesn't exist
        try {
            // Check if column exists first
            const [columns] = await db.query(`
                SHOW COLUMNS FROM Cart LIKE 'payment_option';
            `);
            
            if (columns.length === 0) {
                await db.query(`
                    ALTER TABLE Cart
                    ADD COLUMN payment_option ENUM('online', 'at_event') DEFAULT 'online';
                `);
                console.log('payment_option column added to Cart successfully');
            }
        } catch (error) {
            console.log('Error adding payment_option column to Cart:', error.message);
        }

        //Wishlist Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS Wishlist (
                wishlist_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                product_id INT NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
            );`
        );

        //Notification Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS Notifications (
                notification_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                type ENUM('booking_confirmation', 'purchase_confirmation', 'tournament_confirmation', 'reminder', 'special_offer', 'booking_cancellation', 'updation') NOT NULL,
                subject VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                delivery_method ENUM('email', 'sms', 'push') NOT NULL,
                scheduled_at DATETIME,
                sent_at DATETIME,
                link VARCHAR(255), -- New column to store the URL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
            );
        `);


        //Review Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS Reviews (
                review_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                entity_type ENUM('VR_SESSION', 'PRODUCT', 'TOURNAMENT') NOT NULL, -- Add more types as needed
                entity_id INT NOT NULL, -- This will store the ID of the entity being reviewed (e.g., product_id, tournament_id, etc.)
                rating INT CHECK (rating >= 1 AND rating <= 5), -- Assuming a 5-star rating system
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(user_id)
            );
        `);

        // Ensure Products table has 'category' column
        try {
            await db.query("ALTER TABLE Products ADD COLUMN category VARCHAR(100)");
        } catch (err) {
            // Ignore error if column already exists
            if (!err.message.includes('Duplicate column name') && !err.message.includes('already exists')) {
                console.error('Error altering Products table:', err);
            }
        }

        // Create indexes for faster queries
        const tables = ['Users', 'VRSessions', 'Bookings', 'Tournaments', 'TournamentRegistrations', 'Products', 'Orders', 'OrderItems', 'Payments', 'ShippingInformation', 'GiftCards', 'UserGiftCards', 'Cart', 'Wishlist'];
        for (const table of tables) {
            try {
                // Check if the table has a 'created_at' column
                const [columns] = await db.query(`SHOW COLUMNS FROM ${table} LIKE 'created_at'`);
                if (columns.length > 0) {
                    const [indexes] = await db.query(`SHOW INDEX FROM ${table} WHERE Key_name = 'idx_${table}_created_at'`);
                    if (indexes.length === 0) {
                        await db.query(`CREATE INDEX idx_${table}_created_at ON ${table}(created_at)`);
                    }
                }
            } catch (err) {
                // Ignore errors if index already exists
                if (!err.message.includes('Duplicate key name')) {
                    console.error(`Error creating index for ${table}:`, err);
                }
            }
        }

        // Create ConnectedAccounts table to track Stripe connected accounts
        await db.query(`
            CREATE TABLE IF NOT EXISTS ConnectedAccounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                account_id VARCHAR(255) NOT NULL COMMENT 'Stripe account ID (acct_...)',
                email VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                business_type ENUM('individual', 'company', 'non_profit', 'government_entity') DEFAULT 'individual',
                status ENUM('pending', 'active', 'rejected', 'disabled') DEFAULT 'pending',
                metadata JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY (account_id),
                INDEX (email),
                INDEX (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Create ConnectedAccountPayouts table to track payouts to connected accounts
        await db.query(`
            CREATE TABLE IF NOT EXISTS ConnectedAccountPayouts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                connected_account_id VARCHAR(255) NOT NULL,
                payout_id VARCHAR(255) NOT NULL COMMENT 'Stripe payout ID',
                amount DECIMAL(10, 2) NOT NULL,
                currency VARCHAR(3) DEFAULT 'usd',
                status VARCHAR(50) NOT NULL,
                arrival_date TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (connected_account_id) REFERENCES ConnectedAccounts(account_id) ON DELETE CASCADE,
                UNIQUE KEY (payout_id),
                INDEX (status),
                INDEX (arrival_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Create ConnectedAccountBalances table to track balances of connected accounts
        await db.query(`
            CREATE TABLE IF NOT EXISTS ConnectedAccountBalances (
                id INT AUTO_INCREMENT PRIMARY KEY,
                connected_account_id VARCHAR(255) NOT NULL,
                available_balance DECIMAL(10, 2) DEFAULT 0.00,
                pending_balance DECIMAL(10, 2) DEFAULT 0.00,
                currency VARCHAR(3) DEFAULT 'usd',
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (connected_account_id) REFERENCES ConnectedAccounts(account_id) ON DELETE CASCADE,
                UNIQUE KEY (connected_account_id, currency)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Create ConnectedAccountWebhookEvents table to track webhook events for connected accounts
        await db.query(`
            CREATE TABLE IF NOT EXISTS ConnectedAccountWebhookEvents (
                id INT AUTO_INCREMENT PRIMARY KEY,
                connected_account_id VARCHAR(255) NOT NULL,
                event_id VARCHAR(255) NOT NULL COMMENT 'Stripe event ID',
                event_type VARCHAR(255) NOT NULL,
                event_data JSON,
                processed BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (connected_account_id) REFERENCES ConnectedAccounts(account_id) ON DELETE CASCADE,
                UNIQUE KEY (event_id),
                INDEX (event_type),
                INDEX (processed),
                INDEX (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Add item_type column to Cart if it doesn't exist
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM Cart LIKE 'item_type';`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE Cart ADD COLUMN item_type ENUM('product', 'tournament') DEFAULT 'product';`);
                console.log('item_type column added to Cart successfully');
            }
        } catch (error) {
            console.log('Error adding item_type column to Cart:', error.message);
        }

        // Add connected_account_id column to Payments if it doesn't exist
        try {
            const [columns] = await db.query(`SHOW COLUMNS FROM Payments LIKE 'connected_account_id';`);
            if (columns.length === 0) {
                await db.query(`ALTER TABLE Payments ADD COLUMN connected_account_id VARCHAR(255) NULL AFTER currency, ADD INDEX (connected_account_id);`);
                console.log('connected_account_id column added to Payments successfully');
            }
        } catch (error) {
            console.log('Error adding connected_account_id column to Payments:', error.message);
        }

        // ---- End additional migrations ----
        console.log("Table Has been created")
    } catch (error) {
        console.error('Error creating tables:', error);
    }
}



module.exports = { createTables }
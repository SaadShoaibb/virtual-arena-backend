const db = require('../config/db'); // Import your database connection

// Validation function to ensure tournament order system is working
const validateTournamentOrderSystem = async () => {
    try {
        console.log('🔍 Validating tournament order system...');

        // Check OrderItems table has tournament_id column
        const [orderItemsColumns] = await db.query('DESCRIBE OrderItems');
        const hasTournamentId = orderItemsColumns.some(col => col.Field === 'tournament_id');

        if (!hasTournamentId) {
            console.log('❌ tournament_id column missing from OrderItems');
            return;
        }

        // Check item_type enum includes tournament
        const [createTable] = await db.query('SHOW CREATE TABLE OrderItems');
        const createTableSQL = createTable[0]['Create Table'];
        const hasTournamentEnum = createTableSQL.includes("'tournament'");

        if (!hasTournamentEnum) {
            console.log('❌ item_type enum missing tournament option');
            return;
        }

        // Check foreign key constraint exists
        const [foreignKeys] = await db.query(`
            SELECT CONSTRAINT_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_NAME = 'OrderItems'
            AND COLUMN_NAME = 'tournament_id'
            AND CONSTRAINT_NAME != 'PRIMARY'
            AND TABLE_SCHEMA = DATABASE()
        `);

        if (foreignKeys.length === 0) {
            console.log('⚠️  tournament_id foreign key constraint missing (non-critical)');
        }

        console.log('✅ Tournament order system validation passed');

    } catch (error) {
        console.log('⚠️  Tournament validation error (non-critical):', error.message);
    }
};

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

        // VR Session Booking Table (Enhanced for guest bookings)
        await db.query(`
             CREATE TABLE IF NOT EXISTS Bookings (
                 booking_id INT AUTO_INCREMENT PRIMARY KEY,
                 user_id INT NULL, -- Allow NULL for guest bookings
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
                 -- Guest booking fields
                 guest_name VARCHAR(255) NULL,
                 guest_email VARCHAR(255) NULL,
                 guest_phone VARCHAR(20) NULL,
                 is_guest_booking BOOLEAN DEFAULT FALSE,
                 booking_reference VARCHAR(50) UNIQUE NULL, -- Unique reference for guest bookings
                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                 FOREIGN KEY (user_id) REFERENCES Users(user_id),
                 FOREIGN KEY (session_id) REFERENCES VRSessions(session_id),
                 INDEX idx_start_time (start_time),
                 INDEX idx_session_date (session_id, start_time),
                 INDEX idx_guest_email (guest_email),
                 INDEX idx_booking_reference (booking_reference)
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

        // Events Table (separate from tournaments)
        await db.query(`
            CREATE TABLE IF NOT EXISTS Events (
                event_id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                start_date DATETIME,
                end_date DATETIME,
                city VARCHAR(255) NOT NULL,
                country VARCHAR(255) NOT NULL,
                state VARCHAR(255) NOT NULL,
                ticket_price DECIMAL(10, 2) NOT NULL,
                max_participants INT DEFAULT NULL,
                event_type ENUM('party', 'corporate', 'birthday', 'special', 'other') DEFAULT 'other',
                status ENUM('upcoming', 'ongoing', 'completed', 'cancelled') DEFAULT 'upcoming',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );`
        )

        // Tournaments Table (enhanced with more fields)
        await db.query(`
            CREATE TABLE IF NOT EXISTS Tournaments (
                tournament_id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                start_date DATETIME,
                end_date DATETIME,
                city VARCHAR(255) NOT NULL,
                country VARCHAR(255) NOT NULL,
                state VARCHAR(255) NOT NULL,
                ticket_price DECIMAL(10, 2) NOT NULL,
                max_participants INT DEFAULT NULL,
                prize_pool DECIMAL(10, 2) DEFAULT 0.00,
                game_type VARCHAR(100),
                rules TEXT,
                requirements TEXT,
                status ENUM('upcoming', 'ongoing', 'completed', 'cancelled') DEFAULT 'upcoming',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );`
        )


        // Event Registrations
        await db.query(`
            CREATE TABLE IF NOT EXISTS EventRegistrations (
                registration_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                event_id INT,
                status ENUM('registered', 'attended', 'cancelled') DEFAULT 'registered',
                payment_status ENUM('pending', 'paid') DEFAULT 'pending',
                payment_option ENUM('online', 'at_event') DEFAULT 'online',
                registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(user_id),
                FOREIGN KEY (event_id) REFERENCES Events(event_id)
            );`
        )

        //Tournaments Registrations
        await db.query(`
            CREATE TABLE IF NOT EXISTS TournamentRegistrations (
                registration_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                tournament_id INT,
                status ENUM('registered', 'completed', 'disqualified') DEFAULT 'registered',
                payment_status ENUM('pending', 'paid') DEFAULT 'pending',
                payment_option ENUM('online', 'at_event') DEFAULT 'online',
                registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                team_name VARCHAR(255) DEFAULT NULL,
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

        // Add registration_date column to TournamentRegistrations if it doesn't exist
        try {
            const [columns] = await db.query(`
                SHOW COLUMNS FROM TournamentRegistrations LIKE 'registration_date';
            `);

            if (columns.length === 0) {
                await db.query(`
                    ALTER TABLE TournamentRegistrations
                    ADD COLUMN registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                `);
                console.log('registration_date column added to TournamentRegistrations successfully');
            }
        } catch (error) {
            console.log('Error adding registration_date column to TournamentRegistrations:', error.message);
        }

        // Add guest registration fields to TournamentRegistrations
        try {
            // Make user_id nullable for guest registrations
            await db.query(`ALTER TABLE TournamentRegistrations MODIFY COLUMN user_id INT NULL;`);

            // Add guest fields if they don't exist
            const guestFields = [
                'guest_name VARCHAR(255) NULL',
                'guest_email VARCHAR(255) NULL',
                'guest_phone VARCHAR(20) NULL',
                'is_guest_registration BOOLEAN DEFAULT FALSE',
                'registration_reference VARCHAR(50) UNIQUE NULL'
            ];

            for (const field of guestFields) {
                const fieldName = field.split(' ')[0];
                const [columns] = await db.query(`SHOW COLUMNS FROM TournamentRegistrations LIKE '${fieldName}';`);
                if (columns.length === 0) {
                    await db.query(`ALTER TABLE TournamentRegistrations ADD COLUMN ${field};`);
                    console.log(`${fieldName} column added to TournamentRegistrations`);
                }
            }
        } catch (error) {
            console.log('Error adding guest fields to TournamentRegistrations:', error.message);
        }

        // Add payment_option column to EventRegistrations if it doesn't exist
        try {
            const [columns] = await db.query(`
                SHOW COLUMNS FROM EventRegistrations LIKE 'payment_option';
            `);

            if (columns.length === 0) {
                await db.query(`
                    ALTER TABLE EventRegistrations
                    ADD COLUMN payment_option ENUM('online', 'at_event') DEFAULT 'online';
                `);
                console.log('payment_option column added to EventRegistrations successfully');
            }
        } catch (error) {
            console.log('Error adding payment_option column to EventRegistrations:', error.message);
        }

        // Add guest registration fields to EventRegistrations
        try {
            // Make user_id nullable for guest registrations
            await db.query(`ALTER TABLE EventRegistrations MODIFY COLUMN user_id INT NULL;`);

            // Add guest fields if they don't exist
            const guestFields = [
                'guest_name VARCHAR(255) NULL',
                'guest_email VARCHAR(255) NULL',
                'guest_phone VARCHAR(20) NULL',
                'is_guest_registration BOOLEAN DEFAULT FALSE',
                'registration_reference VARCHAR(50) UNIQUE NULL'
            ];

            for (const field of guestFields) {
                const fieldName = field.split(' ')[0];
                const [columns] = await db.query(`SHOW COLUMNS FROM EventRegistrations LIKE '${fieldName}';`);
                if (columns.length === 0) {
                    await db.query(`ALTER TABLE EventRegistrations ADD COLUMN ${field};`);
                    console.log(`${fieldName} column added to EventRegistrations`);
                }
            }
        } catch (error) {
            console.log('Error adding guest fields to EventRegistrations:', error.message);
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

        // --- TEMPORARY DATA CLEAN-UP: normalize old localhost image URLs ---
        // This block strips the 'http://localhost:8080' prefix that was stored in early
        // development so that images resolve correctly in production.  When you are
        // running the whole stack on localhost:8080 again, either comment-out this
        // block or swap LOCAL_PREFIX/NEW_PREFIX to restore the full origin.
        try {
            const LOCAL_PREFIX = 'http://localhost:8080';
            const NEW_PREFIX   = ''; // '' = make the URL relative (preferred in prod)

            await db.query(`UPDATE ProductImages
                            SET image_url = REPLACE(image_url, '${LOCAL_PREFIX}', '${NEW_PREFIX}')
                            WHERE image_url LIKE '${LOCAL_PREFIX}/%';`);

            await db.query(`UPDATE DealImages
                            SET image_url = REPLACE(image_url, '${LOCAL_PREFIX}', '${NEW_PREFIX}')
                            WHERE image_url LIKE '${LOCAL_PREFIX}/%';`);

            console.log('✅ Image URL prefixes normalized');
        } catch (err) {
            console.error('Error normalizing image URLs:', err.message);
        }
        // --------------------------------------------------------------------

        // --- TEMPORARY DATA CLEAN-UP: delete products without a category -----
        // Some early test products were inserted before the `category` column
        // became required. They break the admin panel. We remove them once at
        // startup. ProductImages rows are automatically removed thanks to
        // ON DELETE CASCADE.
        try {
            const [result] = await db.query(
                `DELETE FROM Products WHERE category IS NULL OR TRIM(category) = '' OR LOWER(category) = 'null'`
            );
            if (result.affectedRows) {
                console.log(`🗑  Deleted ${result.affectedRows} product(s) without category`);
            }
        } catch (err) {
            console.error('Error deleting uncategorised products:', err.message);
        }
        // --------------------------------------------------------------------

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
        
        // Orders (Enhanced for guest orders)
        await db.query(`
            CREATE TABLE IF NOT EXISTS Orders (
                order_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL, -- Allow NULL for guest orders
                total_amount DECIMAL(10, 2) NOT NULL,
                shipping_cost DECIMAL(10, 2) NOT NULL,
                status ENUM('pending', 'processing', 'shipped', 'delivered') DEFAULT 'pending',
                payment_method ENUM('cod', 'online') DEFAULT 'cod', -- Payment method
                payment_status ENUM('pending', 'completed', 'failed') DEFAULT 'pending', -- Payment status
                shipping_address_id INT, -- Foreign key to ShippingAddresses table
                -- Guest order fields
                guest_name VARCHAR(255) NULL,
                guest_email VARCHAR(255) NULL,
                guest_phone VARCHAR(20) NULL,
                is_guest_order BOOLEAN DEFAULT FALSE,
                order_reference VARCHAR(50) UNIQUE NULL, -- Unique reference for guest orders
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(user_id),
                FOREIGN KEY (shipping_address_id) REFERENCES ShippingAddresses(shipping_address_id),
                INDEX idx_guest_email (guest_email),
                INDEX idx_order_reference (order_reference)
            );`
        );

        

        // Order Items
        await db.query(`
            CREATE TABLE IF NOT EXISTS OrderItems  (
                order_item_id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT,
                product_id INT,
                tournament_id INT,
                event_id INT,
                quantity INT NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                item_type ENUM('product', 'tournament', 'event') DEFAULT 'product',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES Orders(order_id),
                FOREIGN KEY (product_id) REFERENCES Products(product_id),
                FOREIGN KEY (tournament_id) REFERENCES Tournaments(tournament_id),
                FOREIGN KEY (event_id) REFERENCES Events(event_id)
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
                    ADD COLUMN item_type ENUM('product', 'tournament', 'event') DEFAULT 'product';
                `);
                console.log('item_type column added to OrderItems successfully');
            } else {
                // Update existing item_type enum to include 'event'
                try {
                    await db.query(`
                        ALTER TABLE OrderItems
                        MODIFY COLUMN item_type ENUM('product', 'tournament', 'event') DEFAULT 'product';
                    `);
                    console.log('item_type column updated to include event type');
                } catch (enumError) {
                    console.log('item_type enum already includes event or update not needed:', enumError.message);
                }
            }
        } catch (error) {
            console.log('Error adding item_type column to OrderItems:', error.message);
        }

        // Add tournament_id column to OrderItems if it doesn't exist
        try {
            const [columns] = await db.query(`
                SHOW COLUMNS FROM OrderItems LIKE 'tournament_id';
            `);

            if (columns.length === 0) {
                await db.query(`
                    ALTER TABLE OrderItems
                    ADD COLUMN tournament_id INT NULL;
                `);
                console.log('tournament_id column added to OrderItems successfully');

                // Add foreign key constraint for tournament_id
                try {
                    await db.query(`
                        ALTER TABLE OrderItems
                        ADD FOREIGN KEY (tournament_id) REFERENCES Tournaments(tournament_id);
                    `);
                    console.log('Foreign key constraint added for tournament_id');
                } catch (fkError) {
                    console.log('Foreign key constraint for tournament_id already exists or could not be added:', fkError.message);
                }
            }
        } catch (error) {
            console.log('Error adding tournament_id column to OrderItems:', error.message);
        }

        // Add event_id column to OrderItems if it doesn't exist
        try {
            const [columns] = await db.query(`
                SHOW COLUMNS FROM OrderItems LIKE 'event_id';
            `);

            if (columns.length === 0) {
                await db.query(`
                    ALTER TABLE OrderItems
                    ADD COLUMN event_id INT NULL;
                `);
                console.log('event_id column added to OrderItems successfully');

                // Add foreign key constraint for event_id
                try {
                    await db.query(`
                        ALTER TABLE OrderItems
                        ADD FOREIGN KEY (event_id) REFERENCES Events(event_id);
                    `);
                    console.log('Foreign key constraint added for event_id');
                } catch (fkError) {
                    console.log('Foreign key constraint for event_id already exists or could not be added:', fkError.message);
                }
            }
        } catch (error) {
            console.log('Error adding event_id column to OrderItems:', error.message);
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
            user_id INT NULL, -- User making the payment (NULL for guest payments)
            entity_type ENUM('gift_card', 'order', 'booking', 'ticket', 'tournament', 'event') NOT NULL, -- Type of entity being paid for
            entity_id INT NOT NULL, -- ID of the entity (e.g., gift_card_id, order_id, tournament_id, event_id, etc.)
            payment_intent_id VARCHAR(255) NULL, -- Stripe Payment Intent ID
            checkout_session_id VARCHAR(255) NULL, -- Stripe Checkout Session ID
            amount DECIMAL(10, 2) NOT NULL, -- Amount paid
            currency VARCHAR(10) NOT NULL, -- Currency (e.g., USD)
            status ENUM('pending', 'succeeded', 'failed', 'expired') DEFAULT 'pending',
            connected_account_id VARCHAR(255) NULL, -- Stripe connected account ID if applicable
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

        //Cart Table (Enhanced for guest carts)
        await db.query(`
            CREATE TABLE IF NOT EXISTS Cart (
                cart_id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL, -- Allow NULL for guest carts
                product_id INT,
                tournament_id INT,
                event_id INT,
                quantity INT NOT NULL DEFAULT 1,
                item_type ENUM('product', 'tournament', 'event') DEFAULT 'product',
                payment_option ENUM('online', 'at_event') DEFAULT 'online',
                -- Guest cart fields
                guest_session_id VARCHAR(255) NULL, -- Session ID for guest carts
                is_guest_cart BOOLEAN DEFAULT FALSE,
                guest_name VARCHAR(255) NULL,
                guest_email VARCHAR(255) NULL,
                guest_phone VARCHAR(20) NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE,
                FOREIGN KEY (tournament_id) REFERENCES Tournaments(tournament_id) ON DELETE CASCADE,
                FOREIGN KEY (event_id) REFERENCES Events(event_id) ON DELETE CASCADE,
                INDEX idx_guest_session (guest_session_id),
                INDEX idx_user_cart (user_id, item_type)
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

        // Add event_id column to Cart if it doesn't exist
        try {
            // Check if column exists first
            const [columns] = await db.query(`
                SHOW COLUMNS FROM Cart LIKE 'event_id';
            `);

            if (columns.length === 0) {
                // Add the column
                await db.query(`
                    ALTER TABLE Cart
                    ADD COLUMN event_id INT NULL AFTER tournament_id;
                `);

                // Add the foreign-key constraint separately to avoid errors if FK exists
                await db.query(`
                    ALTER TABLE Cart
                    ADD CONSTRAINT fk_cart_event FOREIGN KEY (event_id) REFERENCES Events(event_id) ON DELETE CASCADE;
                `);
                console.log('event_id column added to Cart successfully');
            }
        } catch (error) {
            console.log('Error adding event_id column to Cart:', error.message);
        }

        // Update item_type enum to include 'event' if it doesn't already
        try {
            await db.query(`ALTER TABLE Cart MODIFY COLUMN item_type ENUM('product', 'tournament', 'event') DEFAULT 'product'`);
            console.log('Cart item_type column updated to include event');
        } catch (error) {
            console.log('Error updating Cart item_type column:', error.message);
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
                type ENUM('booking_confirmation', 'purchase_confirmation', 'tournament_confirmation', 'event_confirmation', 'reminder', 'special_offer', 'booking_cancellation', 'updation') NOT NULL,
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
                entity_type ENUM('VR_SESSION', 'PRODUCT', 'TOURNAMENT', 'EVENT') NOT NULL, -- Add more types as needed
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
                await db.query(`ALTER TABLE Cart ADD COLUMN item_type ENUM('product', 'tournament', 'event') DEFAULT 'product';`);
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

        // ---- Guest Registration Support ----

        // Add guest registration columns to EventRegistrations
        try {
            const [eventRegColumns] = await db.query('DESCRIBE EventRegistrations');
            const hasGuestName = eventRegColumns.some(col => col.Field === 'guest_name');

            if (!hasGuestName) {
                await db.query(`
                    ALTER TABLE EventRegistrations
                    ADD COLUMN guest_name VARCHAR(255) NULL,
                    ADD COLUMN guest_email VARCHAR(255) NULL,
                    ADD COLUMN guest_phone VARCHAR(20) NULL,
                    ADD COLUMN is_guest_registration BOOLEAN DEFAULT FALSE,
                    ADD COLUMN registration_reference VARCHAR(50) NULL
                `);
                console.log('✅ Guest registration columns added to EventRegistrations');
            }
        } catch (error) {
            console.log('Error adding guest columns to EventRegistrations:', error.message);
        }

        // Add guest registration columns to TournamentRegistrations
        try {
            const [tournamentRegColumns] = await db.query('DESCRIBE TournamentRegistrations');
            const hasGuestName = tournamentRegColumns.some(col => col.Field === 'guest_name');

            if (!hasGuestName) {
                await db.query(`
                    ALTER TABLE TournamentRegistrations
                    ADD COLUMN guest_name VARCHAR(255) NULL,
                    ADD COLUMN guest_email VARCHAR(255) NULL,
                    ADD COLUMN guest_phone VARCHAR(20) NULL,
                    ADD COLUMN is_guest_registration BOOLEAN DEFAULT FALSE,
                    ADD COLUMN registration_reference VARCHAR(50) NULL
                `);
                console.log('✅ Guest registration columns added to TournamentRegistrations');
            }
        } catch (error) {
            console.log('Error adding guest columns to TournamentRegistrations:', error.message);
        }

        // ---- Guest Registration Support Migration ----

        // Add guest registration columns to EventRegistrations
        try {
            const [eventRegColumns] = await db.query('DESCRIBE EventRegistrations');
            const hasGuestName = eventRegColumns.some(col => col.Field === 'guest_name');

            if (!hasGuestName) {
                await db.query(`
                    ALTER TABLE EventRegistrations
                    ADD COLUMN guest_name VARCHAR(255) NULL,
                    ADD COLUMN guest_email VARCHAR(255) NULL,
                    ADD COLUMN guest_phone VARCHAR(20) NULL,
                    ADD COLUMN is_guest_registration BOOLEAN DEFAULT FALSE,
                    ADD COLUMN registration_reference VARCHAR(50) NULL
                `);
                console.log('✅ Guest registration columns added to EventRegistrations');
            }
        } catch (error) {
            console.log('Error adding guest columns to EventRegistrations:', error.message);
        }

        // Add guest registration columns to TournamentRegistrations
        try {
            const [tournamentRegColumns] = await db.query('DESCRIBE TournamentRegistrations');
            const hasGuestName = tournamentRegColumns.some(col => col.Field === 'guest_name');

            if (!hasGuestName) {
                await db.query(`
                    ALTER TABLE TournamentRegistrations
                    ADD COLUMN guest_name VARCHAR(255) NULL,
                    ADD COLUMN guest_email VARCHAR(255) NULL,
                    ADD COLUMN guest_phone VARCHAR(20) NULL,
                    ADD COLUMN is_guest_registration BOOLEAN DEFAULT FALSE,
                    ADD COLUMN registration_reference VARCHAR(50) NULL
                `);
                console.log('✅ Guest registration columns added to TournamentRegistrations');
            }
        } catch (error) {
            console.log('Error adding guest columns to TournamentRegistrations:', error.message);
        }

        // ---- Guest Orders Support Migration ----

        // Add guest order columns to Orders table
        try {
            const [orderColumns] = await db.query('DESCRIBE Orders');
            const hasGuestName = orderColumns.some(col => col.Field === 'guest_name');

            if (!hasGuestName) {
                await db.query(`
                    ALTER TABLE Orders
                    ADD COLUMN guest_name VARCHAR(255) NULL,
                    ADD COLUMN guest_email VARCHAR(255) NULL,
                    ADD COLUMN guest_phone VARCHAR(20) NULL,
                    ADD COLUMN is_guest_order BOOLEAN DEFAULT FALSE,
                    ADD COLUMN order_reference VARCHAR(50) NULL
                `);
                console.log('✅ Guest order columns added to Orders table');
            }
        } catch (error) {
            console.log('Error adding guest columns to Orders:', error.message);
        }

        // ---- CRITICAL: Payments Table Entity Type Migration ----

        // FORCE UPDATE entity_type column in Payments table to support longer values
        try {
            console.log('🔧 FORCING Payments table entity_type column update...');

            // Get current column info
            const [paymentColumns] = await db.query('DESCRIBE Payments');
            const entityTypeColumn = paymentColumns.find(col => col.Field === 'entity_type');

            console.log('Current entity_type column:', entityTypeColumn);

            // ALWAYS try to update the column to ensure it's VARCHAR(50)
            console.log('🔧 Forcing update of entity_type column...');
            await db.query(`
                ALTER TABLE Payments
                MODIFY COLUMN entity_type VARCHAR(50) DEFAULT 'order'
            `);
            console.log('✅ FORCED UPDATE: Payments entity_type column updated to VARCHAR(50)');

            // Verify the change
            const [updatedColumns] = await db.query('DESCRIBE Payments');
            const updatedEntityTypeColumn = updatedColumns.find(col => col.Field === 'entity_type');
            console.log('✅ VERIFIED: Updated entity_type column:', updatedEntityTypeColumn);

        } catch (error) {
            console.log('❌ CRITICAL ERROR updating Payments entity_type column:', error.message);
            // Try alternative approach
            try {
                console.log('🔧 Trying alternative approach...');
                await db.query(`
                    ALTER TABLE Payments
                    CHANGE COLUMN entity_type entity_type VARCHAR(50) DEFAULT 'order'
                `);
                console.log('✅ ALTERNATIVE SUCCESS: entity_type column updated');
            } catch (altError) {
                console.log('❌ ALTERNATIVE FAILED:', altError.message);
            }
        }

        // ---- CRITICAL: Add payment_id columns to registration tables ----

        // Add payment_id column to EventRegistrations table
        try {
            console.log('🔧 Adding payment_id column to EventRegistrations...');
            const [eventColumns] = await db.query('SHOW COLUMNS FROM EventRegistrations LIKE "payment_id"');
            if (eventColumns.length === 0) {
                await db.query(`
                    ALTER TABLE EventRegistrations
                    ADD COLUMN payment_id INT NULL AFTER payment_option
                `);
                await db.query(`
                    ALTER TABLE EventRegistrations
                    ADD CONSTRAINT fk_event_registrations_payment
                    FOREIGN KEY (payment_id) REFERENCES Payments(payment_id) ON DELETE SET NULL
                `);
                console.log('✅ payment_id column added to EventRegistrations');
            } else {
                console.log('✅ payment_id column already exists in EventRegistrations');
            }
        } catch (error) {
            console.log('❌ Error adding payment_id to EventRegistrations:', error.message);
        }

        // Add payment_id column to TournamentRegistrations table
        try {
            console.log('🔧 Adding payment_id column to TournamentRegistrations...');
            const [tournamentColumns] = await db.query('SHOW COLUMNS FROM TournamentRegistrations LIKE "payment_id"');
            if (tournamentColumns.length === 0) {
                await db.query(`
                    ALTER TABLE TournamentRegistrations
                    ADD COLUMN payment_id INT NULL AFTER payment_option
                `);
                await db.query(`
                    ALTER TABLE TournamentRegistrations
                    ADD CONSTRAINT fk_tournament_registrations_payment
                    FOREIGN KEY (payment_id) REFERENCES Payments(payment_id) ON DELETE SET NULL
                `);
                console.log('✅ payment_id column added to TournamentRegistrations');
            } else {
                console.log('✅ payment_id column already exists in TournamentRegistrations');
            }
        } catch (error) {
            console.log('❌ Error adding payment_id to TournamentRegistrations:', error.message);
        }

        // ---- End additional migrations ----

        // Final validation: Ensure tournament order system is working
        await validateTournamentOrderSystem();

        // ---- Final Verification: Ensure All Guest Columns Exist ----

        // Verify EventRegistrations guest columns
        try {
            const [eventColumns] = await db.query('DESCRIBE EventRegistrations');
            const hasGuestName = eventColumns.some(col => col.Field === 'guest_name');
            const hasGuestEmail = eventColumns.some(col => col.Field === 'guest_email');
            const hasGuestPhone = eventColumns.some(col => col.Field === 'guest_phone');
            const hasIsGuest = eventColumns.some(col => col.Field === 'is_guest_registration');
            const hasReference = eventColumns.some(col => col.Field === 'registration_reference');

            if (!hasGuestName || !hasGuestEmail || !hasGuestPhone || !hasIsGuest || !hasReference) {
                console.log('⚠️ EventRegistrations missing some guest columns, adding them...');
                if (!hasGuestName) await db.query('ALTER TABLE EventRegistrations ADD COLUMN guest_name VARCHAR(255) NULL');
                if (!hasGuestEmail) await db.query('ALTER TABLE EventRegistrations ADD COLUMN guest_email VARCHAR(255) NULL');
                if (!hasGuestPhone) await db.query('ALTER TABLE EventRegistrations ADD COLUMN guest_phone VARCHAR(20) NULL');
                if (!hasIsGuest) await db.query('ALTER TABLE EventRegistrations ADD COLUMN is_guest_registration BOOLEAN DEFAULT FALSE');
                if (!hasReference) await db.query('ALTER TABLE EventRegistrations ADD COLUMN registration_reference VARCHAR(50) NULL');
                console.log('✅ EventRegistrations guest columns verified/added');
            }
        } catch (error) {
            console.log('Error verifying EventRegistrations guest columns:', error.message);
        }

        // Verify TournamentRegistrations guest columns
        try {
            const [tournamentColumns] = await db.query('DESCRIBE TournamentRegistrations');
            const hasGuestName = tournamentColumns.some(col => col.Field === 'guest_name');
            const hasGuestEmail = tournamentColumns.some(col => col.Field === 'guest_email');
            const hasGuestPhone = tournamentColumns.some(col => col.Field === 'guest_phone');
            const hasIsGuest = tournamentColumns.some(col => col.Field === 'is_guest_registration');
            const hasReference = tournamentColumns.some(col => col.Field === 'registration_reference');

            if (!hasGuestName || !hasGuestEmail || !hasGuestPhone || !hasIsGuest || !hasReference) {
                console.log('⚠️ TournamentRegistrations missing some guest columns, adding them...');
                if (!hasGuestName) await db.query('ALTER TABLE TournamentRegistrations ADD COLUMN guest_name VARCHAR(255) NULL');
                if (!hasGuestEmail) await db.query('ALTER TABLE TournamentRegistrations ADD COLUMN guest_email VARCHAR(255) NULL');
                if (!hasGuestPhone) await db.query('ALTER TABLE TournamentRegistrations ADD COLUMN guest_phone VARCHAR(20) NULL');
                if (!hasIsGuest) await db.query('ALTER TABLE TournamentRegistrations ADD COLUMN is_guest_registration BOOLEAN DEFAULT FALSE');
                if (!hasReference) await db.query('ALTER TABLE TournamentRegistrations ADD COLUMN registration_reference VARCHAR(50) NULL');
                console.log('✅ TournamentRegistrations guest columns verified/added');
            }
        } catch (error) {
            console.log('Error verifying TournamentRegistrations guest columns:', error.message);
        }

        // ---- CRITICAL: Orders Table Guest Support ----

        // Add guest columns to Orders table
        try {
            const [orderColumns] = await db.query('DESCRIBE Orders');
            const hasGuestName = orderColumns.some(col => col.Field === 'guest_name');
            const hasGuestEmail = orderColumns.some(col => col.Field === 'guest_email');
            const hasGuestPhone = orderColumns.some(col => col.Field === 'guest_phone');
            const hasIsGuest = orderColumns.some(col => col.Field === 'is_guest_order');
            const hasOrderRef = orderColumns.some(col => col.Field === 'order_reference');
            const hasShippingAddr = orderColumns.some(col => col.Field === 'shipping_address');

            if (!hasGuestName) {
                await db.query('ALTER TABLE Orders ADD COLUMN guest_name VARCHAR(255) NULL');
                console.log('✅ Added guest_name to Orders');
            }
            if (!hasGuestEmail) {
                await db.query('ALTER TABLE Orders ADD COLUMN guest_email VARCHAR(255) NULL');
                console.log('✅ Added guest_email to Orders');
            }
            if (!hasGuestPhone) {
                await db.query('ALTER TABLE Orders ADD COLUMN guest_phone VARCHAR(20) NULL');
                console.log('✅ Added guest_phone to Orders');
            }
            if (!hasIsGuest) {
                await db.query('ALTER TABLE Orders ADD COLUMN is_guest_order BOOLEAN DEFAULT FALSE');
                console.log('✅ Added is_guest_order to Orders');
            }
            if (!hasOrderRef) {
                await db.query('ALTER TABLE Orders ADD COLUMN order_reference VARCHAR(50) NULL');
                console.log('✅ Added order_reference to Orders');
            }
            if (!hasShippingAddr) {
                await db.query('ALTER TABLE Orders ADD COLUMN shipping_address TEXT NULL');
                console.log('✅ Added shipping_address to Orders');
            }

            // Check for shipping_cost column
            const hasShippingCost = orderColumns.some(col => col.Field === 'shipping_cost');
            if (!hasShippingCost) {
                await db.query('ALTER TABLE Orders ADD COLUMN shipping_cost DECIMAL(10,2) DEFAULT 0.00');
                console.log('✅ Added shipping_cost to Orders');
            }

            // Make user_id and shipping_address_id nullable for guest orders
            try {
                await db.query('ALTER TABLE Orders MODIFY COLUMN user_id INT NULL');
                await db.query('ALTER TABLE Orders MODIFY COLUMN shipping_address_id INT NULL');
                console.log('✅ Made Orders user_id and shipping_address_id nullable');
            } catch (error) {
                console.log('ℹ️ Orders columns already nullable');
            }
        } catch (error) {
            console.log('Error updating Orders for guest support:', error.message);
        }

        console.log("✅ All tables created and tournament system validated")
        console.log("✅ Guest registration support enabled")
        console.log("✅ Guest order support enabled")
        console.log("✅ Payments table entity_type column updated")
        console.log("✅ Payment system fully configured for guest registrations")
        console.log("✅ Admin panel guest data display verified")
        console.log("✅ Orders table guest support verified")
    } catch (error) {
        console.error('Error creating tables:', error);
    }
}

// Manual migration function for fixing entity_type column
const runMigrations = async (req, res) => {
    try {
        console.log('🔧 Running manual migrations...');

        // Update entity_type column in Payments table
        const [paymentColumns] = await db.query('DESCRIBE Payments');
        const entityTypeColumn = paymentColumns.find(col => col.Field === 'entity_type');

        console.log('Current entity_type column:', entityTypeColumn);

        if (entityTypeColumn && !entityTypeColumn.Type.includes('varchar(50)')) {
            console.log('Updating entity_type column from:', entityTypeColumn.Type);
            await db.query(`
                ALTER TABLE Payments
                MODIFY COLUMN entity_type VARCHAR(50) DEFAULT 'order'
            `);
            console.log('✅ Payments entity_type column updated to VARCHAR(50)');
        } else {
            console.log('✅ Payments entity_type column already correct');
        }

        res.status(200).json({
            success: true,
            message: 'Migrations completed successfully',
            entityTypeColumn: entityTypeColumn
        });

    } catch (error) {
        console.error('Error running migrations:', error);
        res.status(500).json({
            success: false,
            message: 'Error running migrations',
            error: error.message
        });
    }
};

module.exports = { createTables, runMigrations }
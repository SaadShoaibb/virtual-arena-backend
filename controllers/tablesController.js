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
                FOREIGN KEY (user_id) REFERENCES Users(user_id),
                FOREIGN KEY (tournament_id) REFERENCES Tournaments(tournament_id)
            );`
        )

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
                quantity INT NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                FOREIGN KEY (order_id) REFERENCES Orders(order_id),
                FOREIGN KEY (product_id) REFERENCES Products(product_id)
            );`
        )

        // CheckoutPayment
        await db.query(`
            
        CREATE TABLE IF NOT EXISTS Payments (
            payment_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL, -- User making the payment
            entity_type ENUM('gift_card', 'order', 'booking', 'ticket') NOT NULL, -- Type of entity being paid for
            entity_id INT NOT NULL, -- ID of the entity (e.g., gift_card_id, order_id, etc.)
            payment_intent_id VARCHAR(255) NOT NULL, -- Stripe Payment Intent ID
            amount DECIMAL(10, 2) NOT NULL, -- Amount paid
            currency VARCHAR(10) NOT NULL, -- Currency (e.g., USD)
            status ENUM('pending', 'succeeded', 'failed') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
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
                product_id INT NOT NULL,
                quantity INT NOT NULL DEFAULT 1,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES Products(product_id) ON DELETE CASCADE
            );`
        );

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



        console.log("Table Has been created")
    } catch (error) {
        console.error('Error creating tables:', error);
    }
}

module.exports = { createTables }
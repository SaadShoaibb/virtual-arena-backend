const express = require('express');
const colors = require('colors');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const mySqlPool = require('./config/db');
const { createTables } = require('./controllers/tablesController');
const updateTournamentsTable = require('./migrations/update-tournaments-table');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(morgan('dev'));

// Special Stripe webhook route — must come BEFORE body parsers
// This route uses express.raw to preserve the raw request body for Stripe signature verification
app.post('/api/v1/payment/webhook', express.raw({ type: 'application/json' }), require('./controllers/webhookController').handleWebhook);

// Direct webhook status endpoint for debugging
app.get('/webhook-status', require('./controllers/webhookController').getWebhookStatus);

// JSON parser for all other routes
app.use(express.json());

// API Routes
app.use('/api/v1/auth', require('./routes/authRoutes'));
app.use('/api/v1/admin', require('./routes/adminRoutes'));
app.use('/api/v1/user', require('./routes/userRoutes'));
app.use('/api/v1/payment', require('./routes/paymentRoutes'));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Home route
app.get('/', (req, res) => {
  res.send("<h1>Virtual Arena Backend is working correctly</h1>");
});

// Start server
const PORT = process.env.PORT || 8080;

mySqlPool.query('SELECT 1')
  .then(async () => {
    console.log("✅ MySQL DB connected".green);

    // Create tables first
    await createTables();
    console.log("✅ Database tables created/verified".green);

    // ---- IMMEDIATE: Critical Guest Columns Migration ----
    console.log("🔧 IMMEDIATE: Adding critical guest columns...");

    // Add guest columns to EventRegistrations immediately
    try {
      const eventGuestFields = ['guest_name', 'guest_email', 'guest_phone', 'is_guest_registration', 'registration_reference'];
      for (const field of eventGuestFields) {
        try {
          const [columns] = await mySqlPool.query(`SHOW COLUMNS FROM EventRegistrations LIKE '${field}'`);
          if (columns.length === 0) {
            let fieldDef = `${field} VARCHAR(255) NULL`;
            if (field === 'is_guest_registration') fieldDef = `${field} BOOLEAN DEFAULT FALSE`;
            if (field === 'guest_phone') fieldDef = `${field} VARCHAR(20) NULL`;

            await mySqlPool.query(`ALTER TABLE EventRegistrations ADD COLUMN ${fieldDef}`);
            console.log(`✅ IMMEDIATE: Added ${field} to EventRegistrations`);
          }
        } catch (error) {
          if (!error.message.includes('Duplicate column')) {
            console.log(`⚠️ Error adding ${field} to EventRegistrations:`, error.message);
          }
        }
      }

      // Make user_id nullable
      await mySqlPool.query('ALTER TABLE EventRegistrations MODIFY COLUMN user_id INT NULL');
      console.log('✅ IMMEDIATE: Made EventRegistrations.user_id nullable');

      // Add registration_date column if missing
      try {
        const [regDateColumns] = await mySqlPool.query(`SHOW COLUMNS FROM EventRegistrations LIKE 'registration_date'`);
        if (regDateColumns.length === 0) {
          await mySqlPool.query(`ALTER TABLE EventRegistrations ADD COLUMN registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
          console.log('✅ IMMEDIATE: Added registration_date to EventRegistrations');
        }
      } catch (error) {
        console.log('⚠️ Error adding registration_date to EventRegistrations:', error.message);
      }
    } catch (error) {
      console.log('⚠️ EventRegistrations immediate migration error:', error.message);
    }

    // Add guest columns to TournamentRegistrations immediately
    try {
      const tournamentGuestFields = ['guest_name', 'guest_email', 'guest_phone', 'is_guest_registration', 'registration_reference'];
      for (const field of tournamentGuestFields) {
        try {
          const [columns] = await mySqlPool.query(`SHOW COLUMNS FROM TournamentRegistrations LIKE '${field}'`);
          if (columns.length === 0) {
            let fieldDef = `${field} VARCHAR(255) NULL`;
            if (field === 'is_guest_registration') fieldDef = `${field} BOOLEAN DEFAULT FALSE`;
            if (field === 'guest_phone') fieldDef = `${field} VARCHAR(20) NULL`;

            await mySqlPool.query(`ALTER TABLE TournamentRegistrations ADD COLUMN ${fieldDef}`);
            console.log(`✅ IMMEDIATE: Added ${field} to TournamentRegistrations`);
          }
        } catch (error) {
          if (!error.message.includes('Duplicate column')) {
            console.log(`⚠️ Error adding ${field} to TournamentRegistrations:`, error.message);
          }
        }
      }

      // Make user_id nullable
      await mySqlPool.query('ALTER TABLE TournamentRegistrations MODIFY COLUMN user_id INT NULL');
      console.log('✅ IMMEDIATE: Made TournamentRegistrations.user_id nullable');

      // Add registration_date column if missing
      try {
        const [regDateColumns] = await mySqlPool.query(`SHOW COLUMNS FROM TournamentRegistrations LIKE 'registration_date'`);
        if (regDateColumns.length === 0) {
          await mySqlPool.query(`ALTER TABLE TournamentRegistrations ADD COLUMN registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
          console.log('✅ IMMEDIATE: Added registration_date to TournamentRegistrations');
        }
      } catch (error) {
        console.log('⚠️ Error adding registration_date to TournamentRegistrations:', error.message);
      }
    } catch (error) {
      console.log('⚠️ TournamentRegistrations immediate migration error:', error.message);
    }

    console.log("✅ IMMEDIATE: Critical guest columns migration completed".green);

    // ---- CRITICAL: Orders Table Guest Support Migration ----
    console.log("🔧 Adding guest support to Orders table...");

    try {
      // Add guest columns to Orders table
      const orderGuestFields = [
        'guest_name VARCHAR(255) NULL',
        'guest_email VARCHAR(255) NULL',
        'guest_phone VARCHAR(20) NULL',
        'is_guest_order BOOLEAN DEFAULT FALSE',
        'order_reference VARCHAR(50) NULL',
        'shipping_address TEXT NULL',
        'shipping_cost DECIMAL(10,2) DEFAULT 0.00',
        'payment_method VARCHAR(20) DEFAULT "online"'
      ];

      for (const field of orderGuestFields) {
        const fieldName = field.split(' ')[0];
        try {
          const [columns] = await mySqlPool.query(`SHOW COLUMNS FROM Orders LIKE '${fieldName}'`);
          if (columns.length === 0) {
            await mySqlPool.query(`ALTER TABLE Orders ADD COLUMN ${field}`);
            console.log(`✅ Added ${fieldName} to Orders`);
          }
        } catch (error) {
          if (!error.message.includes('Duplicate column')) {
            console.log(`⚠️ Error adding ${fieldName} to Orders:`, error.message);
          }
        }
      }

      // Make user_id nullable for guest orders
      try {
        await mySqlPool.query('ALTER TABLE Orders MODIFY COLUMN user_id INT NULL');
        console.log('✅ Made Orders.user_id nullable');
      } catch (error) {
        console.log('ℹ️ Orders.user_id already nullable');
      }

      // Make shipping_address_id nullable for guest orders
      try {
        await mySqlPool.query('ALTER TABLE Orders MODIFY COLUMN shipping_address_id INT NULL');
        console.log('✅ Made Orders.shipping_address_id nullable');
      } catch (error) {
        console.log('ℹ️ Orders.shipping_address_id already nullable');
      }
    } catch (error) {
      console.log('❌ Error updating Orders for guest support:', error.message);
    }

    console.log("✅ Orders table guest support migration completed".green);



    // Run migrations to update existing tables
    try {
      await updateTournamentsTable();
      console.log("✅ Database migrations completed".green);
    } catch (error) {
      console.log("⚠️  Migration warning:".yellow, error.message);
      // Don't exit on migration errors, just log them
    }

    // ---- CRITICAL: Payment System Migrations ----
    console.log("🔧 Running critical payment system migrations...");

    // 1. Fix Payments table entity_type column
    try {
      console.log('🔧 Updating Payments table entity_type column...');
      await mySqlPool.query(`
        ALTER TABLE Payments
        MODIFY COLUMN entity_type VARCHAR(50) DEFAULT 'order'
      `);
      console.log('✅ Payments entity_type column updated to VARCHAR(50)');
    } catch (error) {
      if (!error.message.includes('already')) {
        console.log('❌ Error updating Payments entity_type:', error.message);
      }
    }

    // 2. Add payment_id column to EventRegistrations
    try {
      console.log('🔧 Adding payment_id column to EventRegistrations...');
      const [eventColumns] = await mySqlPool.query('SHOW COLUMNS FROM EventRegistrations LIKE "payment_id"');
      if (eventColumns.length === 0) {
        await mySqlPool.query(`
          ALTER TABLE EventRegistrations
          ADD COLUMN payment_id INT NULL AFTER payment_option
        `);
        await mySqlPool.query(`
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

    // 3. Add payment_id column to TournamentRegistrations
    try {
      console.log('🔧 Adding payment_id column to TournamentRegistrations...');
      const [tournamentColumns] = await mySqlPool.query('SHOW COLUMNS FROM TournamentRegistrations LIKE "payment_id"');
      if (tournamentColumns.length === 0) {
        await mySqlPool.query(`
          ALTER TABLE TournamentRegistrations
          ADD COLUMN payment_id INT NULL AFTER payment_option
        `);
        await mySqlPool.query(`
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

    console.log("✅ Critical payment system migrations completed".green);

    // ---- CRITICAL: Guest Registration Data Migrations ----
    console.log("🔧 Ensuring guest registration columns exist...");

    // 4. Ensure EventRegistrations has all guest columns
    try {
      const eventGuestFields = [
        'guest_name VARCHAR(255) NULL',
        'guest_email VARCHAR(255) NULL',
        'guest_phone VARCHAR(20) NULL',
        'is_guest_registration BOOLEAN DEFAULT FALSE',
        'registration_reference VARCHAR(50) NULL'
      ];

      for (const field of eventGuestFields) {
        const fieldName = field.split(' ')[0];
        try {
          const [columns] = await mySqlPool.query(`SHOW COLUMNS FROM EventRegistrations LIKE '${fieldName}'`);
          if (columns.length === 0) {
            await mySqlPool.query(`ALTER TABLE EventRegistrations ADD COLUMN ${field}`);
            console.log(`✅ Added ${fieldName} to EventRegistrations`);
          }
        } catch (error) {
          if (!error.message.includes('Duplicate column')) {
            console.log(`⚠️ Error adding ${fieldName} to EventRegistrations:`, error.message);
          }
        }
      }

      // Make user_id nullable for guest registrations
      try {
        await mySqlPool.query('ALTER TABLE EventRegistrations MODIFY COLUMN user_id INT NULL');
        console.log('✅ Made EventRegistrations.user_id nullable');
      } catch (error) {
        console.log('ℹ️ EventRegistrations.user_id already nullable');
      }
    } catch (error) {
      console.log('❌ Error updating EventRegistrations for guests:', error.message);
    }

    // 5. Ensure TournamentRegistrations has all guest columns
    try {
      const tournamentGuestFields = [
        'guest_name VARCHAR(255) NULL',
        'guest_email VARCHAR(255) NULL',
        'guest_phone VARCHAR(20) NULL',
        'is_guest_registration BOOLEAN DEFAULT FALSE',
        'registration_reference VARCHAR(50) NULL'
      ];

      for (const field of tournamentGuestFields) {
        const fieldName = field.split(' ')[0];
        try {
          const [columns] = await mySqlPool.query(`SHOW COLUMNS FROM TournamentRegistrations LIKE '${fieldName}'`);
          if (columns.length === 0) {
            await mySqlPool.query(`ALTER TABLE TournamentRegistrations ADD COLUMN ${field}`);
            console.log(`✅ Added ${fieldName} to TournamentRegistrations`);
          }
        } catch (error) {
          if (!error.message.includes('Duplicate column')) {
            console.log(`⚠️ Error adding ${fieldName} to TournamentRegistrations:`, error.message);
          }
        }
      }

      // Make user_id nullable for guest registrations
      try {
        await mySqlPool.query('ALTER TABLE TournamentRegistrations MODIFY COLUMN user_id INT NULL');
        console.log('✅ Made TournamentRegistrations.user_id nullable');
      } catch (error) {
        console.log('ℹ️ TournamentRegistrations.user_id already nullable');
      }
    } catch (error) {
      console.log('❌ Error updating TournamentRegistrations for guests:', error.message);
    }

    console.log("✅ Guest registration data migrations completed".green);

    // Apply enhanced booking system database updates
    try {
      await applyBookingSystemUpdates();
      console.log("✅ Enhanced booking system database updates completed".green);
    } catch (error) {
      console.log("⚠️  Enhanced booking system update warning:".yellow, error.message);
      // Don't exit on migration errors, just log them
    }

    // Apply guest payment support updates
    try {
      await applyGuestPaymentUpdates();
      console.log("✅ Guest payment support database updates completed".green);
    } catch (error) {
      console.log("⚠️  Guest payment update warning:".yellow, error.message);
      // Don't exit on migration errors, just log them
    }

    // Add updated_at column to Payments table
    try {
      await addUpdatedAtToPayments();
      console.log("✅ Payments table updated_at column added".green);
    } catch (error) {
      console.log("⚠️  Payments table update warning:".yellow, error.message);
      // Don't exit on migration errors, just log them
    }

    // Populate VR Sessions from pricing calculator
    try {
      await populateVRSessions();
      console.log("✅ VR Sessions populated from pricing calculator".green);
    } catch (error) {
      console.log("⚠️  VR Sessions population warning:".yellow, error.message);
      // Don't exit on migration errors, just log them
    }

    // Populate sample tournaments
    try {
      await populateSampleTournaments();
      console.log("✅ Sample tournaments populated".green);
    } catch (error) {
      console.log("⚠️  Sample tournaments population warning:".yellow, error.message);
      // Don't exit on migration errors, just log them
    }

    // Populate sample events
    try {
      await populateSampleEvents();
      console.log("✅ Sample events populated".green);
    } catch (error) {
      console.log("⚠️  Sample events population warning:".yellow, error.message);
      // Don't exit on migration errors, just log them
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`.white.bgMagenta);
    });
  })
  .catch((error) => {
    console.error("❌ DB connection failed:".red, error.message);
    process.exit(1);
  });

// Function to apply enhanced booking system database updates
async function applyBookingSystemUpdates() {
  try {
    console.log("🔄 Checking enhanced booking system database updates...");

    // Check if updates have already been applied by looking for machine_type field in VRSessions
    try {
      const [checkColumns] = await mySqlPool.query(`SHOW COLUMNS FROM VRSessions LIKE 'machine_type';`);
      if (checkColumns.length > 0) {
        console.log("ℹ️ Enhanced booking system updates already applied, skipping...");
        return;
      }
    } catch (error) {
      // Table might not exist yet, continue with updates
      console.log("ℹ️ VRSessions table not found or accessible, continuing with updates...");
    }

    console.log("🔄 Applying enhanced booking system database updates...");

    // 1. Add guest booking fields to Bookings table
    const bookingFields = [
      'guest_name VARCHAR(255) NULL',
      'guest_email VARCHAR(255) NULL',
      'guest_phone VARCHAR(20) NULL',
      'is_guest_booking BOOLEAN DEFAULT FALSE',
      'booking_reference VARCHAR(50) UNIQUE NULL',
      'payment_method ENUM("online", "at_venue") DEFAULT "online"',
      'payment_id INT NULL'
    ];

    // Make user_id nullable for guest bookings
    try {
      await mySqlPool.query('ALTER TABLE Bookings MODIFY COLUMN user_id INT NULL;');
      console.log("✅ Made Bookings.user_id nullable");
    } catch (error) {
      console.log("ℹ️ Bookings.user_id already nullable or modification not needed");
    }

    // Add all booking fields in one batch
    for (const field of bookingFields) {
      const fieldName = field.split(' ')[0];
      try {
        await mySqlPool.query(`ALTER TABLE Bookings ADD COLUMN ${field};`);
        console.log(`✅ Added ${fieldName} to Bookings table`);
      } catch (error) {
        if (error.message.includes('Duplicate column name')) {
          console.log(`ℹ️ ${fieldName} already exists in Bookings table`);
        } else {
          console.log(`⚠️ Error adding ${fieldName} to Bookings:`, error.message);
        }
      }
    }

    // 2. Add guest order fields to Orders table
    const orderFields = [
      'guest_name VARCHAR(255) NULL',
      'guest_email VARCHAR(255) NULL',
      'guest_phone VARCHAR(20) NULL',
      'is_guest_order BOOLEAN DEFAULT FALSE',
      'order_reference VARCHAR(50) UNIQUE NULL'
    ];

    // Make user_id nullable for guest orders
    try {
      await mySqlPool.query('ALTER TABLE Orders MODIFY COLUMN user_id INT NULL;');
      console.log("✅ Made Orders.user_id nullable");
    } catch (error) {
      console.log("ℹ️ Orders.user_id already nullable or modification not needed");
    }

    // Add all order fields in one batch
    for (const field of orderFields) {
      const fieldName = field.split(' ')[0];
      try {
        await mySqlPool.query(`ALTER TABLE Orders ADD COLUMN ${field};`);
        console.log(`✅ Added ${fieldName} to Orders table`);
      } catch (error) {
        if (error.message.includes('Duplicate column name')) {
          console.log(`ℹ️ ${fieldName} already exists in Orders table`);
        } else {
          console.log(`⚠️ Error adding ${fieldName} to Orders:`, error.message);
        }
      }
    }

    // 3. Add guest cart fields to Cart table
    const cartFields = [
      'guest_session_id VARCHAR(255) NULL',
      'is_guest_cart BOOLEAN DEFAULT FALSE',
      'guest_name VARCHAR(255) NULL',
      'guest_email VARCHAR(255) NULL',
      'guest_phone VARCHAR(20) NULL'
    ];

    // Make user_id nullable for guest carts
    try {
      await mySqlPool.query('ALTER TABLE Cart MODIFY COLUMN user_id INT NULL;');
      console.log("✅ Made Cart.user_id nullable");
    } catch (error) {
      console.log("ℹ️ Cart.user_id already nullable or modification not needed");
    }

    // Add all cart fields in one batch
    for (const field of cartFields) {
      const fieldName = field.split(' ')[0];
      try {
        await mySqlPool.query(`ALTER TABLE Cart ADD COLUMN ${field};`);
        console.log(`✅ Added ${fieldName} to Cart table`);
      } catch (error) {
        if (error.message.includes('Duplicate column name')) {
          console.log(`ℹ️ ${fieldName} already exists in Cart table`);
        } else {
          console.log(`⚠️ Error adding ${fieldName} to Cart:`, error.message);
        }
      }
    }

    // 6. Update VRSessions table structure for pricing calculator compatibility
    try {
      // Add machine_type column
      const [machineTypeColumns] = await mySqlPool.query(`SHOW COLUMNS FROM VRSessions LIKE 'machine_type';`);
      if (machineTypeColumns.length === 0) {
        await mySqlPool.query(`ALTER TABLE VRSessions ADD COLUMN machine_type VARCHAR(255) NULL;`);
        console.log(`✅ Added machine_type to VRSessions table`);
      }

      // Change name column from ENUM to VARCHAR for flexibility
      try {
        await mySqlPool.query(`ALTER TABLE VRSessions MODIFY COLUMN name VARCHAR(255) NOT NULL;`);
        console.log(`✅ Updated VRSessions name column to VARCHAR`);
      } catch (error) {
        if (!error.message.includes('already')) {
          console.log(`ℹ️ VRSessions name column modification: ${error.message}`);
        }
      }

      console.log(`ℹ️ VRSessions table structure updated for pricing calculator compatibility`);
    } catch (error) {
      console.log(`⚠️ Error updating VRSessions table structure:`, error.message);
    }

    // 7. Fix Bookings and GuestBookings table machine_type column size
    try {
      await mySqlPool.query(`ALTER TABLE Bookings MODIFY COLUMN machine_type VARCHAR(255);`);
      console.log(`✅ Updated Bookings machine_type column to VARCHAR(255)`);
    } catch (error) {
      console.log(`ℹ️ Bookings machine_type column update: ${error.message}`);
    }

    try {
      await mySqlPool.query(`ALTER TABLE GuestBookings MODIFY COLUMN machine_type VARCHAR(255);`);
      console.log(`✅ Updated GuestBookings machine_type column to VARCHAR(255)`);
    } catch (error) {
      console.log(`ℹ️ GuestBookings machine_type column update: ${error.message}`);
    }

    // 8. Add new booking fields for enhanced booking system
    try {
      // Add session_count column
      const [sessionCountColumns] = await mySqlPool.query(`SHOW COLUMNS FROM Bookings LIKE 'session_count';`);
      if (sessionCountColumns.length === 0) {
        await mySqlPool.query(`ALTER TABLE Bookings ADD COLUMN session_count INT DEFAULT 1;`);
        console.log(`✅ Added session_count column to Bookings table`);
      }

      // Add player_count column
      const [playerCountColumns] = await mySqlPool.query(`SHOW COLUMNS FROM Bookings LIKE 'player_count';`);
      if (playerCountColumns.length === 0) {
        await mySqlPool.query(`ALTER TABLE Bookings ADD COLUMN player_count INT DEFAULT 1;`);
        console.log(`✅ Added player_count column to Bookings table`);
      }

      // Add total_amount column
      const [totalAmountColumns] = await mySqlPool.query(`SHOW COLUMNS FROM Bookings LIKE 'total_amount';`);
      if (totalAmountColumns.length === 0) {
        await mySqlPool.query(`ALTER TABLE Bookings ADD COLUMN total_amount DECIMAL(10,2) DEFAULT 0.00;`);
        console.log(`✅ Added total_amount column to Bookings table`);
      }

    } catch (error) {
      console.log(`⚠️ Error adding new booking columns:`, error.message);
    }

    console.log("✅ Enhanced booking system database updates completed successfully!");

  } catch (error) {
    console.error("❌ Error applying enhanced booking system updates:", error);
    // Don't exit the process, just log the error and continue
  }
}

// Function to populate VR Sessions from pricing calculator
async function populateVRSessions() {
  try {
    console.log("🔄 Populating VR Sessions from pricing calculator...");

    // VR Sessions data from pricing calculator (using single session pricing)
    const vrSessions = [
      {
        name: 'Free Roaming Arena',
        description: 'Experience unlimited freedom in our spacious VR arena (34x49 feet) with full-body tracking and wireless headsets.',
        price: 12.00, // Single session price
        duration_minutes: 15,
        max_players: 10, // Free-roaming arena (34x49 feet, up to 10 players)
        machine_type: 'Free Roaming Arena',
        is_active: true
      },
      {
        name: 'UFO Spaceship Cinema',
        description: 'Immersive cinematic VR experience aboard a UFO spaceship with 360-degree visuals.',
        price: 9.00, // Single session price
        duration_minutes: 15,
        max_players: 5, // UFO Spaceship (5 seats)
        machine_type: 'UFO Spaceship Cinema',
        is_active: true
      },
      {
        name: 'VR 360',
        description: 'Full 360-degree virtual reality experience with stunning visuals and immersive gameplay.',
        price: 9.00, // Single session price
        duration_minutes: 15,
        max_players: 2,
        machine_type: 'VR 360',
        is_active: true
      },
      {
        name: 'VR Battle',
        description: 'Competitive multiplayer VR battles with friends in various combat scenarios.',
        price: 9.00, // Single session price
        duration_minutes: 15,
        max_players: 2, // VR Battle (2 players)
        machine_type: 'VR Battle',
        is_active: true
      },
      {
        name: 'VR Warrior',
        description: 'Become a virtual warrior and fight through epic adventures and challenges (kids).',
        price: 7.00, // Single session price
        duration_minutes: 15,
        max_players: 2, // VR WARRIOR (kids - 2 players)
        machine_type: 'VR Warrior',
        is_active: true
      },
      {
        name: 'VR Cat',
        description: 'Fun and family-friendly VR experience perfect for kids.',
        price: 6.00, // Single session price
        duration_minutes: 15,
        max_players: 2, // VR CAT (kids - 2 machines)
        machine_type: 'VR Cat',
        is_active: true
      },
      {
        name: 'Photo Booth',
        description: 'Capture memorable moments with our VR photo booth experience.',
        price: 6.00, // Single session price
        duration_minutes: 10,
        max_players: 4,
        machine_type: 'Photo Booth',
        is_active: true
      }
    ];

    for (const session of vrSessions) {
      // Check if session already exists
      const [existing] = await mySqlPool.query(
        'SELECT session_id FROM VRSessions WHERE name = ?',
        [session.name]
      );

      if (existing.length === 0) {
        // Insert new session
        const [result] = await mySqlPool.query(
          `INSERT INTO VRSessions (name, description, price, duration_minutes, max_players, machine_type, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            session.name,
            session.description,
            session.price,
            session.duration_minutes,
            session.max_players,
            session.machine_type,
            session.is_active
          ]
        );
        console.log(`✅ Created VR session: ${session.name}`);
      } else {
        // Update existing session to ensure data is current
        await mySqlPool.query(
          `UPDATE VRSessions
           SET description = ?, price = ?, duration_minutes = ?, max_players = ?, machine_type = ?, is_active = ?
           WHERE name = ?`,
          [
            session.description,
            session.price,
            session.duration_minutes,
            session.max_players,
            session.machine_type,
            session.is_active,
            session.name
          ]
        );
        console.log(`ℹ️ Updated VR session: ${session.name}`);
      }
    }

    // Clean up sessions that don't match pricing calculator
    try {
      const pricingCalculatorSessions = [
        'Free Roaming Arena', 'UFO Spaceship Cinema', 'VR 360',
        'VR Battle', 'VR Warrior', 'VR Cat', 'Photo Booth'
      ];

      const [allCurrentSessions] = await mySqlPool.query('SELECT session_id, name FROM VRSessions');

      for (const session of allCurrentSessions) {
        // Check if this session is NOT in our pricing calculator list
        if (!pricingCalculatorSessions.includes(session.name)) {
          // Check if this session has any bookings
          const [bookings] = await mySqlPool.query('SELECT COUNT(*) as count FROM Bookings WHERE session_id = ?', [session.session_id]);

          if (bookings[0].count > 0) {
            console.log(`⚠️ Keeping legacy session "${session.name}" (has ${bookings[0].count} bookings) - deactivating`);
            // Deactivate instead of deleting to preserve booking history
            await mySqlPool.query('UPDATE VRSessions SET is_active = 0 WHERE session_id = ?', [session.session_id]);
          } else {
            console.log(`🗑️ Removing unused session: ${session.name}`);
            // Safe to delete - no bookings exist
            await mySqlPool.query('DELETE FROM VRSessions WHERE session_id = ?', [session.session_id]);
          }
        }
      }

      // Fix any naming inconsistencies (like VR CAT -> VR Cat)
      await mySqlPool.query('UPDATE VRSessions SET name = "VR Cat" WHERE name = "VR CAT"');
      console.log('ℹ️ Fixed any VR naming inconsistencies');

    } catch (cleanupError) {
      console.log(`⚠️ Session cleanup warning: ${cleanupError.message}`);
    }

    console.log("✅ VR Sessions population and cleanup completed successfully!");

  } catch (error) {
    console.error("❌ Error populating VR sessions:", error);
    // Don't exit the process, just log the error and continue
  }
}

// Function to apply guest payment support database updates
async function applyGuestPaymentUpdates() {
  try {
    console.log("🔄 Checking guest payment support database updates...");

    // Check if Payments table user_id column allows NULL
    const [columns] = await mySqlPool.query(`SHOW COLUMNS FROM Payments WHERE Field = 'user_id';`);

    if (columns.length > 0) {
      const userIdColumn = columns[0];

      // Check if user_id column allows NULL
      if (userIdColumn.Null === 'NO') {
        console.log("🔄 Updating Payments table to allow NULL user_id for guest payments...");

        // First, drop the foreign key constraint
        try {
          await mySqlPool.query(`ALTER TABLE Payments DROP FOREIGN KEY payments_ibfk_1;`);
          console.log("✅ Dropped existing foreign key constraint");
        } catch (error) {
          console.log("ℹ️ Foreign key constraint may not exist or already dropped:", error.message);
        }

        // Modify the user_id column to allow NULL
        await mySqlPool.query(`ALTER TABLE Payments MODIFY COLUMN user_id INT NULL;`);
        console.log("✅ Modified user_id column to allow NULL values");

        // Re-add the foreign key constraint with NULL support
        try {
          await mySqlPool.query(`ALTER TABLE Payments ADD CONSTRAINT payments_ibfk_1 FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE;`);
          console.log("✅ Re-added foreign key constraint with NULL support");
        } catch (error) {
          console.log("ℹ️ Could not re-add foreign key constraint:", error.message);
        }

        console.log("✅ Payments table updated to support guest payments");
      } else {
        console.log("ℹ️ Payments table user_id column already allows NULL, skipping...");
      }
    }

  } catch (error) {
    console.error("❌ Error applying guest payment updates:", error);
    throw error;
  }
}

// Function to add updated_at column to Payments table
async function addUpdatedAtToPayments() {
  try {
    console.log("🔄 Checking Payments table for updated_at column...");

    // Check if updated_at column exists
    const [columns] = await mySqlPool.query(`SHOW COLUMNS FROM Payments LIKE 'updated_at'`);

    if (columns.length === 0) {
      // Add updated_at column
      await mySqlPool.query(`
        ALTER TABLE Payments
        ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        AFTER created_at
      `);
      console.log('✅ Added updated_at column to Payments table');
    } else {
      console.log('ℹ️ updated_at column already exists in Payments table');
    }

  } catch (error) {
    console.error("❌ Error adding updated_at column to Payments table:", error);
    throw error;
  }
}

// Function to populate sample tournaments
async function populateSampleTournaments() {
  try {
    console.log("🔄 Populating sample tournaments...");

    const tournaments = [
      {
        name: 'VR Arena Championship 2025',
        description: 'Epic VR battle royale tournament with 64 players competing for the ultimate prize.',
        start_date: '2025-08-15 10:00:00',
        end_date: '2025-08-15 18:00:00',
        city: 'Edmonton',
        country: 'Canada',
        state: 'AB',
        ticket_price: 25.00,
        max_participants: 64,
        prize_pool: 2500.00,
        game_type: 'Battle Royale',
        rules: `All participants must be 13 years or older
Valid government-issued ID required for registration
Players must use provided VR equipment only
Unsportsmanlike conduct will result in disqualification
Tournament organizers' decisions are final`,
        requirements: `Signed waiver form mandatory
Comfortable clothing recommended
No loose jewelry or accessories
Arrive 30 minutes before scheduled match time
Motion sickness tolerance recommended`,
        status: 'upcoming'
      },
      {
        name: 'Beat Saber Masters 2025',
        description: 'Rhythm VR tournament featuring the best Beat Saber players in Western Canada.',
        start_date: '2025-09-20 14:00:00',
        end_date: '2025-09-20 20:00:00',
        city: 'Edmonton',
        country: 'Canada',
        state: 'AB',
        ticket_price: 15.00,
        max_participants: 32,
        prize_pool: 1200.00,
        game_type: 'Rhythm',
        rules: `Minimum age requirement: 10 years old
Players must complete practice session before tournament
No custom songs allowed - official playlist only
Three strikes rule: 3 missed beats = elimination
Respect other players and equipment`,
        requirements: `Signed waiver form mandatory
Comfortable athletic clothing required
No loose jewelry or accessories
Arrive 45 minutes before tournament start
Basic rhythm game experience recommended`,
        status: 'upcoming'
      },
      {
        name: 'VR Racing Grand Prix 2025',
        description: 'High-speed VR racing tournament with realistic physics and stunning graphics.',
        start_date: '2025-10-10 12:00:00',
        end_date: '2025-10-10 17:00:00',
        city: 'Edmonton',
        country: 'Canada',
        state: 'AB',
        ticket_price: 20.00,
        max_participants: 24,
        prize_pool: 1800.00,
        game_type: 'Racing',
        rules: `Age requirement: 16 years or older
No ramming or unsportsmanlike driving
Follow track rules and racing etiquette
Penalties for cutting corners or cheating
Final lap determines winner`,
        requirements: `Valid driver's license or ID required
Signed waiver form mandatory
Comfortable clothing recommended
No loose jewelry or accessories
Motion sickness tolerance required`,
        status: 'upcoming'
      }
    ];

    for (const tournament of tournaments) {
      // Check if tournament already exists
      const [existing] = await mySqlPool.query(
        'SELECT tournament_id FROM Tournaments WHERE name = ?',
        [tournament.name]
      );

      if (existing.length === 0) {
        const [result] = await mySqlPool.query(`
          INSERT INTO Tournaments (
            name, description, start_date, end_date, city, country, state,
            ticket_price, max_participants, prize_pool, game_type, rules, requirements, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          tournament.name,
          tournament.description,
          tournament.start_date,
          tournament.end_date,
          tournament.city,
          tournament.country,
          tournament.state,
          tournament.ticket_price,
          tournament.max_participants,
          tournament.prize_pool,
          tournament.game_type,
          tournament.rules,
          tournament.requirements,
          tournament.status
        ]);

        console.log(`✅ Added tournament: ${tournament.name} (ID: ${result.insertId})`);
      } else {
        console.log(`ℹ️ Tournament already exists: ${tournament.name}`);
      }
    }

    console.log("✅ Sample tournaments population completed successfully!");

  } catch (error) {
    console.error("❌ Error populating sample tournaments:", error);
    // Don't exit the process, just log the error and continue
  }
}

// Function to populate sample events
async function populateSampleEvents() {
  try {
    console.log("🔄 Populating sample events...");

    const events = [
      {
        name: 'VR Birthday Party Package',
        description: 'Celebrate your special day with an unforgettable VR birthday party experience for up to 12 guests.',
        start_date: '2025-08-01 10:00:00',
        end_date: '2025-08-01 14:00:00',
        city: 'Edmonton',
        country: 'Canada',
        state: 'AB',
        ticket_price: 299.99,
        max_participants: 12,
        event_type: 'birthday',
        status: 'upcoming'
      },
      {
        name: 'Corporate Team Building VR Experience',
        description: 'Boost team morale and collaboration with our immersive VR team building activities.',
        start_date: '2025-08-15 09:00:00',
        end_date: '2025-08-15 17:00:00',
        city: 'Edmonton',
        country: 'Canada',
        state: 'AB',
        ticket_price: 599.99,
        max_participants: 20,
        event_type: 'corporate',
        status: 'upcoming'
      },
      {
        name: 'VR Gaming Night',
        description: 'Join us for an epic VR gaming night with multiplayer battles and competitions.',
        start_date: '2025-09-05 18:00:00',
        end_date: '2025-09-05 23:00:00',
        city: 'Edmonton',
        country: 'Canada',
        state: 'AB',
        ticket_price: 45.00,
        max_participants: 30,
        event_type: 'party',
        status: 'upcoming'
      },
      {
        name: 'VR Horror Experience Night',
        description: 'Dare to enter the most terrifying VR horror experiences. Not for the faint of heart!',
        start_date: '2025-10-31 19:00:00',
        end_date: '2025-10-31 23:00:00',
        city: 'Edmonton',
        country: 'Canada',
        state: 'AB',
        ticket_price: 35.00,
        max_participants: 16,
        event_type: 'special',
        status: 'upcoming'
      },
      {
        name: 'Family VR Fun Day',
        description: 'A family-friendly VR experience perfect for all ages. Bring the whole family!',
        start_date: '2025-08-30 12:00:00',
        end_date: '2025-08-30 17:00:00',
        city: 'Edmonton',
        country: 'Canada',
        state: 'AB',
        ticket_price: 25.00,
        max_participants: 25,
        event_type: 'other',
        status: 'upcoming'
      }
    ];

    for (const event of events) {
      // Check if event already exists
      const [existing] = await mySqlPool.query(
        'SELECT event_id FROM Events WHERE name = ?',
        [event.name]
      );

      if (existing.length === 0) {
        const [result] = await mySqlPool.query(`
          INSERT INTO Events (
            name, description, start_date, end_date, city, country, state,
            ticket_price, max_participants, event_type, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          event.name,
          event.description,
          event.start_date,
          event.end_date,
          event.city,
          event.country,
          event.state,
          event.ticket_price,
          event.max_participants,
          event.event_type,
          event.status
        ]);

        console.log(`✅ Added event: ${event.name} (ID: ${result.insertId})`);
      } else {
        console.log(`ℹ️ Event already exists: ${event.name}`);
      }
    }

    console.log("✅ Sample events population completed successfully!");

  } catch (error) {
    console.error("❌ Error populating sample events:", error);
    // Don't exit the process, just log the error and continue
  }
}

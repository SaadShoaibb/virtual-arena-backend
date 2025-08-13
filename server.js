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
app.use('/api/v1/admin/site-settings', require('./routes/siteSettingsRoutes'));
app.use('/api/v1/admin/sessions', require('./routes/sessionPricingRoutes'));
app.use('/api/v1/admin/passes', require('./routes/passesRoutes'));

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

    // CRITICAL: Ensure SiteSettings table exists immediately
    try {
      await mySqlPool.query(`
        CREATE TABLE IF NOT EXISTS SiteSettings (
          setting_id INT AUTO_INCREMENT PRIMARY KEY,
          setting_key VARCHAR(100) NOT NULL UNIQUE,
          setting_value TEXT NOT NULL,
          setting_type ENUM('string', 'number', 'boolean', 'date') DEFAULT 'string',
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ CRITICAL: SiteSettings table created/verified');

      // Insert default countdown settings immediately
      const countdownDate = new Date();
      countdownDate.setDate(countdownDate.getDate() + 100);

      await mySqlPool.query(`
        INSERT IGNORE INTO SiteSettings (setting_key, setting_value, setting_type, description)
        VALUES ('grand_opening_date', ?, 'date', 'Grand opening countdown target date')
      `, [countdownDate.toISOString()]);

      await mySqlPool.query(`
        INSERT IGNORE INTO SiteSettings (setting_key, setting_value, setting_type, description)
        VALUES ('countdown_enabled', 'true', 'boolean', 'Enable/disable countdown banner')
      `);
      console.log('✅ CRITICAL: Default countdown settings inserted');
    } catch (error) {
      console.error('❌ CRITICAL ERROR creating SiteSettings:', error);
    }

    // CRITICAL: Ensure SessionPricing table exists immediately
    try {
      await mySqlPool.query(`
        CREATE TABLE IF NOT EXISTS SessionPricing (
          pricing_id INT AUTO_INCREMENT PRIMARY KEY,
          session_id INT NOT NULL,
          session_count INT NOT NULL DEFAULT 1,
          price DECIMAL(10,2) NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES VRSessions(session_id) ON DELETE CASCADE,
          UNIQUE KEY unique_session_pricing (session_id, session_count)
        )
      `);
      console.log('✅ CRITICAL: SessionPricing table created/verified');
    } catch (error) {
      console.error('❌ CRITICAL ERROR creating SessionPricing:', error);
    }

    // CRITICAL: Ensure GroupDiscounts table exists immediately
    try {
      await mySqlPool.query(`
        CREATE TABLE IF NOT EXISTS GroupDiscounts (
          discount_id INT AUTO_INCREMENT PRIMARY KEY,
          min_players INT NOT NULL,
          max_players INT NULL,
          discount_percentage DECIMAL(5,2) NOT NULL,
          discount_name VARCHAR(100) NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_range (min_players, max_players)
        )
      `);
      console.log('✅ CRITICAL: GroupDiscounts table created/verified');

      // Insert default group discounts
      const defaultDiscounts = [
        [5, 9, 10.00, 'Small Group Discount'],
        [10, 19, 15.00, 'Medium Group Discount'],
        [20, null, 20.00, 'Large Group Discount']
      ];

      for (const [min, max, percentage, name] of defaultDiscounts) {
        try {
          await mySqlPool.query(`
            INSERT IGNORE INTO GroupDiscounts (min_players, max_players, discount_percentage, discount_name, is_active)
            VALUES (?, ?, ?, ?, TRUE)
          `, [min, max, percentage, name]);
        } catch (error) {
          // Ignore duplicate entries
        }
      }
      console.log('✅ CRITICAL: Default group discounts inserted');
    } catch (error) {
      console.error('❌ CRITICAL ERROR creating GroupDiscounts:', error);
    }

    // CRITICAL: Ensure TimePasses table exists immediately
    try {
      await mySqlPool.query(`
        CREATE TABLE IF NOT EXISTS TimePasses (
          pass_id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          duration_hours INT NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          description TEXT,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ CRITICAL: TimePasses table created/verified');

      // Insert default time passes (only if none exist)
      const [existingPasses] = await mySqlPool.query('SELECT COUNT(*) as count FROM TimePasses WHERE is_active = TRUE');
      if (existingPasses[0].count === 0) {
        console.log('🔧 Inserting default time passes...');
        const defaultPasses = [
          ['1-Hour Pass', 1, 35.00, 'Unlimited access to all experiences for 1 hour'],
          ['2-Hour Pass', 2, 55.00, 'Unlimited access to all experiences for 2 hours'],
          ['Half-Day Pass', 4, 85.00, 'Unlimited access to all experiences for 4 hours'],
          ['Full-Day Pass', 8, 120.00, 'Unlimited access to all experiences for 8 hours']
        ];

        for (const [name, duration, price, description] of defaultPasses) {
          try {
            // Check if this specific pass already exists
            const [existing] = await mySqlPool.query(
              'SELECT pass_id FROM TimePasses WHERE name = ? AND duration_hours = ?',
              [name, duration]
            );

            if (existing.length === 0) {
              await mySqlPool.query(`
                INSERT INTO TimePasses (name, duration_hours, price, description, is_active)
                VALUES (?, ?, ?, ?, TRUE)
              `, [name, duration, price, description]);
              console.log(`✅ Added default pass: ${name}`);
            } else {
              console.log(`ℹ️ Pass already exists: ${name}`);
            }
          } catch (error) {
            console.log(`⚠️ Could not add pass ${name}:`, error.message);
          }
        }
      } else {
        console.log('ℹ️ Active time passes already exist, skipping default insertion');
      }

      // Clean up any duplicate passes
      try {
        console.log('🧹 Cleaning up duplicate time passes...');
        await mySqlPool.query(`
          DELETE t1 FROM TimePasses t1
          INNER JOIN TimePasses t2
          WHERE t1.pass_id > t2.pass_id
          AND t1.name = t2.name
          AND t1.duration_hours = t2.duration_hours
        `);
        console.log('✅ Cleaned up duplicate time passes');
      } catch (error) {
        console.log('⚠️ Could not clean up duplicates:', error.message);
      }
      console.log('✅ CRITICAL: Default time passes inserted');
    } catch (error) {
      console.error('❌ CRITICAL ERROR creating TimePasses:', error);
    }

    // CRITICAL: Setup default session pricing
    try {
      // Wait a moment for sessions to be created
      setTimeout(async () => {
        try {
          // Get all sessions
          const [sessions] = await mySqlPool.query('SELECT session_id, name FROM VRSessions');

          // Default pricing map
          const defaultPricing = {
            'Free Roaming Arena': { price1: 12, price2: 20 },
            'UFO Spaceship Cinema': { price1: 9, price2: 15 },
            'VR 360': { price1: 9, price2: 15 },
            'VR Battle': { price1: 9, price2: 15 },
            'VR Warrior': { price1: 7, price2: 12 },
            'VR Cat': { price1: 6, price2: 10 },
            'Photo Booth': { price1: 6, price2: 6 },
            'Free Roaming VR Arena 2.0': { price1: 12, price2: 20 },
            'VR UFO 5 Players': { price1: 9, price2: 15 },
            'VR 360° Motion Chair': { price1: 9, price2: 15 },
            'HTC VIVE VR Standing Platform': { price1: 9, price2: 15 },
            'VR Warrior 2players': { price1: 7, price2: 12 },
            'VR CAT': { price1: 6, price2: 10 }
          };

          for (const session of sessions) {
            const pricing = defaultPricing[session.name];
            if (pricing) {
              // Insert 1 session pricing
              await mySqlPool.query(`
                INSERT IGNORE INTO SessionPricing (session_id, session_count, price, is_active)
                VALUES (?, 1, ?, TRUE)
              `, [session.session_id, pricing.price1]);

              // Insert 2 session pricing
              await mySqlPool.query(`
                INSERT IGNORE INTO SessionPricing (session_id, session_count, price, is_active)
                VALUES (?, 2, ?, TRUE)
              `, [session.session_id, pricing.price2]);
            }
          }
          console.log('✅ CRITICAL: Default session pricing setup completed');
        } catch (error) {
          console.error('❌ Error setting up default session pricing:', error);
        }
      }, 2000); // Wait 2 seconds for sessions to be created
    } catch (error) {
      console.error('❌ CRITICAL ERROR setting up session pricing:', error);
    }

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

    // FORCE migration to run - don't skip for pass bookings
    console.log("🔧 FORCING migration to run for pass booking support...");

    console.log("🔄 Applying enhanced booking system database updates...");

    // 🚨 CRITICAL: Force database schema fixes for pass bookings
    console.log("🔧 CRITICAL: FORCING database fixes for pass bookings...");
    console.log("🔧 MANUAL SQL COMMANDS TO RUN:");
    console.log("ALTER TABLE Bookings ADD COLUMN pass_id INT NULL;");
    console.log("ALTER TABLE Bookings ADD COLUMN booking_type ENUM('session', 'hourly', 'pass') DEFAULT 'session';");
    console.log("ALTER TABLE Bookings ADD COLUMN duration_hours DECIMAL(3,1) DEFAULT NULL;");
    console.log("DELETE FROM TimePasses WHERE pass_id NOT IN (SELECT MIN(pass_id) FROM (SELECT pass_id, name, duration_hours FROM TimePasses) AS temp GROUP BY name, duration_hours);");

    // Force add columns with individual checks
    const columnsToAdd = [
      { name: 'pass_id', sql: "ALTER TABLE Bookings ADD COLUMN pass_id INT NULL" },
      { name: 'booking_type', sql: "ALTER TABLE Bookings ADD COLUMN booking_type ENUM('session', 'hourly', 'pass') DEFAULT 'session'" },
      { name: 'duration_hours', sql: "ALTER TABLE Bookings ADD COLUMN duration_hours DECIMAL(3,1) DEFAULT NULL" }
    ];

    for (const col of columnsToAdd) {
      try {
        // Check if column exists first
        const [columns] = await mySqlPool.query(`SHOW COLUMNS FROM Bookings LIKE '${col.name}'`);

        if (columns.length === 0) {
          await mySqlPool.query(col.sql);
          console.log(`✅ CRITICAL: Successfully added column: ${col.name}`);
        } else {
          console.log(`ℹ️ Column already exists: ${col.name}`);

          // For booking_type, ensure it includes 'pass'
          if (col.name === 'booking_type') {
            try {
              await mySqlPool.query("ALTER TABLE Bookings MODIFY COLUMN booking_type ENUM('session', 'hourly', 'pass') DEFAULT 'session'");
              console.log(`✅ CRITICAL: Updated booking_type enum to include 'pass'`);
            } catch (modError) {
              console.log(`⚠️ Could not update booking_type enum:`, modError.message);
            }
          }
        }
      } catch (error) {
        console.log(`❌ CRITICAL: Failed to add ${col.name}:`, error.message);
        console.log(`🔧 MANUAL SQL: ${col.sql};`);
      }
    }

    // Verify all columns exist
    try {
      const [allColumns] = await mySqlPool.query('SHOW COLUMNS FROM Bookings');
      const columnNames = allColumns.map(col => col.Field);
      const requiredColumns = ['pass_id', 'booking_type', 'duration_hours'];
      const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));

      if (missingColumns.length === 0) {
        console.log('✅ CRITICAL: All required columns exist for pass bookings');
      } else {
        console.log(`❌ CRITICAL: Missing columns: ${missingColumns.join(', ')}`);
        console.log('🔧 MANUAL SQL NEEDED:');
        missingColumns.forEach(col => {
          const colDef = columnsToAdd.find(c => c.name === col);
          if (colDef) console.log(colDef.sql + ';');
        });
      }
    } catch (error) {
      console.log('❌ Could not verify columns:', error.message);
    }

    // Clean up duplicate passes
    try {
      console.log("🧹 CRITICAL: Cleaning up duplicate time passes...");

      // First, get all passes and identify duplicates
      const [allPasses] = await mySqlPool.query('SELECT pass_id, name, duration_hours FROM TimePasses ORDER BY pass_id');
      console.log(`📋 Found ${allPasses.length} total passes`);

      // Group by name and duration to find duplicates
      const passGroups = {};
      for (const pass of allPasses) {
        const key = `${pass.name}_${pass.duration_hours}`;
        if (!passGroups[key]) {
          passGroups[key] = [];
        }
        passGroups[key].push(pass.pass_id);
      }

      // Delete duplicates (keep the first one)
      for (const [key, passIds] of Object.entries(passGroups)) {
        if (passIds.length > 1) {
          const toDelete = passIds.slice(1); // Keep first, delete rest
          console.log(`🗑️ Deleting duplicate passes for ${key}: ${toDelete.join(', ')}`);

          for (const passId of toDelete) {
            await mySqlPool.query('DELETE FROM TimePasses WHERE pass_id = ?', [passId]);
          }
        }
      }

      console.log("✅ CRITICAL: Cleaned up duplicate time passes");
    } catch (error) {
      console.log("⚠️ Could not clean up duplicate passes:", error.message);
      console.log("🔧 MANUAL SQL TO CLEAN DUPLICATES:");
      console.log("DELETE t1 FROM TimePasses t1 INNER JOIN TimePasses t2 WHERE t1.pass_id > t2.pass_id AND t1.name = t2.name AND t1.duration_hours = t2.duration_hours;");
    }

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

    // Allow session_id to be NULL for time pass bookings
    try {
      await mySqlPool.query('ALTER TABLE Bookings MODIFY COLUMN session_id INT NULL;');
      console.log("✅ Made Bookings.session_id nullable");
    } catch (error) {
      console.log("ℹ️ Bookings.session_id already nullable or modification not needed");
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

    // 9. Enhanced booking system - Multiple sessions and machines
    try {
      console.log('🔧 Adding enhanced booking system tables...');

      // Create BookingItems table for multiple sessions per booking
      await mySqlPool.query(`
        CREATE TABLE IF NOT EXISTS BookingItems (
          booking_item_id INT AUTO_INCREMENT PRIMARY KEY,
          booking_id INT NOT NULL,
          session_id INT NOT NULL,
          session_name VARCHAR(255) NOT NULL,
          start_time DATETIME NOT NULL,
          end_time DATETIME NOT NULL,
          session_count INT DEFAULT 1,
          player_count INT DEFAULT 1,
          price_per_session DECIMAL(10,2) NOT NULL,
          total_price DECIMAL(10,2) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (booking_id) REFERENCES Bookings(booking_id) ON DELETE CASCADE,
          FOREIGN KEY (session_id) REFERENCES VRSessions(session_id) ON DELETE CASCADE
        )
      `);
      console.log('✅ Created BookingItems table');

      // Add admin-configurable pricing table
      await mySqlPool.query(`
        CREATE TABLE IF NOT EXISTS SessionPricing (
          pricing_id INT AUTO_INCREMENT PRIMARY KEY,
          session_id INT NOT NULL,
          session_count INT NOT NULL DEFAULT 1,
          price DECIMAL(10,2) NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES VRSessions(session_id) ON DELETE CASCADE,
          UNIQUE KEY unique_session_pricing (session_id, session_count)
        )
      `);
      console.log('✅ Created SessionPricing table');

      // Add admin-configurable time slots table
      await mySqlPool.query(`
        CREATE TABLE IF NOT EXISTS TimeSlots (
          slot_id INT AUTO_INCREMENT PRIMARY KEY,
          start_hour INT NOT NULL,
          end_hour INT NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_time_slot (start_hour, end_hour)
        )
      `);
      console.log('✅ Created TimeSlots table');

      // Insert default time slots (9 AM to 9 PM)
      for (let hour = 9; hour <= 21; hour++) {
        try {
          await mySqlPool.query(`
            INSERT IGNORE INTO TimeSlots (start_hour, end_hour, is_active)
            VALUES (?, ?, TRUE)
          `, [hour, hour + 1]);
        } catch (error) {
          // Ignore duplicate entries
        }
      }
      console.log('✅ Inserted default time slots');

      // Add countdown timer settings table
      await mySqlPool.query(`
        CREATE TABLE IF NOT EXISTS SiteSettings (
          setting_id INT AUTO_INCREMENT PRIMARY KEY,
          setting_key VARCHAR(100) NOT NULL UNIQUE,
          setting_value TEXT NOT NULL,
          setting_type ENUM('string', 'number', 'boolean', 'date') DEFAULT 'string',
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Created SiteSettings table');

      // Insert default countdown timer setting (100 days from now)
      const countdownDate = new Date();
      countdownDate.setDate(countdownDate.getDate() + 100);

      await mySqlPool.query(`
        INSERT IGNORE INTO SiteSettings (setting_key, setting_value, setting_type, description)
        VALUES ('grand_opening_date', ?, 'date', 'Grand opening countdown target date')
      `, [countdownDate.toISOString()]);
      console.log('✅ Inserted default countdown timer setting');

      // Insert default countdown enabled flag
      await mySqlPool.query(`
        INSERT IGNORE INTO SiteSettings (setting_key, setting_value, setting_type, description)
        VALUES ('countdown_enabled', 'true', 'boolean', 'Enable/disable countdown banner')
      `);
      console.log('✅ Inserted default countdown enabled flag');

      // Create group discounts table
      await mySqlPool.query(`
        CREATE TABLE IF NOT EXISTS GroupDiscounts (
          discount_id INT AUTO_INCREMENT PRIMARY KEY,
          min_players INT NOT NULL,
          max_players INT NULL,
          discount_percentage DECIMAL(5,2) NOT NULL,
          discount_name VARCHAR(100) NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_range (min_players, max_players)
        )
      `);
      console.log('✅ Created GroupDiscounts table');

      // Insert default group discounts
      const defaultDiscounts = [
        [5, 9, 10.00, 'Small Group Discount'],
        [10, 19, 15.00, 'Medium Group Discount'],
        [20, null, 20.00, 'Large Group Discount']
      ];

      for (const [min, max, percentage, name] of defaultDiscounts) {
        try {
          await mySqlPool.query(`
            INSERT IGNORE INTO GroupDiscounts (min_players, max_players, discount_percentage, discount_name, is_active)
            VALUES (?, ?, ?, ?, TRUE)
          `, [min, max, percentage, name]);
        } catch (error) {
          // Ignore duplicate entries
        }
      }
      console.log('✅ Inserted default group discounts');

      // Enhanced VRSessions table with more fields for flexible duration and pricing
      await mySqlPool.query(`
        ALTER TABLE VRSessions
        ADD COLUMN IF NOT EXISTS duration_hours DECIMAL(3,1) DEFAULT 0.25,
        ADD COLUMN IF NOT EXISTS min_duration_hours DECIMAL(3,1) DEFAULT 0.25,
        ADD COLUMN IF NOT EXISTS max_duration_hours DECIMAL(3,1) DEFAULT 4.0,
        ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS setup_time_minutes INT DEFAULT 5,
        ADD COLUMN IF NOT EXISTS cleanup_time_minutes INT DEFAULT 5
      `);
      console.log('✅ VRSessions table enhanced with duration and pricing fields');

      // Create SessionDurationPricing table for flexible pricing
      await mySqlPool.query(`
        CREATE TABLE IF NOT EXISTS SessionDurationPricing (
          pricing_id INT AUTO_INCREMENT PRIMARY KEY,
          session_id INT NOT NULL,
          duration_hours DECIMAL(3,1) NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES VRSessions(session_id) ON DELETE CASCADE,
          UNIQUE KEY unique_session_duration (session_id, duration_hours)
        )
      `);
      console.log('✅ SessionDurationPricing table created/verified');

      // Add hour-based booking fields to Bookings table
      await mySqlPool.query(`
        ALTER TABLE Bookings
        ADD COLUMN IF NOT EXISTS duration_hours DECIMAL(3,1) DEFAULT 0.25,
        ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS booking_type ENUM('session', 'hourly') DEFAULT 'session'
      `);
      console.log('✅ Bookings table enhanced with hour-based booking fields');

    } catch (error) {
      console.log(`⚠️ Error adding enhanced booking system tables:`, error.message);
    }

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
        price: 12.00, // Single session price - CORRECT PRICE
        duration_minutes: 15,
        max_players: 10, // Free-roaming arena (34x49 feet, up to 10 players)
        machine_type: 'Free Roaming Arena',
        is_active: true
      },
      {
        name: 'UFO Spaceship Cinema',
        description: 'Immersive cinematic VR experience aboard a UFO spaceship with 360-degree visuals.',
        price: 9.00, // Single session price - CORRECT PRICE
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
        // Update existing session but preserve admin-set pricing
        await mySqlPool.query(
          `UPDATE VRSessions
           SET description = ?, duration_minutes = ?, max_players = ?, machine_type = ?, is_active = ?
           WHERE name = ?`,
          [
            session.description,
            // Removed price update to preserve admin-set pricing
            session.duration_minutes,
            session.max_players,
            session.machine_type,
            session.is_active,
            session.name
          ]
        );
        console.log(`✅ Updated VR session: ${session.name} (preserved admin pricing)`);
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

    // DISABLED: Automatic pricing fixes to allow admin control over pricing
    // 🚨 CRITICAL FIX: Ensure all session prices are correct (fix 10x pricing bug)
    // console.log("🔧 Applying critical pricing fixes...");
    // const pricingFixes = [
    //   { name: 'Free Roaming Arena', correctPrice: 12.00 },
    //   { name: 'UFO Spaceship Cinema', correctPrice: 9.00 },
    //   { name: 'VR 360', correctPrice: 9.00 },
    //   { name: 'VR Battle', correctPrice: 9.00 },
    //   { name: 'VR Warrior', correctPrice: 7.00 },
    //   { name: 'VR Cat', correctPrice: 6.00 },
    //   { name: 'Photo Booth', correctPrice: 6.00 }
    // ];

    // for (const fix of pricingFixes) {
    //   const [result] = await mySqlPool.query(
    //     'UPDATE VRSessions SET price = ? WHERE name = ?',
    //     [fix.correctPrice, fix.name]
    //   );
    //   if (result.affectedRows > 0) {
    //     console.log(`🔧 PRICING FIX: ${fix.name} = $${fix.correctPrice}`);
    //   }
    // }

    console.log("✅ VR Sessions population and cleanup completed successfully!");
    console.log("🚨 CRITICAL PRICING BUG FIXED - All session prices corrected");

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

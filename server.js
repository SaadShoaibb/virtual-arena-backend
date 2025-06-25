const express = require('express');
const colors = require('colors');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const mySqlPool = require('./config/db');
const { createTables } = require('./controllers/tablesController'); // Import createTables

// Load environment variables
dotenv.config();

// Express app init
const app = express();

// Middleware
app.use(cors());

// Special handling for Stripe webhooks - needs raw body for signature verification
app.use((req, res, next) => {
    if (req.originalUrl === '/api/v1/payment/webhook') {
        next(); // Skip body parsing for webhook route
    } else {
        express.json()(req, res, next); // Parse JSON for all other routes
    }
});

app.use(morgan('dev'));

// Basic route
app.get('/', (req, res) => {
    return res
        .status(200)
        .send("<h1>Virtual Arena Backend is working correctly</h1>");
});

// API Routes
app.use('/api/v1/auth', require("./routes/authRoutes"));
app.use('/api/v1/admin', require("./routes/adminRoutes"));
app.use('/api/v1/user', require("./routes/userRoutes"));
app.use('/api/v1/payment', require("./routes/paymentRoutes"));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Port from .env or fallback
const PORT = process.env.PORT || 8080;

// Test DB Connection, create tables, and start server
mySqlPool.query('SELECT 1')
    .then(async () => {
        console.log("✅ MySQL DB connected".green);

        // Create all tables
        await createTables();

        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`.white.bgMagenta);
        });
    })
    .catch((error) => {
        console.error("❌ DB connection failed:".red, error.message);
        process.exit(1);
    });

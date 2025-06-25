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
        console.log('Received webhook request to:', req.originalUrl);
        next(); // Skip body parsing for webhook route
    } else {
        express.json()(req, res, next); // Parse JSON for all other routes
    }
});

// Add a raw body buffer for the webhook route
app.use((req, res, next) => {
    if (req.originalUrl === '/api/v1/payment/webhook' && req.method === 'POST') {
        let rawBody = '';
        req.on('data', (chunk) => {
            rawBody += chunk.toString();
        });
        req.on('end', () => {
            req.rawBody = rawBody;
            next();
        });
    } else {
        next();
    }
});

app.use(morgan('dev'));

// Basic route
app.get('/', (req, res) => {
    return res
        .status(200)
        .send("<h1>Virtual Arena Backend is working correctly</h1>");
});

// Direct webhook status route for easier access and debugging
app.get('/webhook-status', (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    console.log('Direct webhook status route accessed');
    
    res.json({
        webhook_url: `${req.protocol}://${req.get('host')}/api/v1/payment/webhook`,
        webhook_secret_status: webhookSecret ? 'configured' : 'not configured',
        status: webhookSecret ? 'ready' : 'missing webhook secret',
        note: 'This is a direct route. The standard route is at /api/v1/payment/webhook-status'
    });
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

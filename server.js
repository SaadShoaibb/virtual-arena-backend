const express = require('express');
const colors = require('colors');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const mySqlPool = require('./config/db');
const { createTables } = require('./controllers/tablesController');

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
    await createTables();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`.white.bgMagenta);
    });
  })
  .catch((error) => {
    console.error("❌ DB connection failed:".red, error.message);
    process.exit(1);
  });

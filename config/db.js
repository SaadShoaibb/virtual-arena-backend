const mysql = require('mysql2/promise');
require('dotenv').config(); // Load .env variables

// Create a connection pool
const mySqlPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'arena',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test the database connection
(async () => {
    try {
        const connection = await mySqlPool.getConnection();
        console.log('✅ Connected to MySQL database!');
        connection.release(); // Important: release back to pool
    } catch (err) {
        console.error('❌ Unable to connect to MySQL:', err);
    }
})();

module.exports = mySqlPool;

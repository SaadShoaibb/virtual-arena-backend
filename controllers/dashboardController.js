const db = require("../config/db");

const getDashboardStats = async (req, res) => {
    try {
        // Get Total Revenue (Only for 'succeeded' payments)
        const revenueQuery = `SELECT COALESCE(SUM(amount), 0) AS totalRevenue FROM Payments WHERE status = 'succeeded';`;
        const [revenueResult] = await db.query(revenueQuery);
        const totalRevenue = revenueResult[0]?.totalRevenue || 0;  // Ensure correct data retrieval

        // Get Active Users Count
        const activeUsersQuery = `SELECT COUNT(*) AS activeUsers FROM Users WHERE is_active = 1;`;
        const [activeUsersResult] = await db.query(activeUsersQuery);
        const activeUsers = activeUsersResult[0]?.activeUsers || 0;

        // Get Total Sessions Booked
        const sessionsBookedQuery = `SELECT COUNT(*) AS totalSessions FROM Payments WHERE entity_type = 'booking' AND status = 'succeeded';`;
        const [sessionsBookedResult] = await db.query(sessionsBookedQuery);
        const totalSessionsBooked = sessionsBookedResult[0]?.totalSessions || 0;

        // Get Total Orders Placed
        const ordersPlacedQuery = `SELECT COUNT(*) AS totalOrders FROM Payments WHERE entity_type = 'order' AND status = 'succeeded';`;
        const [ordersPlacedResult] = await db.query(ordersPlacedQuery);
        const totalOrdersPlaced = ordersPlacedResult[0]?.totalOrders || 0;

        return res.json({
            success: true,
            data: {
                totalRevenue,
                activeUsers,
                totalSessionsBooked,
                totalOrdersPlaced,
            },
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};


const getOrderStats = async (req, res) => {
    try {
        const query = `
            SELECT 
                status, COUNT(*) AS count 
            FROM Orders 
            GROUP BY status;
        `;
        const [orderStats] = await db.query(query);

        // Convert result to object format
        const stats = {
            pending: 0,
            processing: 0,
            shipped: 0,
            delivered: 0,
        };

        orderStats.forEach(({ status, count }) => {
            stats[status] = count;
        });

        return res.json({ success: true, data: stats });
    } catch (error) {
        console.error("Error fetching order stats:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = { getDashboardStats,getOrderStats };

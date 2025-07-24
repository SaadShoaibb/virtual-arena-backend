const db = require('../config/db'); // Import DB connection



//getting user notificaiton controller
const getUserNotifications = async (req, res) => {
    try {
        const user_id = req.user.id;

        const [notifications] = await db.query(
            `SELECT * FROM Notifications WHERE user_id = ? ORDER BY created_at DESC`,
            [user_id]
        );

        res.status(200).json({
            success: true,
            notifications,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching notifications',
            error,
        });
    }
};

//get admin notification
const getAdminNotifications = async (req, res) => {
    try {
        // Fetch notifications for users with the 'admin' role
        const [notifications] = await db.query(
            `SELECT n.* FROM Notifications n
             JOIN Users u ON n.user_id = u.user_id
             WHERE u.role = 'admin'
             ORDER BY n.created_at DESC`
        );

        res.status(200).json({
            success: true,
            notifications,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error fetching admin notifications',
            error,
        });
    }
};

//mark notification as read
const markNotificationAsRead = async (req, res) => {
    try {
        const { notification_id } = req.params;

        await db.query(
            `UPDATE Notifications SET is_read = TRUE WHERE notification_id = ?`,
            [notification_id]
        );

        res.status(200).json({
            success: true,
            message: 'Notification marked as read',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error marking notification as read',
            error,
        });
    }
};

//mark all notification as read
const markAllNotificationsAsRead = async (req, res) => {
    try {
        const user_id = req.user.id;

        await db.query(
            `UPDATE Notifications SET is_read = TRUE WHERE user_id = ?`,
            [user_id]
        );

        res.status(200).json({
            success: true,
            message: 'All notifications marked as read',
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Error marking all notifications as read',
            error,
        });
    }
};

module.exports={
    getUserNotifications,
    getAdminNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead

}



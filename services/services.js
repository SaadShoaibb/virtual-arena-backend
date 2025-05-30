const db = require('../config/db'); // Import your database connection
const sendEmailNotification = require('./emailNotification');
/**
 * Send a notification to a user or admin.
 * @param {number} user_id - The ID of the user to send the notification to.
 * @param {string} type - The type of notification (e.g., 'booking_confirmation').
 * @param {string} subject - The subject of the notification.
 * @param {string} message - The message content of the notification.
 * @param {string} delivery_method - The delivery method (e.g., 'push', 'email', 'sms').
 * @param {string} link - The link to redirect the user when they click the notification.
 * @returns {Promise<void>}
 */
const sendNotification = async (user_id, type, subject, message, delivery_method, link) => {
    try {
        await db.query(
            `INSERT INTO Notifications (user_id, type, subject, message, delivery_method, link) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [user_id, type, subject, message, delivery_method, link]
        );
         // If delivery method is email, send the email
         if (delivery_method === 'email') {
            const [user] = await db.query(`SELECT email FROM Users WHERE user_id = ? LIMIT 1`, [user_id]);

            if (user.length > 0) {
                const recipientEmail = user[0].email;
                await sendEmailNotification(recipientEmail, subject, message);
            }
        }
    } catch (error) {
        console.error('Error sending notification:', error);
        throw error; // Propagate the error to the caller
    }
};


const sendAdminNotification = async (type, subject, message, delivery_method, link) => {
    try {
        // Fetch admin email
        const [admin] = await db.query(`SELECT user_id, email FROM Users WHERE role = 'admin' LIMIT 1`);

        if (admin.length > 0) {
            const admin_id = admin[0].user_id;
            const adminEmail = admin[0].email;

            // Insert into Notifications table
            await db.query(
                `INSERT INTO Notifications (user_id, type, subject, message, delivery_method, link) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [admin_id, type, subject, message, delivery_method, link]
            );

            // If email delivery, send email
            if (delivery_method === 'email') {
                await sendEmailNotification(adminEmail, subject, message);
            }
        } else {
            console.warn('No admin found for notification.');
        }
    } catch (error) {
        console.error('Error sending admin notification:', error);
        throw error;
    }
};




module.exports = { sendNotification, sendAdminNotification };



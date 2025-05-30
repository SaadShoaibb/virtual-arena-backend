const nodemailer = require('nodemailer');
require('dotenv').config();

// Set up email transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // Use true for port 465, false for 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Function to send email notification
const sendEmailNotification = async (recipientEmail, subject, message) => {
    try {
        const mailOptions = {
            from: process.env.SMTP_USER,
            to: recipientEmail,
            subject,
            text: message
        };

        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${recipientEmail}`);
        return true;
    } catch (error) {
        console.error(`Failed to send email:`, error);
        return false;
    }
};

module.exports = sendEmailNotification;

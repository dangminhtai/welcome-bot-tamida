// utils/mailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail', // có thể đổi sang smtp riêng
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
});

async function sendMail(to, subject, text) {
    await transporter.sendMail({
        from: process.env.MAIL_USER,
        to,
        subject,
        text
    });
}

module.exports = { sendMail };

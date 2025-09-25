// server.js

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Set up Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// The endpoint to handle the bulk email request
app.post('/send-emails', upload.array('attachments'), async (req, res) => {
    const { email, appPassword, recipients, subject, content, signature } = req.body;
    const attachments = req.files;

    if (!email || !appPassword || !recipients || !subject || !content) {
        // Clean up uploaded files if there's a missing field
        attachments.forEach(file => fs.unlinkSync(file.path));
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        // Nodemailer transporter setup with certificate bypass
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: email,
                pass: appPassword,
            },
            tls: {
                rejectUnauthorized: false // This bypasses the certificate error
            }
        });

        const fullContent = `${content}<br><br>${signature.replace(/\n/g, '<br>')}`;
        const parsedRecipients = JSON.parse(recipients);

        const mailPromises = parsedRecipients.map(recipient => {
            const mailOptions = {
                from: email,
                to: recipient,
                subject: subject,
                html: fullContent,
                attachments: attachments.map(file => ({
                    filename: file.originalname,
                    path: file.path,
                })),
            };

            return new Promise((resolve) => {
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error(`Error sending email to ${recipient}:`, error);
                        resolve({ recipient, status: 'error', error: error.message });
                    } else {
                        console.log(`Email sent to ${recipient}: ${info.response}`);
                        resolve({ recipient, status: 'success' });
                    }
                });
            });
        });

        const results = await Promise.all(mailPromises);

        // Clean up uploaded files after sending
        attachments.forEach(file => {
            fs.unlink(file.path, (err) => {
                if (err) console.error(`Failed to delete temporary file: ${file.path}`, err);
            });
        });

        res.status(200).json({
            message: 'Bulk email process completed.',
            results: results,
        });
    } catch (error) {
        console.error('An unhandled server error occurred:', error);
        // Ensure files are deleted even on unhandled errors
        attachments.forEach(file => fs.unlinkSync(file.path));
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});
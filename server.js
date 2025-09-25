// server.js

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs/promises'); // Use promises for async file operations
const path = require('path');

const app = express();
const port = process.env.PORT || 3000; // Use Render's dynamic port

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
    let uploadedFilePaths = [];
    try {
        const { email, appPassword, recipients, subject, content, signature } = req.body;
        const attachments = req.files;
        
        // Store paths for cleanup in case of an error
        uploadedFilePaths = attachments.map(file => file.path);

        if (!email || !appPassword || !recipients || !subject || !content) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: email,
                pass: appPassword,
            },
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

            return transporter.sendMail(mailOptions);
        });

        await Promise.allSettled(mailPromises);

        // Clean up uploaded files after sending
        for (const filePath of uploadedFilePaths) {
            await fs.unlink(filePath);
        }

        res.status(200).json({
            message: 'Bulk email process completed.',
            // For security, do not send recipient list or detailed results back to the client
        });
    } catch (error) {
        console.error('An unhandled server error occurred:', error);
        
        // Ensure files are deleted even on unhandled errors
        if (uploadedFilePaths.length > 0) {
            for (const filePath of uploadedFilePaths) {
                try {
                    await fs.unlink(filePath);
                } catch (cleanupError) {
                    console.error('Failed to delete temporary file during error cleanup:', cleanupError);
                }
            }
        }
        
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});

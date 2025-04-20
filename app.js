const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

// Enable CORS for frontend requests
app.use(cors({
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Parse JSON bodies
app.use(express.json());

// Use memory storage for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'));
    }
  }
});

// Simple health check route
app.get('/', (req, res) => {
  res.send('Solar Quote API is running');
});

// API endpoint for sending quote requests
app.post('/api/send-quote-request', upload.array('image', 5), async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone, 
      address, 
      comments, 
      'solar-panels': solarPanels, 
      'battery': battery, 
      'system-size': systemSize, 
      'daily-energy': dailyEnergy 
    } = req.body;
    
    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({ success: false, message: 'Name, email, and phone are required' });
    }
    
    // Setup email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
    
    // Prepare email body
    const emailBody = `
      <h2>New Quote Request</h2>
      <h3>Customer Information:</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Address:</strong> ${address || 'Not provided'}</p>
      
      <h3>System Details:</h3>
      <p><strong>Solar Panels:</strong> ${solarPanels || 'Not calculated'}</p>
      <p><strong>Battery:</strong> ${battery || 'Not calculated'}</p>
      <p><strong>System Size:</strong> ${systemSize || 'Not calculated'}</p>
      <p><strong>Daily Energy:</strong> ${dailyEnergy || 'Not calculated'}</p>
      
      <h3>Additional Comments:</h3>
      <p>${comments || 'No additional comments'}</p>
    `;
    
    // Prepare attachments for the email
    const attachments = req.files ? req.files.map(file => {
      return {
        filename: file.originalname,
        content: file.buffer,
        contentType: file.mimetype
      };
    }) : [];
    
    // Send email
    const info = await transporter.sendMail({
      from: `"Solar Quote System" <${process.env.EMAIL_USER}>`,
      to: process.env.RECIPIENT_EMAIL,
      cc: process.env.CC_EMAILS ? process.env.CC_EMAILS.split(',') : [],
      subject: `New Solar Quote Request from ${name}`,
      html: emailBody,
      attachments: attachments,
    });
    
    res.json({ 
      success: true,
      message: 'Quote request sent successfully',
      id: info.messageId
    });
  } catch (error) {
    console.error('Error sending quote request:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send quote request',
      error: error.message
    });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: err.message || 'Something went wrong!' 
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
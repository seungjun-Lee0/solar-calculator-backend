const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const cors = require('cors');
const dotenv = require('dotenv');
// Import node-fetch for making HTTP requests
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

// Enable CORS for all origins (for development)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// Handle OPTIONS requests explicitly
app.options('*', cors());

// Parse JSON bodies
app.use(express.json());

// Use memory storage for file uploads
const storage = multer.memoryStorage();

// Create multer instance without field filtering
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

// Additional health check endpoint for monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Use any() to accept any fields instead of array()
app.post('/api/send-quote-request', upload.any(), async (req, res) => {
  try {
    console.log('Received form data:', req.body);
    
    // More detailed file logging
    if (req.files && req.files.length > 0) {
      console.log(`Received files: ${req.files.length}`);
      req.files.forEach((file, index) => {
        console.log(`File ${index + 1}: ${file.originalname || 'unnamed'}, size: ${file.size}, mimetype: ${file.mimetype}`);
      });
    } else {
      console.log('Received files: none');
    }
    
    const { 
      name, 
      email, 
      phone, 
      address, 
      comments, 
      'solar-panels': solarPanels, 
      'battery': battery, 
      'system-size': systemSize, 
      'daily-energy': dailyEnergy,
      'contact-method': contactMethod
    } = req.body;
    
    // Updated validation: Only require name and email
    // Make phone required only if phone contact method is selected
    if (!name || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and email are required' 
      });
    }
    
    if (contactMethod === 'phone' && !phone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required when phone contact method is selected'
      });
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
      <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
      <p><strong>Address:</strong> ${address || 'Not provided'}</p>
      <p><strong>Preferred Contact Method:</strong> ${contactMethod || 'Not specified'}</p>
      
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
        filename: file.originalname || `image.${file.mimetype.split('/')[1]}`,
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
  console.error('Global error handler:', err.stack);
  res.status(500).json({ 
    success: false, 
    message: err.message || 'Something went wrong!' 
  });
});

/**
 * Function to prevent Render from shutting down the server after 15 minutes of inactivity
 * This sends a ping to the server every 14 minutes to keep it alive
 */
function keepAlive() {
  // Server URL (self)
  const url = process.env.SERVER_URL || 'https://solar-calculator-backend.onrender.com';
  
  // Send a ping every 14 minutes (just under the 15-minute Render timeout)
  setInterval(() => {
    fetch(url)
      .then(response => {
        console.log(`Keep-alive ping sent at ${new Date().toISOString()}, status: ${response.status}`);
      })
      .catch(error => {
        console.error(`Keep-alive ping failed: ${error.message}`);
      });
  }, 14 * 60 * 1000); // 14 minutes in milliseconds
}

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  
  // Enable keep-alive if the environment variable is set to true
  if (process.env.KEEP_ALIVE === 'true') {
    keepAlive();
    console.log('Keep-alive service started to prevent Render from shutting down');
  }
});
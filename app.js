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

// Create an array of allowed origins from environment variable
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim()) 
  : [
      'http://localhost:5500',
      'https://solar-calculator-chi.vercel.app',
      'https://tepng.com',
      'https://www.tepng.com'
    ];

// CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked request:', origin);
      callback(new Error('Blocked by CORS policy'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // Allow requests with credentials
}));

// Handle preflight requests
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
    
    // Extract form data (including all possible fields from different calculator modes)
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
      'contact-method': contactMethod,
      // Advanced mode specific fields
      'system-type': systemType,
      'orientation': orientation,
      'annual-output': annualOutput,
      'monthly-savings': monthlySavings,
      'daily-usage': dailyUsage,
      'electric-bill': electricBill,
      'tilt': tilt,
      'location-coordinates': locationCoordinates,
      'purchase-timeline': purchaseTimeline,
      'calculator-mode': clientCalculatorMode
    } = req.body;
    
    // Detect calculator mode based on received fields
    let calculatorMode = clientCalculatorMode || 'unknown';
    
    // Fallback detection if client didn't send the mode
    if (!calculatorMode || calculatorMode === 'unknown') {
      if (systemType && orientation && tilt) {
        calculatorMode = 'advanced';
      } else if (solarPanels && battery) {
        calculatorMode = 'standard';
      } else {
        calculatorMode = 'assistive';
      }
    }
    
    console.log(`Detected calculator mode: ${calculatorMode}`);
    
    // Validate name - always required
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name is required' 
      });
    }
    
    // Validate contact information based on contact method
    if (contactMethod === 'email') {
      if (!email) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email is required when email contact method is selected' 
        });
      }
    } else if (contactMethod === 'phone' || contactMethod === 'sms') {
      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required when phone or SMS contact method is selected'
        });
      }
    } else {
      // If no contact method is specified, require at least one contact method
      if (!email && !phone) {
        return res.status(400).json({
          success: false,
          message: 'At least one contact method (email or phone) is required'
        });
      }
    }
    
    // Setup email transporter with improved settings
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      secure: true, // Use TLS
      pool: true, // Enable connection pooling for efficiency
      maxConnections: 5,
      // Rate limiting helps comply with Gmail API limits
      rateLimit: 5 // Max number of emails per second
    });
    
    // Create a more detailed system details table based on calculator mode
    let systemDetailsHTML = '';
    
    if (calculatorMode === 'advanced') {
      // Advanced mode system details section
      systemDetailsHTML = `
        <h2 style="margin-top: 0; margin-bottom: 15px; color: #1a3755; font-size: 18px; font-weight: 600;">System Details (Advanced)</h2>
        <table cellpadding="0" cellspacing="0" style="width: 100%;">
          <tr>
            <td style="width: 50%; padding-bottom: 15px; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; margin-right: 8px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">System Type</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${systemType || 'Not specified'}</span>
              </div>
            </td>
            <td style="width: 50%; padding-bottom: 15px; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; margin-left: 8px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">Panel Orientation</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${orientation || 'Not specified'}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="width: 50%; padding-bottom: 15px; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; margin-right: 8px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">System Size</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${systemSize || 'Not calculated'}</span>
              </div>
            </td>
            <td style="width: 50%; padding-bottom: 15px; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; margin-left: 8px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">Annual Output</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${annualOutput || 'Not calculated'}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="width: 50%; padding-bottom: 15px; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; margin-right: 8px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">Monthly Savings</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${monthlySavings || 'Not calculated'}</span>
              </div>
            </td>
            <td style="width: 50%; padding-bottom: 15px; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; margin-left: 8px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">Daily Usage</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${dailyUsage || 'Not specified'}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="width: 50%; padding-bottom: 15px; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; margin-right: 8px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">Monthly Electric Bill</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${electricBill || 'Not specified'}</span>
              </div>
            </td>
            <td style="width: 50%; padding-bottom: 15px; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; margin-left: 8px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">Location Coordinates</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${locationCoordinates || 'Not specified'}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="width: 50%; padding-bottom: 15px; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">Panel Tilt</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${tilt || 'Not specified'}</span>
              </div>
            </td>
          </tr>
        </table>
      `;
    } else {
      // Assistive/Standard mode system details section
      systemDetailsHTML = `
        <h2 style="margin-top: 0; margin-bottom: 15px; color: #1a3755; font-size: 18px; font-weight: 600;">System Details (${calculatorMode.charAt(0).toUpperCase() + calculatorMode.slice(1)})</h2>
        <table cellpadding="0" cellspacing="0" style="width: 100%;">
          <tr>
            <td style="width: 50%; padding-bottom: 15px; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; margin-right: 8px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">Solar Panels</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${solarPanels || 'Not calculated'}</span>
              </div>
            </td>
            <td style="width: 50%; padding-bottom: 15px; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; margin-left: 8px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">Battery</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${battery || 'Not calculated'}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="width: 50%; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; margin-right: 8px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">System Size</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${systemSize || 'Not calculated'}</span>
              </div>
            </td>
            <td style="width: 50%; vertical-align: top;">
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 12px; margin-left: 8px; border: 1px solid #eee;">
                <span style="display: block; font-size: 13px; color: #7f8c8d; margin-bottom: 4px;">Daily Energy</span>
                <span style="display: block; font-weight: 600; color: #34495e; font-size: 16px;">${dailyEnergy || 'Not calculated'}</span>
              </div>
            </td>
          </tr>
        </table>
      `;
    }
    
    // Generate additional information section for advanced mode
    let additionalInfoHTML = '';
    if (calculatorMode === 'advanced') {
      additionalInfoHTML = `
        <div style="margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
          <h2 style="margin-top: 0; margin-bottom: 15px; color: #1a3755; font-size: 18px; font-weight: 600;">Installation Preferences</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 10px; border-bottom: 1px solid #eee; font-weight: 600; width: 40%;">Purchase Timeline:</td>
              <td style="padding: 8px 10px; border-bottom: 1px solid #eee;">${purchaseTimeline || 'Not specified'}</td>
            </tr>
          </table>
        </div>
      `;
    }
    
    // Prepare HTML email body with improved styling matching website design and conditionals for calculator mode
    const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solar Quote Request</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #2c3e50; background-color: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(45deg, #1a3755, #3498db); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 500;">New Solar Quote Request (${calculatorMode.charAt(0).toUpperCase() + calculatorMode.slice(1)} Mode)</h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 20px;">
      <!-- Customer Information Section -->
      <div style="margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
        <h2 style="margin-top: 0; margin-bottom: 15px; color: #1a3755; font-size: 18px; font-weight: 600;">Customer Information</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eee; font-weight: 600; width: 40%;">Name:</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eee;">${name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eee; font-weight: 600;">Email:</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eee;">${email || 'Not provided'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eee; font-weight: 600;">Phone:</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eee;">${phone || 'Not provided'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eee; font-weight: 600;">Address:</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eee;">${address || 'Not provided'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eee; font-weight: 600;">Preferred Contact:</td>
            <td style="padding: 8px 10px; border-bottom: 1px solid #eee;">${contactMethod || 'Not specified'}</td>
          </tr>
        </table>
      </div>
      
      <!-- System Details Section - Dynamic based on calculator mode -->
      <div style="margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid #eee;">
        ${systemDetailsHTML}
      </div>
      
      <!-- Additional Information Section (Advanced mode only) -->
      ${additionalInfoHTML}
      
      <!-- Additional Comments Section -->
      <div style="margin-bottom: 15px;">
        <h2 style="margin-top: 0; margin-bottom: 15px; color: #1a3755; font-size: 18px; font-weight: 600;">Additional Comments</h2>
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 15px; border: 1px solid #eee;">
          <p style="margin: 0; white-space: pre-line;">${comments || 'No additional comments'}</p>
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="padding: 15px; text-align: center; font-size: 14px; color: #7f8c8d; background-color: #f1f1f1; border-radius: 0 0 8px 8px;">
      <div style="margin-bottom: 10px;">
        <img src="https://tepng.com/wp-content/uploads/2022/02/logo.png" alt="TEPNG Logo" style="max-width: 120px; height: auto;">
      </div>
      <p style="margin: 0;">© ${new Date().getFullYear()} Solar Quote System</p>
    </div>
  </div>
</body>
</html>
`;

    // Create a plain text version of the email for better deliverability
    let plainTextAdditionalFields = '';
    if (calculatorMode === 'advanced') {
      plainTextAdditionalFields = `
System Type: ${systemType || 'Not specified'}
Panel Orientation: ${orientation || 'Not specified'}
Annual Output: ${annualOutput || 'Not calculated'}
Monthly Savings: ${monthlySavings || 'Not calculated'}
Daily Usage: ${dailyUsage || 'Not specified'}
Monthly Electric Bill: ${electricBill || 'Not specified'}
Location Coordinates: ${locationCoordinates || 'Not specified'}
Panel Tilt: ${tilt || 'Not specified'}
Purchase Timeline: ${purchaseTimeline || 'Not specified'}
`;
    }
    
    const plainTextBody = `
Solar Quote Request from ${name} (${calculatorMode.charAt(0).toUpperCase() + calculatorMode.slice(1)} Mode)
-----------------------------

CUSTOMER INFORMATION:
-----------------------------
Name: ${name}
Email: ${email || 'Not provided'}
Phone: ${phone || 'Not provided'}
Address: ${address || 'Not provided'}
Preferred Contact: ${contactMethod || 'Not specified'}

SYSTEM DETAILS:
-----------------------------
${calculatorMode === 'advanced' ? plainTextAdditionalFields : 
`Solar Panels: ${solarPanels || 'Not calculated'}
Battery: ${battery || 'Not calculated'}
System Size: ${systemSize || 'Not calculated'}
Daily Energy: ${dailyEnergy || 'Not calculated'}`}

ADDITIONAL COMMENTS:
-----------------------------
${comments || 'No additional comments'}

© ${new Date().getFullYear()} Solar Quote System
`;
    
    // Prepare attachments for the email
    const attachments = req.files ? req.files.map(file => {
      return {
        filename: file.originalname || `image.${file.mimetype.split('/')[1]}`,
        content: file.buffer,
        contentType: file.mimetype
      };
    }) : [];
    
    // Send email with improved configuration
    const info = await transporter.sendMail({
      from: {
        name: "Solar Quote System", 
        address: process.env.EMAIL_USER
      },
      to: process.env.RECIPIENT_EMAIL,
      cc: process.env.CC_EMAILS ? process.env.CC_EMAILS.split(',') : [],
      subject: `New Solar Quote Request from ${name} (${calculatorMode.charAt(0).toUpperCase() + calculatorMode.slice(1)} Mode)`,
      html: emailBody,
      text: plainTextBody, // Plain text alternative version
      attachments: attachments,
      headers: {
        'X-Priority': '3', // Normal priority
        'X-MSMail-Priority': 'Normal',
        'Importance': 'Normal',
        'X-Mailer': 'Solar Quote System Mailer'
      },
      // Custom Message-ID domain if configured
      messageId: process.env.EMAIL_DOMAIN ? 
        `<${Date.now()}.${Math.random().toString(36).substring(2, 15)}@${process.env.EMAIL_DOMAIN}>` : 
        undefined,
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

// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const crypto = require('crypto');

// ✅ In-memory session storage (use Redis in production)
const sessions = new Map();

// Generate session token
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/* ===============================
    POST /api/auth/login
    Manual login with email/password
=============================== */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    // Find user by email
    const user = await User.findByEmail(email);

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({ 
        success: false, 
        message: 'Account is inactive. Please contact administrator.' 
      });
    }

    // Check password (in production, use bcrypt)
    if (user.password !== password) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Generate session token
    const token = generateToken();
    
    // Store session
    sessions.set(token, {
      userId: user.id,
      email: user.email,
      role: user.role_name,
      username: user.username,
      department: user.department,
      createdAt: Date.now()
    });

    console.log(`✅ User ${email} (${user.role_name}) logged in successfully`);

    return res.status(200).json({ 
      success: true, 
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role_name,
        department: user.department
      },
      redirectTo: '/allotment'
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error during login' 
    });
  }
});

/* ===============================
    POST /api/auth/verify
    Verify if session token is valid
=============================== */
router.post('/verify', (req, res) => {
  const { token } = req.body;

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ 
      valid: false, 
      message: 'Invalid or expired session' 
    });
  }

  const session = sessions.get(token);
  
  // Check if session is older than 24 hours
  const sessionAge = Date.now() - session.createdAt;
  if (sessionAge > 24 * 60 * 60 * 1000) {
    sessions.delete(token);
    return res.status(401).json({ 
      valid: false, 
      message: 'Session expired' 
    });
  }
  
  return res.status(200).json({ 
    valid: true,
    user: {
      userId: session.userId,
      email: session.email,
      role: session.role,
      username: session.username,
      department: session.department
    }
  });
});

/* ===============================
    POST /api/auth/logout
=============================== */
router.post('/logout', (req, res) => {
  const { token } = req.body;
  
  if (token && sessions.has(token)) {
    sessions.delete(token);
    console.log('✅ User logged out successfully');
  }

  return res.status(200).json({ 
    success: true, 
    message: 'Logged out successfully' 
  });
});

/* ===============================
    GET /api/auth/session-info
    Get current session info
=============================== */
router.get('/session-info', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token || !sessions.has(token)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const session = sessions.get(token);
  
  return res.status(200).json({ 
    user: {
      userId: session.userId,
      email: session.email,
      role: session.role,
      username: session.username,
      department: session.department
    }
  });
});

/* ===============================
    GET /api/auth/sessions/count
    Debug: Get active session count
=============================== */
router.get('/sessions/count', (req, res) => {
  return res.json({ 
    activeSessions: sessions.size 
  });
});

// Export sessions for use in other routes
module.exports = router;
module.exports.sessions = sessions;
module.exports.generateToken = generateToken;
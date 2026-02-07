// routes/authRoutes.js
const express = require('express');
const router = express.Router();
// NOTE: We are NOT importing the User model here because we are using
// hardcoded credentials for the admin user as requested.

// POST /api/auth/login - Handles user login
router.post('/login', (req, res) => {
    // This uses built-in/hardcoded admin credentials as requested.
    const { email, password } = req.body;
    const adminEmail = 'admin@example.com';
    const adminPassword = 'admin123'; // NOTE: This is plain text for simplicity.

    if (email === adminEmail && password === adminPassword) {
        // Successful login
        // In a real app, you would create and send a JWT token here
        console.log(`Admin user ${email} logged in successfully.`);
        return res.status(200).json({ 
            success: true, 
            message: 'Login successful',
            redirectTo: '/allotment' // The destination page
        });
    } else {
        // Failed login
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid credentials' 
        });
    }
});

module.exports = router;

// To use this route, you must register it in your server.js:
// const authRoutes = require('./routes/authRoutes');
// app.use('/api/auth', authRoutes);

// Class/backend/middleware/sessionAuth.js
const { sessions } = require("../routes/authRoutes");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.replace("Bearer ", "");

  // 🔍 Debug logging
  console.log('🔐 Session Auth Check:', {
    hasAuthHeader: !!authHeader,
    hasToken: !!token,
    tokenPreview: token ? token.substring(0, 20) + '...' : 'none',
    totalSessions: sessions.size,
    sessionExists: token ? sessions.has(token) : false,
    path: req.path,
    method: req.method
  });

  if (!token) {
    console.log('❌ Auth failed: No token provided');
    return res.status(401).json({ error: "Authorization token missing" });
  }

  const session = sessions.get(token);

  if (!session) {
    console.log('❌ Auth failed: Session not found in sessions Map');
    console.log('💡 Hint: Server may have restarted. Please logout and login again.');
    return res.status(401).json({ 
      error: "Invalid or expired session",
      hint: "Please logout and login again"
    });
  }

  // ✅ Session valid
  console.log('✅ Auth successful:', {
    userId: session.userId,
    role: session.role,
    email: session.email
  });

  req.session = session;
  req.user = {
    id: session.userId,
    email: session.email,
    role: session.role,
    username: session.username,
    department: session.department,
  };

  next();
};
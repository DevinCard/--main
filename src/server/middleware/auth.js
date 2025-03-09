const jwt = require('jsonwebtoken');

// JWT Secret key - must be the same used in auth routes
const JWT_SECRET = 'your-secret-key';

/**
 * Authentication middleware for Vaultly
 * Verifies JWT token from Authorization header or cookies
 */
const authMiddleware = (req, res, next) => {
  // Get token from header
  const authHeader = req.headers.authorization;
  
  // Log authentication attempt
  console.log(`Auth attempt for path: ${req.path}`);
  
  // Check if no token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Authentication failed: No token provided');
    return res.status(401).json({ error: 'No token, authorization denied' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    // Verify token using the same secret key as in auth routes
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Log successful authentication
    console.log(`Authentication successful for user ID: ${decoded.id}`);
    
    // Add user ID from token to request object
    req.userId = decoded.id;
    
    // Continue to the next middleware/route handler
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    
    // If the token is expired, provide a specific message
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token has expired', 
        message: 'Your session has expired. Please log in again.' 
      });
    }
    
    res.status(401).json({ 
      error: 'Token is not valid',
      message: 'Authentication failed. Please log in again.'
    });
  }
};

module.exports = authMiddleware;
module.exports.requireAuth = authMiddleware; 
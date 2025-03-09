const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const bcrypt = require('bcrypt');

// JWT Secret key - must be the same used in auth middleware
const JWT_SECRET = 'your-secret-key';

// Register endpoint
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Validate the input
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }
        
        // Check if the email already exists
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (user) {
                return res.status(400).json({ error: 'Email already exists' });
            }
            
            // Hash the password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            
            // Create the user
            db.run(
                'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
                [name, email, hashedPassword],
                function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Failed to create user' });
                    }
                    
                    // Create and return a token using the consistent JWT_SECRET
                    const token = jwt.sign({ id: this.lastID }, JWT_SECRET, { expiresIn: '24h' });
                    
                    res.status(201).json({
                        token,
                        user: {
                            id: this.lastID,
                            name,
                            email
                        }
                    });
                }
            );
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        // Check if the user exists
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            // Compare passwords
            const isMatch = await bcrypt.compare(password, user.password);
            
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            // Create and return a token using the consistent JWT_SECRET
            const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '24h' });
            
            res.json({
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                }
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router; 
const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all categories for the user
router.get('/', (req, res) => {
    const userId = req.userId;
    
    // Get both system categories and user-created categories
    db.all(
        `SELECT DISTINCT category, 0 as is_default FROM transactions WHERE user_id = ? AND category IS NOT NULL
         UNION
         SELECT name as category, 1 as is_default FROM default_categories
         ORDER BY is_default DESC, category`,
        [userId],
        (err, rows) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to retrieve categories' });
            }
            res.json(rows);
        }
    );
});

// Save a new category
router.post('/', (req, res) => {
    const { name, emoji } = req.body;
    const userId = req.userId;
    
    if (!name) {
        return res.status(400).json({ error: 'Category name is required' });
    }
    
    // First check if the category already exists
    db.get(
        'SELECT * FROM user_categories WHERE user_id = ? AND name = ?',
        [userId, name],
        (err, row) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to check for existing category' });
            }
            
            if (row) {
                return res.status(400).json({ error: 'Category already exists' });
            }
            
            // Insert the new category
            db.run(
                'INSERT INTO user_categories (user_id, name, emoji) VALUES (?, ?, ?)',
                [userId, name, emoji || '📊'],
                function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Failed to create category' });
                    }
                    
                    res.status(201).json({
                        id: this.lastID,
                        name,
                        emoji,
                        is_default: 0
                    });
                }
            );
        }
    );
});

module.exports = router; 
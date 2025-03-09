const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all transactions
router.get('/', (req, res) => {
    const userId = req.userId;
    
    db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC', [userId], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to retrieve transactions' });
        }
        res.json(rows);
    });
});

// Get recent transactions
router.get('/recent', (req, res) => {
    const userId = req.userId;
    const limit = req.query.limit || 5;
    
    db.all(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT ?', 
        [userId, limit],
        (err, rows) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to retrieve recent transactions' });
            }
            res.json(rows);
        }
    );
});

// Get user balance
router.get('/balance', (req, res) => {
    const userId = req.userId;
    
    db.get(
        'SELECT SUM(CASE WHEN type = "deposit" THEN amount ELSE -amount END) as balance FROM transactions WHERE user_id = ?',
        [userId],
        (err, row) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to calculate balance' });
            }
            
            const balance = row ? row.balance || 0 : 0;
            res.json({ balance });
        }
    );
});

// Add a new transaction
router.post('/', (req, res) => {
    const { type, title, category, amount, date, is_recurring, frequency } = req.body;
    const userId = req.userId;
    
    if (!type || !title || !amount) {
        return res.status(400).json({ error: 'Type, title, and amount are required' });
    }
    
    const query = `
        INSERT INTO transactions (user_id, type, title, category, amount, date, is_recurring, frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(
        query, 
        [userId, type, title, category, amount, date, is_recurring ? 1 : 0, frequency || null],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to add transaction' });
            }
            
            res.status(201).json({
                id: this.lastID,
                type,
                title,
                category,
                amount,
                date,
                is_recurring,
                frequency
            });
        }
    );
});

// Update a transaction
router.put('/:id', (req, res) => {
    const id = req.params.id;
    const userId = req.userId;
    const { type, title, category, amount, date, is_recurring, frequency } = req.body;
    
    db.run(
        `UPDATE transactions SET type = ?, title = ?, category = ?, amount = ?, date = ?, 
         is_recurring = ?, frequency = ? WHERE id = ? AND user_id = ?`,
        [type, title, category, amount, date, is_recurring ? 1 : 0, frequency || null, id, userId],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to update transaction' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Transaction not found or not authorized' });
            }
            
            res.json({ message: 'Transaction updated successfully' });
        }
    );
});

// Delete a transaction
router.delete('/:id', (req, res) => {
    const id = req.params.id;
    const userId = req.userId;
    
    db.run('DELETE FROM transactions WHERE id = ? AND user_id = ?', [id, userId], function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to delete transaction' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Transaction not found or not authorized' });
        }
        
        res.json({ message: 'Transaction deleted successfully' });
    });
});

module.exports = router; 
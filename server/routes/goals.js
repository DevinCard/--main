const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// Debug middleware for this router
router.use((req, res, next) => {
    console.log('Goals Router:', req.method, req.path);
    next();
});

// Get all goals for a user
router.get('/goals', auth, async (req, res) => {
    console.log('GET /goals endpoint hit');
    db.all(
        'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.id],
        (err, rows) => {
            if (err) {
                console.error('Error fetching goals:', err);
                return res.status(500).json({ error: 'Failed to fetch goals' });
            }
            console.log('Query result:', rows);
            res.json(rows);
        }
    );
});

// Create a new goal
router.post('/goals', auth, (req, res) => {
    const { title, targetAmount, category } = req.body;
    db.run(
        'INSERT INTO goals (user_id, title, target_amount, current_amount, category) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, title, targetAmount, 0, category],
        function(err) {
            if (err) {
                console.error('Error creating goal:', err);
                return res.status(500).json({ error: 'Failed to create goal' });
            }
            db.get('SELECT * FROM goals WHERE id = ?', [this.lastID], (err, row) => {
                if (err) {
                    console.error('Error fetching created goal:', err);
                    return res.status(500).json({ error: 'Failed to fetch created goal' });
                }
                res.json(row);
            });
        }
    );
});

// Update goal (add money)
router.patch('/goals/:id', auth, (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    
    console.log('Goal update request:', { goalId: id, amount, userId: req.user.id });
    
    // Begin transaction
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // First, calculate user balance from transactions
        db.get(
            `SELECT COALESCE(SUM(CASE WHEN type = 'Deposit' THEN amount ELSE -amount END), 0) as balance 
             FROM transactions
             WHERE user_id = ?`,
            [req.user.id],
            (err, balanceResult) => {
                if (err) {
                    console.error('Error calculating user balance:', err);
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Failed to calculate user balance' });
                }
                
                const userBalance = balanceResult ? parseFloat(balanceResult.balance) : 0;
                console.log('Current user balance (from transactions):', userBalance);
                
                if (amount > 0 && userBalance < amount) {
                    console.error('Insufficient balance:', { required: amount, available: userBalance });
                    db.run('ROLLBACK');
                    return res.status(400).json({ error: 'Insufficient balance' });
                }
                
                // Update goal amount
                db.run(
                    'UPDATE goals SET current_amount = current_amount + ? WHERE id = ? AND user_id = ?',
                    [amount, id, req.user.id],
                    function(err) {
                        if (err) {
                            console.error('Error updating goal amount:', err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to update goal' });
                        }
                        if (this.changes === 0) {
                            console.error('Goal not found:', { goalId: id, userId: req.user.id });
                            db.run('ROLLBACK');
                            return res.status(404).json({ error: 'Goal not found' });
                        }
                        
                        console.log('Goal amount updated successfully');
                        
                        // Create a transaction record for the goal contribution
                        const newTransaction = {
                            user_id: req.user.id,
                            type: amount > 0 ? 'Withdrawal' : 'Deposit',
                            title: amount > 0 ? 'Goal Contribution' : 'Goal Withdrawal',
                            date: new Date().toISOString().split('T')[0],
                            category: 'Goals',
                            amount: Math.abs(amount)
                        };
                        
                        db.run(
                            `INSERT INTO transactions (user_id, type, title, date, category, amount) 
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [
                                newTransaction.user_id,
                                newTransaction.type,
                                newTransaction.title,
                                newTransaction.date,
                                newTransaction.category,
                                newTransaction.amount
                            ],
                            function(err) {
                                if (err) {
                                    console.error('Error creating transaction record:', err);
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Failed to create transaction record' });
                                }
                                
                                console.log('Transaction record created successfully');
                                
                                // Calculate new balance
                                const newBalance = userBalance - (amount > 0 ? amount : -amount);
                                
                                // Get the updated goal
                                db.get(
                                    'SELECT * FROM goals WHERE id = ?',
                                    [id],
                                    (err, goalData) => {
                                        if (err) {
                                            console.error('Error fetching final goal data:', err);
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ error: 'Failed to fetch updated goal' });
                                        }
                                        
                                        if (!goalData) {
                                            console.error('Goal not found after update');
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ error: 'Goal not found after update' });
                                        }
                                        
                                        // Return response with goal data and calculated balance
                                        console.log('Final update successful');
                                        db.run('COMMIT');
                                        
                                        // Add balance to response
                                        const response = {
                                            ...goalData,
                                            balance: newBalance
                                        };
                                        
                                        res.json(response);
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
});

// Delete a goal
router.delete('/goals/:id', auth, (req, res) => {
    const { id } = req.params;
    db.run(
        'DELETE FROM goals WHERE id = ? AND user_id = ?',
        [id, req.user.id],
        function(err) {
            if (err) {
                console.error('Error deleting goal:', err);
                return res.status(500).json({ error: 'Failed to delete goal' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Goal not found' });
            }
            res.json({ message: 'Goal deleted successfully' });
        }
    );
});

module.exports = router; 
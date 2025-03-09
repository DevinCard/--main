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
router.get('/', (req, res) => {
    console.log('Goals Router: GET /goals');
    const userId = req.userId;
    console.log('User ID from token:', userId);
    
    db.all('SELECT * FROM goals WHERE user_id = ?', [userId], (err, rows) => {
        if (err) {
            console.error('Error fetching goals:', err);
            return res.status(500).json({ error: 'Failed to retrieve goals' });
        }
        console.log('Found goals:', rows ? rows.length : 0);
        res.json(rows || []);
    });
});

// Create a new goal
router.post('/', async (req, res) => {
    try {
        // Extract user ID from authenticated request
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }
        
        // Get goal data from request body
        const { title, targetAmount, target_amount, category } = req.body;
        
        // Use either targetAmount or target_amount, whichever is provided
        const finalTargetAmount = parseFloat(targetAmount || target_amount || 0);
        
        console.log(`Creating goal: ${title} with target: ${finalTargetAmount} for user ${userId}`);
        
        // Insert the goal into the database
        const newGoal = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO goals (user_id, title, target_amount, current_amount, category, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, title, finalTargetAmount, 0, category, new Date().toISOString()],
                function(err) {
                    if (err) {
                        console.error('Error creating goal:', err);
                        reject(err);
                    } else {
                        console.log(`Goal created successfully with ID: ${this.lastID}`);
                        resolve(this.lastID);
                    }
                }
            );
        });
        
        // Get the newly created goal to return
        const goal = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM goals WHERE id = ?', [newGoal], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        // Return success response with the created goal
        res.status(201).json({
            success: true,
            message: 'Goal created successfully',
            goal: goal
        });
    } catch (error) {
        console.error('Error in goal creation route:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create goal',
            error: error.message
        });
    }
});

// Update goal (add/remove money)
router.patch('/goals/:id', auth, (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    const userId = req.user.id;

    console.log(`Updating goal ${id} by ${amount} for user ${userId}`);

    // If amount is undefined or not a number, return error
    if (isNaN(parseFloat(amount))) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    // Convert amount to a number to ensure proper math operations
    const amountValue = parseFloat(amount);

    // Start a transaction to ensure data consistency
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // First verify the goal exists and belongs to the user
        db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', 
            [id, userId],
            (err, goal) => {
                if (err) {
                    db.run('ROLLBACK');
                    console.error('Error finding goal:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                if (!goal) {
                    db.run('ROLLBACK');
                    return res.status(404).json({ error: 'Goal not found' });
                }

                // Make sure goal.current_amount is a number
                const currentGoalAmount = parseFloat(goal.current_amount || 0);
                console.log(`Current goal amount: ${currentGoalAmount}, Amount to add/remove: ${amountValue}`);

                // Calculate user's balance from transactions
                db.get(
                    `SELECT COALESCE(SUM(CASE WHEN type = 'Deposit' THEN amount ELSE -amount END), 0) as balance 
                     FROM transactions 
                     WHERE user_id = ?`,
                    [userId],
                    (err, balanceResult) => {
                        if (err) {
                            db.run('ROLLBACK');
                            console.error('Error calculating balance:', err);
                            return res.status(500).json({ error: 'Failed to calculate user balance' });
                        }

                        const currentBalance = parseFloat(balanceResult.balance || 0);
                        console.log(`Current user balance: ${currentBalance}`);

                        // For adding money (positive amount), check if user has enough balance
                        if (amountValue > 0 && currentBalance < amountValue) {
                            db.run('ROLLBACK');
                            console.log(`Insufficient balance: ${currentBalance} < ${amountValue}`);
                            return res.status(400).json({ error: 'Insufficient balance' });
                        }

                        // For removing money (negative amount), check if goal has enough
                        if (amountValue < 0 && currentGoalAmount < Math.abs(amountValue)) {
                            db.run('ROLLBACK');
                            console.log(`Cannot remove more than goal amount: ${currentGoalAmount} < ${Math.abs(amountValue)}`);
                            return res.status(400).json({ error: 'Cannot remove more money than current goal amount' });
                        }

                        // Get the target amount to check if we're exceeding 100%
                        const targetAmount = parseFloat(goal.target_amount);
                        
                        // Calculate new goal amount, but cap it at the target amount (100%)
                        let newGoalAmount = currentGoalAmount + amountValue;
                        let actualAmountAdded = amountValue;
                        
                        // If adding money would exceed the target amount, cap it
                        if (amountValue > 0 && newGoalAmount > targetAmount) {
                            actualAmountAdded = targetAmount - currentGoalAmount;
                            newGoalAmount = targetAmount;
                            console.log(`Capping goal at target amount (100%): ${targetAmount}`);
                            console.log(`Actual amount to add: ${actualAmountAdded} (adjusted from ${amountValue})`);
                        }
                        
                        console.log(`New goal amount will be: ${newGoalAmount}`);

                        // Update the goal amount
                        db.run(
                            'UPDATE goals SET current_amount = ? WHERE id = ? AND user_id = ?',
                            [newGoalAmount, id, userId],
                            function(err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    console.error('Error updating goal:', err);
                                    return res.status(500).json({ error: 'Failed to update goal' });
                                }

                                // Create a transaction record for the goal contribution/withdrawal
                                const transactionData = {
                                    user_id: userId,
                                    type: actualAmountAdded > 0 ? 'Withdrawal' : 'Deposit',
                                    title: actualAmountAdded > 0 ? `Goal Contribution - ${goal.title}` : `Goal Withdrawal - ${goal.title}`,
                                    date: formatDateForTransaction(new Date()),
                                    category: getCategoryNameFromGoal(goal.category), // Extract clean category name
                                    amount: Math.abs(actualAmountAdded)
                                };

                                console.log('Creating transaction with data:', JSON.stringify(transactionData, null, 2));

                                db.run(
                                    'INSERT INTO transactions (user_id, type, title, date, category, amount) VALUES (?, ?, ?, ?, ?, ?)',
                                    [
                                        transactionData.user_id,
                                        transactionData.type,
                                        transactionData.title,
                                        transactionData.date,
                                        transactionData.category,
                                        transactionData.amount
                                    ],
                                    function(err) {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            console.error('Error creating transaction record:', err);
                                            return res.status(500).json({ error: 'Failed to create transaction record' });
                                        }

                                        db.run('COMMIT');

                                        // Calculate new balance after the transaction
                                        const newBalance = currentBalance - actualAmountAdded;
                                        console.log(`New balance will be: ${newBalance}`);

                                        // Return both updated goal and balance
                                        db.get('SELECT * FROM goals WHERE id = ?', [id], (err, updatedGoal) => {
                                            if (err) {
                                                console.error('Error fetching updated goal:', err);
                                                return res.status(500).json({ error: 'Failed to fetch updated goal' });
                                            }
                                            
                                            const response = {
                                                goal: {
                                                    ...updatedGoal,
                                                    target_amount: parseFloat(updatedGoal.target_amount),
                                                    current_amount: parseFloat(updatedGoal.current_amount)
                                                },
                                                balance: newBalance
                                            };
                                            res.json(response);
                                        });
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
    const userId = req.user.id;
    
    console.log(`Attempting to delete goal ${id} for user ${userId}`);

    // Begin a transaction to ensure atomicity
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // First check if the goal exists and get its current amount
        db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', 
            [id, userId], 
            (err, goal) => {
                if (err) {
                    console.error('Error checking goal:', err);
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: 'Failed to check goal' });
                }
                
                if (!goal) {
                    console.log(`Goal ${id} not found for user ${userId}`);
                    db.run('ROLLBACK');
                    return res.status(404).json({ error: 'Goal not found or unauthorized' });
                }

                const goalAmount = parseFloat(goal.current_amount || 0);
                console.log(`Goal ${id} has current amount: $${goalAmount}`);

                // Delete any recurring payments associated with this goal
                db.run('DELETE FROM recurring_payments WHERE goal_id = ? AND user_id = ?', 
                    [id, userId], 
                    (err) => {
                        if (err) {
                            console.error('Error deleting recurring payments:', err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to delete recurring payments' });
                        }

                        // If goal has money, create a refund transaction
                        if (goalAmount > 0) {
                            // Create a transaction to refund the money back to the user
                            const transactionData = {
                                user_id: userId,
                                type: 'Deposit', // This is a deposit back to the user's account
                                title: `Refund - ${goal.title || 'Deleted Goal'}`,
                                date: formatDateForTransaction(new Date()),
                                category: getCategoryNameFromGoal(goal.category) || 'Other',
                                amount: goalAmount
                            };

                            console.log('Creating refund transaction:', JSON.stringify(transactionData, null, 2));

                            db.run(
                                'INSERT INTO transactions (user_id, type, title, date, category, amount) VALUES (?, ?, ?, ?, ?, ?)',
                                [
                                    transactionData.user_id,
                                    transactionData.type,
                                    transactionData.title,
                                    transactionData.date,
                                    transactionData.category,
                                    transactionData.amount
                                ],
                                function(err) {
                                    if (err) {
                                        console.error('Error creating refund transaction:', err);
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: 'Failed to create refund transaction' });
                                    }

                                    // Now delete the goal
                                    deleteGoalAndFinish();
                                }
                            );
                        } else {
                            // No money to refund, just delete the goal
                            deleteGoalAndFinish();
                        }

                        function deleteGoalAndFinish() {
                            // Delete the goal itself
                            db.run('DELETE FROM goals WHERE id = ? AND user_id = ?',
                                [id, userId],
                                function(err) {
                                    if (err) {
                                        console.error('Error deleting goal:', err);
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: 'Failed to delete goal' });
                                    }
                                    
                                    // Log changes but don't return 404 since we already checked existence
                                    if (this.changes === 0) {
                                        console.log(`No rows affected when deleting goal ${id}, but proceeding with success`);
                                    } else {
                                        console.log(`Successfully deleted goal ${id}`);
                                    }
                                    
                                    // Commit the transaction
                                    db.run('COMMIT');

                                    // Return success with the refunded amount
                                    res.json({ 
                                        message: 'Goal deleted successfully',
                                        refundedAmount: goalAmount > 0 ? goalAmount : 0
                                    });
                                }
                            );
                        }
                    }
                );
            }
        );
    });
});

// Schedule a recurring payment for a goal
router.post('/goals/:id/recurring', auth, (req, res) => {
    const { id } = req.params;
    const { amount, frequency } = req.body;  // Get frequency from the request body
    const userId = req.user.id;

    console.log('Recurring payment request body:', req.body);

    // First verify the goal exists and belongs to the user
    db.get(
        'SELECT * FROM goals WHERE id = ? AND user_id = ?',
        [id, userId],
        (err, goal) => {
            if (err) {
                console.error('Error finding goal:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (!goal) {
                return res.status(404).json({ error: 'Goal not found' });
            }

            // Insert the recurring payment record - use frequency from the request body
            db.run(
                `INSERT INTO recurring_payments 
                (goal_id, user_id, amount, frequency, next_payment_date) 
                VALUES (?, ?, ?, ?, date('now'))`,
                [id, userId, amount, frequency],
                function(err) {
                    if (err) {
                        console.error('Error creating recurring payment:', err);
                        return res.status(500).json({ error: 'Failed to create recurring payment' });
                    }
                    res.json({
                        id: this.lastID,
                        goal_id: id,
                        amount,
                        frequency, // Return frequency as is
                        message: 'Recurring payment scheduled successfully'
                    });
                }
            );
        }
    );
});

// GET recurring payments for a specific goal
router.get('/goals/:id/recurring', auth, async (req, res) => {
  try {
    const goalId = req.params.id;
    const userId = req.user ? req.user.id : (req.userId || null);
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    
    // Verify the goal exists and belongs to the user
    const goal = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (!goal) {
      return res.status(404).json({ success: false, message: 'Goal not found' });
    }
    
    // Get recurring payments for this goal
    const recurringPayments = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM recurring_payments WHERE goal_id = ? AND user_id = ?', 
        [goalId, userId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
    });
    
    return res.json({
      success: true,
      recurring_payments: recurringPayments
    });
  } catch (error) {
    console.error('Error fetching recurring payments for goal:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch recurring payments',
      error: error.message
    });
  }
});

// Add money to a goal (one-time contribution)
router.post('/goals/:id/add', auth, async (req, res) => {
    const goalId = req.params.id;
    const userId = req.user.id;
    const { amount } = req.body;
    
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }
    
    try {
        // Calculate current user balance from transactions instead of using a balance column
        const balanceResult = await new Promise((resolve, reject) => {
            db.get(
                `SELECT COALESCE(SUM(CASE WHEN type = 'Deposit' THEN amount ELSE -amount END), 0) as balance 
                FROM transactions
                WHERE user_id = ?`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        const userBalance = parseFloat(balanceResult?.balance || 0);
        const amountToAdd = parseFloat(amount);
        
        console.log(`Goals Router: User ${userId} has balance $${userBalance}, trying to add $${amountToAdd} to goal ${goalId}`);
        
        // Check if user has enough balance
        if (userBalance < amountToAdd) {
            console.log(`Goals Router: Insufficient balance for user ${userId}. Has: $${userBalance.toFixed(2)}, Needs: $${amountToAdd.toFixed(2)}`);
            return res.status(400).json({ error: `Insufficient balance. You have $${userBalance.toFixed(2)} but need $${amountToAdd.toFixed(2)}` });
        }
        
        // Get the current goal
        const goal = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM goals WHERE id = ? AND user_id = ?',
                [goalId, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!goal) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        
        console.log('Goal found:', goal);
        console.log('Goal category:', goal.category);
        
        // Update goal amount
        const currentAmount = parseFloat(goal.current_amount || 0);
        const newAmount = currentAmount + amountToAdd;
        
        await db.run(
            'UPDATE goals SET current_amount = ? WHERE id = ?',
            [newAmount, goalId]
        );
        
        // No need to update user balance in a users table column
        // Just create the transaction which will affect the calculated balance
        
        // Create transaction record
        const date = new Date().toISOString();
        const transactionTitle = `Goal Contribution - ${goal.title || 'Goal'}`;
        
        // Extract clean category name from goal category - handle missing category
        let categoryName = 'Other'; // Default
        if (goal && goal.category) {
            // Get the category name, handling the format correctly
            if (goal.category.includes('|')) {
                categoryName = goal.category.split('|')[1].trim();
            } else {
                categoryName = goal.category.trim();
            }
        }
        
        console.log('Using category name:', categoryName);
        
        await db.run(
            `INSERT INTO transactions (
                user_id, amount, date, title, type, category
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                userId,
                amountToAdd,
                date,
                transactionTitle,
                'expense',
                categoryName
            ]
        );
        
        // Return updated balance (calculated, not stored)
        console.log(`Goals Router: Successfully added $${amountToAdd} to goal "${goal.title}"`);
        return res.json({
            success: true,
            message: `Added $${amountToAdd} to ${goal.title}`,
            balance: userBalance - amountToAdd
        });
        
    } catch (error) {
        console.error('Error adding money to goal:', error);
        return res.status(500).json({ error: 'Failed to add money to goal' });
    }
});

// Note: The recurring endpoints are now handled directly in the main server file (index.js)

// Helper function to calculate the next payment date based on frequency
function calculateNextPaymentDate(frequency) {
    const now = new Date();
    let nextDate = new Date(now);
    
    switch (frequency) {
        case 'daily':
            nextDate.setDate(now.getDate() + 1);
            break;
        case 'weekly':
            nextDate.setDate(now.getDate() + 7);
            break;
        case 'biweekly':
            nextDate.setDate(now.getDate() + 14);
            break;
        case 'monthly':
            nextDate.setMonth(now.getMonth() + 1);
            break;
        case 'quarterly':
            nextDate.setMonth(now.getMonth() + 3);
            break;
        case 'yearly':
            nextDate.setFullYear(now.getFullYear() + 1);
            break;
        default:
            // Default to monthly if frequency is not recognized
            nextDate.setMonth(now.getMonth() + 1);
    }
    
    return nextDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
}

// Helper functions
function formatDateForTransaction(date) {
    if (!date) return new Date().toISOString();
    return new Date(date).toISOString();
}

function getCategoryNameFromGoal(category) {
    // Handle undefined or null category
    if (!category) {
        return 'Other'; // Default category
    }
    
    // Extract the category name from "emoji|name" format
    if (category.includes('|')) {
        return category.split('|')[1];
    }
    return category;
}

module.exports = router;
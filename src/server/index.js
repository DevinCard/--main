const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('./middleware/auth');
const db = require('./db'); // Use the existing db connection

// Import routes - keep only the ones that actually exist
const authRouter = require('./routes/auth');
const transactionsRouter = require('./routes/transactions');
const goalsRouter = require('./routes/goals');
const categoriesRouter = require('./routes/categories');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../../')));

// Initialize database tables
        initializeDatabase();

function initializeDatabase() {
    console.log('Initializing database with transactions table...');
    
    // Check if transactions table exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'", [], (err, result) => {
        if (err) {
            console.error('Error checking for transactions table:', err);
            return;
        }
        
        if (result) {
            console.log('Transactions table exists');
        } else {
            console.error('WARNING: Transactions table does not exist but should have been created by db.js');
        }
        
        // Check if categories table needs default values
        db.get("SELECT COUNT(*) as count FROM categories WHERE is_default = 1", [], (err, result) => {
            if (err) {
                console.error('Error checking for default categories:', err);
                return;
            }
            
            if (!result || result.count === 0) {
                console.log('Inserting default categories');
        db.run(`
            INSERT OR IGNORE INTO categories (name, emoji, is_default, user_id) VALUES 
            ('Food', '🍔', 1, NULL),
            ('Transport', '🚌', 1, NULL),
            ('Utilities', '💡', 1, NULL)
        `, (err) => {
            if (err) console.error('Error inserting default categories:', err);
        });
            }
        });
    });
}

// User Routes
app.post('/api/signup', async (req, res) => {
    console.log('Received signup request:', req.body);
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        console.log('Validation failed:', { username, email, password: '***' });
        return res.status(400).json({ 
            error: 'Full name, email, and password are required' 
        });
    }

    try {
        const userExists = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
                if (err) {
                    console.error('Error checking user existence:', err);
                    reject(err);
                }
                resolve(row);
            });
        });

        if (userExists) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)',
                [username, email, hashedPassword],
                function(err) {
                    if (err) {
                        console.error('Database insertion error:', err);
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });

        const token = jwt.sign(
            { id: result, full_name: username },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.json({ 
            message: 'User created successfully',
            token
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Error creating user' });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    const sql = `SELECT * FROM users WHERE email = ?`;
    db.get(sql, [email], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                email: user.email
            }
        });
    });
});

// API Routes
app.get('/api/balance', authMiddleware, (req, res) => {
    const sql = `
        SELECT COALESCE(SUM(CASE WHEN type = 'Deposit' THEN amount ELSE -amount END), 0) as balance 
        FROM transactions
        WHERE user_id = ?
    `;
    
    db.get(sql, [req.userId], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ balance: row.balance });
    });
});

app.get('/api/transactions', authMiddleware, (req, res) => {
    const userId = req.userId;
    db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC', [userId], (err, transactions) => {
        if (err) {
            console.error('Error fetching transactions:', err);
            return res.status(500).json({ error: 'Failed to fetch transactions' });
        }
        res.json(transactions || []);
    });
});

app.post('/api/transactions', authMiddleware, (req, res) => {
    const { type, title, date, category, amount, recurring, recurrenceInterval } = req.body;
    
    // Validate the input
    if (!type || !title || !date || !category || !amount) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const sql = `
        INSERT INTO transactions (user_id, type, title, date, category, amount, recurring, recurrence_interval) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.run(sql, [
        req.userId, 
        type, 
        title, 
        date, 
        category, 
        amount,
        recurring || 'one-time',
        recurrenceInterval
    ], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ 
                error: 'Failed to add transaction',
                details: err.message 
            });
        }
        
        res.json({ 
            id: this.lastID,
            message: 'Transaction added successfully' 
        });
    });
});

app.get('/api/categories', authMiddleware, (req, res) => {
    const userId = req.userId;
    const sql = `
        SELECT DISTINCT id, name, emoji, is_default, user_id 
        FROM categories 
        WHERE is_default = 1 
        OR user_id = ?
        ORDER BY 
            is_default DESC,
            name ASC
    `;
    
    db.all(sql, [userId], (err, categories) => {
        if (err) {
            console.error('Error fetching categories:', err);
            return res.status(500).json({ error: 'Failed to fetch categories' });
        }
        
        // Remove duplicates based on name
        const uniqueCategories = Array.from(
            new Map(categories.map(cat => [cat.name, cat])).values()
        );
        
        res.json(uniqueCategories);
    });
});

app.post('/api/categories', authMiddleware, (req, res) => {
    const { name, emoji } = req.body;
    const userId = req.userId;

    if (!name || !emoji) {
        return res.status(400).json({ error: 'Name and emoji are required' });
    }

    db.run(
        'INSERT INTO categories (user_id, name, emoji, is_default) VALUES (?, ?, ?, 0)',
        [userId, name, emoji],
        function(err) {
            if (err) {
                console.error('Error saving category:', err);
                return res.status(500).json({ error: 'Failed to save category' });
            }
            
            res.json({ 
                id: this.lastID,
                name,
                emoji,
                user_id: userId,
                is_default: 0
            });
        }
    );
});

// Add this endpoint for updating transactions
app.put('/api/transactions/:id', authMiddleware, (req, res) => {
    const transactionId = req.params.id;
    const { type, title, date, category, amount, recurring, recurrenceInterval } = req.body;
    const userId = req.userId;

    // Validate input
    if (!type || !title || !date || !category || !amount) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (amount <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    if (!['Deposit', 'Withdrawal'].includes(type)) {
        return res.status(400).json({ error: 'Invalid transaction type' });
    }

    // Update the transaction
    const sql = `
        UPDATE transactions 
        SET type = ?, title = ?, date = ?, category = ?, amount = ?, recurring = ?, recurrence_interval = ?
        WHERE id = ? AND user_id = ?
    `;

    db.run(sql, [
        type, 
        title, 
        date, 
        category, 
        amount, 
        recurring || 'one-time',
        recurrenceInterval,
        transactionId, 
        userId
    ], function(err) {
        if (err) {
            console.error('Error updating transaction:', err);
            return res.status(500).json({ error: 'Failed to update transaction' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Transaction not found or unauthorized' });
        }

        // Return the updated transaction
        db.get(
            'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
            [transactionId, userId],
            (err, transaction) => {
                if (err) {
                    console.error('Error fetching updated transaction:', err);
                    return res.status(500).json({ error: 'Failed to fetch updated transaction' });
                }
                res.json(transaction);
            }
        );
    });
});

// Add this endpoint for deleting transactions
app.delete('/api/transactions/:id', authMiddleware, (req, res) => {
    const transactionId = req.params.id;
    const userId = req.userId;

    // Delete the transaction
    const sql = 'DELETE FROM transactions WHERE id = ? AND user_id = ?';

    db.run(sql, [transactionId, userId], function(err) {
        if (err) {
            console.error('Error deleting transaction:', err);
            return res.status(500).json({ error: 'Failed to delete transaction' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Transaction not found or unauthorized' });
        }

        res.json({ success: true, message: 'Transaction deleted successfully' });
    });
});

// Add this near the other routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// HTML Routes with correct paths
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../src/resource/dashboard.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../../src/resource/dashboard.html'));
});

app.get('/transactions', (req, res) => {
    res.sendFile(path.join(__dirname, '../../src/resource/transaction.html'));
});

app.get('/categories', (req, res) => {
    res.sendFile(path.join(__dirname, '../resource/Categories.html'));
});

app.get('/goals', (req, res) => {
    res.sendFile(path.join(__dirname, '../resource/goals.html'));
});

app.get('/summaries', (req, res) => {
    res.sendFile(path.join(__dirname, '../resource/summaries.html'));
});

app.get('/rpurchases', (req, res) => {
    res.sendFile(path.join(__dirname, '../resource/Rpurchases.html'));
});

// Mount imported routes that actually exist
app.use('/api/auth', authRouter);
app.use('/api/transactions', authMiddleware, transactionsRouter);

// Direct handlers for recurring deposits
// Add a direct handler for getting recurring deposits
app.get('/api/goals/:id/recurring', authMiddleware, async (req, res) => {
  try {
    const goalId = req.params.id;
    const userId = req.user ? req.user.id : (req.userId || null);
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated'
      });
    }
    
    console.log(`Direct handler: GET /api/goals/${goalId}/recurring for user ${userId}`);
    
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

// Direct handler for creating a recurring payment for a goal
app.post('/api/goals/:id/recurring', authMiddleware, async (req, res) => {
  try {
    const goalId = req.params.id;
    const userId = req.user ? req.user.id : (req.userId || null);
    const { amount, frequency } = req.body;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated'
      });
    }
    
    if (!amount || isNaN(parseFloat(amount)) || !frequency) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid amount and frequency are required' 
      });
    }
    
    console.log(`Direct handler: POST /api/goals/${goalId}/recurring for user ${userId}`);
    console.log(`Amount: ${amount}, Frequency: ${frequency}`);
    
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
    
    // Calculate next payment date based on frequency
    let nextPaymentDate = new Date();
    switch (frequency.toLowerCase()) {
      case 'daily':
        nextPaymentDate.setDate(nextPaymentDate.getDate() + 1);
        break;
      case 'weekly':
        nextPaymentDate.setDate(nextPaymentDate.getDate() + 7);
        break;
      case 'monthly':
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
        break;
      default:
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1); // Default to monthly
    }
    
    // Create the recurring payment
    const result = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO recurring_payments (goal_id, user_id, amount, frequency, next_payment_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          goalId,
          userId,
          amount,
          frequency.toLowerCase(),
          nextPaymentDate.toISOString(),
          new Date().toISOString()
        ],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
    
    return res.json({
      success: true,
      message: 'Recurring payment created successfully',
      recurring_payment: {
        id: result.id,
        goal_id: goalId,
        user_id: userId,
        amount: parseFloat(amount),
        frequency: frequency.toLowerCase(),
        next_payment_date: nextPaymentDate.toISOString()
      }
    });
  } catch (error) {
    console.error('Error creating recurring payment:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to create recurring payment',
      error: error.message
    });
  }
});

// Now register the routes that should run only if the direct handlers didn't match
// app.use('/api/goals', authMiddleware, goalsRouter);
// app.use('/api/categories', authMiddleware, categoriesRouter);

// Delete a recurring payment
app.delete('/api/recurring-payments/:id', authMiddleware, (req, res) => {
    const paymentId = req.params.id;
    const userId = req.userId;
    
    console.log(`DELETE /api/recurring-payments/${paymentId} for user ${userId}`);
    
    // Delete the recurring payment, ensuring it belongs to the user
    db.run('DELETE FROM recurring_payments WHERE id = ? AND user_id = ?', 
        [paymentId, userId], 
        function(err) {
            if (err) {
                console.error('Error deleting recurring payment:', err);
                return res.status(500).json({ error: 'Failed to delete recurring payment' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Recurring payment not found or not authorized' });
            }
            
            res.json({ message: 'Recurring payment deleted successfully' });
        }
    );
});

// Fix the endpoint for adding money to a goal
app.post('/api/goals/:id/add', authMiddleware, async (req, res) => {
  const goalId = req.params.id;
  // Handle both auth formats for backward compatibility
  const userId = req.userId || (req.user ? req.user.id : null);
  const { amount } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  console.log(`Direct handler: POST /api/goals/${goalId}/add for user ${userId}`);
  console.log(`Amount to add: ${amount}`);

  if (!amount || isNaN(parseFloat(amount))) {
    return res.status(400).json({ error: 'Valid amount is required' });
  }

  // Verify the goal exists and belongs to the user
  db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
    if (err) {
      console.error('Error fetching goal:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    // Calculate new amount
    const currentAmount = parseFloat(goal.current_amount) || 0;
    const amountToAdd = parseFloat(amount);
    const newAmount = currentAmount + amountToAdd;

    // Update the goal
    db.run(
      'UPDATE goals SET current_amount = ? WHERE id = ?',
      [newAmount, goalId],
      function(err) {
        if (err) {
          console.error('Error updating goal amount:', err);
          return res.status(500).json({ error: 'Failed to update goal' });
        }

        // Create a transaction for this contribution (simplified)
        db.run(
          'INSERT INTO transactions (user_id, type, title, amount, category, date) VALUES (?, ?, ?, ?, ?, ?)',
          [
            userId,
            'withdrawal',
            `Goal Contribution: ${goal.title}`,
            amountToAdd,
            goal.category || 'Savings',
            new Date().toISOString().split('T')[0]
          ],
          (transactionErr) => {
            if (transactionErr) {
              console.error('Error creating transaction:', transactionErr);
              // Return updated goal info even if transaction creation fails
            }

            // Return updated goal info
            res.json({
              id: goalId,
              title: goal.title,
              previous_amount: currentAmount,
              amount_added: amountToAdd,
              new_amount: newAmount,
              target_amount: parseFloat(goal.target_amount)
            });
          }
        );
      }
    );
  });
});

// Endpoint to get all recurring payments for a user
app.get('/api/recurring-payments', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId || (req.user ? req.user.id : null);
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated'
      });
    }
    
    console.log(`Direct handler: GET /api/recurring-payments for user ${userId}`);
    
    // Get standalone recurring payments from recurring_payments table
    const recurringPayments = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM recurring_payments WHERE user_id = ?', [userId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
    
    // Enhance recurring payments data with goal information
    const enhancedPayments = await Promise.all(
      recurringPayments.map(async (payment) => {
        // If this is a goal-related recurring payment, get goal details
        if (payment.goal_id) {
          try {
            const goal = await new Promise((resolve, reject) => {
              db.get('SELECT * FROM goals WHERE id = ?', [payment.goal_id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
              });
            });
            
            if (goal) {
              return {
                ...payment,
                title: `${goal.title} Contribution`,
                category: goal.category,
                type: 'goal-contribution',
                goal_title: goal.title,
                target_amount: goal.target_amount,
                current_amount: goal.current_amount
              };
            }
          } catch (err) {
            console.error(`Error fetching goal info for recurring payment ${payment.id}:`, err);
          }
        }
        
        // Return the payment as is if it's not goal-related or if we failed to get goal info
        return payment;
      })
    );
    
    // Return the enhanced recurring payments
    res.json({
      success: true,
      recurring_payments: enhancedPayments
    });
  } catch (error) {
    console.error('Error fetching recurring payments:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch recurring payments',
      error: error.message
    });
  }
});

// Delete a goal and handle refunding
app.delete('/api/goals/:id', authMiddleware, async (req, res) => {
    try {
        const goalId = req.params.id;
        
        // Make sure userId is properly extracted from authentication
        if (!req.userId) {
            console.error('No authenticated user found in the request');
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Add logging to debug auth issues
        console.log(`Authenticated user ${req.userId} attempting to delete goal ${goalId}`);
        
        // Check if the goal exists and belongs to this user
        const goal = await db.get(
            'SELECT * FROM goals WHERE id = ? AND user_id = ?',
            [goalId, req.userId]
        );
        
        if (!goal) {
            return res.status(404).json({ error: 'Goal not found or not owned by you' });
        }
        
        // Get the current amount in the goal
        const goalAmount = parseFloat(goal.current_amount) || 0;
        console.log(`Goal amount to refund: $${goalAmount}`);
        
        // If the goal has funds, get the current user balance
        let userBalance = 0;
        if (goalAmount > 0) {
            const userRow = await db.get('SELECT balance FROM users WHERE id = ?', [req.userId]);
            userBalance = parseFloat(userRow ? userRow.balance || 0 : 0);
            console.log(`Current user balance: $${userBalance}`);
        }
        
        // Delete any recurring payments for this goal
        await db.run('DELETE FROM recurring_payments WHERE goal_id = ?', [goalId]);
        
        // If the goal has money, refund it to the user's balance
        let refundTransaction = null;
        if (goalAmount > 0) {
            // Update user balance
            const newBalance = userBalance + goalAmount;
            console.log(`New balance after refund: $${newBalance}`);
            
            await db.run('UPDATE users SET balance = ? WHERE id = ?', [newBalance, req.userId]);
            
            // Format the transaction date
            const transactionDate = new Date().toISOString();
            
            // Create a transaction record for the refund
            const transactionResult = await db.run(
                'INSERT INTO transactions (user_id, amount, type, category, title, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    req.userId, 
                    goalAmount, 
                    'income', 
                    'Refund', 
                    `Refund from Goal: ${goal.title}`,
                    `Refund from deleted goal: ${goal.title}`,
                    transactionDate
                ]
            );
            
            // Get the created transaction
            if (transactionResult && transactionResult.lastID) {
                refundTransaction = await db.get('SELECT * FROM transactions WHERE id = ?', [transactionResult.lastID]);
                console.log(`Created refund transaction: ${JSON.stringify(refundTransaction)}`);
            }
        }
        
        // Delete the goal
        await db.run('DELETE FROM goals WHERE id = ?', [goalId]);
        console.log(`Goal ${goalId} successfully deleted`);
        
        // Respond with success and the refunded amount + new balance if applicable
        const response = {
            success: true,
            message: 'Goal deleted successfully'
        };
        
        if (goalAmount > 0) {
            response.refundedAmount = goalAmount;
            response.newBalance = userBalance + goalAmount;
            response.refundTransaction = refundTransaction;
        }
        
        res.json(response);
    } catch (error) {
        console.error('Error deleting goal:', error);
        res.status(500).json({ error: 'Failed to delete goal' });
    }
});

// Make sure our goal routes are registered in the right place
// If we already mounted the router below, comment out or remove duplicate mount
app.use('/api/goals', authMiddleware, goalsRouter);

// Comment out any duplicate mounts
// app.use('/api/goals', authMiddleware, goalsRouter);

// Get transactions by category (combines regular transactions and goal contributions)
app.get('/api/transactions/by-category', authMiddleware, async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Get timeframe parameters
        const { start_date, end_date } = req.query;
        let dateFilter = '';
        let dateParams = [];
        
        if (start_date && end_date) {
            dateFilter = 'AND date BETWEEN ? AND ?';
            dateParams = [start_date, end_date];
        }
        
        // Query regular transactions grouped by category
        const transactionsQuery = `
            SELECT 
                category, 
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense,
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
                COUNT(*) as count
            FROM transactions 
            WHERE user_id = ? ${dateFilter} AND category IS NOT NULL
            GROUP BY category
        `;
        
        // Execute the query
        const transactionsByCategory = await new Promise((resolve, reject) => {
            db.all(transactionsQuery, [userId, ...dateParams], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        // Since we're having issues with joining transactions and goals,
        // let's just get all goals and do the filtering in JavaScript
        const goalsQuery = `
            SELECT id, title, category, current_amount
            FROM goals
            WHERE user_id = ? AND category IS NOT NULL
        `;
        
        // Get all goals
        const goals = await new Promise((resolve, reject) => {
            db.all(goalsQuery, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
        
        // Process goals into category data
        const goalsByCategory = new Map();
        goals.forEach(goal => {
            if (!goal.category) return;
            
            const category = goal.category.split('|')[1] || goal.category;
            const currentAmount = parseFloat(goal.current_amount) || 0;
            
            if (!goalsByCategory.has(category)) {
                goalsByCategory.set(category, {
                    category: category,
                    expense: currentAmount,
                    income: 0,
                    count: 1
                });
            } else {
                const existing = goalsByCategory.get(category);
                existing.expense += currentAmount;
                existing.count += 1;
            }
        });
        
        // Combine the results
        const categoriesMap = new Map();
        
        // Add regular transactions
        transactionsByCategory.forEach(cat => {
            categoriesMap.set(cat.category, {
                category: cat.category,
                expense: parseFloat(cat.expense) || 0,
                income: parseFloat(cat.income) || 0,
                count: parseInt(cat.count) || 0
            });
        });
        
        // Add/merge goal contributions
        goalsByCategory.forEach((goalCat, category) => {
            if (categoriesMap.has(category)) {
                const existing = categoriesMap.get(category);
                existing.expense += goalCat.expense;
                existing.count += goalCat.count;
            } else {
                categoriesMap.set(category, goalCat);
            }
        });
        
        // Convert to array
        const combinedCategories = Array.from(categoriesMap.values());
        
        // Return the combined data
        res.json({
            success: true,
            categories: combinedCategories
        });
    } catch (error) {
        console.error('Error fetching category data:', error);
        res.status(500).json({ error: 'Failed to fetch category data' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = app;
const express = require('express');
const cors = require('cors');
const app = express();

// Import routes
const authRouter = require('./routes/auth');
const transactionsRouter = require('./routes/transactions');
const categoriesRouter = require('./routes/categories');
const goalsRouter = require('./routes/goals');

// Middleware
app.use(cors());
app.use(express.json());

// Debug logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/api', authRouter);
app.use('/api', transactionsRouter);
app.use('/api', categoriesRouter);
app.use('/api', goalsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

module.exports = app; 
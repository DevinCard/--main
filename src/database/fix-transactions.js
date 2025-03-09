const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Path to the database file
const dbPath = path.join(__dirname, 'vaultly.db');
console.log('Using database file:', dbPath);

// Create a new database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        process.exit(1);
    }
    
    console.log('Connected to database:', dbPath);
    
    // Check if transactions table exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'", [], (err, result) => {
        if (err) {
            console.error('Error checking for transactions table:', err);
            db.close();
            process.exit(1);
        }
        
        if (!result) {
            console.log('Transactions table NOT found, creating it now...');
            
            // Create the transactions table
            db.run(`
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    type TEXT,
                    title TEXT,
                    date TEXT,
                    category TEXT,
                    amount REAL,
                    recurring TEXT DEFAULT 'one-time',
                    recurrence_interval TEXT,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating transactions table:', err);
                    db.close();
                    process.exit(1);
                }
                
                console.log('Transactions table created successfully');
                
                // Create a test transaction to verify it works
                db.run(`
                    INSERT INTO transactions (
                        user_id, type, title, date, category, amount
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    1, // Assuming user ID 1 exists
                    'Deposit',
                    'Initial Test Balance',
                    new Date().toISOString().split('T')[0],
                    'Other',
                    1000
                ], function(err) {
                    if (err) {
                        console.error('Error creating test transaction:', err);
                    } else {
                        console.log('Test transaction created with ID:', this.lastID);
                    }
                    
                    // Verify the table exists and has the test transaction
                    db.all('SELECT * FROM transactions', [], (err, rows) => {
                        if (err) {
                            console.error('Error verifying transactions table:', err);
                        } else {
                            console.log('Transactions table content:', rows);
                        }
                        db.close();
                    });
                });
            });
        } else {
            console.log('Transactions table already exists, verifying content...');
            
            // Verify the table content
            db.all('SELECT * FROM transactions', [], (err, rows) => {
                if (err) {
                    console.error('Error querying transactions table:', err);
                } else {
                    console.log('Found', rows.length, 'transactions in the table');
                    console.log('Transactions:', rows);
                    
                    // If no transactions exist, create a test one
                    if (rows.length === 0) {
                        console.log('No transactions found, creating a test transaction...');
                        db.run(`
                            INSERT INTO transactions (
                                user_id, type, title, date, category, amount
                            ) VALUES (?, ?, ?, ?, ?, ?)
                        `, [
                            1, // Assuming user ID 1 exists
                            'Deposit',
                            'Initial Test Balance',
                            new Date().toISOString().split('T')[0],
                            'Other',
                            1000
                        ], function(err) {
                            if (err) {
                                console.error('Error creating test transaction:', err);
                            } else {
                                console.log('Test transaction created with ID:', this.lastID);
                            }
                            db.close();
                        });
                    } else {
                        db.close();
                    }
                }
            });
        }
    });
}); 
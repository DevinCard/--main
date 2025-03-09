const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '../database/vaultly.db'), (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
    } else {
        console.log('Connected to SQLite database (vaultly.db)');
    }
});

// Check if the recurring_payments table has the correct structure
db.get("PRAGMA table_info(recurring_payments)", [], (err, columns) => {
    if (err) {
        console.error('Error checking recurring_payments table:', err);
        return;
    }
    
    console.log('Checking recurring_payments table structure...');
    
    // Check if the table exists and has the right columns
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='recurring_payments'", [], (err, table) => {
        if (err) {
            console.error('Error checking for recurring_payments table:', err);
            return;
        }
        
        if (!table) {
            console.log('recurring_payments table does not exist, creating it...');
            createRecurringPaymentsTable();
        } else {
            // Table exists, check for interval/frequency column
            db.all("PRAGMA table_info(recurring_payments)", [], (err, columns) => {
                if (err) {
                    console.error('Error checking recurring_payments columns:', err);
                    return;
                }
                
                console.log('Existing columns in recurring_payments:', columns.map(c => c.name));
                
                const hasIntervalColumn = columns.some(col => col.name === 'interval');
                const hasFrequencyColumn = columns.some(col => col.name === 'frequency');
                
                if (hasIntervalColumn && !hasFrequencyColumn) {
                    console.log('Table has interval column but not frequency, renaming...');
                    db.run(`ALTER TABLE recurring_payments RENAME COLUMN interval TO frequency`, err => {
                        if (err) {
                            console.error('Error renaming column:', err);
                            // SQLite might not support RENAME COLUMN in older versions
                            // So we'll need to recreate the table
                            recreateRecurringPaymentsTable();
                        } else {
                            console.log('Successfully renamed interval column to frequency');
                        }
                    });
                } else if (!hasIntervalColumn && !hasFrequencyColumn) {
                    console.error('recurring_payments table is missing both interval and frequency columns!');
                    recreateRecurringPaymentsTable();
                } else {
                    console.log('recurring_payments table structure looks good');
                }
            });
        }
    });
});

function createRecurringPaymentsTable() {
    db.run(`
        CREATE TABLE recurring_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER,
            user_id INTEGER,
            amount DECIMAL(10,2) NOT NULL,
            frequency TEXT NOT NULL,
            next_payment_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (goal_id) REFERENCES goals(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, err => {
        if (err) {
            console.error('Error creating recurring_payments table:', err);
        } else {
            console.log('Successfully created recurring_payments table');
        }
    });
}

function recreateRecurringPaymentsTable() {
    // First get all existing data
    db.all("SELECT * FROM recurring_payments", [], (err, rows) => {
        if (err) {
            console.error('Error backing up recurring_payments data:', err);
            return;
        }
        
        console.log(`Backing up ${rows.length} recurring payment records`);
        
        // Drop the table
        db.run("DROP TABLE recurring_payments", err => {
            if (err) {
                console.error('Error dropping recurring_payments table:', err);
                return;
            }
            
            console.log('Dropped recurring_payments table');
            
            // Create the new table
            createRecurringPaymentsTable();
            
            // Restore the data if there was any
            if (rows.length > 0) {
                console.log('Restoring recurring payment data...');
                
                // Determine which column to use for frequency based on the old data
                const restorePromises = rows.map(row => {
                    return new Promise((resolve, reject) => {
                        // Determine frequency - prefer interval if it exists
                        const frequency = row.interval || row.frequency || 'monthly';
                        
                        db.run(
                            `INSERT INTO recurring_payments (
                                id, goal_id, user_id, amount, frequency, next_payment_date, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [
                                row.id, 
                                row.goal_id, 
                                row.user_id, 
                                row.amount, 
                                frequency,
                                row.next_payment_date,
                                row.created_at || new Date().toISOString()
                            ],
                            err => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                });
                
                Promise.all(restorePromises)
                    .then(() => console.log('Successfully restored all recurring payment data'))
                    .catch(err => console.error('Error restoring recurring payment data:', err));
            }
        });
    });
}

// Create goals table if it doesn't exist
db.run(`
    CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT NOT NULL,
        target_amount DECIMAL(10,2) NOT NULL,
        current_amount DECIMAL(10,2) DEFAULT 0,
        category TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`);

// Ensure transactions table exists
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
`);

module.exports = db; 
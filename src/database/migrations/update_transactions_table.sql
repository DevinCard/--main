-- First, rename the existing table to backup
ALTER TABLE transactions RENAME TO transactions_backup;

-- Create new table with correct schema
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Deposit', 'Withdrawal')),
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Copy data from backup table if needed (adjust column names as necessary)
INSERT INTO transactions (type, title, date, category, amount, user_id)
SELECT type, title, date, category, amount, 
       (SELECT id FROM users LIMIT 1) -- temporary solution to assign existing transactions
FROM transactions_backup;

-- Drop the backup table
DROP TABLE transactions_backup; 
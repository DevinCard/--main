document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Add CSS styles for still-active transactions
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            .transaction-item.still-active {
                border-left: 3px solid #4caf50;
                background-color: #f0f7f0;
            }
            
            .loading-indicator {
                text-align: center;
                padding: 20px;
                color: #666;
            }
        `;
        document.head.appendChild(styleElement);
        
        // Load both sections in parallel for better performance
        await Promise.all([
            loadUpcomingPurchases(),
            loadPreviousPurchases()
        ]);
        
        // Initialize the projected budget graph
        await initializeProjectedBudgetGraph(3);

        // Add range button listeners
        const rangeButtons = document.querySelectorAll('.range-btn');
        rangeButtons.forEach(button => {
            button.addEventListener('click', async () => {
                // Update active state
                rangeButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Get the months value
                const monthsValue = button.dataset.months;

                // Check if this is a special timeframe like YTD
                if (monthsValue === 'ytd') {
                    // Calculate months from start of year to now
                    const now = new Date();
                    const startOfYear = new Date(now.getFullYear(), 0, 1); // January 1st of current year
                    const monthsDiff = (now.getMonth() - startOfYear.getMonth()) + 
                                      (12 * (now.getFullYear() - startOfYear.getFullYear()));
                    
                    // Add the fractional month based on current day of month
                    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                    const fractionOfMonth = now.getDate() / daysInMonth;
                    
                    const ytdMonths = monthsDiff + fractionOfMonth;
                    
                    // Update graph with YTD range
                    await initializeProjectedBudgetGraph(ytdMonths);
                } else {
                    // Convert to a number for regular timeframes
                    const months = parseFloat(monthsValue);
                    await initializeProjectedBudgetGraph(months);
                }
            });
        });

        // Setup timeframe buttons
        setupTimeframeButtons();

        // Show content
        const loadingElement = document.getElementById('recurring-payments-loading');
        const contentElement = document.getElementById('recurring-payments-content');
        
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        
        if (contentElement) {
            contentElement.style.display = 'block';
        }
    } catch (error) {
        console.error('Error initializing recurring purchases:', error);
        
        // Only try to update DOM elements if they exist
        const loadingElement = document.getElementById('recurring-payments-loading');
        const errorElement = document.getElementById('error-message');
        
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        
        if (errorElement) {
            errorElement.style.display = 'block';
        }
    }
});

async function loadUpcomingPurchases() {
    try {
        const upcomingContainer = document.querySelector('.upcoming-purchases-container');
        if (!upcomingContainer) return;
        
        // Show loading indicator
        upcomingContainer.innerHTML = '<div class="loading-indicator">Loading recurring purchases...</div>';
        
        // Get regular transactions, recurring payments, and goal recurring payments
        const [transactions, recurringPayments, goals] = await Promise.all([
            api.getTransactions(),
            api.getRecurringPayments(),
            api.getGoals()
        ]);
        
        console.log('Transactions loaded:', transactions.length);
        console.log('Recurring payments loaded:', recurringPayments.length);
        console.log('Goals loaded:', goals.length);
        
        // 1. Process dedicated recurring payments
        const dedicatedRecurringPayments = recurringPayments.map(payment => {
            // Calculate next occurrence date, ensuring it's in the future
            const nextOccurrence = calculateNextOccurrenceForPayment(payment);
            
            return {
                id: payment.id,
                title: payment.title || payment.description || 'Recurring Payment',
                amount: payment.amount,
                date: payment.last_payment_date || new Date().toISOString(),
                recurring: payment.frequency || 'monthly',
                nextOccurrence: nextOccurrence,
                category: payment.category || 'Other',
                type: payment.type || 'Withdrawal',
                isRecurringPayment: true
            };
        });
        
        console.log('Processed dedicated recurring payments:', dedicatedRecurringPayments.length);

        // 2. Process recurring transactions from regular transactions
        // Get IDs of all dedicated recurring payments to avoid duplicates
        const recurringPaymentIds = new Set(dedicatedRecurringPayments.map(p => p.id).filter(id => id));
        
        // Filter for recurring transactions not in dedicated recurring payments
        const recurringTransactions = transactions
            .filter(t => t.recurring && t.recurring !== 'one-time' && !recurringPaymentIds.has(t.id))
            .map(t => {
                // Calculate next occurrence date
                const nextOccurrence = calculateNextOccurrence(t);
                
                return {
                    ...t,
                    nextOccurrence: nextOccurrence,
                    isGoalContribution: false,
                    isRecurringTransaction: true
                };
            });
        
        console.log('Recurring transactions (excluding duplicates):', recurringTransactions.length);
        
        // 3. Process recurring goal deposits
        const recurringGoalDeposits = [];
        
        goals.forEach(goal => {
            // Check if the goal has recurring payments
            if (goal.recurring && goal.recurring.length > 0) {
                goal.recurring.forEach(payment => {
                    // Calculate next occurrence date
                    const nextOccurrence = calculateNextOccurrenceForGoal(payment);
                    
                    // Create a transaction-like object for the recurring payment
                    recurringGoalDeposits.push({
                        title: `Goal Contribution - ${goal.title}`,
                        amount: payment.amount,
                        date: new Date().toISOString(), // Start from today
                        recurring: payment.frequency || 'monthly',
                        nextOccurrence: nextOccurrence,
                        category: 'Savings',
                        type: 'Deposit',
                        isGoalContribution: true,
                        goalTitle: goal.title,
                        goalId: goal.id
                    });
                });
            }
        });
        
        console.log('Recurring goal deposits:', recurringGoalDeposits.length);
        
        // 4. Combine all recurring items and sort by next occurrence date
        const allRecurringItems = [
            ...dedicatedRecurringPayments,
            ...recurringTransactions, 
            ...recurringGoalDeposits
        ].sort((a, b) => {
            // Sort by next occurrence date
            return new Date(a.nextOccurrence) - new Date(b.nextOccurrence);
        });
        
        console.log('Total recurring items (combined):', allRecurringItems.length);

        // Display the recurring items or a message if none exist
        if (allRecurringItems.length > 0) {
            upcomingContainer.innerHTML = allRecurringItems.map(t => createTransactionElement(t, true)).join('');
        } else {
            upcomingContainer.innerHTML = '<p class="no-data">No upcoming recurring purchases found.</p>';
        }
    } catch (error) {
        console.error('Error loading upcoming purchases:', error);
        const upcomingContainer = document.querySelector('.upcoming-purchases-container');
        if (upcomingContainer) {
            upcomingContainer.innerHTML = '<p class="error-message">Error loading upcoming purchases. Please try again later.</p>';
        }
    }
}

async function loadPreviousPurchases() {
    try {
        // Get all transactions and recurring payments
        const [transactions, recurringPayments] = await Promise.all([
            api.getTransactions(),
            api.getRecurringPayments()
        ]);
        
        const previousContainer = document.querySelector('.previous-purchases-container');
        if (!previousContainer) return;
        
        // Show loading indicator
        previousContainer.innerHTML = '<div class="loading-indicator">Loading previous transactions...</div>';

        // Create a map of recurring payment IDs to easily check if a transaction is recurring
        const recurringPaymentIds = new Set();
        if (recurringPayments && recurringPayments.length > 0) {
            recurringPayments.forEach(payment => {
                if (payment.id) {
                    recurringPaymentIds.add(payment.id);
                }
            });
        }
        
        // Filter for transactions that have already occurred and are recurring
        const previousTransactions = transactions
            .filter(t => {
                // Check if this is a recurring transaction
                const isRecurring = t.recurring && t.recurring !== 'one-time';
                
                // Check if transaction date is in the past
                const isPastTransaction = new Date(t.date) <= new Date();
                
                // Include the transaction if it's recurring and has already occurred
                return isRecurring && isPastTransaction;
            })
            .map(t => {
                // Important: Calculate next occurrence for active recurring transactions
                const nextOccurrence = calculateNextOccurrence(t);
                const isStillActive = nextOccurrence > new Date();
                
                return {
                    ...t,
                    nextOccurrence,
                    isStillActive
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending

        if (previousTransactions.length > 0) {
            previousContainer.innerHTML = previousTransactions
                .map(t => createTransactionElement(t, false))
                .join('');
        } else {
            previousContainer.innerHTML = '<p class="no-data">No previous recurring purchases</p>';
        }
    } catch (error) {
        console.error('Error loading previous purchases:', error);
        const previousContainer = document.querySelector('.previous-purchases-container');
        if (previousContainer) {
            previousContainer.innerHTML = '<p class="error-message">Error loading previous purchases. Please try again later.</p>';
        }
    }
}

function calculateNextOccurrence(transaction) {
    const lastDate = new Date(transaction.date);
    const today = new Date();
    let nextDate = new Date(lastDate);

    // If not recurring, just return the original date
    if (!transaction.recurring || transaction.recurring === 'one-time') {
        return nextDate;
    }

    // Function to add the appropriate interval to a date based on frequency
    const addInterval = (date) => {
        const newDate = new Date(date);
        const frequency = transaction.recurring.toLowerCase();
        
        switch (frequency) {
            case 'daily':
                newDate.setDate(date.getDate() + 1);
                break;
            case 'weekly':
                newDate.setDate(date.getDate() + 7);
                break;
            case 'bi-weekly':
            case 'biweekly':
                newDate.setDate(date.getDate() + 14);
                break;
            case 'monthly':
                newDate.setMonth(date.getMonth() + 1);
                break;
            case 'quarterly':
                newDate.setMonth(date.getMonth() + 3);
                break;
            case 'yearly':
            case 'annual':
                newDate.setFullYear(date.getFullYear() + 1);
                break;
            default:
                // Default to monthly for unknown frequencies
                newDate.setMonth(date.getMonth() + 1);
        }
        return newDate;
    };

    // Calculate the next occurrence, making sure it's in the future
    // We assume all recurring transactions continue indefinitely - no end date check
    while (nextDate <= today) {
        nextDate = addInterval(nextDate);
    }

    return nextDate;
}

function calculateNextOccurrenceForGoal(payment) {
    const today = new Date();
    
    // If there's a next payment date saved, start with that
    let nextDate = payment.next_payment_date ? new Date(payment.next_payment_date) : new Date(today);
    
    // If the payment date is in the past, find the next occurrence
    if (nextDate < today) {
        const frequency = (payment.frequency || 'monthly').toLowerCase();
        
        switch (frequency) {
            case 'daily':
                nextDate.setDate(today.getDate() + 1);
                break;
            case 'weekly':
                nextDate.setDate(today.getDate() + 7);
                break;
            case 'biweekly':
            case 'bi-weekly':
                nextDate.setDate(today.getDate() + 14);
                break;
            case 'monthly':
                nextDate.setMonth(today.getMonth() + 1);
                break;
            case 'quarterly':
                nextDate.setMonth(today.getMonth() + 3);
                break;
            case 'annual':
            case 'yearly':
                nextDate.setFullYear(today.getFullYear() + 1);
                break;
            default:
                nextDate.setMonth(today.getMonth() + 1); // Default to monthly
        }
    }
    
    return nextDate;
}

function createTransactionElement(transaction, isUpcoming) {
    // Format date for display
    const date = new Date(transaction.date);
    const formattedDate = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric'
    });
    
    // Determine if this is a goal deposit
    const isGoalDeposit = transaction.isGoalContribution || 
                          (transaction.description && transaction.description.includes('Goal:')) ||
                          (transaction.title && transaction.title.includes('Goal Contribution'));
    
    // Extract category and format it with emoji if available
    let categoryDisplay = transaction.category || 'Uncategorized';
    if (categoryDisplay.includes('|')) {
        const parts = categoryDisplay.split('|');
        categoryDisplay = `<span class="category-emoji">${parts[0]}</span> ${parts[1]}`;
    }
    
    // Format amount with color based on transaction type
    const amount = parseFloat(transaction.amount || 0).toFixed(2);
    const amountClass = transaction.type === 'Deposit' || 
                        transaction.type === 'deposit' || 
                        transaction.type === 'income' || 
                        isGoalDeposit ? 'amount-positive' : 'amount-negative';
    
    // Format the next occurrence date for upcoming or active transactions
    let nextOccurrenceHTML = '';
    
    // Show next occurrence if this is in the upcoming section OR if it's in previous but still active
    const showNextOccurrence = isUpcoming || transaction.isStillActive;
    
    if (showNextOccurrence && transaction.nextOccurrence) {
        // Use the calculated nextOccurrence
        const nextDate = new Date(transaction.nextOccurrence);
                         
        const nextFormattedDate = nextDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        // Calculate days until next payment
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
        
        const upcomingClass = daysUntil <= 3 ? 'upcoming-soon' : 
                             daysUntil <= 7 ? 'upcoming' : '';
        
        nextOccurrenceHTML = `
            <div class="next-occurrence ${upcomingClass}">
                <div class="next-date">Next: ${nextFormattedDate}</div>
                <div class="days-until">${daysUntil <= 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}</div>
            </div>
        `;
    }
    
    // Format recurring text (e.g., "Monthly", "Weekly", etc.)
    const recurringText = formatRecurringText(transaction);
    
    // Create title - choose the most descriptive field available
    const title = transaction.title || transaction.description || 'Recurring Payment';
    
    // Add styling class for active recurring transactions in the previous section
    const isActiveClass = !isUpcoming && transaction.isStillActive ? 'still-active' : '';
    
    // Create HTML for the transaction element
    return `
        <div class="transaction-item ${isGoalDeposit ? 'goal-deposit' : ''} ${transaction.isRecurringPayment ? 'recurring-payment' : ''} ${isActiveClass}">
            <div class="transaction-info">
                <div class="transaction-title">${title}</div>
                <div class="transaction-details">
                    <span class="transaction-date">${formattedDate}</span>
                    <span class="transaction-category">${categoryDisplay}</span>
                    <span class="transaction-recurring">${recurringText}</span>
                </div>
            </div>
            <div class="transaction-right">
                <div class="transaction-amount ${amountClass}">$${amount}</div>
                ${nextOccurrenceHTML}
            </div>
        </div>
    `;
}

function formatRecurringText(transaction) {
    // Get the frequency from any available field
    const frequency = transaction.recurring || transaction.frequency || 'one-time';
    
    // Normalize the frequency to lowercase for comparison
    const normalizedFrequency = frequency.toLowerCase();
    
    // Format the frequency to be more user-friendly
    switch (normalizedFrequency) {
        case 'daily':
            return 'Daily';
        case 'weekly':
            return 'Weekly';
        case 'biweekly':
        case 'bi-weekly':
            return 'Bi-weekly';
        case 'monthly':
            return 'Monthly';
        case 'quarterly':
            return 'Quarterly';
        case 'yearly':
        case 'annual':
            return 'Yearly';
        case 'one-time':
            return 'One-time';
        default:
            // Capitalize the first letter of the frequency
            return frequency.charAt(0).toUpperCase() + frequency.slice(1);
    }
}

async function initializeProjectedBudgetGraph(months = 12) {
    try {
        console.log("Initializing projected budget graph with months:", months);
        
        // Get the chart container
        const chartElement = document.getElementById('projectedBudgetChart');
        if (!chartElement) {
            console.error('Chart container not found');
            return;
        }
        
        // Show loading indicator
        chartElement.innerHTML = '<div class="loading-indicator">Calculating balance projection...</div>';
        
        // Get user balance
        let currentBalance = 0;
        try {
            const balanceResult = await fetch('/api/balance', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (balanceResult.ok) {
                const balanceData = await balanceResult.json();
                currentBalance = parseFloat(balanceData.balance) || 0;
                console.log('Current balance:', currentBalance);
            } else {
                console.warn('Failed to fetch balance, using 0');
            }
        } catch (err) {
            console.error('Error fetching balance:', err);
        }
        
        // Get recurring payments data from both API endpoints
        let recurringPayments = [];
        try {
            // Get recurring payments from API
            const payments = await api.getRecurringPayments();
            
            if (payments && payments.length > 0) {
                recurringPayments = payments;
                console.log('Recurring payments loaded:', payments.length);
            } else {
                // Fetch transactions to find recurring ones
                const transactions = await api.getTransactions();
                const recurringTransactions = transactions.filter(t => 
                    t.recurring && t.recurring !== 'one-time'
                );
                
                if (recurringTransactions.length > 0) {
                    recurringPayments = recurringTransactions.map(t => ({
                        id: t.id,
                        title: t.title,
                        amount: t.amount,
                        frequency: t.recurring,
                        type: t.type,
                        category: t.category,
                        last_payment_date: t.date
                    }));
                    console.log('Recurring transactions found:', recurringTransactions.length);
                }
            }
            
            // Also get recurring goal contributions
            const goals = await api.getGoals();
            if (goals && goals.length > 0) {
                const goalDeposits = [];
                goals.forEach(goal => {
                    if (goal.recurring && goal.recurring.length > 0) {
                        goal.recurring.forEach(deposit => {
                            goalDeposits.push({
                                id: deposit.id || `goal-${goal.id}-${goalDeposits.length}`,
                                title: `Goal: ${goal.title}`,
                                amount: deposit.amount,
                                frequency: deposit.frequency,
                                type: 'Withdrawal', // This is a withdrawal from main account
                                category: 'Savings',
                                goal_id: goal.id,
                                last_payment_date: deposit.last_date || new Date().toISOString()
                            });
                        });
                    }
                });
                
                if (goalDeposits.length > 0) {
                    recurringPayments = [...recurringPayments, ...goalDeposits];
                    console.log('Goal deposits added:', goalDeposits.length);
                }
            }
        } catch (err) {
            console.error('Error fetching recurring payments:', err);
        }
        
        if (recurringPayments.length === 0) {
            chartElement.innerHTML = '<div class="no-data-message">No recurring payments found to calculate projections.</div>';
            return;
        }
        
        // Calculate balance projection based on recurring payments
        const projectionData = calculateBalanceProjection(currentBalance, recurringPayments, months);
        
        // Create chart with Chart.js to match the style in summaries
        // First, clear the container
        chartElement.innerHTML = '<canvas id="balance-forecast-chart"></canvas>';
        const canvas = document.getElementById('balance-forecast-chart');
        
        // Format the data for the chart
        const labels = projectionData.map(item => item.x);
        const balances = projectionData.map(item => item.y);
        
        // Create areas for positive and negative balances
        const positiveBalances = balances.map(balance => balance >= 0 ? balance : null);
        const negativeBalances = balances.map(balance => balance < 0 ? balance : null);
        
        // Create the chart
        new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Positive Balance',
                        data: positiveBalances,
                        backgroundColor: 'rgba(75, 192, 125, 0.2)',
                        borderColor: 'rgba(75, 192, 125, 1)',
                        borderWidth: 2,
                        pointRadius: 2, // Smaller points for more frequent data
                        pointBackgroundColor: 'rgba(75, 192, 125, 1)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1,
                        pointHoverRadius: 5,
                        tension: 0.3,
                        fill: true
                    },
                    {
                        label: 'Negative Balance',
                        data: negativeBalances,
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 2,
                        pointRadius: 2, // Smaller points for more frequent data
                        pointBackgroundColor: 'rgba(255, 99, 132, 1)',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 1,
                        pointHoverRadius: 5,
                        tension: 0.3,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Projected Balance Over Time',
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                const dataPoint = projectionData[context.dataIndex];
                                const label = context.dataset.label;
                                const value = context.raw;
                                
                                if (value !== null) {
                                    // Main balance label
                                    const result = [`Balance: $${Math.abs(value).toFixed(2)}`];
                                    
                                    // Add deposits and withdrawals information if available
                                    if (dataPoint && dataPoint.deposits > 0) {
                                        result.push(`Deposits: +$${dataPoint.deposits.toFixed(2)}`);
                                    }
                                    if (dataPoint && dataPoint.withdrawals > 0) {
                                        result.push(`Withdrawals: -$${dataPoint.withdrawals.toFixed(2)}`);
                                    }
                                    
                                    return result;
                                }
                                return '';
                            }
                        }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: 'Date'
                        },
                        ticks: {
                            maxTicksLimit: 10, // Limit the number of x-axis labels to avoid crowding
                            maxRotation: 45, // Rotate labels for better fit
                            minRotation: 45
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(200, 200, 200, 0.2)'
                        },
                        title: {
                            display: true,
                            text: 'Balance ($)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
        
        return projectionData;
        
    } catch (error) {
        console.error('Error initializing projected budget graph:', error);
        
        // Show error message in the chart container
        const chartElement = document.getElementById('projectedBudgetChart');
        if (chartElement) {
            chartElement.innerHTML = '<div class="error-message">Error generating balance projection. Please try again later.</div>';
        }
        
        return [];
    }
}

// Function to calculate balance projection over time
function calculateBalanceProjection(currentBalance, recurringPayments, months = 12) {
    const currentDate = new Date();
    const projectionData = [];
    
    // Add current balance as the first point
    projectionData.push({
        x: currentDate.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' }),
        y: Math.round(currentBalance * 100) / 100, // Round to 2 decimal places
        deposits: 0,
        withdrawals: 0
    });
    
    let runningBalance = currentBalance;
    
    // Determine the number of data points based on the timeframe
    // For more granularity, we'll use days for shorter timeframes and weeks for longer ones
    let interval;
    let intervalType;
    
    if (months <= 0.25) { // Weekly or less
        intervalType = 'days';
        interval = 1; // Show daily points
    } else if (months <= 1) { // Monthly
        intervalType = 'days';
        interval = 2; // Show points every 2 days
    } else if (months <= 3) { // 3 Months
        intervalType = 'days';
        interval = 5; // Show points every 5 days
    } else if (months <= 6) { // 6 Months
        intervalType = 'days';
        interval = 7; // Show points weekly
    } else { // YTD or longer
        intervalType = 'days';
        interval = 10; // Show points every 10 days
    }
    
    // Calculate end date based on months
    const endDate = new Date(currentDate);
    endDate.setMonth(currentDate.getMonth() + Math.ceil(months));
    
    // Generate dates between now and end date based on interval
    const projectionDates = [];
    let currentPoint = new Date(currentDate);
    
    while (currentPoint <= endDate) {
        projectionDates.push(new Date(currentPoint));
        
        // Advance to next interval
        if (intervalType === 'days') {
            currentPoint.setDate(currentPoint.getDate() + interval);
        } else if (intervalType === 'weeks') {
            currentPoint.setDate(currentPoint.getDate() + (interval * 7));
        } else if (intervalType === 'months') {
            currentPoint.setMonth(currentPoint.getMonth() + interval);
        }
    }
    
    // Process each date in the projection
    for (let i = 1; i < projectionDates.length; i++) {
        const projectionDate = projectionDates[i];
        const previousDate = projectionDates[i-1];
        
        // Calculate days since the last point
        const daysSinceLastPoint = (projectionDate - previousDate) / (1000 * 60 * 60 * 24);
        
        // Initialize monthly totals
        let periodDeposits = 0;
        let periodWithdrawals = 0;
        
        // Process each recurring payment
        recurringPayments.forEach(payment => {
            if (!payment || !payment.amount || isNaN(parseFloat(payment.amount))) {
                console.warn('Skipping invalid payment:', payment);
                return; // Skip invalid payments
            }
            
            // Parse amount, ensuring it's always a positive number for calculations
            const amount = Math.abs(parseFloat(payment.amount));
            
            // Get payment frequency, defaulting to monthly
            const frequency = (payment.frequency || 'monthly').toLowerCase();
            
            // Calculate occurrences in this period based on frequency
            let occurrences = 0;
            
            switch (frequency) {
                case 'daily':
                    occurrences = daysSinceLastPoint; // Occurs every day
                    break;
                case 'weekly':
                    occurrences = daysSinceLastPoint / 7; // Weekly occurrences in this period
                    break;
                case 'bi-weekly':
                case 'biweekly':
                    occurrences = daysSinceLastPoint / 14; // Bi-weekly occurrences in this period
                    break;
                case 'monthly':
                    // Calculate based on day of month
                    const dayOfMonth = payment.next_payment_date ? 
                        new Date(payment.next_payment_date).getDate() : 
                        currentDate.getDate();
                    
                    // Check if this period includes the day of month
                    const periodStartDay = previousDate.getDate();
                    const periodEndDay = projectionDate.getDate();
                    
                    if ((periodStartDay <= dayOfMonth && periodEndDay >= dayOfMonth) ||
                        (periodStartDay > periodEndDay && (periodStartDay <= dayOfMonth || periodEndDay >= dayOfMonth))) {
                        occurrences = 1;
                    } else if (daysSinceLastPoint >= 28) {
                        // If this period is a full month or longer, prorate
                        occurrences = daysSinceLastPoint / 30;
                    }
                    break;
                case 'quarterly':
                    // Check if this period crosses a quarter boundary
                    const prevQuarter = Math.floor(previousDate.getMonth() / 3);
                    const currQuarter = Math.floor(projectionDate.getMonth() / 3);
                    
                    if (prevQuarter !== currQuarter) {
                        occurrences = 1;
                    } else if (daysSinceLastPoint >= 85) {
                        // If this period is a full quarter or longer, prorate
                        occurrences = daysSinceLastPoint / 90;
                    }
                    break;
                case 'yearly':
                case 'annual':
                    // Check if this period crosses a year boundary
                    if (previousDate.getFullYear() !== projectionDate.getFullYear()) {
                        occurrences = 1;
                    } else if (daysSinceLastPoint >= 360) {
                        // If this period is a full year or longer, prorate
                        occurrences = daysSinceLastPoint / 365;
                    }
                    break;
                default:
                    // Default to monthly prorated by days
                    occurrences = daysSinceLastPoint / 30;
            }
            
            // Skip if no occurrences in this period
            if (occurrences <= 0) return;
            
            // Calculate amount for this period
            const periodAmount = amount * occurrences;
            
            // Determine payment type
            const isDeposit = payment.type === 'Deposit' || 
                             payment.type === 'deposit' || 
                             payment.type === 'income';
            
            // Add to the appropriate period total
            if (isDeposit) {
                // This is income/deposit - adds to balance
                periodDeposits += periodAmount;
            } else {
                // This is an expense/withdrawal - subtracts from balance
                periodWithdrawals += periodAmount;
            }
        });
        
        // Update balance with this period's net flow
        const netFlow = periodDeposits - periodWithdrawals;
        runningBalance += netFlow;
        
        // Add this period's balance to projection data
        projectionData.push({
            x: projectionDate.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' }),
            y: Math.round(runningBalance * 100) / 100, // Round to 2 decimal places
            deposits: Math.round(periodDeposits * 100) / 100,
            withdrawals: Math.round(periodWithdrawals * 100) / 100
        });
    }
    
    console.log(`Generated ${projectionData.length} data points for projection`);
    return projectionData;
}

// Helper function to calculate the next occurrence date for a payment
function calculateNextOccurrenceForPayment(payment) {
    // If there's already a next_payment_date, check if it's in the future
    if (payment.next_payment_date) {
        const nextDate = new Date(payment.next_payment_date);
        const today = new Date();
        
        // If the next payment date is in the future, use it
        if (nextDate > today) {
            return nextDate;
        }
    }
    
    // Use existing calculation functions if available
    if (payment.goal_id || payment.isGoalContribution) {
        return calculateNextOccurrenceForGoal(payment);
    } else {
        // Get the last payment date or use today's date
        const lastDate = payment.last_payment_date ? 
                         new Date(payment.last_payment_date) : 
                         new Date();
                         
        // Create a transaction-like object for the existing function
        const transactionLike = {
            ...payment,
            date: lastDate.toISOString(),
            recurring: payment.frequency || payment.recurring || 'monthly'
        };
        
        return calculateNextOccurrence(transactionLike);
    }
}

// Setup timeframe buttons for the chart
function setupTimeframeButtons() {
    const timeframeButtons = document.querySelectorAll('.range-btn');
    
    timeframeButtons.forEach(button => {
        button.addEventListener('click', async function() {
            // Get the months value
            const months = parseInt(this.dataset.months);
            
            // Update active button
            timeframeButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Update the chart with new timeframe
            await initializeProjectedBudgetGraph(months);
        });
    });
}

// Fetch recurring payments from API
async function fetchRecurringPayments() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('User not authenticated');
        }

        const response = await fetch('/api/recurring-payments', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Recurring payments data:', data);

        // Return the recurring_payments array or an empty array if it doesn't exist
        return data.recurring_payments || [];
    } catch (error) {
        console.error('Error fetching recurring payments:', error);
        throw error;
    }
}

// Helper function to convert a payment amount to a monthly amount based on frequency
function convertToMonthlyAmount(amount, frequency) {
    if (!amount || isNaN(amount)) return 0;
    
    const normalizedFrequency = frequency?.toLowerCase() || 'monthly';
    
    switch (normalizedFrequency) {
        case 'daily':
            return amount * 30; // Approximate days in a month
        case 'weekly':
            return amount * 4.33; // Average weeks in a month (52/12)
        case 'bi-weekly':
        case 'biweekly':
            return amount * 2.17; // Bi-weekly occurrences in a month
        case 'monthly':
            return amount; // Once per month
        case 'quarterly':
            return amount / 3; // Every three months
        case 'yearly':
        case 'annual':
            return amount / 12; // Every year
        default:
            return amount; // Default to monthly
    }
}

// Format the frequency for display
function formatFrequency(frequency) {
    if (!frequency) return 'Monthly';
    
    const normalizedFrequency = frequency.toLowerCase();
    
    switch (normalizedFrequency) {
        case 'daily':
            return 'Daily';
        case 'weekly':
            return 'Weekly';
        case 'bi-weekly':
        case 'biweekly':
            return 'Bi-Weekly';
        case 'monthly':
            return 'Monthly';
        case 'quarterly':
            return 'Quarterly';
        case 'yearly':
        case 'annual':
            return 'Yearly';
        default:
            return frequency.charAt(0).toUpperCase() + frequency.slice(1);
    }
} 
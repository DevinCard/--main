document.addEventListener("DOMContentLoaded", async () => {
    try {
        await loadUpcomingPurchases();
        await loadPreviousPurchases();
        await initializeProjectedBudgetGraph(3);

        // Add range button listeners
        const rangeButtons = document.querySelectorAll('.range-btn');
        rangeButtons.forEach(button => {
            button.addEventListener('click', async () => {
                // Update active state
                rangeButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Update graph with new range
                const months = parseInt(button.dataset.months);
                await initializeProjectedBudgetGraph(months);
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
        // Get regular transactions and goal recurring payments
        const [transactions, goals] = await Promise.all([
            api.getTransactions(),
            api.getGoals()
        ]);
        
        const upcomingContainer = document.querySelector('.upcoming-purchases-container');
        
        if (!upcomingContainer) return;

        // Filter for recurring transactions
        const recurringTransactions = transactions.filter(t => t.recurring && t.recurring !== 'one-time')
            .map(t => ({
                ...t,
                nextOccurrence: calculateNextOccurrence(t),
                isGoalContribution: false
            }))
            .filter(t => t.nextOccurrence > new Date()); // Only future occurrences
        
        // Get recurring goal deposits
        const recurringGoalDeposits = [];
        goals.forEach(goal => {
            // Check if the goal has recurring payments
            if (goal.recurring && goal.recurring.length > 0) {
                goal.recurring.forEach(payment => {
                    // Create a transaction-like object for the recurring payment
                    recurringGoalDeposits.push({
                        title: `Goal Contribution - ${goal.title}`,
                        amount: payment.amount,
                        date: new Date().toISOString(), // Start from today
                        recurring: payment.frequency,
                        nextOccurrence: calculateNextOccurrenceForGoal(payment),
                        category: 'Savings',
                        type: 'Recurring Deposit',
                        isGoalContribution: true,
                        goalTitle: goal.title,
                        goalId: goal.id
                    });
                });
            }
        });
        
        // Combine regular recurring transactions with goal recurring deposits
        const allRecurringItems = [...recurringTransactions, ...recurringGoalDeposits]
            .sort((a, b) => a.nextOccurrence - b.nextOccurrence);

        upcomingContainer.innerHTML = allRecurringItems.length ? 
            allRecurringItems.map(t => createTransactionElement(t, true)).join('') :
            '<p class="no-data">No upcoming recurring purchases</p>';
    } catch (error) {
        console.error('Error loading upcoming purchases:', error);
    }
}

async function loadPreviousPurchases() {
    try {
        const transactions = await api.getTransactions();
        const previousContainer = document.querySelector('.previous-purchases-container');
        
        if (!previousContainer) return;

        // Filter for completed recurring transactions
        const previousTransactions = transactions
            .filter(t => t.recurring && t.recurring !== 'one-time' && new Date(t.date) <= new Date())
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        previousContainer.innerHTML = previousTransactions.length ?
            previousTransactions.map(t => createTransactionElement(t, false)).join('') :
            '<p class="no-data">No previous recurring purchases</p>';
    } catch (error) {
        console.error('Error loading previous purchases:', error);
    }
}

function calculateNextOccurrence(transaction) {
    const lastDate = new Date(transaction.date);
    const today = new Date();
    let nextDate = new Date(lastDate);

    if (!transaction.recurring) return nextDate;

    const addInterval = (date, interval) => {
        const newDate = new Date(date);
        switch (transaction.recurring) {
            case 'daily':
                newDate.setDate(date.getDate() + 1);
                break;
            case 'weekly':
                newDate.setDate(date.getDate() + 7);
                break;
            case 'bi-weekly':
                newDate.setDate(date.getDate() + 14);
                break;
            case 'monthly':
                newDate.setMonth(date.getMonth() + 1);
                break;
            case 'yearly':
                newDate.setFullYear(date.getFullYear() + 1);
                break;
            case 'custom':
                if (transaction.recurrenceInterval) {
                    const [interval, unit] = transaction.recurrenceInterval.split('-');
                    switch (unit) {
                        case 'days':
                            newDate.setDate(date.getDate() + parseInt(interval));
                            break;
                        case 'weeks':
                            newDate.setDate(date.getDate() + (parseInt(interval) * 7));
                            break;
                        case 'months':
                            newDate.setMonth(date.getMonth() + parseInt(interval));
                            break;
                        case 'years':
                            newDate.setFullYear(date.getFullYear() + parseInt(interval));
                            break;
                    }
                }
                break;
        }
        return newDate;
    };

    while (nextDate <= today) {
        nextDate = addInterval(nextDate);
    }

    return nextDate;
}

function calculateNextOccurrenceForGoal(payment) {
    const today = new Date();
    let nextDate = new Date(today);
    
    switch (payment.frequency) {
        case 'daily':
            nextDate.setDate(today.getDate() + 1);
            break;
        case 'weekly':
            nextDate.setDate(today.getDate() + 7);
            break;
        case 'biweekly':
            nextDate.setDate(today.getDate() + 14);
            break;
        case 'monthly':
            nextDate.setMonth(today.getMonth() + 1);
            break;
        case 'quarterly':
            nextDate.setMonth(today.getMonth() + 3);
            break;
        case 'annual':
            nextDate.setFullYear(today.getFullYear() + 1);
            break;
        default:
            nextDate.setMonth(today.getMonth() + 1); // Default to monthly
    }
    
    return nextDate;
}

function createTransactionElement(transaction, isUpcoming) {
    // Determine CSS class based on transaction type and if it's a goal contribution
    const typeClass = transaction.isGoalContribution ? 'goal-contribution' : transaction.type.toLowerCase();
    
    // Determine sign for amount display
    // Goal contributions should always be displayed as expenses (negative amounts)
    const amountPrefix = transaction.isGoalContribution || transaction.type === 'Withdrawal' ? '-' : '+';
    
    if (isUpcoming) {
        const today = new Date();
        const nextDate = new Date(transaction.nextOccurrence);
        const daysUntil = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
        
        // Add goal indicator for goal contributions
        const goalIndicator = transaction.isGoalContribution 
            ? `<span class="goal-indicator">🎯 Goal: ${transaction.goalTitle}</span>` 
            : '';
        
        return `
            <div class="transaction-item ${typeClass}">
                <div class="transaction-info">
                    <span class="days-until">${daysUntil} days</span>
                    <span class="transaction-title">${transaction.title}</span>
                    <span class="transaction-amount ${typeClass}-amount">
                        ${amountPrefix}$${parseFloat(transaction.amount).toFixed(2)}
                    </span>
                    <span class="transaction-date">${nextDate.toLocaleDateString()}</span>
                    <span class="transaction-recurring">${formatRecurringText(transaction)}</span>
                    ${goalIndicator}
                </div>
            </div>
        `;
    } else {
        const date = new Date(transaction.date).toLocaleDateString();
        
        // Add goal indicator for goal contributions
        const goalIndicator = transaction.isGoalContribution 
            ? `<span class="goal-indicator">🎯 Goal: ${transaction.goalTitle}</span>` 
            : '';
            
        return `
            <div class="transaction-item ${typeClass}">
                <div class="transaction-info">
                    <span class="transaction-title">${transaction.title}</span>
                    <span class="transaction-amount ${typeClass}-amount">
                        ${amountPrefix}$${parseFloat(transaction.amount).toFixed(2)}
                    </span>
                    <span class="transaction-date">${date}</span>
                    <span class="transaction-recurring">${formatRecurringText(transaction)}</span>
                    ${goalIndicator}
                </div>
            </div>
        `;
    }
}

function formatRecurringText(transaction) {
    if (!transaction.recurring) return '';
    
    if (transaction.recurring === 'custom' && transaction.recurrenceInterval) {
        const [interval, unit] = transaction.recurrenceInterval.split('-');
        return `Every ${interval} ${unit}`;
    }
    return transaction.recurring.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join('-');
}

async function initializeProjectedBudgetGraph(months = 12) {
    try {
        console.log("Initializing projected budget graph with months:", months);
        
        // Find existing container
        const upcomingContainer = document.querySelector('.upcoming-purchases-container');
        
        if (!upcomingContainer) {
            console.error("Could not find upcoming purchases container");
            return;
        }
        
        // Clear existing content - keep only one heading
        upcomingContainer.innerHTML = '';
        
        // Add a single heading for the container
        const headingElement = document.createElement('h3');
        headingElement.textContent = 'Upcoming Recurring Payments';
        upcomingContainer.appendChild(headingElement);
        
        // Get user balance
        const balanceResult = await fetch('/api/balance', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!balanceResult.ok) {
            throw new Error('Failed to fetch balance');
        }
        
        const balanceData = await balanceResult.json();
        const currentBalance = parseFloat(balanceData.balance) || 0;
        console.log('Current balance:', currentBalance);
        
        // Fetch recurring payments
        const recurringPayments = await fetchRecurringPayments();
        console.log('Processing recurring payments:', recurringPayments);
        
        if (!recurringPayments || recurringPayments.length === 0) {
            const noPaymentsElement = document.createElement('p');
            noPaymentsElement.textContent = 'No upcoming recurring payments found.';
            noPaymentsElement.style.padding = '10px';
            upcomingContainer.appendChild(noPaymentsElement);
        } else {
            // Process each recurring payment and add to the container
            recurringPayments.forEach(payment => {
                try {
                    const amount = parseFloat(payment.amount);
                    if (isNaN(amount)) {
                        console.warn('Invalid amount for payment:', payment);
                        return;
                    }
                    
                    // Determine payment type for styling
                    const isGoalContribution = payment.goal_id || payment.type === 'goal-contribution';
                    const isExpense = payment.type === 'expense' || (!isGoalContribution && amount > 0);
                    const isDeposit = !isExpense && !isGoalContribution;
                    
                    // Create transaction element with exact same styling as transactions
                    const transactionEl = document.createElement('div');
                    transactionEl.className = 'transaction-item';
                    
                    // Format the title
                    let displayTitle = payment.title || 'Unnamed Payment';
                    if (isGoalContribution && payment.goal_title) {
                        displayTitle = `${payment.goal_title} Contribution`;
                    }
                    
                    // Calculate next occurrence date
                    const nextDate = calculateNextOccurrenceForPayment(payment);
                    
                    // Format the remaining days text
                    const daysUntil = nextDate ? Math.ceil((nextDate - new Date()) / (1000 * 60 * 60 * 24)) : 0;
                    let daysText = '';
                    if (daysUntil > 0) {
                        daysText = daysUntil === 1 ? '1 day' : `${daysUntil} days`;
                    } else if (daysUntil === 0) {
                        daysText = 'Today';
                    } else {
                        daysText = 'Overdue';
                    }
                    
                    // Set the correct CSS class for the amount based on transaction type
                    let amountClass = '';
                    if (isGoalContribution) {
                        amountClass = 'goal-contribution-amount';
                    } else if (isExpense) {
                        amountClass = 'withdrawal-amount';
                    } else {
                        amountClass = 'deposit-amount';
                    }
                    
                    // Use the exact same HTML structure as in the createTransactionElement function
                    transactionEl.innerHTML = `
                        <div class="transaction-info">
                            <div class="transaction-title">${displayTitle}</div>
                            <div class="transaction-date">${formatRecurringText(payment)}</div>
                        </div>
                        <div class="days-until">${daysText}</div>
                        <div class="transaction-amount ${amountClass}">
                            ${isExpense || isGoalContribution ? '-' : '+'}$${amount.toFixed(2)}
                        </div>
                    `;
                    
                    // Add to the container
                    upcomingContainer.appendChild(transactionEl);
                } catch (err) {
                    console.error('Error processing payment:', payment, err);
                }
            });
        }
        
        // Initialize balance projection graph
        const chartElement = document.getElementById('projectedBudgetChart');
        if (!chartElement) {
            console.error('Chart container not found');
            return;
        }
        
        // Calculate balance projection based on recurring payments
        const projectionData = calculateBalanceProjection(currentBalance, recurringPayments, months);
        
        // Fix for the chart destroy issue with ApexCharts
        if (window.projectedBudgetChart && typeof window.projectedBudgetChart === 'object') {
            try {
                // For ApexCharts
                if (window.projectedBudgetChart instanceof ApexCharts) {
                    window.projectedBudgetChart.destroy();
                } else {
                    console.log('Existing chart is not an ApexCharts instance, creating new one');
                }
            } catch (error) {
                console.warn('Error destroying previous chart, will create new one:', error);
            }
        }
        
        // Configure the chart options
        const options = {
            series: [{
                name: 'Projected Balance',
                data: projectionData.map(item => item.y)
            }],
            chart: {
                height: 350,
                type: 'line',
                zoom: {
                    enabled: false
                },
                toolbar: {
                    show: false
                },
                fontFamily: 'Roboto, sans-serif'
            },
            dataLabels: {
                enabled: false
            },
            stroke: {
                curve: 'smooth',
                width: 3,
                colors: ['#78a864']  // Green color to match app theme
            },
            title: {
                text: 'Projected Balance Over Time',
                align: 'center',
                style: {
                    fontSize: '18px',
                    fontWeight: 600,
                    fontFamily: 'Roboto, sans-serif'
                }
            },
            grid: {
                borderColor: '#e7e7e7',
                row: {
                    colors: ['#f8f8f8', 'transparent'],
                    opacity: 0.5
                }
            },
            xaxis: {
                categories: projectionData.map(item => item.x),
                title: {
                    text: 'Month'
                },
                labels: {
                    style: {
                        fontSize: '12px',
                        fontFamily: 'Roboto, sans-serif'
                    }
                }
            },
            yaxis: {
                title: {
                    text: 'Balance ($)'
                },
                labels: {
                    formatter: function (value) {
                        return '$' + value.toFixed(2);
                    },
                    style: {
                        fontSize: '12px',
                        fontFamily: 'Roboto, sans-serif'
                    }
                }
            },
            tooltip: {
                y: {
                    formatter: function (value) {
                        return '$' + value.toFixed(2);
                    }
                }
            },
            markers: {
                size: 4,
                colors: ['#78a864'],
                strokeWidth: 0,
                hover: {
                    size: 6
                }
            },
            annotations: {
                yaxis: [{
                    y: 0,
                    borderColor: '#ff6b6b',
                    borderWidth: 2,
                    strokeDashArray: 5,
                    label: {
                        text: 'Zero Balance',
                        position: 'left',
                        textAnchor: 'start',
                        style: {
                            color: '#ff6b6b',
                            background: '#ffffff',
                            padding: {
                                left: 5,
                                right: 5,
                                top: 2,
                                bottom: 2
                            }
                        }
                    }
                }]
            }
        };
        
        // Create the chart
        window.projectedBudgetChart = new ApexCharts(chartElement, options);
        window.projectedBudgetChart.render();
        
        return projectionData;
    } catch (error) {
        console.error('Error initializing projected budget graph:', error);
        return [];
    }
}

// Function to calculate balance projection over time
function calculateBalanceProjection(currentBalance, recurringPayments, months = 12) {
    const currentDate = new Date();
    const projectionData = [];
    
    // Add current balance as the first point
    projectionData.push({
        x: currentDate.toLocaleString('default', { month: 'short', year: 'numeric' }),
        y: Math.round(currentBalance * 100) / 100 // Round to 2 decimal places
    });
    
    let runningBalance = currentBalance;
    
    // Generate projection for specified number of months
    for (let i = 1; i <= months; i++) {
        // Create a new date object for this month to avoid modifying the original
        const projectionDate = new Date(currentDate);
        projectionDate.setMonth(currentDate.getMonth() + i);
        
        // Initialize monthly totals
        let monthlyDeposits = 0;
        let monthlyWithdrawals = 0;
        
        // Process each recurring payment
        recurringPayments.forEach(payment => {
            if (!payment || !payment.amount || isNaN(payment.amount)) {
                return; // Skip invalid payments
            }
            
            const amount = parseFloat(payment.amount);
            const frequency = (payment.frequency || 'monthly').toLowerCase();
            
            // Calculate occurrences based on frequency
            let occurrences = 0;
            
            switch (frequency) {
                case 'daily':
                    occurrences = 30; // Approximate days in a month
                    break;
                case 'weekly':
                    occurrences = 4.33; // Average weeks in a month (52/12)
                    break;
                case 'bi-weekly':
                case 'biweekly':
                    occurrences = 2.17; // Bi-weekly occurrences in a month
                    break;
                case 'monthly':
                    occurrences = 1; // Once per month
                    break;
                case 'quarterly':
                    occurrences = (i % 3 === 0) ? 1/3 : 0; // Every three months
                    break;
                case 'yearly':
                case 'annual':
                    // Check if the month matches the original payment date
                    const nextPaymentDate = payment.next_payment_date ? new Date(payment.next_payment_date) : null;
                    if (nextPaymentDate && nextPaymentDate.getMonth() === projectionDate.getMonth()) {
                        occurrences = 1/12; // Spread the yearly payment across months
                    } else {
                        occurrences = 0;
                    }
                    break;
                default:
                    occurrences = 1; // Default to monthly
            }
            
            // Add to monthly totals based on payment type
            const monthlyAmount = amount * occurrences;
            const isGoalContribution = payment.goal_id || payment.type === 'goal-contribution';
            const isExpense = payment.type === 'expense' || (!isGoalContribution && payment.amount > 0);
            
            if (!isExpense && !isGoalContribution) {
                // This is income
                monthlyDeposits += monthlyAmount;
            } else {
                // This is an expense or goal contribution
                monthlyWithdrawals += monthlyAmount;
            }
        });
        
        // Update balance with this month's net flow
        const netFlow = monthlyDeposits - monthlyWithdrawals;
        runningBalance += netFlow;
        
        // Add this month's balance to projection data
        projectionData.push({
            x: projectionDate.toLocaleString('default', { month: 'short', year: 'numeric' }),
            y: Math.round(runningBalance * 100) / 100 // Round to 2 decimal places
        });
    }
    
    return projectionData;
}

// Helper function to calculate the next occurrence date for a payment
function calculateNextOccurrenceForPayment(payment) {
    // Use existing calculation functions if available
    if (payment.goal_id) {
        return calculateNextOccurrenceForGoal(payment);
    } else {
        // Create a transaction-like object for the existing function
        const transactionLike = {
            ...payment,
            date: payment.next_payment_date || new Date().toISOString()
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
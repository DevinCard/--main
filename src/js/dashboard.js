document.addEventListener("DOMContentLoaded", async () => {
  try {
    const balanceData = await api.getBalance();
    const balance = balanceData.balance;

    const balanceElement = document.querySelector(".balance-amount");
    if (balanceElement) {
      balanceElement.textContent = `$${balance.toFixed(2)}`;
    }

    const transactions = await api.getTransactions();
    
    if (transactions.length > 0) {
      const labels = transactions.map(t => t.date);
      const data = transactions.reduce((acc, t) => {
        const lastBalance = acc.length ? acc[acc.length - 1] : 0;
        const newBalance = t.type === "Deposit" ? lastBalance + t.amount : lastBalance - t.amount;
        acc.push(newBalance);
        return acc;
      }, []);

      const ctx = document.getElementById('balanceChart');
      if (ctx) {
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'Balance Over Time',
              data: data,
              borderColor: 'rgba(75, 192, 192, 1)',
              backgroundColor: 'rgba(75, 192, 192, 0.2)',
              fill: true,
            }]
          },
          options: {
            scales: {
              x: {
                type: 'time',
                time: {
                  unit: 'day'
                }
              }
            }
          }
        });
      }
    }

    // Initialize timeframe buttons
    const timeButtons = document.querySelectorAll('.time-btn')
    timeButtons.forEach(button => {
      button.addEventListener('click', async () => {
        // Remove active class from all buttons
        timeButtons.forEach(btn => btn.classList.remove('active'));
        // Add active class to clicked button
        button.classList.add('active');
        // Update display with new timeframe
        await updateCategoryDisplay(button.dataset.timeframe);
      });
    });

    // Initial load with 'day' timeframe
    await updateCategoryDisplay('day');

    // Initialize sorting buttons
    initializeSortingButtons();

    // Add this new function call
    await loadUpcomingPurchases();

    // Load recurring transactions
    loadUpcomingRecurringTransactions();

  } catch (error) {
    console.error('Error initializing dashboard:', error);
  }
});

async function updateCategoryDisplay(timeframe, sortBy = 'amount') {
  try {
    const transactions = await api.getTransactions();
    console.log('Fetched transactions:', transactions); // Debug log
    const rankings = getCategoryRankings(transactions, timeframe);
    
    // Sort rankings based on selected method
    switch(sortBy) {
      case 'name':
        rankings.sort((a, b) => a.category.localeCompare(b.category));
        break;
      case 'recent':
        // Get most recent transaction date for each category
        const categoryDates = {};
        transactions.forEach(t => {
          if (!categoryDates[t.category] || new Date(t.date) > new Date(categoryDates[t.category])) {
            categoryDates[t.category] = t.date;
          }
        });
        rankings.sort((a, b) => new Date(categoryDates[b.category]) - new Date(categoryDates[a.category]));
        break;
      default: // 'amount'
        rankings.sort((a, b) => b.amount - a.amount);
    }
    
    console.log('Current rankings:', rankings); // Debug log
    
    // Get previous period rankings
    const previousTimeframe = getPreviousPeriod(timeframe);
    const previousRankings = getCategoryRankings(transactions, previousTimeframe);
    
    updateRankings(rankings, previousRankings);
  } catch (error) {
    console.error('Error updating category display:', error);
  }
}

function getPreviousPeriod(timeframe) {
  const now = new Date();
  switch(timeframe) {
    case 'Daily':
    case 'day':
      now.setDate(now.getDate() - 1);
      return 'Daily';
    case 'Weekly':
    case 'week':
      now.setDate(now.getDate() - 7);
      return 'Weekly';
    case 'Monthly':
    case 'month':
      now.setMonth(now.getMonth() - 1);
      return 'Monthly';
    case '3M':
    case '3month':
      now.setMonth(now.getMonth() - 3);
      return '3M';
    case '6M':
      now.setMonth(now.getMonth() - 6);
      return '6M';
    case 'YTD':
    case 'ytd':
      // For YTD, previous period is the same period last year
      now.setFullYear(now.getFullYear() - 1);
      return 'YTD';
    default:
      return timeframe; // Return same timeframe if unknown
  }
}

function getCategoryRankings(transactions, timeframe) {
  if (!transactions || transactions.length === 0) return [];
  
  const now = new Date();
  const filteredTransactions = transactions.filter(t => {
    const transDate = new Date(t.date);
    switch(timeframe) {
      case 'Daily':
      case 'day':
        return transDate.toDateString() === now.toDateString();
      case 'Weekly':
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        return transDate >= weekAgo;
      case 'Monthly':
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return transDate >= monthStart;
      case '3M':
      case '3month':
        const threeMonthsAgo = new Date(now);
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        return transDate >= threeMonthsAgo;
      case '6M':
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(now.getMonth() - 6);
        return transDate >= sixMonthsAgo;
      case 'YTD':
      case 'ytd':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return transDate >= yearStart;
      default:
        return true;
    }
  });

  // Only consider withdrawal (expense) transactions for category spending
  const categorySpending = {};
  filteredTransactions.forEach(t => {
    if (t.type === 'Withdrawal') {
      const category = extractCategoryName(t.category);
      categorySpending[category] = (categorySpending[category] || 0) + parseFloat(t.amount);
    }
  });

  const rankings = Object.entries(categorySpending)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return rankings;
}

// Helper function to extract the clean category name
function extractCategoryName(category) {
  if (!category) return 'Other'; // Default to 'Other' if category is missing
  
  // If category contains a pipe (emoji|name format), extract just the name
  if (category.includes('|')) {
      const parts = category.split('|');
      return parts[1].trim(); // Return the name part
  }
  
  // If category contains a space (emoji name format), extract just the name
  if (category.includes(' ')) {
      const parts = category.split(' ');
      return parts.slice(1).join(' ').trim();
  }
  
  // If no delimiter found, return as is
  return category;
}

function updateRankings(newRankings, oldRankings) {
  const rankingsContainer = document.getElementById('category-rankings');
  if (!rankingsContainer) return;

  rankingsContainer.innerHTML = '';

  if (newRankings.length === 0) {
    rankingsContainer.innerHTML = '<div class="no-data" style="text-align: center; padding: 20px; color: #666;">No transactions in this period</div>';
    return;
  }

  newRankings.forEach((item, index) => {
    const oldIndex = oldRankings.findIndex(r => r.category === item.category);
    let rankChangeValue = oldIndex !== -1 ? oldIndex - index : 0;

    const rankingItem = document.createElement('div');
    rankingItem.className = 'ranking-item';

    rankingItem.innerHTML = `
      <div class="rank-info">
        <span class="rank-number">#${index + 1}</span>
        <span>${item.category}</span>
        <div class="rank-change ${getRankChangeClass(rankChangeValue)}">
          ${getRankChangeHTML(rankChangeValue)}
        </div>
      </div>
      <span class="category-amount">$${item.amount.toFixed(2)}</span>
    `;

    rankingsContainer.appendChild(rankingItem);
  });
}

function getRankChangeClass(change) {
  return change > 0 ? 'up' : change < 0 ? 'down' : 'same';
}

function getRankChangeHTML(change) {
  if (change > 0) return `↑ +${change}`;
  if (change < 0) return `↓ ${change}`;
  return '•';
}

function initializeSortingButtons() {
  const sortingButtons = document.querySelectorAll('.sort-btn');
  sortingButtons.forEach(button => {
    button.addEventListener('click', async () => {
      // Remove active class from all buttons
      sortingButtons.forEach(btn => btn.classList.remove('active'));
      // Add active class to clicked button
      button.classList.add('active');
      
      // Get current timeframe and update display with new sorting
      const timeframe = document.getElementById('timeframe-select').value;
      await updateCategoryDisplay(timeframe, button.dataset.sort);
    });
  });
}

// Add these new functions
async function loadUpcomingPurchases() {
  try {
    const transactions = await api.getTransactions();
    const upcomingContainer = document.querySelector('.upcoming-purchases-container');
    
    if (!upcomingContainer) return;

    // Filter for recurring transactions
    const recurringTransactions = transactions.filter(t => t.recurring && t.recurring !== 'one-time')
        .map(t => ({
            ...t,
            nextOccurrence: calculateNextOccurrence(t)
        }))
        .filter(t => t.nextOccurrence > new Date()) // Only future occurrences
        .sort((a, b) => a.nextOccurrence - b.nextOccurrence)
        .slice(0, 3); // Only show the next 3 upcoming purchases

    upcomingContainer.innerHTML = recurringTransactions.length ? 
        recurringTransactions.map(t => createTransactionElement(t)).join('') :
        '<p class="no-data">No upcoming recurring purchases</p>';
  } catch (error) {
    console.error('Error loading upcoming purchases:', error);
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

function createTransactionElement(transaction) {
  const today = new Date();
  const nextDate = new Date(transaction.nextOccurrence);
  const daysUntil = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
  
  return `
    <div class="transaction-item ${transaction.type.toLowerCase()}">
      <div class="transaction-info">
        <span class="days-until">${daysUntil} days</span>
        <span class="transaction-title">${transaction.title}</span>
        <span class="transaction-amount ${transaction.type.toLowerCase()}-amount">
          ${transaction.type === 'Withdrawal' ? '-' : '+'}$${transaction.amount.toFixed(2)}
        </span>
        <span class="transaction-date">${nextDate.toLocaleDateString()}</span>
      </div>
    </div>
  `;
}

// Function to load and display upcoming recurring transactions
async function loadUpcomingRecurringTransactions() {
    try {
        // Find the container for recurring payments
        const container = document.querySelector('.recurring-payments-container');
        if (!container) {
            console.error('Recurring payments container not found');
            return;
        }
        
        // Show loading state
        container.innerHTML = '<div class="loading-message">Loading recurring payments...</div>';
        
        // Load both regular recurring payments and goal recurring deposits
        console.log('Fetching recurring payments and goals...');
        const [recurringPayments, goals] = await Promise.all([
            window.api.getRecurringPayments().catch(err => {
                console.error('Error fetching recurring payments:', err);
                return [];
            }),
            window.api.getGoals().catch(err => {
                console.error('Error fetching goals:', err);
                return [];
            })
        ]);
        
        console.log('Recurring payments:', recurringPayments);
        console.log('Goals:', goals);
        
        // Extract recurring deposits from goals
        const recurringDeposits = [];
        if (Array.isArray(goals)) {
            goals.forEach(goal => {
                if (goal.recurring && Array.isArray(goal.recurring) && goal.recurring.length > 0) {
                    console.log(`Found ${goal.recurring.length} recurring deposits for goal: ${goal.title}`);
                    goal.recurring.forEach(deposit => {
                        // Add goal information to each deposit
                        recurringDeposits.push({
                            ...deposit,
                            goal_id: goal.id,
                            goal_title: goal.title,
                            description: `Goal: ${goal.title}`,
                            isGoalDeposit: true,
                            type: 'expense' // Goal deposits are expenses
                        });
                    });
                }
            });
        }
        
        console.log('Recurring deposits from goals:', recurringDeposits);
        
        // Get transactions that are marked as recurring but not in the recurring payments list
        const transactions = await window.api.getTransactions().catch(err => {
            console.error('Error fetching transactions:', err);
            return [];
        });
        
        // Find transactions that are recurring but not in the recurring payments list
        const recurringTransactions = transactions.filter(transaction => {
            // Check if transaction is marked as recurring (any value other than 'one-time')
            return transaction.recurring && transaction.recurring !== 'one-time';
        });
        
        console.log('Recurring transactions found:', recurringTransactions);
        
        // Convert recurring transactions to recurring payment format
        const additionalRecurringPayments = recurringTransactions.map(transaction => {
            return {
                id: transaction.id,
                title: transaction.title,
                description: transaction.title,
                amount: transaction.amount,
                frequency: transaction.recurring || 'monthly', // Default to monthly if not specified
                category: transaction.category,
                type: transaction.type,
                last_payment_date: transaction.date,
                // Ensure recurring payments are treated as indefinite
                end_date: null, // No end date means indefinite
                status: 'active'
            };
        });
        
        // Combine all recurring items, ensuring no duplicates by ID
        const allRecurringItems = [
            ...(Array.isArray(recurringPayments) ? recurringPayments : []), 
            ...recurringDeposits,
            ...additionalRecurringPayments
        ];
        
        // Remove duplicates based on ID
        const uniqueRecurringItems = [];
        const seenIds = new Set();
        
        allRecurringItems.forEach(item => {
            if (!item.id || !seenIds.has(item.id)) {
                if (item.id) {
                    seenIds.add(item.id);
                }
                uniqueRecurringItems.push(item);
            }
        });
        
        console.log('All recurring items combined (unique):', uniqueRecurringItems);
        
        // If no recurring items, show a message
        if (!uniqueRecurringItems || uniqueRecurringItems.length === 0) {
            container.innerHTML = '<p class="no-data-message">No recurring payments scheduled.</p>';
            return;
        }
        
        // Process each recurring item to add next payment date
        const itemsWithNextDates = uniqueRecurringItems.map(item => {
            const frequency = item.frequency || 'monthly';
            let nextDate;
            
            // If there's already a next_payment_date, use it
            if (item.next_payment_date) {
                nextDate = new Date(item.next_payment_date);
            } else {
                // Calculate next payment date based on frequency and last payment
                const today = new Date();
                const lastPaymentDate = item.last_payment_date ? new Date(item.last_payment_date) : new Date();
                
                switch(frequency.toLowerCase()) {
                    case 'daily':
                        nextDate = new Date(lastPaymentDate);
                        nextDate.setDate(nextDate.getDate() + 1);
                        break;
                    case 'weekly':
                        nextDate = new Date(lastPaymentDate);
                        nextDate.setDate(nextDate.getDate() + 7);
                        break;
                    case 'biweekly':
                        nextDate = new Date(lastPaymentDate);
                        nextDate.setDate(nextDate.getDate() + 14);
                        break;
                    case 'monthly':
                        nextDate = new Date(lastPaymentDate);
                        nextDate.setMonth(nextDate.getMonth() + 1);
                        break;
                    case 'quarterly':
                        nextDate = new Date(lastPaymentDate);
                        nextDate.setMonth(nextDate.getMonth() + 3);
                        break;
                    case 'yearly':
                        nextDate = new Date(lastPaymentDate);
                        nextDate.setFullYear(nextDate.getFullYear() + 1);
                        break;
                    default:
                        nextDate = new Date(lastPaymentDate);
                        nextDate.setMonth(nextDate.getMonth() + 1); // Default to monthly
                }
                
                // Ensure next date is in the future
                if (nextDate < today) {
                    while (nextDate < today) {
                        // Move to next period until we find a future date
                        switch(frequency.toLowerCase()) {
                            case 'daily':
                                nextDate.setDate(nextDate.getDate() + 1);
                                break;
                            case 'weekly':
                                nextDate.setDate(nextDate.getDate() + 7);
                                break;
                            case 'biweekly':
                                nextDate.setDate(nextDate.getDate() + 14);
                                break;
                            case 'monthly':
                                nextDate.setMonth(nextDate.getMonth() + 1);
                                break;
                            case 'quarterly':
                                nextDate.setMonth(nextDate.getMonth() + 3);
                                break;
                            case 'yearly':
                                nextDate.setFullYear(nextDate.getFullYear() + 1);
                                break;
                        }
                    }
                }
            }
            
            return {
                ...item,
                next_payment_date: nextDate
            };
        });
        
        // Sort by next payment date
        itemsWithNextDates.sort((a, b) => {
            return a.next_payment_date - b.next_payment_date;
        });
        
        // Clear the container
        container.innerHTML = '';
        
        // Display ALL upcoming recurring payments
        itemsWithNextDates.forEach(payment => {
            // Format next payment date
            const nextPaymentDate = payment.next_payment_date;
            const formattedDate = nextPaymentDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            
            // Calculate days until payment
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset time to start of day
            const daysUntil = Math.ceil((nextPaymentDate - today) / (1000 * 60 * 60 * 24));
            
            // Create payment element
            const paymentElement = document.createElement('div');
            paymentElement.className = 'recurring-payment-item';
            
            // Set status class based on days until payment
            if (daysUntil <= 3) {
                paymentElement.classList.add('upcoming-soon');
            } else if (daysUntil <= 7) {
                paymentElement.classList.add('upcoming');
            }
            
            // Format the payment description
            let description = payment.description || payment.title || 'Payment';
            let type = 'Purchase';
            
            if (payment.isGoalDeposit) {
                description = `Goal: ${payment.goal_title}`;
                type = 'Deposit';
            } else if (payment.type === 'Deposit') {
                type = 'Deposit';
            }
            
            // Set inner HTML with payment details
            paymentElement.innerHTML = `
                <div class="payment-details">
                    <div class="payment-title">${description}</div>
                    <div class="payment-frequency">${payment.frequency} ${type}</div>
                </div>
                <div class="payment-amount">$${parseFloat(payment.amount).toFixed(2)}</div>
                <div class="payment-date">
                    <div class="next-date">${formattedDate}</div>
                    <div class="days-until">${daysUntil <= 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}</div>
                </div>
            `;
            
            // Add to container
            container.appendChild(paymentElement);
        });
        
    } catch (error) {
        console.error('Error loading recurring payments:', error);
        const container = document.querySelector('.recurring-payments-container');
        if (container) {
            container.innerHTML = '<p class="error-message">Failed to load recurring payments.</p>';
        }
    }
} 
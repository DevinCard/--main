document.addEventListener("DOMContentLoaded", async () => {
  console.log('Categories page is loading...');
  
  // Initialize event listeners for sign out button
  const signoutBtn = document.querySelector('.signout-btn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      window.location.href = '../../index.html';
    });
  }

  // Set up the budget modal first
  console.log('Setting up budget modal...');
  setupBudgetModal();
  console.log('Budget modal setup complete');

  // Load all the necessary data
  try {
    console.log('Loading category data...');
    await Promise.all([
      loadCategories(),
      loadTopCategories('day'),
      loadCategoryBudgets(),
      loadCategorySpend(),
      loadActiveCategories()
    ]);
    console.log('All category data loaded successfully');
    
    // Set up timeframe buttons after data is loaded
    setupTimeframeButtons();

    // Setup timeframe controls for current spend
    setupSpendTimeframeControls();
  } catch (error) {
    console.error('Error initializing Categories page:', error);
    showToast('Failed to load some data', 'error');
  }
});

// Load available categories
async function loadCategories() {
  try {
    console.log('Loading categories from API...');
    const categories = await api.getCategories();
    console.log('Categories loaded successfully:', categories);
    
    // Populate categories in the budget modal select
    const categorySelect = document.getElementById('category-select');
    if (categorySelect) {
      // Save the custom option if it exists
      const customOption = categorySelect.querySelector('option[value="Custom"]');
      
      categorySelect.innerHTML = '';
      
      // Re-add the custom option first
      if (customOption) {
        categorySelect.appendChild(customOption);
      } else {
        // Create a new custom option if it doesn't exist
        const newCustomOption = document.createElement('option');
        newCustomOption.value = 'Custom';
        newCustomOption.textContent = '➕ Add Custom Category';
        categorySelect.appendChild(newCustomOption);
      }
      
      // Add categories from the API
      categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.name;
        option.textContent = category.emoji ? `${category.emoji} ${category.name}` : category.name;
        categorySelect.appendChild(option);
      });
    }
    
    return categories;
  } catch (error) {
    console.error('Error loading categories:', error);
    showToast('Failed to load categories', 'error');
    throw error;
  }
}

// Load top spending categories
async function loadTopCategories(timeframe = 'day') {
  try {
    // Get all transactions
    const transactions = await api.getTransactions();
    if (!transactions || transactions.length === 0) {
      updateRankings([], []);
      return;
    }
    
    // Get previous period rankings for comparison
    const currentRankings = getCategoryRankings(transactions, timeframe);
    const previousTimeframe = getPreviousPeriod(timeframe);
    const previousRankings = getCategoryRankings(transactions, previousTimeframe);
    
    // Update the UI with the rankings
    updateRankings(currentRankings, previousRankings);
  } catch (error) {
    console.error('Error loading top categories:', error);
    showToast('Failed to load top categories', 'error');
  }
}

// Calculate rankings for categories based on transactions
function getCategoryRankings(transactions, timeframe) {
  if (!transactions || transactions.length === 0) return [];
  
  const now = new Date();
  const filteredTransactions = transactions.filter(t => {
    const transDate = new Date(t.date);
    switch(timeframe) {
      case 'day':
        return transDate.toDateString() === now.toDateString();
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        return transDate >= weekAgo;
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return transDate >= monthStart;
      case '3month':
        const threeMonthsAgo = new Date(now);
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        return transDate >= threeMonthsAgo;
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

// Get previous time period for comparison
function getPreviousPeriod(timeframe) {
  const now = new Date();
  switch(timeframe) {
    case 'day':
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      return `${yesterday.toISOString().split('T')[0]}`;
    case 'week':
      const twoWeeksAgo = new Date(now);
      twoWeeksAgo.setDate(now.getDate() - 14);
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(now.getDate() - 7);
      return `${twoWeeksAgo.toISOString().split('T')[0]}_${oneWeekAgo.toISOString().split('T')[0]}`;
    case 'month':
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return `${lastMonth.toISOString().split('T')[0]}_${lastMonthEnd.toISOString().split('T')[0]}`;
    case '3month':
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(now.getMonth() - 3);
      return `${sixMonthsAgo.toISOString().split('T')[0]}_${threeMonthsAgo.toISOString().split('T')[0]}`;
    case 'ytd':
      const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
      const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);
      return `${lastYearStart.toISOString().split('T')[0]}_${lastYearEnd.toISOString().split('T')[0]}`;
    default:
      return 'all';
  }
}

// Extract clean category name
function extractCategoryName(category) {
  if (!category) return 'Other';
  
  // If category contains a pipe (emoji|name format), extract just the name
  if (category.includes('|')) {
    const parts = category.split('|');
    return parts[1].trim();
  }
  
  // If category contains a space (emoji name format), extract just the name
  if (category.includes(' ') && category.trim().length > 1) {
    const parts = category.split(' ');
    // Check if the first part might be an emoji (usually 1-2 chars)
    if (parts[0].length <= 2) {
      return parts.slice(1).join(' ').trim();
    }
  }
  
  // If no delimiter found, return as is
  return category;
}

// Update the UI with category rankings
function updateRankings(newRankings, oldRankings) {
  const container = document.getElementById('category-rankings');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (newRankings.length === 0) {
    container.innerHTML = '<p class="no-data-message">No spending data available for this period.</p>';
    return;
  }
  
  newRankings.forEach((category, index) => {
    const rankItem = document.createElement('div');
    rankItem.className = 'ranking-item';
    
    // Find old rank if it exists
    const oldRank = oldRankings.findIndex(c => c.category === category.category);
    let rankChange = '';
    let changeClass = '';
    
    if (oldRank !== -1) {
      const change = oldRank - index; // Positive means improved rank (moved up)
      
      if (change > 0) {
        rankChange = `↑${change}`;
        changeClass = 'up';
      } else if (change < 0) {
        rankChange = `↓${Math.abs(change)}`;
        changeClass = 'down';
      } else {
        rankChange = '–';
        changeClass = 'same';
      }
    }
    
    // Format the category name (extract the emoji if present)
    let displayName = category.category;
    let emoji = '';
    
    const match = category.category.match(/^(\p{Emoji})\s+(.*)/u);
    if (match) {
      emoji = match[1];
      displayName = match[2];
    }
    
    rankItem.innerHTML = `
      <div class="rank-info">
        <span class="rank-number">#${index + 1}</span>
        ${emoji ? `<span class="category-emoji" style="margin-right: 5px;">${emoji}</span>` : ''}
        <span>${displayName}</span>
        ${rankChange ? `<span class="rank-change ${changeClass}">${rankChange}</span>` : ''}
      </div>
      <span class="category-amount">$${category.amount.toFixed(2)}</span>
    `;
    
    container.appendChild(rankItem);
  });
}

// Set up timeframe buttons event handlers
function setupTimeframeButtons() {
  const timeframeButtons = document.querySelectorAll('.time-btn');
  timeframeButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all buttons
      timeframeButtons.forEach(btn => btn.classList.remove('active'));
      // Add active class to the clicked button
      button.classList.add('active');
      // Update the top categories display with the new timeframe
      loadTopCategories(button.getAttribute('data-timeframe'));
      // Also update the category spend display
      loadCategorySpend(button.getAttribute('data-timeframe'));
    });
  });
}

// Store category budgets in memory (in a real app, these would be stored in a database)
let categoryBudgets = JSON.parse(localStorage.getItem('categoryBudgets')) || [];

// Load and display category budgets
function loadCategoryBudgets() {
  const container = document.getElementById('category-budgets-container');
  if (!container) return;
  
  // Clear the container
  container.innerHTML = '';
  
  // Get budgets from localStorage
  const budgets = JSON.parse(localStorage.getItem('categoryBudgets') || '[]');
  
  // Save to global variable for other functions to use
  window.categoryBudgets = budgets;
  
  if (budgets.length === 0) {
    container.innerHTML = '<p class="no-data-message">No category budgets set. Add a budget to track your spending by category.</p>';
    return;
  }
  
  // Create and append budget items
  budgets.forEach(budget => {
    const budgetItem = createCategoryBudgetItem(budget);
    container.appendChild(budgetItem);
  });
}

// Setup budget modal
function setupBudgetModal() {
  const modal = document.getElementById('budget-modal');
  const openBtn = document.getElementById('set-budget-btn');
  const closeBtn = document.querySelector('.close-modal');
  const form = document.getElementById('budget-form');
  const categorySelect = document.getElementById('category-select');
  const customCategoryGroup = document.getElementById('custom-category-group');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      openBudgetModal();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  // Close modal when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  // Handle category change for custom category
  if (categorySelect) {
    categorySelect.addEventListener('change', (e) => {
      console.log('Category selected:', e.target.value);
      if (e.target.value === 'Custom') {
        console.log('Custom category selected, showing input fields');
        customCategoryGroup.classList.remove('hidden');
      } else {
        console.log('Standard category selected, hiding custom input fields');
        customCategoryGroup.classList.add('hidden');
      }
    });
  }

  // Handle form submission
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const categorySelect = document.getElementById('category-select');
      const budgetAmount = parseFloat(document.getElementById('budget-amount').value);
      
      if (isNaN(budgetAmount) || budgetAmount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
      }

      let categoryValue = categorySelect.value;
      let categoryName = categorySelect.options[categorySelect.selectedIndex]?.text || '';

      // Handle custom category
      if (categoryValue === 'Custom') {
        const customName = document.getElementById('custom-category-name').value;
        const customEmoji = document.getElementById('custom-emoji').value || '📋';
        
        console.log('Custom category data:', { customName, customEmoji });
        
        if (!customName) {
          showToast('Please enter a category name', 'error');
          return;
        }
        
        // Save the custom category
        try {
          console.log('Saving custom category:', customName, customEmoji);
          await api.saveCategory(customName, customEmoji);
          console.log('Custom category saved successfully');
          categoryValue = customName;
          categoryName = `${customEmoji} ${customName}`;
        } catch (error) {
          console.error('Error saving custom category:', error);
          showToast('Failed to create custom category', 'error');
          return;
        }
      }
      
      // Check if we're editing an existing budget or creating a new one
      const existingBudgetIndex = categoryBudgets.findIndex(b => b.category === categoryValue);
      
      if (existingBudgetIndex >= 0) {
        // Update existing budget
        categoryBudgets[existingBudgetIndex].amount = budgetAmount;
        showToast('Budget updated successfully');
      } else {
        // Add new budget
        categoryBudgets.push({
          category: categoryValue,
          categoryName: categoryName,
          amount: budgetAmount
        });
        showToast('Budget added successfully');
      }
      
      // Save to localStorage
      localStorage.setItem('categoryBudgets', JSON.stringify(categoryBudgets));
      
      // Update UI
      loadCategoryBudgets();
      loadCategorySpend();
      
      // Close the modal
      modal.style.display = 'none';
      
      // Reset form
      form.reset();
      customCategoryGroup.classList.add('hidden');
    });
  }
}

// Open budget modal for new budget or editing existing budget
function openBudgetModal(budget = null) {
  const modal = document.getElementById('budget-modal');
  const modalTitle = modal.querySelector('h2');
  const categorySelect = document.getElementById('category-select');
  const amountInput = document.getElementById('budget-amount');
  const customCategoryGroup = document.getElementById('custom-category-group');
  
  // Reset custom category fields
  customCategoryGroup.classList.add('hidden');
  document.getElementById('custom-category-name').value = '';
  document.getElementById('custom-emoji').value = '';
  
  if (budget) {
    // We're editing an existing budget
    modalTitle.textContent = 'Edit Category Budget';
    
    // Find and select the correct option
    for (let i = 0; i < categorySelect.options.length; i++) {
      if (categorySelect.options[i].value === budget.category) {
        categorySelect.selectedIndex = i;
        break;
      }
    }
    
    amountInput.value = budget.amount.toFixed(2);
    
    // Disable category selection when editing
    categorySelect.disabled = true;
  } else {
    modalTitle.textContent = 'Set Category Budget';
    amountInput.value = '';
    categorySelect.disabled = false;
  }
  
  // Show the modal
  modal.style.display = 'block';
}

// Delete category budget
function deleteCategoryBudget(category) {
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete the budget for ${category}?`)) {
        return;
    }
    
    console.log(`Deleting budget for category: ${category}`);
    
    // Get the current budgets from localStorage
    const budgets = JSON.parse(localStorage.getItem('categoryBudgets') || '[]');
    
    // Find the index of the budget to delete
    const budgetIndex = budgets.findIndex(b => b.category.toLowerCase() === category.toLowerCase());
    
    if (budgetIndex === -1) {
        showToast(`No budget found for category: ${category}`, 'error');
        return;
    }
    
    // Remove the budget from the array
    budgets.splice(budgetIndex, 1);
    
    // Save the updated budgets back to localStorage
    localStorage.setItem('categoryBudgets', JSON.stringify(budgets));
    
    // Update the global variable
    window.categoryBudgets = budgets;
    
    // Update the UI to reflect the deletion
    loadCategoryBudgets();
    loadCategorySpend(document.querySelector('#spend-timeframe-controls .timeframe-button.active')?.getAttribute('data-timeframe') || 'month');
    
    // Show success message
    showToast(`Budget for ${category} has been deleted.`, 'success');
}

// Function to create a category budget display item
function createCategoryBudgetItem(budget) {
    const { category, amount } = budget;
    
    const budgetItem = document.createElement('div');
    budgetItem.className = 'category-budget-item';
    
    // Format the category name and extract emoji if present
    let displayName = category;
    let emoji = '';
    
    if (category.includes('|')) {
        const parts = category.split('|');
        emoji = parts[0];
        displayName = parts[1];
    }
    
    budgetItem.innerHTML = `
        <div class="budget-category">
            <span class="category-emoji">${emoji}</span>
            <span class="category-name">${displayName}</span>
        </div>
        <div class="budget-amount">$${parseFloat(amount).toFixed(2)}</div>
        <div class="budget-actions">
            <button class="edit-budget-btn" data-category="${category}">
                <i class="fas fa-edit"></i>
            </button>
            <button class="delete-budget-btn" data-category="${category}">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    
    // Add event listeners
    const editBtn = budgetItem.querySelector('.edit-budget-btn');
    const deleteBtn = budgetItem.querySelector('.delete-budget-btn');
    
    editBtn.addEventListener('click', () => openBudgetModal(budget));
    deleteBtn.addEventListener('click', () => deleteCategoryBudget(category));
    
    return budgetItem;
}

// Load and display category spend with progress circles
async function loadCategorySpend(timeframe = 'month') {
    try {
        updateTimeframeControls(timeframe, 'spend-timeframe-controls');
        
        // Get transactions for selected timeframe
        const transactions = await fetchTransactionsForTimeframe(timeframe);
        
        // Process the data to create category spend objects
        const categorySpendData = {};
        
        // Group all transactions by category
        transactions.forEach(transaction => {
            // Skip if transaction or category is undefined
            if (!transaction || !transaction.category) {
                return;
            }
            
            // Use toLowerCase for case-insensitive comparison
            const category = String(transaction.category).toLowerCase();
            
            // Add category if not exists
            if (!categorySpendData[category]) {
                categorySpendData[category] = {
                    category: transaction.category,
                    expense: 0,
                    income: 0,
                    count: 0
                };
            }
            
            // Update category data
            if (transaction.expense) {
                categorySpendData[category].expense += parseFloat(transaction.expense) || 0;
            }
            if (transaction.income) {
                categorySpendData[category].income += parseFloat(transaction.income) || 0;
            }
            categorySpendData[category].count += parseInt(transaction.count) || 1;
        });
        
        // Convert to array for sorting
        const categoryData = Object.values(categorySpendData);
        
        // Sort by expense (highest first)
        categoryData.sort((a, b) => b.expense - a.expense);
        
        // Get top 5 categories
        const topCategories = categoryData.slice(0, 5);
        
        // Display the spend for each category
        displayCategorySpend(topCategories);
        
    } catch (error) {
        console.error('Error loading category spend:', error);
        showToast('Failed to load category spend data', 'error');
    }
}

// Function to create a spend circle
function createSpendCircle(category, spent, budget) {
    // Parse and format values
    spent = parseFloat(spent) || 0;
    budget = parseFloat(budget) || 0;
    
    // Format category name and extract emoji if present
    let displayName = category;
    let emoji = '📊';
    
    if (typeof category === 'string' && category.includes('|')) {
        const parts = category.split('|');
        emoji = parts[0];
        displayName = parts[1];
    }
    
    // Create the container
    const container = document.createElement('div');
    container.className = 'spend-circle';
    
    // Calculate percentage and status
    let percentage = 0;
    let status = 'good';
    
    if (budget > 0) {
        percentage = Math.min(100, (spent / budget) * 100);
        
        if (percentage >= 90) {
            status = 'danger';
        } else if (percentage >= 75) {
            status = 'warning';
        }
    }
    
    // Create the circle SVG
    const strokeWidth = 8;
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (percentage / 100) * circumference;
    
    // Set the HTML content
    container.innerHTML = `
        <div class="spend-circle-container ${status}">
            <div class="category-info">
                <span class="category-emoji">${emoji}</span>
                <span class="category-name">${displayName}</span>
            </div>
            <div class="progress-circle-container">
                <svg class="progress-ring" width="120" height="120" viewBox="0 0 120 120">
                    <circle 
                        class="progress-ring-circle-bg" 
                        stroke="#e0e0e0" 
                        stroke-width="${strokeWidth}" 
                        fill="transparent" 
                        r="${radius}" 
                        cx="60" 
                        cy="60"
                    />
                    <circle 
                        class="progress-ring-circle ${status}" 
                        stroke="currentColor" 
                        stroke-width="${strokeWidth}" 
                        fill="transparent" 
                        r="${radius}" 
                        cx="60" 
                        cy="60"
                        stroke-dasharray="${circumference} ${circumference}"
                        stroke-dashoffset="${dashOffset}"
                        transform="rotate(-90, 60, 60)"
                    />
                </svg>
                <div class="progress-text">
                    <div class="percentage">${Math.round(percentage)}%</div>
                    <div class="amount">$${spent.toFixed(2)} / $${budget.toFixed(2)}</div>
                </div>
            </div>
        </div>
    `;
    
    return container;
}

// Helper function to fetch transactions for a specific timeframe
async function fetchTransactionsForTimeframe(timeframe) {
    try {
        // Calculate start and end dates based on timeframe
        const { startDate, endDate } = calculateDateRange(timeframe);
        
        // Use the new endpoint that combines regular transactions and goal transactions
        const categories = await window.api.getTransactionsByCategory(startDate, endDate);
        
        console.log('Combined category data:', categories);
        return categories;
    } catch (error) {
        console.error('Error fetching transactions by category:', error);
        showError('Failed to load category data. Please try again later.');
        return [];
    }
}

// Helper function to calculate date range based on timeframe
function calculateDateRange(timeframe) {
    const now = new Date();
    let startDate = new Date();
    
    switch (timeframe) {
        case 'week':
            startDate.setDate(now.getDate() - 7);
            break;
        case 'month':
            startDate.setMonth(now.getMonth() - 1);
            break;
        case 'quarter':
            startDate.setMonth(now.getMonth() - 3);
            break;
        case 'year':
            startDate.setFullYear(now.getFullYear() - 1);
            break;
        case 'all':
            startDate = new Date(2000, 0, 1); // Far past date to include everything
            break;
        default:
            startDate.setMonth(now.getMonth() - 1); // Default to month
    }
    
    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0]
    };
}

// Helper to clean category name from emoji format
function cleanCategoryName(category) {
    if (!category) return 'Uncategorized';
    
    // Check if category has emoji format (emoji|name)
    if (category.includes('|')) {
        return category.split('|')[1].trim();
    }
    
    return category.trim();
}

// Update timeframe control buttons
function updateTimeframeControls(selectedTimeframe, controlsId) {
    const controls = document.getElementById(controlsId);
    if (!controls) return;
    
    const buttons = controls.querySelectorAll('.timeframe-button');
    buttons.forEach(button => {
        const timeframe = button.getAttribute('data-timeframe');
        if (timeframe === selectedTimeframe) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

// Load and display active categories
async function loadActiveCategories() {
  const container = document.getElementById('active-categories-container');
  if (!container) return;
  
  try {
    // Get all transactions
    const transactions = await api.getTransactions();
    
    // Count occurrences of each category
    const categoryCounts = {};
    const categoryEmojis = {};
    
    transactions.forEach(transaction => {
      const category = transaction.category;
      if (!categoryCounts[category]) {
        categoryCounts[category] = 0;
        
        // Try to extract emoji if present
        const match = category.match(/^(\p{Emoji})\s+(.*)/u);
        if (match) {
          categoryEmojis[category] = match[1];
        } else {
          categoryEmojis[category] = '📋'; // Default emoji
        }
      }
      categoryCounts[category]++;
    });
    
    // Convert to array and sort by count (descending)
    const sortedCategories = Object.keys(categoryCounts)
      .map(category => ({ 
        name: category, 
        count: categoryCounts[category],
        emoji: categoryEmojis[category]
      }))
      .sort((a, b) => b.count - a.count);
    
    // Display categories
    if (sortedCategories.length === 0) {
      container.innerHTML = '<p class="no-data-message">No active categories found.</p>';
      return;
    }
    
    container.innerHTML = '';
    
    sortedCategories.forEach(category => {
      const categoryItem = document.createElement('div');
      categoryItem.className = 'active-category-item';
      
      // Extract name without emoji if present
      let displayName = category.name;
      const match = category.name.match(/^(\p{Emoji})\s+(.*)/u);
      if (match) {
        displayName = match[2]; // Just the name without emoji
      }
      
      categoryItem.innerHTML = `
        <div class="category-icon">
          ${category.emoji}
        </div>
        <div class="category-details">
          <div class="category-title">${displayName}</div>
          <div class="category-count">${category.count} transaction${category.count !== 1 ? 's' : ''}</div>
        </div>
      `;
      
      container.appendChild(categoryItem);
    });
    
  } catch (error) {
    console.error('Error loading active categories:', error);
    container.innerHTML = '<p class="no-data-message">Error loading categories.</p>';
  }
}

// Display a toast message
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  
  // Clear any existing timeout
  clearTimeout(toast.timeoutId);
  
  // Set the message and type
  toast.innerHTML = message;
  toast.className = 'toast';
  toast.classList.add(type);
  toast.classList.add('show');
  
  // Hide the toast after 3 seconds
  toast.timeoutId = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Setup timeframe controls for current spend
function setupSpendTimeframeControls() {
    const timeframeButtons = document.querySelectorAll('#spend-timeframe-controls .timeframe-button');
    if (!timeframeButtons.length) return;
    
    timeframeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const timeframe = this.getAttribute('data-timeframe');
            
            // Update button states
            timeframeButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Load data for selected timeframe
            loadCategorySpend(timeframe);
        });
    });
}

// Display category spend data
function displayCategorySpend(categories) {
    const container = document.getElementById('category-spend-container');
    if (!container) {
        console.error('Category spend container not found');
        return;
    }
    
    // Clear previous content
    container.innerHTML = '';
    
    if (!categories || categories.length === 0) {
        container.innerHTML = '<p class="info-message">No spending data available for this timeframe.</p>';
        return;
    }
    
    // Add header section
    const headerSection = document.createElement('div');
    headerSection.className = 'spend-section-header';
    headerSection.innerHTML = `
        <h3>Current Spend by Category</h3>
        <p class="section-subtitle">Showing how much you've spent vs. your budget for each category</p>
    `;
    container.appendChild(headerSection);
    
    // Create spend circles for each category
    const spendCirclesContainer = document.createElement('div');
    spendCirclesContainer.className = 'spend-circles-container';
    
    categories.forEach(categoryData => {
        const categoryName = categoryData.category;
        const spent = categoryData.expense || 0;
        
        // Try to find a matching budget
        const budget = window.categoryBudgets ? 
            window.categoryBudgets.find(b => cleanCategoryName(b.category) === cleanCategoryName(categoryName)) : 
            null;
        
        const budgetAmount = budget ? parseFloat(budget.amount) : 0;
        
        // Create spend circle
        const spendCircle = createSpendCircle(categoryName, spent, budgetAmount);
        spendCirclesContainer.appendChild(spendCircle);
    });
    
    container.appendChild(spendCirclesContainer);
} 
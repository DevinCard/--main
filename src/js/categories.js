// Store category budgets in memory (in a real app, these would be stored in a database)
window.categoryBudgets = [];

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
      loadTopCategories('day'), // Default to Today for top categories
      loadCategoryBudgets(),
      loadCategorySpend('month'), // Default to Month for budget spend
      loadActiveCategories()
    ]);
    console.log('All category data loaded successfully');
    
    // Set up timeframe buttons after data is loaded
    setupTimeframeButtons();
    
    // Apply the correct active state for each section's timeframe buttons
    updateTimeframeControls('day', 'timeframe-controls'); // Top Categories section
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
      case '3m':
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
      categorySpending[category] = (categorySpending[category] || 0) + Math.abs(parseFloat(t.amount));
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
  
  newRankings.slice(0, 5).forEach((category, index) => {
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
    let emoji = getCategoryEmoji(category.category);
    
    if (emoji !== '📊') {
      displayName = cleanCategoryName(category.category);
    }
    
    // Format currency
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(category.amount);
    
    rankItem.innerHTML = `
      <div class="rank-info">
        <span class="rank-number">#${index + 1}</span>
        <span class="category-emoji">${emoji}</span>
        <span>${displayName}</span>
        ${rankChange ? `<span class="rank-change ${changeClass}">${rankChange}</span>` : ''}
      </div>
      <span class="category-amount">${formattedAmount}</span>
    `;
    
    container.appendChild(rankItem);
  });
}

// Helper function to update timeframe buttons
function updateTimeframeControls(selectedTimeframe, controlsClass = 'timeframe-controls') {
    // Find all timeframe control containers
    const controlContainers = document.querySelectorAll(`.${controlsClass}`);
    if (!controlContainers.length) return;
    
    // Update all timeframe control sets
    controlContainers.forEach(controls => {
        const buttons = controls.querySelectorAll('.time-btn');
        buttons.forEach(button => {
            const timeframe = button.getAttribute('data-timeframe');
            if (timeframe === selectedTimeframe) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    });
}

// Setup function for timeframe buttons
function setupTimeframeButtons() {
    const timeframeButtons = document.querySelectorAll('.time-btn');
    timeframeButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Find the parent timeframe-controls element
            const controlsContainer = button.closest('.timeframe-controls');
            if (!controlsContainer) return;
            
            // Remove active class from all buttons in this container
            const siblingButtons = controlsContainer.querySelectorAll('.time-btn');
            siblingButtons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to the clicked button
            button.classList.add('active');
            
            // Get the timeframe value
            const timeframe = button.getAttribute('data-timeframe');
            
            // Update appropriate section based on which container this is in
            const parentBox = controlsContainer.closest('.category-box');
            if (parentBox.classList.contains('top-right')) {
                // This is the Top Categories section
                loadTopCategories(timeframe);
            } else if (parentBox.classList.contains('bottom-left')) {
                // This is the Current Spend section
                loadCategorySpend(timeframe);
            }
        });
    });
}

// Load category budgets from localStorage
async function loadCategoryBudgets(silentMode = false) {
  try {
    // Get budgets from localStorage
    const budgetsStr = localStorage.getItem('categoryBudgets');
    let budgets = [];
    
    if (budgetsStr) {
      budgets = JSON.parse(budgetsStr);
    }
    
    // Save to global variable for other functions to access
    window.categoryBudgets = budgets;
    
    // If in silent mode, just return the budgets without updating UI
    if (silentMode) {
      return budgets;
    }
    
    // Update UI if not in silent mode
    const container = document.getElementById('category-budget-container');
    if (!container) return budgets;
    
    // Clear container - remove any existing no-data-message
    const noDataMessage = container.querySelector('.no-data-message');
    if (noDataMessage) {
      container.removeChild(noDataMessage);
    } else {
      container.innerHTML = '';
    }
    
    if (budgets.length === 0) {
      container.innerHTML = '<p class="no-data-message">No budgets set. Add a budget to get started.</p>';
      return budgets;
    }
    
    // Create budget items
    budgets.forEach(budget => {
      const budgetItem = createCategoryBudgetItem(budget);
      container.appendChild(budgetItem);
    });
    
    return budgets;
  } catch (error) {
    console.error('Error loading category budgets:', error);
    return [];
  }
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
          categoryValue = `${customEmoji}|${customName}`;
          categoryName = `${customEmoji} ${customName}`;
        } catch (error) {
          console.error('Error saving custom category:', error);
          showToast('Failed to create custom category', 'error');
          return;
        }
      }
      
      // Check if we're editing an existing budget or creating a new one
      const existingBudgetIndex = categoryBudgets.findIndex(b => b.category === categoryValue);
      
      let budget;
      if (existingBudgetIndex >= 0) {
        // Update existing budget
        categoryBudgets[existingBudgetIndex].amount = budgetAmount;
        budget = categoryBudgets[existingBudgetIndex];
        showToast('Budget updated successfully');
      } else {
        // Add new budget
        budget = {
          category: categoryValue,
          categoryName: categoryName,
          amount: budgetAmount
        };
        categoryBudgets.push(budget);
        showToast('Budget added successfully');
      }
      
      // Save to localStorage
      localStorage.setItem('categoryBudgets', JSON.stringify(categoryBudgets));
      
      // Update UI immediately
      const budgetContainer = document.getElementById('category-budget-container');
      if (budgetContainer) {
        // Remove any no-data message
        const noDataMessage = budgetContainer.querySelector('.no-data-message');
        if (noDataMessage) {
          budgetContainer.removeChild(noDataMessage);
        }
        
        // If adding a new budget, just append it to the container
        if (existingBudgetIndex < 0) {
          const budgetItem = createCategoryBudgetItem(budget);
          budgetContainer.appendChild(budgetItem);
        } else {
          // If updating, reload the entire list
          loadCategoryBudgets();
        }
      }
      
      // Force clear and reload the current spend section
      const spendContainer = document.getElementById('category-spend-container');
      if (spendContainer) {
        spendContainer.innerHTML = '<p class="loading-message">Updating spend data...</p>';
      }
      
      // Get current timeframe from active button
      const currentTimeframe = document.querySelector('.spend-timeframe-controls .timeframe-button.active')?.dataset.timeframe || 'month';
      
      // Reload the spend data with a slight delay to ensure DOM updates
      setTimeout(() => {
        loadCategorySpend(currentTimeframe);
      }, 100);
      
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
    budgetItem.dataset.category = category;
    
    // Format the category name and extract emoji if present
    let displayName = category;
    let emoji = '📊'; // Default emoji
    
    if (category.includes('|')) {
        const parts = category.split('|');
        emoji = parts[0];
        displayName = parts[1];
    } else {
        // Try to get emoji from the getCategoryEmoji function
        const extractedEmoji = getCategoryEmoji(category);
        if (extractedEmoji && extractedEmoji !== '📊') {
            emoji = extractedEmoji;
        }
    }
    
    // Format the amount with commas and decimals
    const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(parseFloat(amount) || 0);
    
    budgetItem.innerHTML = `
        <div class="budget-category">
            <div class="budget-category-emoji">${emoji}</div>
            <div class="budget-category-name">${displayName}</div>
        </div>
        <div class="budget-amount">${formattedAmount}<span class="budget-period">/month</span></div>
        <div class="budget-actions">
            <button class="edit-budget-btn" title="Edit Budget" data-category="${category}">
                Edit
            </button>
            <button class="delete-budget-btn" title="Delete Budget" data-category="${category}">
                Delete
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
        console.log('Loading budgets for timeframe:', timeframe);
        
        // Normalize timeframe value
        let normalizedTimeframe = timeframe.toLowerCase();
        if (normalizedTimeframe === 'daily') normalizedTimeframe = 'day';
        if (normalizedTimeframe === 'weekly') normalizedTimeframe = 'week';
        if (normalizedTimeframe === 'monthly') normalizedTimeframe = 'month';
        
        updateTimeframeControls(timeframe);
        
        const container = document.getElementById('category-spend-container');
        if (!container) {
            console.error('Category spend container not found');
            return;
        }
        
        // Show loading state
        container.innerHTML = '<p class="loading-message">Loading budgets...</p>';
        
        // Get budgets from localStorage
        const budgetsStr = localStorage.getItem('categoryBudgets');
        let budgets = [];
        
        if (budgetsStr) {
            try {
                budgets = JSON.parse(budgetsStr);
                // Update global variable
                window.categoryBudgets = budgets;
            } catch (e) {
                console.error('Error parsing budgets from localStorage:', e);
            }
        }
        
        // Check if we have any budgets
        if (!budgets || budgets.length === 0) {
            container.innerHTML = `
                <div class="no-budgets-message">
                    <p>You haven't set any monthly budgets yet.</p>
                    <p>Create your first budget to start tracking your spending.</p>
                    <button id="create-first-budget" class="action-button">Create Your First Budget</button>
                </div>
            `;
            
            // Add event listener to the create budget button
            const createBudgetBtn = document.getElementById('create-first-budget');
            if (createBudgetBtn) {
                createBudgetBtn.addEventListener('click', () => {
                    openBudgetModal();
                });
            }
            
            return;
        }
        
        // Calculate date range for future timeframe
        const dateRange = calculateDateRange(normalizedTimeframe);
        const daysDifference = dateRange.days || 30; // Use the calculated days or default to 30
        
        // Clear container
        container.innerHTML = '';
        
        // Add title and subtitle
        const titleElement = document.createElement('h3');
        titleElement.className = 'spend-section-title';
        titleElement.textContent = 'Budget for Selected Period';
        container.appendChild(titleElement);
        
        const subtitleElement = document.createElement('p');
        subtitleElement.className = 'spend-section-subtitle';
        subtitleElement.textContent = dateRange.displayText;
        container.appendChild(subtitleElement);
        
        // Creating HTML for each budgeted category
        const budgetedCategories = [];
        const daysInMonth = 30; // Standard month length for budget calculation
        
        // Prepare data for all budgeted categories
        budgets.forEach(budget => {
            if (!budget || !budget.category) return;
            
            const categoryName = cleanCategoryName(budget.category);
            const monthlyBudget = parseFloat(budget.amount) || 0;
            
            // Skip invalid budgets
            if (monthlyBudget <= 0) return;
            
            // Calculate budget for this timeframe
            const timeframeBudget = (monthlyBudget / daysInMonth) * daysDifference;
            
            budgetedCategories.push({
                category: budget.category, // Original category with emoji
                categoryName: categoryName, // Clean category name
                spent: 0, // Start with 0 spent
                budget: timeframeBudget, // Pro-rated budget for timeframe
                monthlyBudget: monthlyBudget, // Original monthly budget
                days: daysDifference // Days in the timeframe
            });
        });
        
        // Sort categories by budget amount
        budgetedCategories.sort((a, b) => b.budget - a.budget);
        
        // Create HTML elements for each category
        budgetedCategories.forEach(data => {
            const budgetItem = createBudgetProgressItem(
                data.category,
                data.categoryName,
                data.spent,
                data.budget,
                false,
                data.days,
                data.monthlyBudget
            );
            container.appendChild(budgetItem);
        });
        
        // Display message if no categories with budgets
        if (budgetedCategories.length === 0) {
            container.innerHTML = `
                <p class="no-data-message">No budgeted categories found. Set a budget for at least one category.</p>
            `;
        }
        
    } catch (error) {
        console.error('Error loading budgets:', error);
        if (container) {
            container.innerHTML = `
                <p class="error-message">Failed to load budgets. Please try again later.</p>
            `;
        }
    }
}

// Helper function to fetch transactions specifically for the current month
async function fetchTransactionsForMonth(startDate, endDate) {
    try {
        // Format dates for the API
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        // Get transactions from the API
        const transactions = await api.getTransactions();
        
        // Filter transactions by date range
        return transactions.filter(transaction => {
            const transactionDate = new Date(transaction.date);
            return transactionDate >= startDate && transactionDate <= endDate;
        });
    } catch (error) {
        console.error('Error fetching transactions for month:', error);
        return [];
    }
}

// Create a budget progress item with horizontal bar
function createBudgetProgressItem(category, categoryName, spent, budget, isProjection = false, days = 30, monthlyBudget = 0) {
    // Validate inputs
    if (!category || isNaN(budget) || budget <= 0) {
        console.warn('Invalid data for budget progress item:', { category, categoryName, spent, budget });
        return document.createElement('div'); // Return empty div if invalid
    }
    
    // Calculate percentage (since spent is 0, this will be 0)
    const percentage = 0;
    let status = 'on-track';
    
    // Get emoji
    const emoji = getCategoryEmoji(category);
    
    // Format currency values
    const budgetFormatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(budget);
    
    // Format monthly budget for reference
    const monthlyBudgetFormatted = monthlyBudget ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(monthlyBudget) : '';
    
    // Create container element
    const container = document.createElement('div');
    container.className = `spend-item ${status}`;
    if (isProjection) container.classList.add('projection');
    container.dataset.category = category;
    
    // Create the SVG circle with proper stroke properties
    const radius = 30;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference; // Full offset for 0% progress
    
    // Determine period text based on days
    let periodText = '';
    const today = new Date();
    const endOfYear = new Date(today.getFullYear(), 11, 31);
    const daysUntilEndOfYear = Math.round((endOfYear - today) / (1000 * 60 * 60 * 24));
    
    if (days === 1) {
        periodText = 'today';
    } else if (days === daysUntilEndOfYear) {
        periodText = 'until end of year';
    } else {
        periodText = 'next ' + days + ' days';
    }
    
    // Create the HTML structure with goal-like circular progress
    container.innerHTML = `
        <a href="transaction.html?category=${encodeURIComponent(category)}" class="spend-item-link">
            <div class="category-progress">
                <svg class="progress-ring" width="70" height="70">
                    <circle class="progress-ring-circle-bg" 
                        stroke-width="5" 
                        fill="transparent" 
                        r="${radius}" 
                        cx="35" 
                        cy="35"/>
                    <circle class="progress-ring-circle" 
                        stroke-width="5" 
                        fill="transparent" 
                        r="${radius}" 
                        cx="35" 
                        cy="35"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${dashOffset}"
                        transform="rotate(-90, 35, 35)"/>
                </svg>
                <div class="category-emoji">${emoji}</div>
                <div class="progress-text">${percentage}%</div>
            </div>
            <div class="category-info">
                <div class="category-name">${categoryName}</div>
                <div class="spend-amount">$0.00 of ${budgetFormatted}</div>
                <div class="status-indicator">On track</div>
            </div>
        </a>
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
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of today
    let endDate = new Date(today); // Default end date is today
    let displayText = '';
    
    switch (timeframe) {
        case 'day':
            // Just today (24 hours)
            endDate.setDate(today.getDate() + 1);
            displayText = 'Today only';
            break;
        case 'week':
            // 1 week from today
            endDate.setDate(today.getDate() + 7);
            displayText = `From today to ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            break;
        case 'month':
            // 1 month from today
            endDate.setMonth(today.getMonth() + 1);
            displayText = `From today to ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            break;
        case '3m':
            // 3 months from today
            endDate.setMonth(today.getMonth() + 3);
            displayText = `From today to ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            break;
        case '6m':
            // 6 months from today
            endDate.setMonth(today.getMonth() + 6);
            displayText = `From today to ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            break;
        case 'ytd':
            // End of current year
            endDate = new Date(today.getFullYear(), 11, 31);
            displayText = `From today to Dec 31, ${today.getFullYear()}`;
            break;
        default:
            // Default to 1 month
            endDate.setMonth(today.getMonth() + 1);
            displayText = `From today to ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    
    return {
        startDate: today.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        displayText: displayText,
        days: Math.round((endDate - today) / (1000 * 60 * 60 * 24))
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

// Load and display active categories
async function loadActiveCategories() {
    try {
        const container = document.getElementById('active-categories-container');
        if (!container) {
            console.error('Active categories container not found');
            return;
        }
        
        // Clear container
        container.innerHTML = '';
        
        // Get transactions to analyze categories
        const transactions = await api.getTransactions();
        
        if (!transactions || transactions.length === 0) {
            container.innerHTML = '<p class="no-data-message">No transaction data available to determine active categories.</p>';
            return;
        }
        
        // Extract and count categories, tracking both withdrawals and deposits
        const categories = {};
        
        transactions.forEach(transaction => {
            if (!transaction.category) return;
            
            const categoryName = cleanCategoryName(transaction.category);
            const isExpense = transaction.type === 'Withdrawal';
            const isIncome = transaction.type === 'Deposit';
            
            if (!categories[categoryName]) {
                categories[categoryName] = {
                    name: categoryName,
                    withdrawals: 0,
                    deposits: 0,
                    withdrawalAmount: 0,
                    depositAmount: 0,
                    count: 0,
                    originalCategory: transaction.category
                };
            }
            
            categories[categoryName].count++;
            
            if (isExpense) {
                categories[categoryName].withdrawals++;
                categories[categoryName].withdrawalAmount += Math.abs(parseFloat(transaction.amount) || 0);
            } else if (isIncome) {
                categories[categoryName].deposits++;
                categories[categoryName].depositAmount += Math.abs(parseFloat(transaction.amount) || 0);
            }
        });
        
        // Convert to array and sort by overall transaction count
        const sortedCategories = Object.values(categories)
            .sort((a, b) => b.count - a.count);
        
        if (sortedCategories.length === 0) {
            container.innerHTML = '<p class="no-data-message">No categories found in your transactions.</p>';
            return;
        }
        
        // Create list container
        const listContainer = document.createElement('div');
        listContainer.className = 'categories-list';
        
        // Add each category in transaction-like format
        sortedCategories.forEach(category => {
            const emoji = getCategoryEmoji(category.originalCategory || category.name);
            
            const categoryItem = document.createElement('div');
            categoryItem.className = 'category-item';
            
            // Calculate total across both deposits and withdrawals
            const totalAmount = category.withdrawalAmount + category.depositAmount;
            const netAmount = category.depositAmount - category.withdrawalAmount;
            const netPrefix = netAmount >= 0 ? '+' : '-';
            
            categoryItem.innerHTML = `
                <div class="category-item-container">
                    <div class="category-icon">${emoji}</div>
                    <div class="category-details">
                        <div class="category-name">${category.name}</div>
                        <div class="category-stats">
                            <span class="usage-count">${category.count} transaction${category.count !== 1 ? 's' : ''}</span>
                            ${category.withdrawals > 0 ? `<span class="withdrawal-stat">${category.withdrawals} withdrawal${category.withdrawals !== 1 ? 's' : ''}</span>` : ''}
                            ${category.deposits > 0 ? `<span class="deposit-stat">${category.deposits} deposit${category.deposits !== 1 ? 's' : ''}</span>` : ''}
                        </div>
                    </div>
                    <div class="category-amounts">
                        ${category.withdrawalAmount > 0 ? 
                            `<div class="withdrawal-amount">-$${category.withdrawalAmount.toFixed(2)}</div>` : ''}
                        ${category.depositAmount > 0 ? 
                            `<div class="deposit-amount">+$${category.depositAmount.toFixed(2)}</div>` : ''}
                        <div class="net-amount ${netAmount >= 0 ? 'positive' : 'negative'}">
                            Net: ${netPrefix}$${Math.abs(netAmount).toFixed(2)}
                        </div>
                    </div>
                </div>
            `;
            
            listContainer.appendChild(categoryItem);
        });
        
        container.appendChild(listContainer);
        
    } catch (error) {
        console.error('Error loading active categories:', error);
        const container = document.getElementById('active-categories-container');
        if (container) {
            container.innerHTML = '<p class="no-data-message">Error loading categories. Please try again later.</p>';
        }
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
    const timeframeButtons = document.querySelectorAll('.category-box.bottom-left .time-btn');
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
    if (!container) return;
    
    // Clear previous content
    container.innerHTML = '';
    
    if (!categories || categories.length === 0) {
        container.innerHTML = '<p class="no-data-message">No category spend data available.</p>';
        return;
    }
    
    // Create spend circles for each category
    const spendCirclesContainer = document.createElement('div');
    spendCirclesContainer.className = 'spend-circles-minimal';
    
    categories.forEach(category => {
        // Extract category name
        const categoryName = category.category;
        // Get budget for this category
        const budgetAmount = category.budget || 0;
        // Get spent amount
        const spent = category.spent || 0;
        
        // Create spend circle
        const spendCircle = createSpendCircle(categoryName, spent, budgetAmount);
        spendCirclesContainer.appendChild(spendCircle);
    });
    
    container.appendChild(spendCirclesContainer);
}

/**
 * Gets the emoji for a category, extracting it if the category includes an emoji
 * or returning a default emoji based on the category name
 */
function getCategoryEmoji(category) {
    // List of predefined categories and their emojis
    const emojiMap = {
        'food': '🍔',
        'dining': '🍽️',
        'groceries': '🛒',
        'restaurant': '🍲',
        'transport': '🚗',
        'transportation': '🚗',
        'travel': '✈️',
        'gas': '⛽',
        'fuel': '⛽',
        'bills': '📄',
        'utilities': '💡',
        'electricity': '💡',
        'water': '💧',
        'shopping': '🛍️',
        'clothes': '👕',
        'entertainment': '🎬',
        'movies': '🎞️',
        'games': '🎮',
        'health': '🏥',
        'medical': '💊',
        'fitness': '🏋️',
        'education': '📚',
        'books': '📖',
        'courses': '🎓',
        'housing': '🏠',
        'rent': '🏘️',
        'mortgage': '🏡',
        'savings': '💰',
        'investment': '📈',
        'income': '💵',
        'salary': '💼',
        'gift': '🎁',
        'donation': '🎗️',
        'withdrawal': '💸',
        'deposit': '💵',
        'transfer': '↔️',
        'subscription': '🔄',
        'insurance': '🛡️',
        'tax': '📝',
        'pet': '🐾',
        'childcare': '👶',
        'personal': '👤',
        'other': '📌',
        'miscellaneous': '🔮',
        'refund': '💰'
    };
    
    // Check if the category contains a predefined emoji
    if (category && category.includes('|')) {
        const parts = category.split('|');
        if (parts.length > 0 && parts[0].trim()) {
            return parts[0].trim();
        }
    }
    
    // If no emoji in the category string, search for keywords
    if (category) {
        for (const [key, emoji] of Object.entries(emojiMap)) {
            if (category.toLowerCase().includes(key.toLowerCase())) {
                return emoji;
            }
        }
    }
    
    // Return a generic emoji if no match is found
    return '📊';
}

/**
 * Updates a budget progress circle with a new percentage
 * @param {HTMLElement} circleElement - The SVG circle element
 * @param {number} percentage - Progress percentage (0-100)
 */
function updateBudgetProgress(circleElement, percentage) {
    if (!circleElement || isNaN(percentage)) return;
    
    // Clamp percentage between 0-100
    const validPercentage = Math.max(0, Math.min(100, percentage));
    
    // Calculate new offset
    const radius = parseInt(circleElement.getAttribute('r'));
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (validPercentage / 100) * circumference;
    
    // Update the circle
    circleElement.style.strokeDashoffset = offset;
    
    // Find and update the percentage text
    const progressItem = circleElement.closest('.spend-item');
    if (progressItem) {
        const percentText = progressItem.querySelector('.progress-text');
        if (percentText) {
            percentText.textContent = validPercentage + '%';
        }
        
        // Update status class
        progressItem.classList.remove('on-track', 'warning', 'over-budget');
        if (validPercentage >= 100) {
            progressItem.classList.add('over-budget');
        } else if (validPercentage >= 85) {
            progressItem.classList.add('warning');
        } else {
            progressItem.classList.add('on-track');
        }
    }
}

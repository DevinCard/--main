// Global variables
let currentGoals = [];

// Track goals being deleted to prevent duplicate requests
const deletingGoals = new Set();

function checkAuth() {
    // Check both storage locations for the token
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    
    if (!token) {
        console.log('No authentication token found, redirecting to login');
        window.location.href = '/index.html'; // Redirect to login page
        return false;
    }
    return true;
}

// Initialize everything when the DOM loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded');
    try {
        // First, make sure the API is available
        if (typeof window.api === 'undefined') {
            console.error('API object not available - waiting 500ms to retry');
            // Add a short delay to allow scripts to load
            await new Promise(resolve => setTimeout(resolve, 500));
            
            if (typeof window.api === 'undefined') {
                console.error('API still not available after delay');
                throw new Error('API is not defined. Please check if api.js is loaded properly.');
            } else {
                console.log('API available after delay');
            }
        }
        
        if (!checkAuth()) {
            console.log('Auth check failed');
            return;
        }
        
        await Promise.all([
            loadCategories(),
            loadGoals()
        ]);
        
        // Set up general event listeners (forms, modals, etc.)
        setupEventListeners();
        
        // Initialize the goals timeline chart with window.goals (set in loadGoals)
        initializeGoalsTimelineChart(window.goals || []);
        
        // Set up event listeners for the timeframe buttons
        setupTimeframeButtons();
        
        // Set up event listeners for goal actions - this handles delete buttons
        setupGoalActionListeners();
        
        // Comment out functions that might not be defined yet
        // setupRecurringPaymentForms();
        // setupSignOut();
        
        console.log('Initialization complete');
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

// Setup all event listeners
function setupEventListeners() {
    // New goal form submission
    const newGoalForm = document.getElementById('newGoalForm');
    if (newGoalForm) {
        newGoalForm.addEventListener('submit', handleNewGoalSubmit);
    }

    // Category selection change
    const categorySelect = document.getElementById('goal-category-select');
    if (categorySelect) {
        categorySelect.addEventListener('change', handleCategoryChange);
    }

    // Close buttons for modals
    document.querySelectorAll('.close').forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            if (modal) {
                closeModal(modal.id);
            }
        });
    });

    // Add money form event listener
    const addMoneyForm = document.getElementById('addMoneyForm');
    if (addMoneyForm) {
        addMoneyForm.addEventListener('submit', handleAddMoneySubmit);
    }
}

// Load and display goals
async function loadGoals() {
    try {
        // Check if API is available
        if (typeof window.api === 'undefined') {
            throw new Error('API is not defined');
        }
        
        // Check authentication
        if (!checkAuth()) return;
        
        // Get goals for the logged-in user
        const goalsData = await window.api.getGoals();
        
        // Enhance goals with recurring payments
        const enhancedGoals = await Promise.all(goalsData.map(async (goal) => {
            try {
                // Fetch recurring payments for this goal
                const response = await fetch(`/api/goals/${goal.id}/recurring`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    // Extract recurring payments from response
                    const recurringPayments = data.recurring_payments || data;
                    
                    return {
                        ...goal,
                        recurring: Array.isArray(recurringPayments) ? recurringPayments : []
                    };
                }
                
                return { ...goal, recurring: [] };
            } catch (error) {
                console.error(`Error fetching recurring payments for goal ${goal.id}:`, error);
                return { ...goal, recurring: [] };
            }
        }));
        
        // Store in global scope for other functions to access
        window.goals = enhancedGoals;
        
        // Get the goals container
        const goalsContainer = document.querySelector('.goals-container');
        
        // If no container is found, show an error
        if (!goalsContainer) {
            console.error('Goals container not found');
            return;
        }
        
        // Clear the container
        goalsContainer.innerHTML = '';
        
        // If no goals found, show a message
        if (!enhancedGoals || enhancedGoals.length === 0) {
            goalsContainer.innerHTML = '<p class="no-goals-message">You have no goals yet. Create a new goal to get started.</p>';
            
            // Hide the timeline since there are no goals
            const timelineContainer = document.getElementById('goalsTimelineChart');
            if (timelineContainer) {
                timelineContainer.innerHTML = '<p class="no-goals-message">Create goals with recurring deposits to see your progress over time.</p>';
            }
            
            return;
        }
        
        // Create goal cards
        enhancedGoals.forEach(goal => {
            const goalCard = createGoalCard(goal);
            goalsContainer.appendChild(goalCard);
        });
        
        // Set up event listeners for goal actions
        setupGoalActionListeners();
        
        // Initialize timeline chart with the enhanced goals that include recurring payments
        initializeGoalsTimelineChart(enhancedGoals);
        
    } catch (error) {
        console.error('Error loading goals:', error);
        const goalsContainer = document.querySelector('.goals-container');
        if (goalsContainer) {
            goalsContainer.innerHTML = '<p class="error-message">Error loading goals. Please try again later.</p>';
        }
    }
}

// Create a goal card element
function createGoalCard(goal) {
    // Get values, ensuring they're numeric
    const targetAmount = parseFloat(goal.target_amount || goal.targetAmount || 0);
    const currentAmount = parseFloat(goal.current_amount || 0);
    const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
    
    // Extract emoji from category string (assuming format "emoji|name")
    let emoji = '🎯';
    let categoryName = goal.category || 'General';
    
    if (categoryName.includes('|')) {
        const parts = categoryName.split('|');
        emoji = parts[0];
        categoryName = parts[1];
    }
    
    // Log goal data for debugging
    console.log(`Goal ${goal.id} - ${goal.title}:`, {
        current: currentAmount,
        target: targetAmount,
        percent: progress,
        category: categoryName,
        rawGoal: goal
    });
    
    const goalCard = document.createElement('div');
    goalCard.className = 'goal-card';
    goalCard.setAttribute('data-goal-id', goal.id);
    
    goalCard.innerHTML = `
        <div class="goal-circle">
            <div class="category-emoji-background">${emoji}</div>
            <svg class="progress-ring" width="120" height="120">
                <circle class="progress-ring-circle-bg" 
                    stroke="#e0e0e0"
                    stroke-width="8"
                    fill="transparent"
                    r="52"
                    cx="60"
                    cy="60"/>
                <circle class="progress-ring-circle" 
                    stroke="#4CAF50"
                    stroke-width="8"
                    fill="transparent"
                    r="52"
                    cx="60"
                    cy="60"/>
            </svg>
            <div class="progress-text-container">
                <div class="percentage">${Math.round(progress)}%</div>
                <div class="amount">$${currentAmount.toFixed(2)} / $${targetAmount.toFixed(2)}</div>
            </div>
        </div>
        <div class="goal-info">
            <h3>${goal.title}</h3>
            <span class="goal-category">${categoryName}</span>
        </div>
        <div class="goal-actions">
            <button class="add-money-btn" onclick="showAddMoneyModal(${goal.id}, 'add')">Add Money</button>
            <button class="remove-money-btn" onclick="showAddMoneyModal(${goal.id}, 'remove')">Remove Money</button>
            <button class="delete-goal-btn" onclick="deleteGoal(${goal.id})">Delete</button>
        </div>
    `;
    
    // Initialize the progress ring
    initializeProgressCircle(goalCard, progress);
    
    return goalCard;
}

function initializeProgressCircle(goalCard, progress) {
    const circle = goalCard.querySelector('.progress-ring-circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;
    
    const offset = circumference - (progress / 100 * circumference);
    circle.style.strokeDashoffset = offset;
}

// Handle new goal form submission
async function handleNewGoalSubmit(event) {
    event.preventDefault();
    
    try {
        const formData = new FormData(event.target);
        const title = formData.get('title');
        const targetAmount = formData.get('targetAmount');
        const category = formData.get('category');
        
        const newGoal = await window.api.createGoal({
            title,
            targetAmount: parseFloat(targetAmount),
            category
        });
        
        console.log('Goal created:', newGoal);
        
        // Close modal and reset form
        closeModal('newGoalModal');
        event.target.reset();
        
        // Reload goals
        await loadGoals();
        
    } catch (error) {
        console.error('Error creating goal:', error);
        showError('Failed to create goal');
    }
}

// Load categories into select
async function loadCategories() {
    try {
        const categories = await window.api.getCategories();
        const categorySelect = document.getElementById('goal-category-select');
        
        // Clear existing options
        categorySelect.innerHTML = '';
        
        if (!categories || !Array.isArray(categories)) {
            console.error('Invalid categories data received:', categories);
            return;
        }

        // Add default categories with proper emoji formatting
        const defaultCategories = [
            { emoji: '🍔', name: 'Food' },
            { emoji: '🚌', name: 'Transport' },
            { emoji: '💡', name: 'Utilities' },
            // Add any other default categories here
        ];

        // Combine default and custom categories
        const allCategories = [...defaultCategories, ...categories.filter(cat => !cat.is_default)];

        // Add all categories to select
        allCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = `${category.emoji}|${category.name}`; // Store emoji and name together
            option.textContent = `${category.emoji} ${category.name}`;
            categorySelect.appendChild(option);
        });

        // Add the Custom option at the end
        const customOption = document.createElement('option');
        customOption.value = 'Custom';
        customOption.textContent = '➕ Add Custom Category';
        categorySelect.appendChild(customOption);

        // Add custom category input fields to the form
        const formGroup = document.getElementById('newGoalForm');
        const customCategoryGroup = document.createElement('div');
        customCategoryGroup.id = 'goal-custom-category-group';
        customCategoryGroup.className = 'form-group hidden';
        customCategoryGroup.innerHTML = `
            <div class="custom-category-inputs">
                <label for="goal-custom-category-name">Category Name</label>
                <input type="text" id="goal-custom-category-name" name="customCategoryName" placeholder="Category Name">
                <label for="goal-custom-category-emoji">Emoji</label>
                <input type="text" id="goal-custom-category-emoji" name="customEmoji" placeholder="Enter Emoji">
            </div>
        `;
        formGroup.insertBefore(customCategoryGroup, formGroup.querySelector('button'));

        // Add event listener for category selection
        categorySelect.addEventListener('change', (e) => {
            const customCategoryGroup = document.getElementById('goal-custom-category-group');
            if (e.target.value === 'Custom') {
                customCategoryGroup.classList.remove('hidden');
            } else {
                customCategoryGroup.classList.add('hidden');
            }
        });

    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Modal functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Utility functions
function showError(message) {
    // Implement error display logic here
    alert(message);
}

// Make functions available globally
window.openNewGoalModal = () => openModal('newGoalModal');
window.deleteGoal = async (goalId) => {
    try {
        // Confirm deletion
        if (!confirm('Are you sure you want to delete this goal? Any funds will be returned to your balance.')) {
            return;
        }
        
        // Find the goal card and add a "deleting" class
        const goalCard = document.querySelector(`.goal-card[data-goal-id="${goalId}"]`);
        if (goalCard) {
            goalCard.classList.add('deleting');
        }
        
        // Call the API to delete the goal
        const result = await window.api.deleteGoal(goalId);
        
        // Process the result
        if (result.success) {
            // If there was a refund, show it in the message
            if (result.refundedAmount && result.refundedAmount > 0) {
                // Update the balance display if a function exists for that
                if (typeof updateBalanceDisplay === 'function') {
                    updateBalanceDisplay(result.newBalance);
                }
                
                showToast(`Goal deleted successfully. $${result.refundedAmount.toFixed(2)} has been refunded to your balance.`, 'success');
            } else {
                showToast('Goal deleted successfully.', 'success');
            }
            
            // Reload the goals to update the UI
            await loadGoals();
        } else {
            // If there was an error, show it
            showToast(result.error || 'Failed to delete goal. Please try again.', 'error');
            
            // Remove the deleting class
            if (goalCard) {
                goalCard.classList.remove('deleting');
            }
        }
    } catch (error) {
        console.error('Error deleting goal:', error);
        showToast('Failed to delete goal. Please try again.', 'error');
        
        // Find the goal card and remove the "deleting" class if it exists
        const goalCard = document.querySelector(`.goal-card[data-goal-id="${goalId}"]`);
        if (goalCard) {
            goalCard.classList.remove('deleting');
        }
    }
};

/**
 * Set up event listeners for goal actions
 */
function setupGoalActionListeners() {
    // Use event delegation by attaching listener to a parent container
    const goalsContainer = document.querySelector('.goals-container');
    
    if (goalsContainer) {
        // First remove any existing listeners
        const newGoalsContainer = goalsContainer.cloneNode(true);
        goalsContainer.parentNode.replaceChild(newGoalsContainer, goalsContainer);
        
        // Add a single click event listener to the container
        newGoalsContainer.addEventListener('click', function(event) {
            // Find the closest goal card to the clicked element
            const goalCard = event.target.closest('.goal-card');
            if (!goalCard) return;
            
            const goalId = goalCard.getAttribute('data-goal-id');
            
            // Check which button was clicked
            if (event.target.closest('.add-money-btn')) {
                showAddMoneyModal(goalId, 'add');
            } else if (event.target.closest('.remove-money-btn')) {
                showAddMoneyModal(goalId, 'remove');
            } else if (event.target.closest('.delete-goal-btn')) {
                deleteGoal(goalId);
            }
        });
    } else {
        console.warn('Goals container not found for attaching event listeners');
    }
}

/**
 * Show the add money modal for a specific goal
 * @param {string} goalId - Goal ID
 * @param {string} action - Action type (add/remove)
 */
function showAddMoneyModal(goalId, action = 'add') {
    // Set goal ID in hidden field
    document.getElementById('add-money-goal-id').value = goalId;
    
    // Update modal title based on action
    const modalTitle = document.querySelector('#addMoneyModal h2');
    if (modalTitle) {
        modalTitle.textContent = action === 'add' ? 'Add Money to Goal' : 'Remove Money from Goal';
    }
    
    // Show the modal
    openModal('addMoneyModal');
    
    // Add event listener to form (remove any existing ones first)
    const form = document.getElementById('addMoneyForm');
    if (form) {
        // Clone and replace to remove old event listeners
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        // Add new event listener
        newForm.addEventListener('submit', handleAddMoneySubmit);
    }
}

/**
 * Handle form submission for adding/removing money from a goal
 * @param {Event} event - The form submission event
 */
async function handleAddMoneySubmit(event) {
    event.preventDefault();
    
    // Get form values
    const goalId = document.getElementById('add-money-goal-id').value;
    const amount = parseFloat(document.getElementById('add-money-amount').value);
    const interval = document.getElementById('add-money-interval').value;
    
    // Validate amount
    if (isNaN(amount) || amount <= 0) {
        showError('Please enter a valid amount.');
        return;
    }
    
    // Check if it's a recurring payment
    if (interval !== 'one-time') {
        return createRecurringDeposit(event);
    }
    
    try {
        // Add money to goal (one-time payment)
        const result = await window.api.addMoneyToGoal(goalId, amount);
        
        if (result.error) {
            showError(result.error);
            return;
        }
        
        // Update balance if returned
        if (result.balance) {
            updateBalanceDisplay(result.balance);
        }
        
        // Close modal
        closeModal('addMoneyModal');
        
        // Reload goals to reflect changes
        await loadGoals();
        
    } catch (error) {
        console.error('Error adding money to goal:', error);
        showError('Failed to add money to goal. Please try again.');
    }
}

/**
 * Create a recurring deposit for a goal
 * @param {Event} event - The form submission event
 */
async function createRecurringDeposit(event) {
    event.preventDefault();
    
    // Get form values
    const goalId = document.getElementById('add-money-goal-id').value;
    const amount = parseFloat(document.getElementById('add-money-amount').value);
    const interval = document.getElementById('add-money-interval').value;
    
    // Validate amount
    if (isNaN(amount) || amount <= 0) {
        showError('Please enter a valid amount.');
        return;
    }
    
    try {
        // Validate interval/frequency
        if (!interval || interval === 'undefined' || interval === 'null') {
            showError('Please select a valid recurring interval.');
            return;
        }
        
        // Create the recurring payment
        await window.api.createRecurringPayment({
            goalId,
            amount,
            frequency: interval
        });
        
        // Also add the first payment immediately
        await window.api.addMoneyToGoal(goalId, amount);
        
        // Close the modal
        closeModal('addMoneyModal');
        
        // Refresh the goals list
        await loadGoals();
        
    } catch (error) {
        console.error('Error creating recurring deposit:', error);
        showError('Failed to set up recurring deposit. Please try again.');
    }
}

/**
 * Update the balance display with a new value
 * @param {number} newBalance - The new balance to display
 */
function updateBalanceDisplay(newBalance) {
    const balanceElement = document.getElementById('user-balance');
    if (balanceElement) {
        balanceElement.textContent = `$${newBalance.toFixed(2)}`;
    }
}

async function handleCategoryChange(event) {
    const customCategoryGroup = document.getElementById('goal-custom-category-group');
    if (event.target.value === 'Custom') {
        customCategoryGroup.classList.remove('hidden');
    } else {
        customCategoryGroup.classList.add('hidden');
    }
}

/**
 * Initialize the goals timeline chart
 * @param {Array} goals - Array of goals with recurring payments
 */
function initializeGoalsTimelineChart(goals) {
    // Find the chart container
    let chartContainer = document.getElementById('goalsTimelineChart');
    
    if (!chartContainer) {
        console.error('Timeline chart container not found');
        return;
    }
    
    // Clear the container
    chartContainer.innerHTML = '';
    
    // Filter goals to only include those with recurring payments
    const goalsWithRecurring = goals.filter(goal => {
        // Check if goal has valid recurring payments
        if (!goal.recurring || !Array.isArray(goal.recurring) || goal.recurring.length === 0) {
            return false;
        }
        return true;
    });
    
    // If no goals have recurring payments, show a message
    if (goalsWithRecurring.length === 0) {
        chartContainer.innerHTML = `
            <div class="no-recurring-goals">
                <p>No recurring deposits set up yet.</p>
                <p>Add a recurring deposit to any goal to start tracking your progress over time.</p>
            </div>
        `;
        return;
    }
    
    try {
        // Make the container visible
        chartContainer.style.display = 'block';
        chartContainer.style.height = '350px';
        chartContainer.style.width = '100%';
        chartContainer.style.position = 'relative';
        chartContainer.style.zIndex = '1';
        
        // Prepare series data for the chart
        const seriesData = [];
        const currentDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 12); // Look ahead 12 months
        
        // Process each goal with recurring payments
        goalsWithRecurring.forEach((goal, index) => {
            try {
                // Generate a unique color for this goal
                const colorHue = (index * 137) % 360; // Golden angle approximation for even distribution
                const color = `hsl(${colorHue}, 70%, 50%)`;
                
                // Create series for this goal
                const series = createGoalSeries(goal, [], color, currentDate, endDate);
                
                // Add to series data for chart
                seriesData.push(series);
            } catch (error) {
                console.error(`Error processing goal "${goal.title}" for chart:`, error);
            }
        });
        
        // Set up event listeners for the timeframe buttons
        setupTimeframeButtons();
        
        // Render the chart with the prepared series data
        renderTimelineChart(seriesData, chartContainer);
    } catch (error) {
        console.error('Error initializing goals timeline chart:', error);
        chartContainer.innerHTML = '<p class="error-message">Could not load timeline chart. Please try again later.</p>';
    }
}

/**
 * Setup timeframe buttons to switch between different time periods
 */
function setupTimeframeButtons() {
    const timeButtons = document.querySelectorAll('.time-btn');
    
    timeButtons.forEach(button => {
        // Remove old listeners (to avoid duplicates)
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        // Add click handler
        newButton.addEventListener('click', async function() {
            // Get the selected timeframe
            const timeframe = this.getAttribute('data-timeframe');
            
            // Update active state
            timeButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Reload goals with the new timeframe
            await loadGoals();
        });
    });
}

/**
 * Create a data series for a goal to display in the timeline chart
 * @param {Object} goal - The goal object
 * @param {Array} dataPoints - Optional existing data points
 * @param {string} color - Color for the series
 * @param {Date} startDate - Start date for the projection
 * @param {Date} endDate - End date for the projection
 * @returns {Object} Series data for the chart
 */
function createGoalSeries(goal, dataPoints = [], color, startDate, endDate) {
    try {
        // Initialize with basic data
        const currentAmount = parseFloat(goal.current_amount) || 0;
        const targetAmount = parseFloat(goal.target_amount) || 1; // Avoid division by zero
        const currentPercentage = Math.min(100, (currentAmount / targetAmount) * 100);
        
        // Create an array to hold all data points
        const allPoints = [];
        
        // Start with current progress
        allPoints.push({
            x: new Date().getTime(),
            y: Math.round(currentPercentage)
        });
        
        // If the goal has recurring payments, project future points
        if (goal.recurring && Array.isArray(goal.recurring) && goal.recurring.length > 0) {
            // Sort recurring payments by amount (highest first for visual clarity)
            const payments = [...goal.recurring].sort((a, b) => {
                return parseFloat(b.amount || 0) - parseFloat(a.amount || 0);
            });
            
            // Calculate future points
            let runningAmount = currentAmount;
            let projectionDate = new Date();
            
            // Project for the next year or until target is reached
            for (let i = 0; i < 365 && runningAmount < targetAmount; i++) {
                // For each payment, add its contribution
                for (const payment of payments) {
                    const frequency = payment.frequency || 'monthly';
                    const amount = parseFloat(payment.amount) || 0;
                    
                    // Skip invalid payments
                    if (amount <= 0) continue;
                    
                    // Calculate next payment date based on frequency
                    projectionDate = addDaysBasedOnFrequency(projectionDate, frequency);
                    
                    // If we've gone beyond our projection end date, stop
                    if (projectionDate > endDate) break;
                    
                    // Add payment to running amount
                    runningAmount += amount;
                    
                    // Calculate percentage and add data point
                    const percentage = Math.min(100, (runningAmount / targetAmount) * 100);
                    
                    // Add to our data points
                    allPoints.push({
                        x: projectionDate.getTime(),
                        y: Math.round(percentage)
                    });
                    
                    // If we've reached 100%, stop projecting
                    if (percentage >= 100) break;
                }
            }
            
            // Add final 100% point if needed
            if (runningAmount < targetAmount) {
                // Calculate payment frequency (use most common if multiple)
                const mostFrequentPayment = payments[0];
                const frequency = mostFrequentPayment?.frequency || 'monthly';
                const amount = parseFloat(mostFrequentPayment?.amount) || 0;
                
                if (amount > 0) {
                    // Calculate remaining periods to reach target
                    const remaining = targetAmount - runningAmount;
                    const periodsLeft = Math.ceil(remaining / amount);
                    
                    // Add final point at 100%
                    let finalDate = new Date(projectionDate);
                    for (let i = 0; i < periodsLeft; i++) {
                        finalDate = addDaysBasedOnFrequency(finalDate, frequency);
                    }
                    
                    allPoints.push({
                        x: finalDate.getTime(),
                        y: 100
                    });
                }
            }
        } else {
            // For goals without recurring payments, add a point 1 month from now with same value
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            
            allPoints.push({
                x: nextMonth.getTime(),
                y: Math.round(currentPercentage)
            });
        }
        
        // Sort points chronologically
        allPoints.sort((a, b) => a.x - b.x);
        
        // Return in ApexCharts format
        return {
            name: goal.title || "Unnamed Goal",
            data: allPoints,
            color: color
        };
    } catch (error) {
        console.error("Error creating goal series:", error);
        
        // Return a minimal valid series to avoid crashing
        return {
            name: goal.title || "Unnamed Goal",
            data: [
                { x: new Date().getTime(), y: 0 },
                { x: new Date().getTime() + 2592000000, y: 0 } // +30 days
            ],
            color: color
        };
    }
}

/**
 * Add days to a date based on a payment frequency
 * @param {Date} date - The starting date
 * @param {string} frequency - Payment frequency (daily, weekly, monthly)
 * @returns {Date} The new date
 */
function addDaysBasedOnFrequency(date, frequency) {
    const newDate = new Date(date);
    
    switch(frequency?.toLowerCase()) {
        case 'daily':
            newDate.setDate(newDate.getDate() + 1);
            break;
        case 'weekly':
            newDate.setDate(newDate.getDate() + 7);
            break;
        case 'monthly':
            newDate.setMonth(newDate.getMonth() + 1);
            break;
        case 'quarterly':
            newDate.setMonth(newDate.getMonth() + 3);
            break;
        case 'yearly':
            newDate.setFullYear(newDate.getFullYear() + 1);
            break;
        default:
            // Default to monthly
            newDate.setMonth(newDate.getMonth() + 1);
    }
    
    return newDate;
}

/**
 * Render a timeline chart with the provided series data
 * @param {Array} seriesData - Array of series data objects
 * @param {HTMLElement} container - The container element for the chart
 */
function renderTimelineChart(seriesData, container) {
    if (!seriesData || seriesData.length === 0) {
        container.innerHTML = `
            <div class="no-recurring-goals">
                <p>No recurring deposits set up yet.</p>
                <p>Add a recurring deposit to any goal to start tracking your progress over time.</p>
            </div>
        `;
        return;
    }
    
    // Make sure each series has a valid data array
    const validatedSeries = [];
    
    for (let i = 0; i < seriesData.length; i++) {
        const series = seriesData[i];
        
        // First check if we have old format (actual + projected) and convert it
        if (series.actual && Array.isArray(series.actual)) {
            // Combine actual and projected arrays into a single data array
            const combinedData = [...series.actual];
            
            if (series.projected && Array.isArray(series.projected)) {
                // Skip duplicates between actual and projected
                const lastActualPoint = series.actual.length > 0 ? 
                    new Date(series.actual[series.actual.length - 1].x).getTime() : 0;
                    
                series.projected.forEach(point => {
                    const pointDate = new Date(point.x).getTime();
                    if (pointDate > lastActualPoint) {
                        combinedData.push(point);
                    }
                });
            }
            
            // Create a new format series
            const convertedSeries = {
                name: series.name,
                data: combinedData.map(point => ({
                    x: typeof point.x === 'number' ? point.x : new Date(point.x).getTime(),
                    y: typeof point.y === 'number' ? point.y : parseFloat(point.y) || 0
                })),
                color: series.color
            };
            
            validatedSeries.push(convertedSeries);
            continue;
        }
        
        // Check if series has data property and it's an array
        if (!series.data || !Array.isArray(series.data) || series.data.length === 0) {
            // Create a minimal valid series
            validatedSeries.push({
                name: series.name || `Goal ${i+1}`,
                data: [
                    { x: new Date().getTime(), y: 0 },
                    { x: new Date().getTime() + 86400000, y: 0 } // next day
                ],
                color: series.color || '#cccccc'
            });
        } else {
            // Ensure all data points have correct x and y properties
            const validData = series.data.map(point => {
                return {
                    x: typeof point.x === 'number' ? point.x : new Date(point.x).getTime(),
                    y: typeof point.y === 'number' ? point.y : parseFloat(point.y) || 0
                };
            });
            
            validatedSeries.push({
                name: series.name || `Goal ${i+1}`,
                data: validData,
                color: series.color || '#cccccc'
            });
        }
    }
    
    if (validatedSeries.length === 0) {
        container.innerHTML = `<p class="error-message">No valid data available for the chart. Please add recurring deposits to your goals.</p>`;
        return;
    }
    
    // Make sure the container is properly styled
    container.style.height = '350px';
    container.style.width = '100%';
    container.style.display = 'block';
    container.style.position = 'relative';
    container.style.zIndex = '1';
    container.style.overflow = 'visible';
    
    // Add custom CSS for the chart (only once)
    const chartStyleId = 'apexcharts-custom-styles';
    if (!document.getElementById(chartStyleId)) {
        const chartStyles = document.createElement('style');
        chartStyles.id = chartStyleId;
        chartStyles.textContent = `
            #goalsTimelineChart {
                min-height: 350px;
                width: 100%;
                margin: 20px 0;
            }
            .apexcharts-canvas {
                position: relative !important;
                z-index: 10;
                margin: 0 auto;
            }
        `;
        document.head.appendChild(chartStyles);
    }
    
    // Render the chart using ApexCharts
    try {
        // Create the chart options
        const options = {
            series: validatedSeries,
            chart: {
                height: 350,
                type: 'line',
                zoom: {
                    enabled: false
                },
                animations: {
                    enabled: true
                },
                toolbar: {
                    show: false
                },
                fontFamily: 'Poppins, Arial, sans-serif'
            },
            colors: validatedSeries.map(s => s.color),
            stroke: {
                width: 3,
                curve: 'smooth'
            },
            grid: {
                borderColor: '#e0e0e0',
                row: {
                    colors: ['transparent', 'transparent'],
                    opacity: 0.2
                }
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeUTC: false,
                    format: 'MMM dd, yyyy',
                    style: {
                        colors: '#666',
                        fontSize: '12px'
                    }
                }
            },
            yaxis: {
                title: {
                    text: 'Completion (%)',
                    style: {
                        fontWeight: 500,
                        fontSize: '14px'
                    }
                },
                min: 0,
                max: 100,
                labels: {
                    formatter: function(val) {
                        return val.toFixed(0) + '%';
                    },
                    style: {
                        colors: '#666',
                        fontSize: '12px'
                    }
                }
            },
            legend: {
                position: 'top',
                horizontalAlign: 'right',
                fontSize: '13px'
            },
            tooltip: {
                shared: true,
                intersect: false,
                x: {
                    format: 'MMM dd, yyyy'
                },
                y: {
                    formatter: function(val) {
                        return val.toFixed(0) + '%';
                    }
                }
            },
            markers: {
                size: 4,
                hover: {
                    size: 6
                }
            },
            responsive: [{
                breakpoint: 768,
                options: {
                    chart: {
                        height: 300
                    },
                    legend: {
                        position: 'bottom',
                        fontSize: '11px'
                    }
                }
            }]
        };
        
        // Create the chart instance
        const chart = new ApexCharts(container, options);
        chart.render();
    } catch (error) {
        console.error('Error rendering timeline chart:', error);
        container.innerHTML = '<p class="error-message">Error rendering chart. Please try again later.</p>';
    }
}

// Helper function to load ApexCharts if it's not already loaded
function loadApexCharts(callback) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/apexcharts';
    script.onload = callback;
    document.head.appendChild(script);
}

// Helper function to dump page structure for debugging
function dumpPageStructure() {
    console.log('Page structure (first 1000 chars):', document.body.innerHTML.substring(0, 1000) + '...');
}

// Add showToast function since it's missing
function showToast(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Use existing showError for error messages
    if (type === 'error') {
        if (typeof showError === 'function') {
            showError(message);
            return;
        }
    }
    
    // For other types, use alert
    alert(message);
    // In a real implementation, this would show a styled toast message
}

// Add the missing function to avoid errors
function setupRecurringPaymentForms() {
    console.log('Setting up recurring payment forms');
    
    // Get the recurring payment form
    const recurringPaymentForm = document.getElementById('recurring-payment-form');
    if (!recurringPaymentForm) {
        console.log('Recurring payment form not found');
        return;
    }
    
    // Add event listener for the form submission
    recurringPaymentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        // Get form data
        const formData = new FormData(recurringPaymentForm);
        const goalId = formData.get('goal-id');
        const amount = parseFloat(formData.get('amount'));
        const frequency = formData.get('frequency');
        
        if (!goalId || isNaN(amount) || amount <= 0 || !frequency) {
            showToast('Please fill out all fields correctly', 'error');
            return;
        }
        
        try {
            // Create the recurring payment
            await createRecurringPayment(goalId, amount, frequency);
            
            // Close the modal and show success message
            const modal = document.getElementById('recurring-payment-modal');
            if (modal) {
                modal.style.display = 'none';
            }
            
            showToast('Recurring payment set up successfully!', 'success');
            
            // Reload goals to show the updated data
            await loadGoals();
        } catch (error) {
            console.error('Error setting up recurring payment:', error);
            showToast('Failed to set up recurring payment', 'error');
        }
    });
}

// Also add a stub for setupSignOut if it's referenced
function setupSignOut() {
    console.log('Setting up sign out button');
    const signOutButton = document.getElementById('sign-out-btn');
    if (signOutButton) {
        signOutButton.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        });
    }
} 
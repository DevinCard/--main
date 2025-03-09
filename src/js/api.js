// API service module
const API_BASE_URL = '/api';

// Helper function to get token
function getToken() {
    return localStorage.getItem('token');
}

// Helper function to handle API responses
async function handleResponse(response) {
    try {
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'An error occurred');
        }
        return data;
    } catch (error) {
        console.error('Error handling API response:', error);
        throw error;
    }
}

// API object with methods for interacting with backend
const api = {
    // Get request headers with authentication
    getHeaders() {
        const token = getToken();
        return {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        };
    },
    
    // Get user balance
    async getBalance() {
        const response = await fetch(`${API_BASE_URL}/balance`, {
            headers: this.getHeaders()
        });
        return handleResponse(response);
    },
    
    // Get transactions
    async getTransactions() {
        const response = await fetch(`${API_BASE_URL}/transactions`, {
            headers: this.getHeaders()
        });
        return handleResponse(response);
    },
    
    // Add a new transaction
    async addTransaction(transaction) {
        const response = await fetch(`${API_BASE_URL}/transactions`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(transaction)
        });
        const data = await handleResponse(response);
        
        // Update local data if needed
        if (typeof updateBalance === 'function' && data.balance) {
            updateBalance(data.balance);
        }
        
        return data;
    },
    
    // Get categories
    async getCategories() {
        const response = await fetch(`${API_BASE_URL}/categories`, {
            headers: this.getHeaders()
        });
        return handleResponse(response);
    },
    
    // Save a new category
    async saveCategory(name, emoji) {
        const response = await fetch(`${API_BASE_URL}/categories`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                name,
                emoji
            })
        });
        return handleResponse(response);
    },
    
    // Update a transaction
    async updateTransaction(id, transactionData) {
        const response = await fetch(`${API_BASE_URL}/transactions/${id}`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify(transactionData)
        });
        
        const data = await handleResponse(response);
        
        // Update local data if needed
        if (typeof updateBalance === 'function' && data.balance) {
            updateBalance(data.balance);
        }
        
        return data;
    },
    
    // Delete a transaction
    async deleteTransaction(id) {
        const response = await fetch(`${API_BASE_URL}/transactions/${id}`, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        
        const data = await handleResponse(response);
        
        // Update local data if needed
        if (typeof updateBalance === 'function' && data.balance) {
            updateBalance(data.balance);
        }
        
        return data;
    },
    
    // Get goals for the current user
    async getGoals() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Authentication required');
            }
            
            const response = await fetch(`${API_BASE_URL}/goals`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch goals');
            }
            
            const goals = await response.json();
            return goals;
        } catch (error) {
            console.error('Error fetching goals:', error);
            throw error;
        }
    },
    
    // Create a new goal
    async createGoal(goalData) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Authentication required');
            }
            
            const response = await fetch(`${API_BASE_URL}/goals`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(goalData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to create goal');
            }
            
            const goal = await response.json();
            return goal;
        } catch (error) {
            console.error('Error creating goal:', error);
            throw error;
        }
    },
    
    // Update a goal
    async updateGoal(goalId, { amount }) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Authentication required');
            }
            
            const response = await fetch(`${API_BASE_URL}/goals/${goalId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ amount })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update goal');
            }
            
            const goal = await response.json();
            return goal;
        } catch (error) {
            console.error('Error updating goal:', error);
            throw error;
        }
    },
    
    // Delete a goal
    async deleteGoal(goalId) {
        try {
            if (!goalId) {
                throw new Error('Goal ID is required');
            }
            
            // Make sure authentication token is available
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Authentication required');
            }
            
            // IMPORTANT: We need to find the contributions by checking transactions directly
            // The goal's current_amount may not accurately reflect all contributions
            console.log('Finding contributions for goal ID:', goalId);
            
            // Step 1: Get all transactions related to this goal
            let totalContributed = 0;
            let goalTitle = 'Unknown Goal';
            let foundContributions = false;
            
            try {
                // Get all transactions
                const transactionsResponse = await fetch(`${API_BASE_URL}/transactions`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (transactionsResponse.ok) {
                    const allTransactions = await transactionsResponse.json();
                    
                    // Filter for transactions related to this goal
                    // Look for both withdrawals (contributions) and corresponding goal transactions
                    console.log(`Searching through ${allTransactions.length} transactions for goal contributions...`);
                    
                    allTransactions.forEach(transaction => {
                        // Check for direct goal contributions (withdrawals from main balance)
                        if (transaction.type === 'Withdrawal' && 
                            transaction.title && 
                            transaction.title.includes('Goal Contribution')) {
                            
                            // Check if this transaction is for our specific goal
                            // We might need to check description or other fields depending on how they're stored
                            const goalIdRegex = new RegExp(`goal_id:${goalId}`, 'i');
                            const isForThisGoal = transaction.description && goalIdRegex.test(transaction.description);
                            
                            if (isForThisGoal || transaction.goal_id === goalId) {
                                // This is a contribution to our target goal
                                const amount = parseFloat(transaction.amount) || 0;
                                totalContributed += amount;
                                foundContributions = true;
                                
                                console.log(`Found contribution: $${amount}`);
                                
                                // Try to extract goal title if available
                                if (!goalTitle || goalTitle === 'Unknown Goal') {
                                    // Extract from transaction title or description
                                    const titleFromDesc = transaction.description && transaction.description.match(/for goal: (.*?)($|\s*\()/i);
                                    if (titleFromDesc && titleFromDesc[1]) {
                                        goalTitle = titleFromDesc[1].trim();
                                    } else if (transaction.title) {
                                        const titleFromTitle = transaction.title.match(/Goal Contribution - (.*?)($|\s*\()/i);
                                        if (titleFromTitle && titleFromTitle[1]) {
                                            goalTitle = titleFromTitle[1].trim();
                                        }
                                    }
                                }
                            }
                        }
                    });
                    
                    console.log(`Total contributions found: $${totalContributed} for goal: ${goalTitle}`);
                } else {
                    console.warn('Failed to fetch transactions to check for goal contributions');
                }
            } catch (error) {
                console.error('Error fetching transactions for goal contributions:', error);
                // Continue with deletion even if we can't find transactions
            }
            
            // Step 2: Now proceed with deleting the goal
            const deleteResponse = await fetch(`${API_BASE_URL}/goals/${goalId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            
            // Parse delete response
            let data;
            try {
                data = await deleteResponse.json();
            } catch (e) {
                // If JSON parsing fails, create a basic response object
                data = { success: deleteResponse.ok };
            }
            
            // Handle delete errors
            if (!deleteResponse.ok) {
                throw new Error(data.error || 'Failed to delete goal');
            }
            
            console.log('Goal deleted successfully');
            
            // Step 3: Create a refund transaction if we found contributions
            if (totalContributed > 0) {
                console.log(`Creating refund for $${totalContributed} for goal "${goalTitle}"`);
                
                try {
                    // Create the refund transaction
                    const refundTransaction = {
                        type: 'Deposit',
                        title: `Goal Refund`,
                        amount: totalContributed,
                        category: 'Refund|💰',
                        date: new Date().toISOString(),
                        description: `Refund from deleted goal: ${goalTitle}`
                    };
                    
                    console.log('Refund transaction details:', refundTransaction);
                    
                    // Create the refund transaction
                    const refundResponse = await fetch(`${API_BASE_URL}/transactions`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(refundTransaction)
                    });
                    
                    if (refundResponse.ok) {
                        console.log('Refund transaction created successfully');
                        const refundData = await refundResponse.json();
                        
                        // Add refund info to the response data
                        data.refundAmount = totalContributed;
                        data.refundTransaction = refundData;
                    } else {
                        console.error('Failed to create refund transaction:', 
                                     await refundResponse.text().catch(() => 'Unknown error'));
                    }
                } catch (refundError) {
                    console.error('Error creating refund transaction:', refundError);
                }
            } else {
                console.log('No refund created - could not find contributions for this goal');
            }
            
            // Return the response data (including refund info if applicable)
            return data;
        } catch (error) {
            console.error('Error deleting goal:', error);
            throw error;
        }
    },
    
    // Add money to a goal
    async addMoneyToGoal(goalId, amount) {
        try {
            const response = await fetch(`${API_BASE_URL}/goals/${goalId}/add`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ amount })
            });
            if (!response.ok) throw new Error('Failed to add money to goal');
            return response.json();
        } catch (error) {
            console.error('Error adding money to goal:', error);
            throw error;
        }
    },
    
    // Login method
    async login(email, password) {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await handleResponse(response);
        
        // Store token in localStorage for persistence
        if (data.token) {
            localStorage.setItem('token', data.token);
        }
        
        return data;
    },
    
    // Signup method
    async signup(userData) {
        const response = await fetch(`${API_BASE_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        
        const data = await handleResponse(response);
        
        // Store token in localStorage for persistence
        if (data.token) {
            localStorage.setItem('token', data.token);
        }
        
        return data;
    },
    
    // Check if user is authenticated
    isAuthenticated() {
        return !!getToken();
    },
    
    // Create a recurring deposit for a goal
    async createRecurringPayment(paymentData) {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Authentication required');
        }
        
        const response = await fetch(`${API_BASE_URL}/goals/${paymentData.goalId}/recurring`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                amount: paymentData.amount, 
                frequency: paymentData.frequency
            })
        });
        
        return handleResponse(response);
    },
    
    // Get recurring deposits for a goal
    async getRecurringDeposits(goalId) {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Authentication required');
        }
        
        const response = await fetch(`${API_BASE_URL}/goals/${goalId}/recurring`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        return handleResponse(response);
    },
    
    // Delete a recurring deposit
    async deleteRecurringDeposit(id) {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Authentication required');
        }
        
        const response = await fetch(`${API_BASE_URL}/recurring-payments/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        return handleResponse(response);
    },
    
    // Get transactions by category (combines goal and regular transactions)
    async getTransactionsByCategory(startDate, endDate) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Authentication required');
            }
            
            let url = `${API_BASE_URL}/transactions/by-category`;
            
            // Add date parameters if provided
            if (startDate && endDate) {
                url += `?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;
            }
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch transactions by category');
            }
            
            const data = await response.json();
            return data.categories || [];
        } catch (error) {
            console.error('Error fetching transactions by category:', error);
            throw error;
        }
    },
    
    // Get all recurring payments
    async getRecurringPayments() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('Authentication required');
            }
            
            const response = await fetch(`${API_BASE_URL}/recurring-payments`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch recurring payments');
            }
            
            const data = await response.json();
            
            // Also fetch all transactions to check for recurring ones
            const transactions = await this.getTransactions();
            
            // Find recurring transactions that might not be in the recurring payments list
            const recurringTransactions = transactions.filter(transaction => {
                return transaction.recurring && transaction.recurring !== 'one-time';
            });
            
            // Convert recurring transactions to recurring payment format
            const additionalRecurringPayments = recurringTransactions.map(transaction => {
                return {
                    id: transaction.id,
                    title: transaction.title,
                    description: transaction.title,
                    amount: transaction.amount,
                    frequency: transaction.recurring || 'monthly', 
                    category: transaction.category,
                    type: transaction.type,
                    last_payment_date: transaction.date,
                    // Ensure recurring payments are treated as indefinite
                    end_date: null, // No end date means indefinite
                    status: 'active'
                };
            });
            
            // Merge both arrays, ensuring no duplicates
            const allRecurringPayments = [...(data.payments || [])];
            
            // Add in any recurring transactions not already in the payments array
            additionalRecurringPayments.forEach(payment => {
                const exists = allRecurringPayments.some(p => p.id === payment.id);
                if (!exists) {
                    allRecurringPayments.push(payment);
                }
            });
            
            return allRecurringPayments;
        } catch (error) {
            console.error('Error fetching recurring payments:', error);
            throw error;
        }
    }
};

// Make API object globally available
window.api = api;
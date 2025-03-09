/**
 * Common utility functions for Vaultly application
 */

// Format currency values
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

// Format date strings
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Extract clean category name (similar to getCategoryNameFromGoal in goals.js)
function getCategoryName(category) {
    if (!category) return 'Other';
    
    // If category contains a pipe (emoji|name format), extract just the name
    if (category.includes('|')) {
        const parts = category.split('|');
        return parts[1].trim();
    }
    
    // If category contains a space (emoji name format), extract just the name
    if (category.includes(' ')) {
        const parts = category.split(' ');
        return parts.slice(1).join(' ').trim();
    }
    
    // If no delimiter found, return as is
    return category;
}

// Show error message in a standardized way
function showError(message, duration = 5000) {
    // Check if error container exists, create if not
    let errorContainer = document.getElementById('error-container');
    if (!errorContainer) {
        errorContainer = document.createElement('div');
        errorContainer.id = 'error-container';
        errorContainer.style.position = 'fixed';
        errorContainer.style.top = '20px';
        errorContainer.style.left = '50%';
        errorContainer.style.transform = 'translateX(-50%)';
        errorContainer.style.backgroundColor = '#f44336';
        errorContainer.style.color = 'white';
        errorContainer.style.padding = '15px 20px';
        errorContainer.style.borderRadius = '5px';
        errorContainer.style.zIndex = '1000';
        errorContainer.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        document.body.appendChild(errorContainer);
    }
    
    // Set message and show
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
    
    // Hide after duration
    setTimeout(() => {
        errorContainer.style.display = 'none';
    }, duration);
}

// Check authentication status
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../resource/login.html';
        return false;
    }
    return true;
}

// Sign out function
function signOut() {
    localStorage.removeItem('token');
    window.location.href = '../resource/login.html';
}

// Set up common event listeners
function setupCommonListeners() {
    // Set up sign out button if present
    const signOutBtn = document.querySelector('.signout-btn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', signOut);
    }
}

// Initialize common elements when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication on page load
    if (!checkAuth()) return;
    
    // Set up common event listeners
    setupCommonListeners();
}); 
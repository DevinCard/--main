// Protect routes that require authentication
function checkAuth() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    return !!token; // Just return true/false without redirecting
}

function signOut() {
    // Clear both storage types to be safe
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    
    // Redirect to login page
    window.location.href = '/index.html';
}

// Add event listener to signout button when document loads
document.addEventListener('DOMContentLoaded', () => {
    const signoutBtn = document.querySelector('.signout-btn');
    if (signoutBtn) {
        signoutBtn.addEventListener('click', signOut);
    }
});

// Make functions globally available
window.checkAuth = checkAuth;
window.signOut = signOut; 
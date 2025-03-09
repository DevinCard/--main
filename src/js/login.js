document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    if (!loginForm) {
        console.error("Login form not found!");
        return;
    }

    loginForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        try {
            // Show loading state
            const submitButton = loginForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Logging in...';

            const email = document.getElementById("login-email").value.trim();
            const password = document.getElementById("login-password").value;

            const response = await fetch('http://localhost:3001/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Login failed");
            }

            // Store token in localStorage for persistence
            if (data.token) {
                localStorage.setItem('token', data.token);
                // Redirect to dashboard
                window.location.href = 'dashboard.html';
            }
        } catch (error) {
            console.error('Login error:', error);
            // Show error message to user
            const errorMessage = error.message || "Login failed. Please try again.";
            alert(errorMessage);
        } finally {
            // Reset button state
            const submitButton = loginForm.querySelector('button[type="submit"]');
            submitButton.disabled = false;
            submitButton.textContent = 'Login';
        }
    });
}); 
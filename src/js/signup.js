document.addEventListener("DOMContentLoaded", () => {
    console.log("Signup.js is loaded!");
    const signupForm = document.getElementById("signup-form");

    if (!signupForm) {
        console.error("Signup form not found!");
        return;
    }

    // Add input event listener for confirm password
    const confirmPasswordInput = document.getElementById("confirm-password");
    const passwordInput = document.getElementById("password");

    if (confirmPasswordInput && passwordInput) {
        confirmPasswordInput.addEventListener('input', () => {
            const confirmPassword = confirmPasswordInput.value;
            const password = passwordInput.value;

            const errorElement = document.getElementById("confirm-password-error");
            
            if (confirmPassword && password && confirmPassword !== password) {
                errorElement.textContent = "Passwords do not match";
                errorElement.classList.add('show');
            } else {
                errorElement.textContent = "";
                errorElement.classList.remove('show');
            }
        });
    }

    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        resetErrors();

        // Get form elements with correct IDs
        const usernameInput = document.getElementById("full-name");
        const emailInput = document.getElementById("email-address");
        const passwordInput = document.getElementById("password");
        const confirmPasswordInput = document.getElementById("confirm-password");

        // Check if elements exist
        if (!usernameInput || !emailInput || !passwordInput || !confirmPasswordInput) {
            console.error("Required form fields not found!");
            return;
        }

        const formData = {
            username: usernameInput.value.trim(),
            email: emailInput.value.trim(),
            password: passwordInput.value,
            confirmPassword: confirmPasswordInput.value
        };

        // Validate passwords match
        if (formData.password !== formData.confirmPassword) {
            showError("password", "Passwords do not match");
            return;
        }

        // Validate all fields are filled
        if (!formData.username || !formData.email || !formData.password) {
            showError("signup", "All fields are required");
            return;
        }

        try {
            const response = await fetch('http://localhost:3001/api/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: formData.username,
                    email: formData.email,
                    password: formData.password
                })
            });

            const data = await response.json();

            if (!response.ok) {
                showError("signup", data.error);
                return;
            }

            localStorage.setItem('token', data.token);
            alert("Signup successful!");
            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error('Signup error:', error);
            showError("signup", "An error occurred. Please try again.");
        }
    });

    function showError(field, message) {
        const errorElement = document.getElementById(`${field}-error`);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('show');
        } else {
            alert(message); // Fallback if error element not found
        }
    }

    function resetErrors() {
        const errorElements = document.querySelectorAll('.error-message');
        errorElements.forEach(el => {
            el.textContent = '';
            el.classList.remove('show');
        });
    }
});
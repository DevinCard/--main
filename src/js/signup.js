document.addEventListener("DOMContentLoaded", () => {
    console.log("Signup.js is loaded!");
    const signupForm = document.getElementById("signup-form");

    if (!signupForm) {
        console.error("Signup form not found!");
        return;
    }

    // Form element references
    const fullNameInput = document.getElementById("first-name"); // Note the ID is first-name, not full-name
    const emailInput = document.getElementById("email-address");
    const passwordInput = document.getElementById("password");
    const confirmPasswordInput = document.getElementById("confirm-password");

    // Add input validation for email
    if (emailInput) {
        emailInput.addEventListener('input', () => {
            validateEmail(emailInput.value);
        });
    }

    // Add input validation for password
    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            validatePassword(passwordInput.value);
        });
    }

    // Add input event listener for confirm password
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

        // Check if elements exist
        if (!fullNameInput || !emailInput || !passwordInput || !confirmPasswordInput) {
            console.error("Required form fields not found!");
            return;
        }

        const formData = {
            username: fullNameInput.value.trim(),
            email: emailInput.value.trim(),
            password: passwordInput.value,
            confirmPassword: confirmPasswordInput.value
        };

        // Run all validations
        const isFullNameValid = validateFullName(formData.username);
        const isEmailValid = validateEmail(formData.email);
        const isPasswordValid = validatePassword(formData.password);
        const doPasswordsMatch = validatePasswordsMatch(formData.password, formData.confirmPassword);

        // If any validation fails, stop form submission
        if (!isFullNameValid || !isEmailValid || !isPasswordValid || !doPasswordsMatch) {
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

    function validateFullName(name) {
        if (!name) {
            showError("full-name", "Full name is required");
            return false;
        }
        if (name.length < 2) {
            showError("full-name", "Name must be at least 2 characters");
            return false;
        }
        return true;
    }

    function validateEmail(email) {
        if (!email) {
            showError("email", "Email is required");
            return false;
        }
        
        // Basic email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showError("email", "Please enter a valid email address");
            return false;
        }
        
        return true;
    }

    function validatePassword(password) {
        if (!password) {
            showError("password", "Password is required");
            return false;
        }
        
        if (password.length < 8) {
            showError("password", "Password must be at least 8 characters");
            return false;
        }
        
        // Check for a strong password (at least one uppercase, one lowercase, one number)
        const hasUppercase = /[A-Z]/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        
        if (!(hasUppercase && hasLowercase && hasNumber)) {
            showError("password", "Password must include uppercase, lowercase, and numbers");
            return false;
        }
        
        return true;
    }

    function validatePasswordsMatch(password, confirmPassword) {
        if (password !== confirmPassword) {
            showError("confirm-password", "Passwords do not match");
            return false;
        }
        return true;
    }

    function showError(field, message) {
        const errorElement = document.getElementById(`${field}-error`);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('show');
        } else {
            console.error(`Error element for ${field} not found`);
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
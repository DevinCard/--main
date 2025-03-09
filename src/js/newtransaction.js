// Define global functions first
window.addTransactionToDisplay = function(transaction) {
    const transactionDisplay = document.getElementById("transaction-display");
    const transactionElement = document.createElement("div");
    transactionElement.classList.add("transaction-item");

    // Create main transaction content
    const transactionContent = document.createElement("div");
    transactionContent.classList.add("transaction-content");

    // Get the category and emoji
    let emoji;
    let originalCategory = transaction.category;
    let cleanCategory = extractCategoryName(transaction.category);
    
    // Determine the emoji
    if (originalCategory.includes(' ') || originalCategory.includes('|')) {
        // Extract emoji from the format
        if (originalCategory.includes('|')) {
            emoji = originalCategory.split('|')[0].trim();
        } else if (originalCategory.includes(' ')) {
            emoji = originalCategory.split(' ')[0].trim();
        }
    } else {
        const emojiMap = {
            Food: "🍔",
            Transport: "🚌",
            Utilities: "💡",
            Custom: "📝",
            Other: "💰"
        };
        emoji = emojiMap[cleanCategory] || "💰";
    }

    const sign = transaction.type === "Deposit" ? "+" : "-";
    const formattedDate = new Date(transaction.date).toLocaleDateString('en-GB');

    transactionContent.style.color = transaction.type === "Deposit" ? "green" : "red";
    transactionContent.textContent = `${emoji} ${sign}$${transaction.amount.toFixed(2)} | ${formattedDate} | ${transaction.title}`;

    // Create three-dot menu
    const menuButton = document.createElement("button");
    menuButton.classList.add("menu-dots");
    menuButton.textContent = "⋮";
    menuButton.onclick = () => showEditModal({...transaction, category: cleanCategory});

    // Combine elements
    transactionElement.appendChild(transactionContent);
    transactionElement.appendChild(menuButton);
    transactionElement.setAttribute("data-category", cleanCategory);
    transactionDisplay.appendChild(transactionElement);
};

window.filterTransactions = async function() {
    const searchInput = document.getElementById("transaction-search").value.toLowerCase();
    const categoryFilter = document.getElementById("category-filter").value;

    try {
        const transactions = await api.getTransactions();
        const transactionDisplay = document.getElementById("transaction-display");
        transactionDisplay.innerHTML = '';

        transactions.forEach(transaction => {
            // Extract category name consistently
            let categoryName = extractCategoryName(transaction.category);

            const matchesSearch = 
                transaction.title.toLowerCase().includes(searchInput) || 
                categoryName.toLowerCase().includes(searchInput);

            const matchesCategory = 
                categoryFilter === "" || 
                categoryName === categoryFilter;

            if (matchesSearch && matchesCategory) {
                window.addTransactionToDisplay(transaction);
            }
        });
    } catch (error) {
        console.error('Error filtering transactions:', error);
    }
};

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

window.showEditModal = function(transaction) {
    const modal = document.getElementById("transaction-modal");
    const modalTitle = document.getElementById("modal-title");
    const form = document.getElementById("transaction-form");
    const deleteBtn = document.getElementById("delete-transaction-btn");

    modalTitle.textContent = "Edit Transaction";
    
    // Pre-fill the form with transaction data
    document.getElementById("transaction-type").value = transaction.type;
    document.getElementById("transaction-title").value = transaction.title;
    document.getElementById("transaction-date").value = transaction.date;
    document.getElementById("transaction-amount").value = transaction.amount;
    document.getElementById("transaction-recurring").value = transaction.recurring || 'one-time';

    // Handle recurring settings
    const customRecurringGroup = document.getElementById('custom-recurring-group');
    if (transaction.recurring === 'custom' && transaction.recurrence_interval) {
        customRecurringGroup.classList.remove('hidden');
        const [interval, unit] = transaction.recurrence_interval.split('-');
        document.getElementById('recurring-interval').value = interval;
        document.getElementById('recurring-unit').value = unit;
    } else {
        customRecurringGroup.classList.add('hidden');
    }

    // Handle category selection
    const categorySelect = document.getElementById("transaction-category");
    const customCategoryGroup = document.getElementById("custom-category-group");
    const customCategoryName = document.getElementById("custom-category-name");
    const customEmoji = document.getElementById("custom-emoji");

    if (transaction.category.includes(' ')) {
        categorySelect.value = "Custom";
        customCategoryGroup.classList.remove("hidden");
        const [emoji, ...nameParts] = transaction.category.split(' ');
        customEmoji.value = emoji;
        customCategoryName.value = nameParts.join(' ');
    } else {
        categorySelect.value = transaction.category;
        customCategoryGroup.classList.add("hidden");
    }

    // Store the transaction ID for the update
    form.setAttribute("data-editing-id", transaction.id);
    
    // Show the delete button and set up event listener
    if (deleteBtn) {
        deleteBtn.classList.remove("hidden");
        // Remove any existing event listeners
        deleteBtn.replaceWith(deleteBtn.cloneNode(true));
        // Get the new button reference
        const newDeleteBtn = document.getElementById("delete-transaction-btn");
        newDeleteBtn.addEventListener("click", () => handleDeleteTransaction(transaction.id));
    }

    // Show the modal
    modal.classList.remove("hidden");
};

// Add this function at the top with other window functions
window.selectEmoji = function(emoji) {
    const emojiInput = document.getElementById('custom-emoji');
    if (emojiInput) {
        emojiInput.value = emoji;
    }
    const emojiPicker = document.querySelector('.emoji-picker');
    if (emojiPicker) {
        emojiPicker.remove();
    }
};

// Add this function to create and show the emoji picker
function showEmojiPicker(inputElement) {
    // Remove any existing emoji picker
    const existingPicker = document.querySelector('.emoji-picker');
    if (existingPicker) {
        existingPicker.remove();
    }

    const emojiPicker = document.createElement('div');
    emojiPicker.className = 'emoji-picker';

    // Common emojis for financial categories
    const emojis = ['💰', '🏦', '🍔', '🚌', '💡', '🏠', '🎮', '👕', '💊', '📚', 
                    '✈️', '🎬', '🎵', '🏋️', '🎨', '🎁', '💝', '🛒', '💻', '📱'];

    emojis.forEach(emoji => {
        const button = document.createElement('button');
        button.textContent = emoji;
        button.onclick = (e) => {
            e.stopPropagation();
            selectEmoji(emoji);
        };
        emojiPicker.appendChild(button);
    });

    // Position the picker relative to the modal
    const modalContent = document.querySelector('.modal-content');
    modalContent.style.position = 'relative'; // Ensure relative positioning
    
    const rect = inputElement.getBoundingClientRect();
    const modalRect = modalContent.getBoundingClientRect();
    
    emojiPicker.style.position = 'absolute';
    emojiPicker.style.top = `${rect.bottom - modalRect.top + 5}px`;
    emojiPicker.style.left = `${rect.left - modalRect.left}px`;
    emojiPicker.style.zIndex = '1000';

    modalContent.appendChild(emojiPicker);

    // Close picker when clicking outside
    document.addEventListener('click', function closeEmojiPicker(e) {
        if (!emojiPicker.contains(e.target) && e.target !== inputElement) {
            emojiPicker.remove();
            document.removeEventListener('click', closeEmojiPicker);
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await loadInitialTransactions();
        
        // Add event listeners
        const form = document.getElementById('transaction-form');
        if (form) {
            form.addEventListener('submit', handleTransactionSubmit);
        }

        const closeBtn = document.getElementById('close-modal-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }

        const newTransactionBtn = document.getElementById('new-transaction-btn');
        if (newTransactionBtn) {
            newTransactionBtn.addEventListener('click', () => showModal());
        }

        // Add category change listener
        const categorySelect = document.getElementById('transaction-category');
        if (categorySelect) {
            categorySelect.addEventListener('change', handleCategoryChange);
        }

        // Add emoji picker trigger
        const emojiInput = document.getElementById('custom-emoji');
        if (emojiInput) {
            emojiInput.addEventListener('click', (e) => {
                e.stopPropagation();
                showEmojiPicker(emojiInput);
            });
        }

        // Add recurring change listener
        const recurringSelect = document.getElementById('transaction-recurring');
        if (recurringSelect) {
            recurringSelect.addEventListener('change', handleRecurringChange);
        }
    } catch (error) {
        console.error('Error initializing:', error);
    }
});

async function loadInitialTransactions() {
    try {
        const transactions = await api.getTransactions();
        const transactionDisplay = document.getElementById("transaction-display");
        
        if (!transactionDisplay) {
            console.error('Transaction display element not found');
            return;
        }

        // Clear existing transactions
        transactionDisplay.innerHTML = '';
        
        // Add each transaction to the display
        transactions.forEach(transaction => {
            window.addTransactionToDisplay(transaction);
        });
    } catch (error) {
        console.error('Error loading initial transactions:', error);
    }
}

function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function showModal(type = 'deposit') {
    const modal = document.getElementById('transaction-modal');
    const form = document.getElementById('transaction-form');
    const dateInput = document.getElementById('transaction-date');
    const deleteBtn = document.getElementById('delete-transaction-btn');
    const modalTitle = document.getElementById('modal-title');
    
    if (!modal || !form) return;
    
    // Reset form and show modal
    form.reset();
    form.removeAttribute('data-editing-id');
    modal.classList.remove('hidden');
    
    // Hide delete button for new transactions
    if (deleteBtn) {
        deleteBtn.classList.add('hidden');
    }
    
    // Set title to "New Transaction"
    if (modalTitle) {
        modalTitle.textContent = 'New Transaction';
    }
    
    // Set current date
    if (dateInput) {
        const today = new Date();
        dateInput.max = formatDate(today);
        dateInput.value = formatDate(today);
    }
}

function closeModal() {
    const modal = document.getElementById('transaction-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Make functions globally available
window.showModal = showModal;
window.closeModal = closeModal;

function handleCategoryChange(event) {
    const customCategoryGroup = document.getElementById('custom-category-group');
    if (event.target.value === 'Custom') {
        customCategoryGroup.classList.remove('hidden');
    } else {
        customCategoryGroup.classList.add('hidden');
    }
}

async function saveCustomCategory(name, emoji) {
    try {
        await api.saveCategory(name, emoji);
        await loadSavedCategories(); // Refresh categories after saving
        return true;
    } catch (error) {
        console.error('Error saving custom category:', error);
        return false;
    }
}

async function loadSavedCategories() {
    try {
        const categories = await api.getCategories();
        const categorySelect = document.getElementById('transaction-category');
        const categoryFilter = document.getElementById('category-filter');
        
        // Clear existing options
        categorySelect.innerHTML = '';
        categoryFilter.innerHTML = '<option value="">All Categories</option>';
        
        if (!categories || !Array.isArray(categories)) {
            console.error('Invalid categories data received:', categories);
            return;
        }

        categories.forEach(category => {
            if (!category.name || !category.emoji) {
                console.error('Invalid category data:', category);
                return;
            }
        // Load initial transactions
            // Add to transaction dropdown
            const transactionOption = document.createElement('option');
            transactionOption.value = category.is_default ? category.name : `${category.emoji} ${category.name}`;
            transactionOption.textContent = `${category.emoji} ${category.name}`;
            categorySelect.appendChild(transactionOption);
            // Add to filter dropdown
            // Add to filter dropdown
            const filterOption = document.createElement('option');
            filterOption.value = category.name;
            filterOption.textContent = `${category.emoji} ${category.name}`;
            categoryFilter.appendChild(filterOption);
        });

        // Add the Custom option at the end of transaction dropdown
        const customOption = document.createElement('option');
        customOption.value = 'Custom';
        customOption.textContent = '➕ Add Custom Category';
        categorySelect.appendChild(customOption);
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

function handleRecurringChange(event) {
    const customRecurringGroup = document.getElementById('custom-recurring-group');
    if (event.target.value === 'custom') {
        customRecurringGroup.classList.remove('hidden');
    } else {
        customRecurringGroup.classList.add('hidden');
    }
}

async function handleTransactionSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const editingId = form.getAttribute('data-editing-id');
    
    const type = document.getElementById('transaction-type').value;
    const title = document.getElementById('transaction-title').value;
    const date = document.getElementById('transaction-date').value;
    const amount = parseFloat(document.getElementById('transaction-amount').value);
    const recurring = document.getElementById('transaction-recurring').value;
    
    let recurrenceInterval = null;
    if (recurring === 'custom') {
        const interval = document.getElementById('recurring-interval').value;
        const unit = document.getElementById('recurring-unit').value;
        recurrenceInterval = `${interval}-${unit}`;
    }
    
    let category = document.getElementById('transaction-category').value;
    
    // Handle custom category
    if (category === 'Custom') {
        const customName = document.getElementById('custom-category-name').value;
        const customEmoji = document.getElementById('custom-emoji').value;
        
        if (!customName || !customEmoji) {
            alert('Please fill in both category name and emoji');
            return;
        }
        
        // Save the custom category
        await saveCustomCategory(customName, customEmoji);
        category = `${customEmoji} ${customName}`;
    }
    
    const transaction = {
        type,
        title,
        date,
        category,
        amount,
        recurring,
        recurrenceInterval
    };

    try {
        if (editingId) {
            // Handle edit - pass ID and transaction data separately
            await api.updateTransaction(editingId, transaction);
        } else {
            // Handle new transaction
            await api.addTransaction(transaction);
        }
        
        // Refresh the transaction display
        await loadInitialTransactions();
        
        // Close modal and reset form
        closeModal();
        form.reset();
        form.removeAttribute('data-editing-id');
    } catch (error) {
        console.error('Error submitting transaction:', error);
        alert('Failed to save transaction. Please try again.');
    }
}

async function populateFormForEdit(transaction) {
    const form = document.getElementById('transaction-form');
    form.setAttribute('data-editing-id', transaction.id);
    
    document.getElementById('transaction-type').value = transaction.type;
    document.getElementById('transaction-title').value = transaction.title;
    document.getElementById('transaction-date').value = transaction.date;
    document.getElementById('transaction-amount').value = transaction.amount;
    document.getElementById('transaction-category').value = transaction.category;
    document.getElementById('transaction-recurring').value = transaction.recurring || 'one-time';

    // Handle custom recurring settings
    if (transaction.recurring === 'custom' && transaction.recurrence_interval) {
        const [interval, unit] = transaction.recurrence_interval.split('-');
        const customGroup = document.getElementById('custom-recurring-group');
        customGroup.classList.remove('hidden');
        document.getElementById('recurring-interval').value = interval;
        document.getElementById('recurring-unit').value = unit;
    }
}

// Add delete transaction handler
async function handleDeleteTransaction(transactionId) {
    if (confirm('Are you sure you want to delete this transaction?')) {
        try {
            await api.deleteTransaction(transactionId);
            await loadInitialTransactions();
            closeModal();
        } catch (error) {
            console.error('Error deleting transaction:', error);
            alert('Failed to delete transaction. Please try again.');
        }
    }
}
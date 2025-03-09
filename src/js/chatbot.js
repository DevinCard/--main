// Vaultly AI Assistant Chatbot
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load chatbot HTML from external file
        const response = await fetch('../html/chatbot.html');
        const chatbotHTML = await response.text();
        
        // Append the HTML to the body
        const chatbotWrapper = document.createElement('div');
        chatbotWrapper.id = 'vaultly-chatbot';
        chatbotWrapper.innerHTML = chatbotHTML;
        document.body.appendChild(chatbotWrapper);
        
        // Get DOM elements
        const chatbotToggle = document.querySelector('.chatbot-toggle');
        const chatbotContainer = document.querySelector('.chatbot-container');
        const chatbotClose = document.querySelector('.chatbot-close');
        const chatbotMessages = document.querySelector('.chatbot-messages');
        const chatbotInput = document.querySelector('.chatbot-input input');
        const chatbotSend = document.querySelector('.chatbot-send');
        
        // Toggle chatbot visibility
        chatbotToggle.addEventListener('click', () => {
            chatbotContainer.classList.add('active');
            if (chatbotMessages.children.length === 0) {
                // Add initial welcome message
                addBotMessage("👋 Hi there! I'm your Vaultly Assistant. I can help you manage your finances and navigate the app. How can I help you today?");
            }
            chatbotInput.focus();
        });
        
        // Close chatbot
        chatbotClose.addEventListener('click', () => {
            chatbotContainer.classList.remove('active');
        });
        
        // Send message
        function sendMessage() {
            const userMessage = chatbotInput.value.trim();
            if (userMessage === '') return;
            
            // Add user message to chat
            addUserMessage(userMessage);
            
            // Clear input
            chatbotInput.value = '';
            
            // Show typing indicator
            showTypingIndicator();
            
            // Send to API
            processUserMessage(userMessage);
        }
        
        // Event listeners for sending messages
        chatbotSend.addEventListener('click', sendMessage);
        chatbotInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        // Add a message from the bot
        function addBotMessage(message) {
            const messageElement = document.createElement('div');
            messageElement.className = 'message bot';
            messageElement.textContent = message;
            chatbotMessages.appendChild(messageElement);
            scrollToBottom();
        }
        
        // Add a message from the user
        function addUserMessage(message) {
            const messageElement = document.createElement('div');
            messageElement.className = 'message user';
            messageElement.textContent = message;
            chatbotMessages.appendChild(messageElement);
            scrollToBottom();
        }
        
        // Show typing indicator
        function showTypingIndicator() {
            const typingIndicator = document.createElement('div');
            typingIndicator.className = 'typing-indicator';
            typingIndicator.innerHTML = `
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            `;
            typingIndicator.id = 'typing-indicator';
            chatbotMessages.appendChild(typingIndicator);
            scrollToBottom();
        }
        
        // Hide typing indicator
        function hideTypingIndicator() {
            const typingIndicator = document.getElementById('typing-indicator');
            if (typingIndicator) {
                typingIndicator.remove();
            }
        }
        
        // Auto-scroll to the bottom of the chat
        function scrollToBottom() {
            chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
        }
        
        // Process message with API
        async function processUserMessage(message) {
            try {
                // Get user data for context
                const userData = await getUserDataForContext();
                
                // In a real implementation, this would call your backend that securely handles the API key
                const response = await fetchAIResponse(message, userData);
                
                // Hide typing indicator
                hideTypingIndicator();
                
                // Add bot response
                addBotMessage(response);
                
            } catch (error) {
                console.error('Error processing message:', error);
                
                // Hide typing indicator
                hideTypingIndicator();
                
                // Show error message
                addBotMessage("I'm sorry, I couldn't process your request at the moment. Please try again later.");
            }
        }
        
        // Get user data to provide context to the AI
        async function getUserDataForContext() {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    return {};
                }
                
                // Fetch essential user data in parallel
                const [balanceData, transactionsData, goalsData, categoriesData] = await Promise.all([
                    fetch('/api/transactions/balance', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }).then(res => res.json()).catch(() => ({ balance: 'unknown' })),
                    
                    fetch('/api/transactions/recent', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }).then(res => res.json()).catch(() => []),
                    
                    fetch('/api/goals', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }).then(res => res.json()).catch(() => []),
                    
                    fetch('/api/categories', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }).then(res => res.json()).catch(() => [])
                ]);
                
                // Format transactions data
                const recentTransactions = transactionsData.slice(0, 5).map(t => ({
                    title: t.title,
                    amount: t.amount,
                    category: t.category,
                    date: t.date
                }));
                
                // Format goals data
                const activeGoals = goalsData.map(g => ({
                    title: g.title,
                    target: g.target_amount,
                    current: g.current_amount,
                    category: g.category
                }));
                
                // Prepare user context
                return {
                    balance: balanceData.balance,
                    recentTransactions,
                    activeGoals,
                    categories: categoriesData,
                    lastActive: new Date().toISOString()
                };
            } catch (error) {
                console.error('Error fetching user data for context:', error);
                return {};
            }
        }
        
        // Call the AI API
        async function fetchAIResponse(message, userData) {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    return "Please log in to use the AI assistant.";
                }

                // Call our backend API that securely handles OpenAI integration
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ 
                        message,
                        userData
                    })
                });

                if (!response.ok) {
                    // If the main AI endpoint fails, try the fallback
                    return await fetchFallbackResponse(message);
                }

                const data = await response.json();
                return data.response;
            } catch (error) {
                console.error('Error fetching AI response:', error);
                // If any error occurs, use the fallback
                return await fetchFallbackResponse(message);
            }
        }

        // Fallback function for when the OpenAI API is unavailable or fails
        async function fetchFallbackResponse(message) {
            try {
                const token = localStorage.getItem('token');
                
                const response = await fetch('/api/ai/chat-fallback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ message })
                });

                if (!response.ok) {
                    return "I'm sorry, I'm having trouble processing your request right now. Please try again later.";
                }

                const data = await response.json();
                return data.response;
            } catch (error) {
                console.error('Error fetching fallback response:', error);
                return "I'm sorry, I'm having trouble connecting right now. Please try again later.";
            }
        }
    } catch (error) {
        console.error('Failed to initialize chatbot:', error);
    }
});

// Add OpenAI API integration - this would typically be handled by your backend
async function callOpenAI(message, context) {
    // This is a placeholder function - in a real implementation, you would make a request to your backend
    // which would securely call the OpenAI API with your API key
    
    // Example of the request format for reference:
    /*
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}` // Never expose your API key in client-side code
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: `You are a helpful assistant for Vaultly, a personal finance application. 
                             Help users understand how to use the app's features. 
                             Here is information about Vaultly's features: ${JSON.stringify(context)}`
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            max_tokens: 150
        })
    });
    
    const data = await response.json();
    return data.choices[0].message.content;
    */
    
    // Placeholder for demonstration
    return "This is a placeholder response. In a real implementation, this would be a response from the OpenAI API.";
} 
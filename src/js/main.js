// Function to load the chatbot on all pages
function loadChatbot() {
    // Check if we're on a logged-in page (any page except index.html, signup.html, login.html)
    const currentPath = window.location.pathname;
    const publicPages = ['/index.html', '/signup.html', '/login.html', '/'];
    const isPublicPage = publicPages.some(page => currentPath.endsWith(page));
    
    if (isPublicPage) {
        // Don't load chatbot on public pages
        return;
    }
    
    // Load chatbot CSS
    const chatbotCSS = document.createElement('link');
    chatbotCSS.rel = 'stylesheet';
    chatbotCSS.href = '../style/chatbot.css';
    document.head.appendChild(chatbotCSS);
    
    // Load chatbot JS
    const chatbotScript = document.createElement('script');
    chatbotScript.src = '../js/chatbot.js';
    document.body.appendChild(chatbotScript);
}

// Run when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    loadChatbot();
}); 
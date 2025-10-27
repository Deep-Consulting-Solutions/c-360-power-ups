// Configuration file for C-360 Timer Power-Up

// Task categories for your team
const CATEGORIES = [
    'Copywriting',
    'Project Management',
    'Account Management',
    'PR',
    'Design'
];

// User ID to default category mapping
// Map Trello user IDs to their primary role categories
// To find user IDs:
// 1. Open a card where the user is a member
// 2. Click on their avatar
// 3. Look at the URL - it will contain their username
// 4. Or use the Trello API to get the actual user ID
const USER_CATEGORY_MAPPING = {
    // Examples - replace with actual Trello user IDs
    // 'user_id_1': 'Copywriting',
    // 'user_id_2': 'Design',
    // 'user_id_3': 'Project Management',
    // 'user_id_4': 'Account Management',
    // 'user_id_5': 'PR',

    // You can also use Trello usernames as keys
    // 'johndoe': 'Copywriting',
    // 'janedoe': 'Design',
};

// N8N Webhook Configuration
const N8N_CONFIG = {
    // Replace these with your actual N8N webhook URLs
    startTimerUrl: 'https://c360-staging-flows.app.n8n.cloud/webhook/staging/start-timer',
    stopTimerUrl: 'https://c360-staging-flows.app.n8n.cloud/webhook/staging/stop-timer',
    createChildCardsUrl: 'https://c360-staging-flows.app.n8n.cloud/webhook/create-child-cards',

    // Replace with your actual API key
    // For production, consider using environment variables
    apiKey: 'your-api-key-here'
};

// API Request Configuration
const API_CONFIG = {
    timeout: 10000, // 10 seconds timeout
    retryAttempts: 2,
    retryDelay: 1000 // 1 second delay between retries
};

// Export for use in other modules (if using module system)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CATEGORIES,
        USER_CATEGORY_MAPPING,
        N8N_CONFIG,
        API_CONFIG
    };
}
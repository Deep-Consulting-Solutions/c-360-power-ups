// Configuration file for C-360 Timer Power-Up
// This file is auto-generated during build - DO NOT EDIT MANUALLY
// Generated at: 2025-10-27T16:18:15.097Z
// Environment: staging

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

// N8N Webhook Configuration (injected from environment variables)
const N8N_CONFIG = {
    startTimerUrl: 'https://c360-staging-flows.app.n8n.cloud/webhook/staging/start-timer',
    stopTimerUrl: 'https://c360-staging-flows.app.n8n.cloud/webhook/staging/stop-timer',
    createChildCardsUrl: 'https://c360-staging-flows.app.n8n.cloud/webhook/staging/create-child-cards',
    apiKey: 'client-c360-staging@esatest.click'
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

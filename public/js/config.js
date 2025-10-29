// Configuration file for C-360 Timer Power-Up
// This file is auto-generated during build - DO NOT EDIT MANUALLY
// Generated at: 2025-10-29T05:31:53.544Z
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
    apiKey: 'pyuO7lPDzbIZePkKNMEhgr7kVg3aG2LF'
};

// Harvest API Configuration (injected from environment variables)
const HARVEST_CONFIG = {
    accessToken: '4082558.pt.c3-mWRKIKCXBbANjq_ftbD4UciPKlt6cYzmZe9KW8VPOBQ5WG61tYvUkRV83vWOVyu5P-O8Loq5rEmtmZ9NVew',
    accountId: '2037905',
    apiBaseUrl: 'https://api.harvestapp.com/v2',
    userAgent: 'C360-Trello-Timer (trello@c360.com)'
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
        HARVEST_CONFIG,
        API_CONFIG
    };
}

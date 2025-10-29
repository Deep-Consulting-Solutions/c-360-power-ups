#!/usr/bin/env node

/**
 * Build script to generate config.js from environment variables
 * This runs during deployment to inject environment-specific values
 */

const fs = require('fs');
const path = require('path');

// Load .env file if it exists (for local development)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=:#]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    });
}

// Read environment variables
const ENVIRONMENT = process.env.ENVIRONMENT || 'staging';
const N8N_API_KEY = process.env.N8N_API_KEY || 'your-api-key-here';
const HARVEST_ACCESS_TOKEN = process.env.HARVEST_ACCESS_TOKEN || '';
const HARVEST_ACCOUNT_ID = process.env.HARVEST_ACCOUNT_ID || '';

// Parse Trello to Harvest user mappings (JSON format in env var)
// Example: TRELLO_HARVEST_USER_MAPPINGS={"johndoe":12345,"janedoe":12346}
let TRELLO_HARVEST_USER_MAPPINGS = {};
if (process.env.TRELLO_HARVEST_USER_MAPPINGS) {
    try {
        TRELLO_HARVEST_USER_MAPPINGS = JSON.parse(process.env.TRELLO_HARVEST_USER_MAPPINGS);
        console.log('User mappings loaded:', Object.keys(TRELLO_HARVEST_USER_MAPPINGS).length, 'users');
    } catch (e) {
        console.warn('Failed to parse TRELLO_HARVEST_USER_MAPPINGS:', e.message);
    }
}

// Determine N8N URLs based on environment
const N8N_BASE_URL = 'https://c360-staging-flows.app.n8n.cloud/webhook';
const START_TIMER_URL = `${N8N_BASE_URL}/${ENVIRONMENT}/start-timer`;
const STOP_TIMER_URL = `${N8N_BASE_URL}/${ENVIRONMENT}/stop-timer`;
const CREATE_CHILD_CARDS_URL = `${N8N_BASE_URL}/${ENVIRONMENT}/create-child-cards`;

// Generate config.js content
const configContent = `// Configuration file for C-360 Timer Power-Up
// This file is auto-generated during build - DO NOT EDIT MANUALLY
// Generated at: ${new Date().toISOString()}
// Environment: ${ENVIRONMENT}

// User ID to default category mapping
// Categories are now fetched dynamically from Harvest tasks
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

// Trello to Harvest User ID Mapping (for multi-user timer support)
// Maps Trello usernames to Harvest user IDs
// This is used as a fallback when email matching fails
const TRELLO_HARVEST_USER_MAPPINGS = ${JSON.stringify(TRELLO_HARVEST_USER_MAPPINGS, null, 4)};

// N8N Webhook Configuration (injected from environment variables)
const N8N_CONFIG = {
    startTimerUrl: '${START_TIMER_URL}',
    stopTimerUrl: '${STOP_TIMER_URL}',
    createChildCardsUrl: '${CREATE_CHILD_CARDS_URL}',
    apiKey: '${N8N_API_KEY}'
};

// Harvest API Configuration (injected from environment variables)
const HARVEST_CONFIG = {
    accessToken: '${HARVEST_ACCESS_TOKEN}',
    accountId: '${HARVEST_ACCOUNT_ID}',
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
        USER_CATEGORY_MAPPING,
        TRELLO_HARVEST_USER_MAPPINGS,
        N8N_CONFIG,
        HARVEST_CONFIG,
        API_CONFIG
    };
}
`;

// Write config.js to public/js/
const outputPath = path.join(__dirname, 'public', 'js', 'config.js');
fs.writeFileSync(outputPath, configContent, 'utf8');

console.log('✓ Config file generated successfully');
console.log(`  Environment: ${ENVIRONMENT}`);
console.log(`  Start Timer URL: ${START_TIMER_URL}`);
console.log(`  Stop Timer URL: ${STOP_TIMER_URL}`);
console.log(`  Convert Checklist Items to Cards URL: ${CREATE_CHILD_CARDS_URL}`);
console.log(`  Harvest Account ID: ${HARVEST_ACCOUNT_ID ? 'Set' : 'NOT SET'}`);
console.log(`  Output: ${outputPath}`);

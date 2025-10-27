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

// Determine N8N URLs based on environment
const N8N_BASE_URL = 'https://c360-staging-flows.app.n8n.cloud/webhook';
const START_TIMER_URL = `${N8N_BASE_URL}/${ENVIRONMENT}/start-timer`;
const STOP_TIMER_URL = `${N8N_BASE_URL}/${ENVIRONMENT}/stop-timer`;

// Generate config.js content
const configContent = `// Configuration file for C-360 Timer Power-Up
// This file is auto-generated during build - DO NOT EDIT MANUALLY
// Generated at: ${new Date().toISOString()}
// Environment: ${ENVIRONMENT}

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
    startTimerUrl: '${START_TIMER_URL}',
    stopTimerUrl: '${STOP_TIMER_URL}',
    apiKey: '${N8N_API_KEY}'
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
`;

// Write config.js to public/js/
const outputPath = path.join(__dirname, 'public', 'js', 'config.js');
fs.writeFileSync(outputPath, configContent, 'utf8');

console.log('✓ Config file generated successfully');
console.log(`  Environment: ${ENVIRONMENT}`);
console.log(`  Start Timer URL: ${START_TIMER_URL}`);
console.log(`  Stop Timer URL: ${STOP_TIMER_URL}`);
console.log(`  Output: ${outputPath}`);

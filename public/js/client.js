// Check if configuration is loaded, provide defaults if not
if (typeof N8N_CONFIG === 'undefined') {
    console.warn('N8N_CONFIG not found, using defaults');
    window.N8N_CONFIG = {
        startTimerUrl: 'https://c360-staging-flows.app.n8n.cloud/webhook/staging/start-timer',
        stopTimerUrl: 'https://c360-staging-flows.app.n8n.cloud/webhook/staging/stop-timer',
        createChildCardsUrl: 'https://c360-staging-flows.app.n8n.cloud/webhook/create-child-cards',
        apiKey: 'your-api-key-here'
    };
}

if (typeof HARVEST_CONFIG === 'undefined') {
    console.warn('HARVEST_CONFIG not found, using defaults');
    window.HARVEST_CONFIG = {
        accessToken: '',
        accountId: '',
        apiBaseUrl: 'https://api.harvestapp.com/v2',
        userAgent: 'C360-Trello-Timer (trello@c360.com)'
    };
}

if (typeof API_CONFIG === 'undefined') {
    console.warn('API_CONFIG not found, using defaults');
    window.API_CONFIG = {
        timeout: 10000,
        retryAttempts: 2,
        retryDelay: 1000
    };
}

// Cached Harvest projects
let harvestProjectsCache = null;
let harvestProjectsFetchPromise = null;

// Cached Harvest tasks
let harvestTasksCache = null;
let harvestTasksFetchPromise = null;

// Check if there's a running timer for this card
async function checkRunningTimer(t) {
    try {
        // Check if Harvest is configured
        if (!HARVEST_CONFIG.accessToken || !HARVEST_CONFIG.accountId) {
            console.warn('Harvest API credentials not configured for timer check');
            return null;
        }

        // Get card details
        const card = await t.card('name', 'labels');

        // Get client name from first label
        const clientLabel = card.labels && card.labels.length > 0 ? card.labels[0].name : null;

        // If no client label, can't match timer
        if (!clientLabel) {
            console.log('No client label found on card, skipping timer check');
            return null;
        }

        const projectName = card.name;

        // Query Harvest for running timers (admin token can see all team timers)
        const response = await fetch(
            `${HARVEST_CONFIG.apiBaseUrl}/time_entries?is_running=true`,
            {
                headers: {
                    'Authorization': `Bearer ${HARVEST_CONFIG.accessToken}`,
                    'Harvest-Account-Id': HARVEST_CONFIG.accountId,
                    'User-Agent': HARVEST_CONFIG.userAgent
                },
                signal: AbortSignal.timeout(5000) // 5 second timeout for badge checks
            }
        );

        if (!response.ok) {
            console.warn(`Harvest API returned ${response.status} for timer check`);
            return null;
        }

        const data = await response.json();
        const runningTimers = data.time_entries || [];

        // Find timer matching this card's client + project
        const matchingTimer = runningTimers.find(timer => {
            const clientMatch = timer.client && timer.client.name === clientLabel;
            const projectMatch = timer.project && timer.project.name === projectName;
            return clientMatch && projectMatch;
        });

        if (matchingTimer) {
            console.log(`✓ Running timer found for card: ${projectName} (${clientLabel})`);
            return {
                text: '⏱️ Timer Running',
                color: 'green'
            };
        }

        // No matching timer found
        return null;

    } catch (error) {
        // Fail silently - don't show badge on errors
        console.warn('Error checking running timer:', error.message);
        return null;
    }
}

// Initialize Trello Power-Up
window.TrelloPowerUp.initialize({
    'card-buttons': async function(t, options) {
        // Check if timer is already running
        const timerRunning = await checkRunningTimer(t);

        const buttons = [];

        // Start Timer button - disabled if timer already running
        if (timerRunning) {
            buttons.push({
                icon: './start-timer.svg',
                text: '⏱️ Timer Already Running',
                callback: function(t) {
                    return t.alert({
                        message: 'A timer is already running for this project. Stop it before starting a new one.',
                        duration: 4,
                        display: 'warning'
                    });
                },
                condition: 'always'
            });
        } else {
            buttons.push({
                icon: './start-timer.svg',
                text: 'Start Harvest Timer ',
                callback: handleStartTimer,
                condition: 'always'
            });
        }

        // Stop Timer button - always shown
        buttons.push({
            icon: './stop-timer.svg',
            text: 'Stop Harvest Timer ',
            callback: handleStopTimer,
            condition: 'always'
        });

        // Convert Checklist button - always shown
        buttons.push({
            icon: './create-child-cards.svg',
            text: 'Convert Checklist Items to Cards',
            callback: handleChecklistToCards,
            condition: 'always'
        });

        return buttons;
    },
    'card-badges': function(t, options) {
        return [{
            dynamic: function() {
                return checkRunningTimer(t);
            },
            refresh: 10 // Refresh every 10 seconds (Trello minimum)
        }];
    }
});

// Fetch and cache Harvest projects
async function fetchHarvestProjects() {
    // If already fetching, return existing promise
    if (harvestProjectsFetchPromise) {
        return harvestProjectsFetchPromise;
    }

    // If already cached, return cache
    if (harvestProjectsCache) {
        return harvestProjectsCache;
    }

    // Check if Harvest is configured
    if (!HARVEST_CONFIG.accessToken || !HARVEST_CONFIG.accountId) {
        console.warn('Harvest API credentials not configured');
        return [];
    }

    harvestProjectsFetchPromise = (async () => {
        try {
            console.log('Fetching Harvest projects...');

            const response = await fetch(
                `${HARVEST_CONFIG.apiBaseUrl}/projects?is_active=true&per_page=2000`,
                {
                    headers: {
                        'Authorization': `Bearer ${HARVEST_CONFIG.accessToken}`,
                        'Harvest-Account-Id': HARVEST_CONFIG.accountId,
                        'User-Agent': HARVEST_CONFIG.userAgent
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Harvest API returned ${response.status}`);
            }

            const data = await response.json();
            harvestProjectsCache = data.projects || [];
            console.log(`✓ Cached ${harvestProjectsCache.length} Harvest projects`);

            return harvestProjectsCache;
        } catch (error) {
            console.error('Failed to fetch Harvest projects:', error);
            harvestProjectsFetchPromise = null; // Reset to allow retry
            throw error;
        }
    })();

    return harvestProjectsFetchPromise;
}

// Fetch and cache Harvest tasks
async function fetchHarvestTasks() {
    // If already fetching, return existing promise
    if (harvestTasksFetchPromise) {
        return harvestTasksFetchPromise;
    }

    // If already cached, return cache
    if (harvestTasksCache) {
        return harvestTasksCache;
    }

    // Check if Harvest is configured
    if (!HARVEST_CONFIG.accessToken || !HARVEST_CONFIG.accountId) {
        console.warn('Harvest API credentials not configured');
        return [];
    }

    harvestTasksFetchPromise = (async () => {
        try {
            console.log('Fetching Harvest tasks...');

            const response = await fetch(
                `${HARVEST_CONFIG.apiBaseUrl}/tasks?is_active=true&per_page=2000`,
                {
                    headers: {
                        'Authorization': `Bearer ${HARVEST_CONFIG.accessToken}`,
                        'Harvest-Account-Id': HARVEST_CONFIG.accountId,
                        'User-Agent': HARVEST_CONFIG.userAgent
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Harvest API returned ${response.status}`);
            }

            const data = await response.json();
            harvestTasksCache = data.tasks || [];
            console.log(`✓ Cached ${harvestTasksCache.length} Harvest tasks`);

            return harvestTasksCache;
        } catch (error) {
            console.error('Failed to fetch Harvest tasks:', error);
            harvestTasksFetchPromise = null; // Reset to allow retry
            throw error;
        }
    })();

    return harvestTasksFetchPromise;
}

// Initialize Harvest projects cache on Power-Up load
fetchHarvestProjects().catch(err => {
    console.warn('Initial Harvest fetch failed, will retry on popup open:', err);
});

// Initialize Harvest tasks cache on Power-Up load
fetchHarvestTasks().catch(err => {
    console.warn('Initial Harvest tasks fetch failed, will retry on popup open:', err);
});

// Handle Start Timer button click
function handleStartTimer(t) {
    return t.popup({
        title: 'Start Timer',
        url: './popup.html',
        height: 320
    });
}

// Handle Convert Checklist Items to Cards button click
function handleChecklistToCards(t) {
    return t.popup({
        title: 'Convert Checklist Items to Cards',
        url: './checklist-popup.html',
        height: 400
    });
}

// Handle Stop Timer button click
async function handleStopTimer(t) {
    // Show loading state
    t.alert({
        message: 'Stopping timer...',
        duration: 2,
        display: 'info'
    });

    try {
        // Get card details
        const card = await t.card('all');

        // Get current member (user who clicked the button)
        const member = await t.member('all');

        // Get board details
        const board = await t.board('id', 'name');

        // Get list details
        const list = await t.list('id', 'name');

        // Prepare the payload
        const payload = {
            card: {
                id: card.id,
                name: card.name,
                desc: card.desc,
                idBoard: card.idBoard,
                idList: card.idList,
                labels: card.labels || [],
                members: card.members || [],
                due: card.due,
                dueComplete: card.dueComplete || false,
                attachments: card.attachments || [],
                url: card.url,
                shortUrl: card.shortUrl,
                badges: card.badges,
                customFieldItems: card.customFieldItems || []
            },
            user: {
                id: member.id,
                fullName: member.fullName,
                username: member.username,
                avatarUrl: member.avatarUrl,
                initials: member.initials
            },
            timestamp: new Date().toISOString(),
            boardName: board.name,
            listName: list.name
        };

        // Make API call to N8N
        const response = await makeApiCall(N8N_CONFIG.stopTimerUrl, payload);

        if (response.ok) {
            // Show success message
            t.alert({
                message: 'Timer stopped successfully!',
                duration: 3,
                display: 'success'
            });
        } else {
            throw new Error(`API returned ${response.status}`);
        }
    } catch (error) {
        console.error('Error stopping timer:', error);

        // Show error message
        t.alert({
            message: 'Unable to stop timer. Please check that your timer is running and your Harvest project is properly configured.',
            duration: 5,
            display: 'error'
        });
    }
}

// Make API call to N8N webhook
async function makeApiCall(url, data, retries = API_CONFIG.retryAttempts) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': N8N_CONFIG.apiKey
            },
            body: JSON.stringify(data),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok && retries > 0) {
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, API_CONFIG.retryDelay));
            return makeApiCall(url, data, retries - 1);
        }

        return response;
    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            console.error('API call timed out');
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, API_CONFIG.retryDelay));
                return makeApiCall(url, data, retries - 1);
            }
            throw new Error('API call timed out');
        }

        if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, API_CONFIG.retryDelay));
            return makeApiCall(url, data, retries - 1);
        }

        throw error;
    }
}
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

// Cached Harvest users (for user ID resolution)
let harvestUsersCache = null;
let harvestUsersFetchPromise = null;

// Helper function to detect if card is a child card (has Trello card attachment)
function getParentCardAttachment(card) {
    if (!card.attachments || card.attachments.length === 0) {
        return null;
    }

    // Find attachment that is a Trello card URL
    const parentAttachment = card.attachments.find(attachment => {
        return attachment.url && attachment.url.includes('trello.com/c/');
    });

    return parentAttachment || null;
}

// Extract parent card name from Trello attachment URL
function getParentCardNameFromAttachment(parentAttachment) {
    if (!parentAttachment || !parentAttachment.url) {
        return null;
    }

    // Extract from URL slug
    // URL format: https://trello.com/c/CARD_ID/NUMBER-card-name-slug
    const urlParts = parentAttachment.url.split('/');
    const nameSlug = urlParts[urlParts.length - 1];

    if (!nameSlug) {
        return null;
    }

    // Remove card number prefix (e.g., "659-esa-campaign" -> "esa-campaign")
    const slugWithoutNumber = nameSlug.replace(/^\d+-/, '');

    // Convert kebab-case to Title Case
    const extractedName = slugWithoutNumber
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

    return extractedName;
}

// Check if user has ANY running timer (across all projects)
async function checkUserHasAnyRunningTimer(trelloMember) {
    try {
        // Check if Harvest is configured
        if (!HARVEST_CONFIG.accessToken || !HARVEST_CONFIG.accountId) {
            console.warn('Harvest API credentials not configured');
            return null;
        }

        // Resolve to Harvest user ID
        const harvestUserId = await resolveHarvestUserId(trelloMember);

        if (!harvestUserId) {
            console.warn(`User ${trelloMember.username} not mapped to Harvest`);
            return null;
        }

        // Query Harvest for user's running timers
        const response = await fetch(
            `${HARVEST_CONFIG.apiBaseUrl}/time_entries?is_running=true&user_id=${harvestUserId}`,
            {
                headers: {
                    'Authorization': `Bearer ${HARVEST_CONFIG.accessToken}`,
                    'Harvest-Account-Id': HARVEST_CONFIG.accountId,
                    'User-Agent': HARVEST_CONFIG.userAgent
                },
                signal: AbortSignal.timeout(5000)
            }
        );

        if (!response.ok) {
            console.warn(`Harvest API returned ${response.status}`);
            return null;
        }

        const data = await response.json();
        const runningTimers = data.time_entries || [];

        if (runningTimers.length > 0) {
            // Return info about the running timer
            const timer = runningTimers[0]; // Get first running timer
            return {
                project: timer.project ? timer.project.name : 'Unknown Project',
                client: timer.client ? timer.client.name : 'Unknown Client',
                task: timer.task ? timer.task.name : 'Unknown Task',
                notes: timer.notes || ''
            };
        }

        return null; // No running timer

    } catch (error) {
        console.error('Error checking for running timers:', error);
        return null;
    }
}

// Check if there's a running timer for this card (user-specific for buttons, team-wide for badges)
async function checkRunningTimer(t, options = {}) {
    try {
        // Check if Harvest is configured
        if (!HARVEST_CONFIG.accessToken || !HARVEST_CONFIG.accountId) {
            console.warn('⚠️ [TIMER CHECK] Harvest API credentials not configured');
            return null;
        }

        // Try to get current user - this only works in button/popup context, NOT in badge context
        let member = null;
        let harvestUserId = null;

        try {
            console.log('🔍 [TIMER CHECK] Attempting to get current Trello user...');
            // Request basic fields first (email may not be available without special permissions)
            member = await t.member('id', 'username', 'fullName');
            console.log('👤 [TIMER CHECK] Got user:', {
                id: member.id,
                username: member.username,
                fullName: member.fullName
            });

            // Try to get email separately (may fail, that's OK)
            try {
                const memberWithEmail = await t.member('email');
                if (memberWithEmail && memberWithEmail.email) {
                    member.email = memberWithEmail.email;
                    console.log('📧 [TIMER CHECK] Got user email:', member.email);
                } else {
                    console.log('ℹ️ [TIMER CHECK] Email not available for user');
                }
            } catch (emailError) {
                console.log('ℹ️ [TIMER CHECK] Email not accessible (will use username/ID for mapping)');
            }

            // Resolve to Harvest user ID
            console.log('🔄 [TIMER CHECK] Resolving to Harvest user ID...');
            harvestUserId = await resolveHarvestUserId(member);

            if (harvestUserId) {
                console.log(`✅ [TIMER CHECK] User ${member.username} mapped to Harvest ID: ${harvestUserId}`);
            } else {
                console.warn(`❌ [TIMER CHECK] User ${member.username} not mapped to Harvest`);
            }
        } catch (memberError) {
            // This is expected in badge context - member API is not available
            console.log('ℹ️ [TIMER CHECK] Member info not available (expected in badge context) - will check team-wide timers');
            member = null;
            harvestUserId = null;
        }

        // Get card details (including attachments for child card detection)
        const card = await t.card('name', 'labels', 'attachments');
        console.log('📇 [TIMER CHECK] Card details:', {
            name: card.name,
            labels: card.labels ? card.labels.map(l => l.name) : []
        });

        // Get client name from first label
        const clientLabel = card.labels && card.labels.length > 0 ? card.labels[0].name : null;

        // If no client label, can't match timer
        if (!clientLabel) {
            console.log('⚠️ [TIMER CHECK] No client label found on card, skipping timer check');
            return null;
        }

        // Check if this is a child card - badges only show on parent cards
        const parentAttachment = getParentCardAttachment(card);

        if (parentAttachment) {
            // This is a child card - don't show badge (parent will show it)
            console.log(`👶 [TIMER CHECK] Child card detected (${card.name}) - no badge on child cards`);
            return null;
        }

        // This is a parent/regular card - check for running timer
        const projectName = card.name;

        // Build API URL - include user_id filter if we have it (button context), otherwise query all (badge context)
        let apiUrl = `${HARVEST_CONFIG.apiBaseUrl}/time_entries?is_running=true`;
        if (harvestUserId) {
            apiUrl += `&user_id=${harvestUserId}`;
            console.log(`🌐 [TIMER CHECK] Querying Harvest API for USER-SPECIFIC timer (Harvest ID: ${harvestUserId})...`);
        } else {
            console.log('🌐 [TIMER CHECK] Querying Harvest API for TEAM-WIDE timers (badge context)...');
        }

        console.log('   URL:', apiUrl);
        console.log('   Looking for:', { project: projectName, client: clientLabel });

        // Query Harvest for running timers (user-specific if possible, team-wide in badge context)
        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${HARVEST_CONFIG.accessToken}`,
                'Harvest-Account-Id': HARVEST_CONFIG.accountId,
                'User-Agent': HARVEST_CONFIG.userAgent
            },
            signal: AbortSignal.timeout(5000) // 5 second timeout for badge checks
        });

        if (!response.ok) {
            console.warn(`❌ [TIMER CHECK] Harvest API returned ${response.status} for timer check`);
            return null;
        }

        const data = await response.json();
        const runningTimers = data.time_entries || [];

        if (harvestUserId) {
            console.log(`📊 [TIMER CHECK] Harvest returned ${runningTimers.length} running timer(s) for user ${member.username} (Harvest ID: ${harvestUserId})`);
        } else {
            console.log(`📊 [TIMER CHECK] Harvest returned ${runningTimers.length} running timer(s) (team-wide, badge context)`);
        }

        if (runningTimers.length > 0) {
            console.log('⏱️ [TIMER CHECK] Running timers details:');
            runningTimers.forEach((timer, index) => {
                console.log(`   Timer ${index + 1}:`, {
                    project: timer.project ? timer.project.name : 'N/A',
                    client: timer.client ? timer.client.name : 'N/A',
                    task: timer.task ? timer.task.name : 'N/A',
                    user: timer.user ? `${timer.user.name} (ID: ${timer.user.id})` : 'N/A'
                });
            });
        } else {
            if (harvestUserId) {
                console.log('✅ [TIMER CHECK] No running timers found for this user');
            } else {
                console.log('✅ [TIMER CHECK] No running timers found for this project (team-wide)');
            }
        }

        // Find timer matching this card's client + project (case-insensitive)
        const matchingTimer = runningTimers.find(timer => {
            const clientMatch = timer.client &&
                timer.client.name.toLowerCase() === clientLabel.toLowerCase();
            const projectMatch = timer.project &&
                timer.project.name.toLowerCase() === projectName.toLowerCase();

            if (clientMatch || projectMatch) {
                console.log('🔍 [TIMER CHECK] Comparing timer:', {
                    timerProject: timer.project ? timer.project.name : 'N/A',
                    timerClient: timer.client ? timer.client.name : 'N/A',
                    cardProject: projectName,
                    cardClient: clientLabel,
                    clientMatch,
                    projectMatch,
                    bothMatch: clientMatch && projectMatch
                });
            }

            return clientMatch && projectMatch;
        });

        if (matchingTimer) {
            if (harvestUserId && member) {
                console.log(`✅ ⏱️ [TIMER CHECK] MATCH FOUND! User-specific timer for ${member.username} on card: ${projectName} (${clientLabel})`);
            } else {
                console.log(`✅ ⏱️ [TIMER CHECK] MATCH FOUND! Team-wide timer on card: ${projectName} (${clientLabel})`);
            }
            console.log('   Timer details:', {
                project: matchingTimer.project.name,
                client: matchingTimer.client.name,
                user: matchingTimer.user ? matchingTimer.user.name : 'Unknown',
                harvestUserId: matchingTimer.user ? matchingTimer.user.id : 'Unknown'
            });
            return {
                text: '⏱️ Timer Running',
                color: 'green'
            };
        }

        if (harvestUserId && member) {
            console.log(`❌ [TIMER CHECK] No matching timer found for user ${member.username} on this card`);
        } else {
            console.log(`❌ [TIMER CHECK] No matching timer found on this card (team-wide check)`);
        }
        return null;

    } catch (error) {
        // Fail silently - don't show badge on errors
        console.error('❌ [TIMER CHECK] Error:', error.message, error);
        return null;
    }
}

// Initialize Trello Power-Up
window.TrelloPowerUp.initialize({
    'card-buttons': async function(t, options) {
        console.log('🔘 [BUTTON RENDER] Starting button rendering...');

        // Check if timer is already running
        const timerRunning = await checkRunningTimer(t);

        console.log('🔘 [BUTTON RENDER] Timer check result:', timerRunning ? 'TIMER RUNNING (will disable start)' : 'NO TIMER (will enable start)');

        const buttons = [];

        // Start Timer button - disabled if user's timer already running on this card
        if (timerRunning) {
            console.log('🔘 [BUTTON RENDER] Adding DISABLED start button (timer already running)');
            buttons.push({
                icon: './start-timer.svg',
                text: '⏱️ Timer Already Running ',
                callback: function(t) {
                    return t.alert({
                        message: 'You already have a timer running for this project. Stop it before starting a new one.',
                        duration: 4,
                        display: 'warning'
                    });
                },
                condition: 'always'
            });
        } else {
            console.log('🔘 [BUTTON RENDER] Adding ENABLED start button (no timer running)');
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
            text: 'Convert Checklist Items to Cards ',
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

// Fetch and cache Harvest users (for user ID resolution)
async function fetchHarvestUsers() {
    // If already fetching, return existing promise
    if (harvestUsersFetchPromise) {
        return harvestUsersFetchPromise;
    }

    // If already cached, return cache
    if (harvestUsersCache) {
        return harvestUsersCache;
    }

    // Check if Harvest is configured
    if (!HARVEST_CONFIG.accessToken || !HARVEST_CONFIG.accountId) {
        console.warn('Harvest API credentials not configured');
        return [];
    }

    harvestUsersFetchPromise = (async () => {
        try {
            console.log('👥 [HARVEST USERS] Fetching Harvest users from API...');

            const response = await fetch(
                `${HARVEST_CONFIG.apiBaseUrl}/users?is_active=true&per_page=2000`,
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
            harvestUsersCache = data.users || [];
            console.log(`✅ [HARVEST USERS] Cached ${harvestUsersCache.length} Harvest users`);

            // Log first few users for debugging
            if (harvestUsersCache.length > 0) {
                console.log('📋 [HARVEST USERS] Sample users (first 3):',
                    harvestUsersCache.slice(0, 3).map(u => ({
                        id: u.id,
                        name: `${u.first_name} ${u.last_name}`,
                        email: u.email
                    }))
                );
            }

            return harvestUsersCache;
        } catch (error) {
            console.error('❌ [HARVEST USERS] Failed to fetch Harvest users:', error);
            harvestUsersFetchPromise = null; // Reset to allow retry
            throw error;
        }
    })();

    return harvestUsersFetchPromise;
}

// Initialize Harvest users cache on Power-Up load
fetchHarvestUsers().catch(err => {
    console.warn('Initial Harvest users fetch failed, will retry when needed:', err);
});

// Resolve Trello user to Harvest user ID
// Strategy: First try email matching, then fallback to config mapping
async function resolveHarvestUserId(trelloMember) {
    try {
        console.log('🔍 [USER RESOLVE] Starting user resolution for:', {
            trelloId: trelloMember.id,
            trelloUsername: trelloMember.username,
            trelloFullName: trelloMember.fullName,
            trelloEmail: trelloMember.email || '(no email)'
        });

        // Get Harvest users
        const harvestUsers = await fetchHarvestUsers();

        if (!harvestUsers || harvestUsers.length === 0) {
            console.warn('❌ [USER RESOLVE] No Harvest users available for matching');
            return null;
        }

        console.log(`📊 [USER RESOLVE] ${harvestUsers.length} Harvest users available for matching`);

        // Strategy 1: Match by email (preferred method)
        if (trelloMember.email) {
            console.log(`🔍 [USER RESOLVE] Trying email match for: ${trelloMember.email}`);

            const emailMatch = harvestUsers.find(hUser =>
                hUser.email && hUser.email.toLowerCase() === trelloMember.email.toLowerCase()
            );

            if (emailMatch) {
                console.log(`✅ [USER RESOLVE] EMAIL MATCH! Trello user "${trelloMember.username}" → Harvest user "${emailMatch.first_name} ${emailMatch.last_name}" (ID: ${emailMatch.id})`);
                return emailMatch.id;
            } else {
                console.log(`❌ [USER RESOLVE] No email match found for ${trelloMember.email}`);
                console.log('   Available Harvest emails:', harvestUsers.slice(0, 5).map(u => u.email));
            }
        } else {
            console.log('⚠️ [USER RESOLVE] Trello user has no email, skipping email matching');
        }

        // Strategy 2: Use config mapping (fallback)
        console.log('🔍 [USER RESOLVE] Trying config mapping fallback...');

        if (typeof TRELLO_HARVEST_USER_MAPPINGS !== 'undefined') {
            console.log('📋 [USER RESOLVE] Config mappings available:', TRELLO_HARVEST_USER_MAPPINGS);

            // Try by username first
            if (TRELLO_HARVEST_USER_MAPPINGS[trelloMember.username]) {
                const harvestUserId = TRELLO_HARVEST_USER_MAPPINGS[trelloMember.username];
                console.log(`✅ [USER RESOLVE] CONFIG MATCH (username)! "${trelloMember.username}" → Harvest ID ${harvestUserId}`);
                return harvestUserId;
            }

            // Try by Trello user ID
            if (TRELLO_HARVEST_USER_MAPPINGS[trelloMember.id]) {
                const harvestUserId = TRELLO_HARVEST_USER_MAPPINGS[trelloMember.id];
                console.log(`✅ [USER RESOLVE] CONFIG MATCH (user ID)! "${trelloMember.id}" → Harvest ID ${harvestUserId}`);
                return harvestUserId;
            }

            console.log(`❌ [USER RESOLVE] No config mapping found for username "${trelloMember.username}" or ID "${trelloMember.id}"`);
        } else {
            console.log('⚠️ [USER RESOLVE] TRELLO_HARVEST_USER_MAPPINGS not defined in config');
        }

        // No match found
        console.error(`❌ [USER RESOLVE] FAILED to resolve Harvest user ID for Trello user: "${trelloMember.username}" (${trelloMember.fullName})`);
        console.error('   💡 Solution: Add mapping in TRELLO_HARVEST_USER_MAPPINGS config or ensure email addresses match');
        console.error('   Add this to .env: TRELLO_HARVEST_USER_MAPPINGS={"' + trelloMember.username + '":HARVEST_USER_ID}');
        return null;

    } catch (error) {
        console.error('❌ [USER RESOLVE] Error resolving Harvest user ID:', error);
        return null;
    }
}

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
// Check if configuration is loaded, provide defaults if not
if (typeof N8N_CONFIG === 'undefined') {
    console.warn('N8N_CONFIG not found, using defaults');
    window.N8N_CONFIG = {
        startTimerUrl: 'https://your-n8n-instance.com/webhook/start-timer',
        stopTimerUrl: 'https://your-n8n-instance.com/webhook/stop-timer',
        apiKey: 'your-api-key-here'
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

// Initialize Trello Power-Up
window.TrelloPowerUp.initialize({
    'card-buttons': function(t, options) {
        return [
            {
                icon: './start-timer.svg',
                text: 'Start Timer',
                callback: handleStartTimer,
                condition: 'always'
            },
            {
                icon: './stop-timer.svg',
                text: 'Stop Timer',
                callback: handleStopTimer,
                condition: 'always'
            }
        ];
    }
});

// Handle Start Timer button click
function handleStartTimer(t) {
    return t.popup({
        title: 'Start Timer',
        url: './popup.html',
        height: 280
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
            message: 'Failed to stop timer. Please try again.',
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
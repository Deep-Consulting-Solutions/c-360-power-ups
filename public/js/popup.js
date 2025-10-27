// Check if configuration is loaded, provide defaults if not
if (typeof CATEGORIES === 'undefined') {
    console.warn('CATEGORIES not found, using defaults');
    window.CATEGORIES = [
        'Copywriting',
        'Project Management',
        'Account Management',
        'PR',
        'Design'
    ];
}

if (typeof USER_CATEGORY_MAPPING === 'undefined') {
    console.warn('USER_CATEGORY_MAPPING not found, using defaults');
    window.USER_CATEGORY_MAPPING = {};
}

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

// Get Trello Power-Up instance
const t = window.TrelloPowerUp.iframe();

// Initialize popup
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Populate category dropdown
        populateCategoryDropdown();

        // Get current user to set default category
        const member = await t.member('id', 'username', 'fullName');
        setDefaultCategory(member);

        // Set up event listeners
        setupEventListeners();

        // Resize popup to fit content
        t.sizeTo('#popup-container').done();
    } catch (error) {
        console.error('Error initializing popup:', error);
    }
});

// Populate category dropdown
function populateCategoryDropdown() {
    const selectElement = document.getElementById('category-select');

    CATEGORIES.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        selectElement.appendChild(option);
    });
}

// Set default category based on user mapping
function setDefaultCategory(member) {
    const selectElement = document.getElementById('category-select');

    // Try to find mapping by user ID first, then by username
    const defaultCategory = USER_CATEGORY_MAPPING[member.id] ||
                          USER_CATEGORY_MAPPING[member.username] ||
                          '';

    if (defaultCategory && CATEGORIES.includes(defaultCategory)) {
        selectElement.value = defaultCategory;
        // Enable the start button if a default category is set
        validateForm();
    }
}

// Set up event listeners
function setupEventListeners() {
    const selectElement = document.getElementById('category-select');
    const startButton = document.getElementById('start-timer-btn');
    const cancelButton = document.getElementById('cancel-btn');

    // Category selection change
    selectElement.addEventListener('change', validateForm);

    // Start timer button click
    startButton.addEventListener('click', handleStartTimer);

    // Cancel button click
    cancelButton.addEventListener('click', () => t.closePopup());
}

// Validate form and enable/disable start button
function validateForm() {
    const selectElement = document.getElementById('category-select');
    const startButton = document.getElementById('start-timer-btn');
    const errorElement = document.getElementById('category-error');

    if (selectElement.value) {
        startButton.disabled = false;
        errorElement.style.display = 'none';
        return true;
    } else {
        startButton.disabled = true;
        return false;
    }
}

// Handle start timer button click
async function handleStartTimer() {
    // Validate form first
    if (!validateForm()) {
        const errorElement = document.getElementById('category-error');
        errorElement.style.display = 'block';
        return;
    }

    const selectElement = document.getElementById('category-select');
    const selectedCategory = selectElement.value;

    // Show loading state
    setLoadingState(true);

    try {
        // Get all necessary data from Trello
        const [card, member, board, list] = await Promise.all([
            t.card('all'),
            t.member('all'),
            t.board('id', 'name'),
            t.list('id', 'name')
        ]);

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
            category: selectedCategory,
            timestamp: new Date().toISOString(),
            boardName: board.name,
            listName: list.name
        };

        // Make API call to N8N
        const response = await makeApiCall(N8N_CONFIG.startTimerUrl, payload);

        if (response.ok) {
            // Show success message
            showToast('Timer started successfully!', 'success');

            // Close popup after a short delay
            setTimeout(() => {
                t.closePopup();
            }, 1500);
        } else {
            throw new Error(`API returned ${response.status}`);
        }
    } catch (error) {
        console.error('Error starting timer:', error);

        // Show error message
        showToast('Failed to start timer. Please try again.', 'error');

        // Reset loading state
        setLoadingState(false);
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

// Set loading state for the start button
function setLoadingState(loading) {
    const startButton = document.getElementById('start-timer-btn');
    const buttonText = startButton.querySelector('.btn-text');
    const buttonSpinner = startButton.querySelector('.btn-spinner');
    const cancelButton = document.getElementById('cancel-btn');
    const selectElement = document.getElementById('category-select');

    if (loading) {
        startButton.disabled = true;
        cancelButton.disabled = true;
        selectElement.disabled = true;
        buttonText.style.display = 'none';
        buttonSpinner.style.display = 'inline-block';
    } else {
        startButton.disabled = false;
        cancelButton.disabled = false;
        selectElement.disabled = false;
        buttonText.style.display = 'inline';
        buttonSpinner.style.display = 'none';
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = toast.querySelector('.toast-message');

    // Set message and type
    toastMessage.textContent = message;
    toast.className = `toast toast-${type}`;
    toast.style.display = 'block';

    // Auto-hide after 3 seconds
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}
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
    console.log('=== POPUP INITIALIZING ===');
    console.log('Configuration loaded:', {
        categories: CATEGORIES,
        startTimerUrl: N8N_CONFIG.startTimerUrl,
        stopTimerUrl: N8N_CONFIG.stopTimerUrl,
        apiKey: N8N_CONFIG.apiKey ? '***' + N8N_CONFIG.apiKey.slice(-4) : 'NOT SET',
        timeout: API_CONFIG.timeout,
        retryAttempts: API_CONFIG.retryAttempts
    });

    try {
        // Populate category dropdown
        populateCategoryDropdown();
        console.log('Category dropdown populated');

        // Get current user to set default category
        const member = await t.member('id', 'username', 'fullName');
        console.log('Current user:', member);
        setDefaultCategory(member);

        // Set up event listeners
        setupEventListeners();
        console.log('Event listeners set up');

        // Resize popup to fit content
        t.sizeTo('#popup-container').done();
        console.log('Popup sized');
        console.log('=== POPUP READY ===');
    } catch (error) {
        console.error('=== ERROR INITIALIZING POPUP ===');
        console.error('Error:', error);
        console.error('Stack:', error.stack);
    }
});

// Populate category dropdown with predefined categories + Custom option
function populateCategoryDropdown() {
    const selectElement = document.getElementById('category-select');

    // Add predefined categories
    CATEGORIES.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        selectElement.appendChild(option);
    });

    // Add "Add New Category" option at the end
    const customOption = document.createElement('option');
    customOption.value = '__CUSTOM__';
    customOption.textContent = '+ Add New Category';
    selectElement.appendChild(customOption);
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
    const customInputWrapper = document.getElementById('custom-category-wrapper');
    const customInput = document.getElementById('custom-category-input');
    const startButton = document.getElementById('start-timer-btn');
    const cancelButton = document.getElementById('cancel-btn');
    const closeButton = document.getElementById('close-btn');

    // Category dropdown change
    selectElement.addEventListener('change', function() {
        if (selectElement.value === '__CUSTOM__') {
            // Show custom input field
            customInputWrapper.style.display = 'block';
            customInput.focus();
            // Disable start button until custom text is entered
            startButton.disabled = true;
        } else {
            // Hide custom input field
            customInputWrapper.style.display = 'none';
            customInput.value = '';
            // Validate with dropdown value
            validateForm();
        }
    });

    // Custom category input change (real-time validation)
    customInput.addEventListener('input', validateForm);

    // Start timer button click
    startButton.addEventListener('click', handleStartTimer);

    // Cancel button click
    cancelButton.addEventListener('click', () => t.closePopup());

    // Close button click (optional - may not exist in all layouts)
    if (closeButton) {
        closeButton.addEventListener('click', () => t.closePopup());
    }
}

// Validate form and enable/disable start button
function validateForm() {
    const selectElement = document.getElementById('category-select');
    const customInput = document.getElementById('custom-category-input');
    const startButton = document.getElementById('start-timer-btn');
    const infoMessage = document.getElementById('info-message');
    const helperBox = document.getElementById('helper-box');
    const selectedCategoryText = document.getElementById('selected-category-text');
    const progressBar = document.getElementById('progress-bar');

    // Get category value from either dropdown or custom input
    let categoryValue = '';
    if (selectElement.value === '__CUSTOM__') {
        // Using custom input
        categoryValue = customInput.value.trim();
    } else {
        // Using predefined category
        categoryValue = selectElement.value;
    }

    if (categoryValue) {
        // Enable button
        startButton.disabled = false;

        // Hide info message
        if (infoMessage) {
            infoMessage.style.display = 'none';
        }

        // Show helper box with selected category (optional)
        if (helperBox && selectedCategoryText) {
            helperBox.style.display = 'block';
            selectedCategoryText.textContent = categoryValue;
        }

        // Update progress bar to 100%
        if (progressBar) {
            progressBar.classList.add('complete');
        }

        return true;
    } else {
        // Disable button
        startButton.disabled = true;

        // Show info message
        if (infoMessage) {
            infoMessage.style.display = 'flex';
        }

        // Hide helper box (optional)
        if (helperBox) {
            helperBox.style.display = 'none';
        }

        // Update progress bar to 50%
        if (progressBar) {
            progressBar.classList.remove('complete');
        }

        return false;
    }
}

// Handle start timer button click
async function handleStartTimer() {
    console.log('=== START TIMER BUTTON CLICKED ===');

    // Validate form first
    if (!validateForm()) {
        console.log('Form validation failed');
        return;
    }

    const selectElement = document.getElementById('category-select');
    const customInput = document.getElementById('custom-category-input');

    // Get category from either dropdown or custom input
    let selectedCategory = '';
    if (selectElement.value === '__CUSTOM__') {
        selectedCategory = customInput.value.trim();
    } else {
        selectedCategory = selectElement.value;
    }

    console.log('Selected category:', selectedCategory);

    // Show loading state
    setLoadingState(true);

    try {
        console.log('Fetching Trello data...');

        // Get all necessary data from Trello
        const [card, member, board, list] = await Promise.all([
            t.card('all'),
            t.member('all'),
            t.board('id', 'name'),
            t.list('id', 'name')
        ]);

        console.log('Trello data received:', {
            cardId: card.id,
            cardName: card.name,
            memberId: member.id,
            memberName: member.fullName,
            boardName: board.name,
            listName: list.name
        });

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

        console.log('Payload prepared:', JSON.stringify(payload, null, 2));
        console.log('Making API call to:', N8N_CONFIG.startTimerUrl);
        console.log('Using API key:', N8N_CONFIG.apiKey);

        // Make API call to N8N
        const response = await makeApiCall(N8N_CONFIG.startTimerUrl, payload);

        console.log('API response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        });

        if (response.ok) {
            console.log('✓ Timer started successfully');

            // Show success message
            showToast('Timer started successfully!', 'success');

            // Close popup after a short delay
            setTimeout(() => {
                t.closePopup();
            }, 1500);
        } else {
            const errorText = await response.text().catch(() => 'No error text available');
            console.error('API returned error status:', response.status, errorText);
            throw new Error(`API returned ${response.status}: ${errorText}`);
        }
    } catch (error) {
        console.error('=== ERROR STARTING TIMER ===');
        console.error('Error type:', error.name);
        console.error('Error message:', error.message);
        console.error('Full error:', error);
        console.error('Stack trace:', error.stack);

        // Show error message
        showToast('Failed to start timer. Please try again.', 'error');

        // Reset loading state
        setLoadingState(false);
    }
}

// Make API call to N8N webhook
async function makeApiCall(url, data, retries = API_CONFIG.retryAttempts) {
    console.log(`makeApiCall: Attempt ${API_CONFIG.retryAttempts - retries + 1}/${API_CONFIG.retryAttempts + 1}`);
    console.log('makeApiCall: URL:', url);
    console.log('makeApiCall: Retries remaining:', retries);
    console.log('makeApiCall: Timeout:', API_CONFIG.timeout, 'ms');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        console.warn('Request timeout triggered');
        controller.abort();
    }, API_CONFIG.timeout);

    try {
        console.log('makeApiCall: Sending fetch request...');

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

        console.log('makeApiCall: Response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Array.from(response.headers.entries())
        });

        if (!response.ok && retries > 0) {
            console.warn(`makeApiCall: Response not OK (${response.status}), retrying in ${API_CONFIG.retryDelay}ms...`);
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, API_CONFIG.retryDelay));
            return makeApiCall(url, data, retries - 1);
        }

        return response;
    } catch (error) {
        clearTimeout(timeoutId);

        console.error('makeApiCall: Fetch error caught:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });

        if (error.name === 'AbortError') {
            console.error('makeApiCall: API call timed out after', API_CONFIG.timeout, 'ms');
            if (retries > 0) {
                console.log(`makeApiCall: Retrying after timeout... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, API_CONFIG.retryDelay));
                return makeApiCall(url, data, retries - 1);
            }
            throw new Error('API call timed out after ' + API_CONFIG.timeout + 'ms');
        }

        if (retries > 0) {
            console.log(`makeApiCall: Retrying after error... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, API_CONFIG.retryDelay));
            return makeApiCall(url, data, retries - 1);
        }

        console.error('makeApiCall: No more retries, throwing error');
        throw error;
    }
}

// Set loading state for the start button
function setLoadingState(loading) {
    const startButton = document.getElementById('start-timer-btn');
    const cancelButton = document.getElementById('cancel-btn');
    const closeButton = document.getElementById('close-btn');
    const selectElement = document.getElementById('category-select');
    const customInput = document.getElementById('custom-category-input');

    if (loading) {
        startButton.disabled = true;
        startButton.classList.add('loading');
        cancelButton.disabled = true;
        if (closeButton) {
            closeButton.disabled = true;
        }
        selectElement.disabled = true;
        customInput.disabled = true;
    } else {
        startButton.disabled = false;
        startButton.classList.remove('loading');
        cancelButton.disabled = false;
        if (closeButton) {
            closeButton.disabled = false;
        }
        selectElement.disabled = false;
        customInput.disabled = false;
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
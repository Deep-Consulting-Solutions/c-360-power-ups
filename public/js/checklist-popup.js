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

// Store checklists data
let checklistsData = [];
let selectedChecklistIds = new Set();

// Initialize popup
document.addEventListener('DOMContentLoaded', async function() {
    console.log('=== CHECKLIST POPUP INITIALIZING ===');
    console.log('Configuration loaded:', {
        createChildCardsUrl: N8N_CONFIG.createChildCardsUrl,
        apiKey: N8N_CONFIG.apiKey ? '***' + N8N_CONFIG.apiKey.slice(-4) : 'NOT SET',
        timeout: API_CONFIG.timeout,
        retryAttempts: API_CONFIG.retryAttempts
    });

    try {
        // Set up event listeners
        setupEventListeners();
        console.log('Event listeners set up');

        // Load checklists
        await loadChecklists();

        // Resize popup to fit content
        t.sizeTo('#popup-container').done();
        console.log('Popup sized');
        console.log('=== POPUP READY ===');
    } catch (error) {
        console.error('=== ERROR INITIALIZING POPUP ===');
        console.error('Error:', error);
        console.error('Stack:', error.stack);
        showError('Failed to load checklists');
    }
});

// Set up event listeners
function setupEventListeners() {
    const createButton = document.getElementById('create-cards-btn');
    const cancelButton = document.getElementById('cancel-btn');

    // Create cards button click
    createButton.addEventListener('click', handleCreateCards);

    // Cancel button click
    cancelButton.addEventListener('click', () => t.closePopup());
}

// Load checklists from the card
async function loadChecklists() {
    const loadingState = document.getElementById('loading-state');
    const checklistContainer = document.getElementById('checklist-container');
    const emptyState = document.getElementById('empty-state');

    // Show loading
    loadingState.style.display = 'block';
    checklistContainer.style.display = 'none';
    emptyState.style.display = 'none';

    try {
        console.log('Fetching card data with checklists...');

        // Get card data including checklists
        const card = await t.card('all');
        console.log('Card data received:', card);

        // Check if card has checklists
        if (!card.checklists || card.checklists.length === 0) {
            console.log('No checklists found on card');
            loadingState.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        // Store all checklists data
        checklistsData = card.checklists;
        console.log('Checklists found:', checklistsData.length);

        // Populate checklist UI
        populateChecklists(checklistsData);

        // Hide loading, show checklist container
        loadingState.style.display = 'none';
        checklistContainer.style.display = 'block';

    } catch (error) {
        console.error('Error loading checklists:', error);
        loadingState.style.display = 'none';
        emptyState.style.display = 'block';
        showToast('Failed to load checklists', 'error');
    }
}

// Populate checklist selection UI
function populateChecklists(checklists) {
    const container = document.getElementById('checklist-container');
    container.innerHTML = '';

    checklists.forEach(checklist => {
        // Create checklist item element
        const checklistItem = document.createElement('div');
        checklistItem.className = 'checklist-item';
        checklistItem.dataset.checklistId = checklist.id;

        // Create checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'checklist-checkbox';
        checkbox.id = `checklist-${checklist.id}`;
        checkbox.value = checklist.id;

        // Create checklist info
        const checklistInfo = document.createElement('div');
        checklistInfo.className = 'checklist-info';

        const checklistName = document.createElement('div');
        checklistName.className = 'checklist-name';
        checklistName.textContent = checklist.name;

        checklistInfo.appendChild(checklistName);

        // Assemble checklist item
        checklistItem.appendChild(checkbox);
        checklistItem.appendChild(checklistInfo);

        // Add click handler for the entire item
        checklistItem.addEventListener('click', function(e) {
            // If clicking on the checkbox itself, let it handle naturally
            if (e.target === checkbox) return;

            // Otherwise, toggle the checkbox
            checkbox.checked = !checkbox.checked;
            handleChecklistSelection(checkbox);
        });

        // Add change handler for checkbox
        checkbox.addEventListener('change', function() {
            handleChecklistSelection(checkbox);
        });

        container.appendChild(checklistItem);
    });
}

// Handle checklist selection change
function handleChecklistSelection(checkbox) {
    const checklistId = checkbox.value;
    const checklistItem = checkbox.closest('.checklist-item');

    if (checkbox.checked) {
        selectedChecklistIds.add(checklistId);
        checklistItem.classList.add('selected');
    } else {
        selectedChecklistIds.delete(checklistId);
        checklistItem.classList.remove('selected');
    }

    console.log('Selected checklists:', Array.from(selectedChecklistIds));
    validateForm();
}

// Validate form and enable/disable create button
function validateForm() {
    const createButton = document.getElementById('create-cards-btn');
    const infoMessage = document.getElementById('info-message');
    const progressBar = document.getElementById('progress-bar');

    if (selectedChecklistIds.size > 0) {
        // Enable button
        createButton.disabled = false;

        // Hide info message
        infoMessage.style.display = 'none';

        // Update progress bar to 100%
        progressBar.classList.add('complete');

        return true;
    } else {
        // Disable button
        createButton.disabled = true;

        // Show info message
        infoMessage.style.display = 'flex';

        // Update progress bar to 50%
        progressBar.classList.remove('complete');

        return false;
    }
}

// Handle create cards button click
async function handleCreateCards() {
    console.log('=== CREATE CARDS BUTTON CLICKED ===');

    // Validate form first
    if (!validateForm()) {
        console.log('Form validation failed');
        return;
    }

    console.log('Selected checklist IDs:', Array.from(selectedChecklistIds));

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

        // Get selected checklists with their data
        const selectedChecklists = checklistsData.filter(checklist =>
            selectedChecklistIds.has(checklist.id)
        );

        console.log('Selected checklists data:', selectedChecklists);

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
            checklists: selectedChecklists.map(checklist => ({
                id: checklist.id,
                name: checklist.name,
                checkItems: checklist.checkItems || []
            })),
            timestamp: new Date().toISOString(),
            boardName: board.name,
            listName: list.name
        };

        console.log('Payload prepared:', JSON.stringify(payload, null, 2));
        console.log('Making API call to:', N8N_CONFIG.createChildCardsUrl);

        // Make API call to N8N
        const response = await makeApiCall(N8N_CONFIG.createChildCardsUrl, payload);

        console.log('API response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        });

        if (response.ok) {
            console.log('✓ Child cards created successfully');

            // Show success message
            showToast('Child cards created successfully!', 'success');

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
        console.error('=== ERROR CREATING CARDS ===');
        console.error('Error type:', error.name);
        console.error('Error message:', error.message);
        console.error('Full error:', error);
        console.error('Stack trace:', error.stack);

        // Show error message
        showToast('Failed to create cards. Please try again.', 'error');

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
            ok: response.ok
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
            message: error.message
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

// Set loading state for the create button
function setLoadingState(loading) {
    const createButton = document.getElementById('create-cards-btn');
    const cancelButton = document.getElementById('cancel-btn');
    const checkboxes = document.querySelectorAll('.checklist-checkbox');

    if (loading) {
        createButton.disabled = true;
        createButton.classList.add('loading');
        cancelButton.disabled = true;
        checkboxes.forEach(cb => cb.disabled = true);
    } else {
        createButton.disabled = false;
        createButton.classList.remove('loading');
        cancelButton.disabled = false;
        checkboxes.forEach(cb => cb.disabled = false);
        validateForm(); // Re-validate to set correct button state
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

// Show error in the UI
function showError(message) {
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');

    loadingState.style.display = 'none';
    emptyState.style.display = 'block';
    emptyState.querySelector('.empty-state-text').textContent = message;
}

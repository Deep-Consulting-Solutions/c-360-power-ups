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
        startTimerUrl: 'https://c360-staging-flows.app.n8n.cloud/webhook/staging/start-timer',
        stopTimerUrl: 'https://c360-staging-flows.app.n8n.cloud/webhook/staging/stop-timer',
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

// Get Trello Power-Up instance
const t = window.TrelloPowerUp.iframe();

// Harvest projects data
let harvestProjects = [];
let selectedProject = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async function() {
    try {
        populateCategoryDropdown();

        const member = await t.member('id', 'username', 'fullName');
        setDefaultCategory(member);

        // Load Harvest projects (has its own error handling)
        try {
            await loadHarvestProjects();

            // Auto-match project if successful
            const card = await t.card('name');
            autoMatchProject(card.name);
        } catch (harvestError) {
            console.error('Harvest error:', harvestError);
            // loadHarvestProjects already shows error, don't call showProjectError again
        }

        setupEventListeners();

        // Resize popup to fit content
        t.sizeTo('#popup-container').done();
    } catch (error) {
        console.error('Error initializing popup:', error);
        // Don't show project error for general initialization errors
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

// Load Harvest projects
async function loadHarvestProjects() {
    const projectLoading = document.getElementById('project-loading');
    const projectDropdown = document.getElementById('project-dropdown');
    const projectError = document.getElementById('project-error');

    // Reset all states first
    projectLoading.style.display = 'none';
    projectDropdown.style.display = 'none';
    projectError.style.display = 'none';

    // Show loading state
    projectLoading.style.display = 'block';

    try {
        console.log('Fetching Harvest projects from:', HARVEST_CONFIG.apiBaseUrl);

        // Fetch projects from Harvest API
        const response = await fetch(
            `${HARVEST_CONFIG.apiBaseUrl}/projects?is_active=true&per_page=2000`,
            {
                headers: {
                    'Authorization': `Bearer ${HARVEST_CONFIG.accessToken}`,
                    'Harvest-Account-Id': HARVEST_CONFIG.accountId,
                    'User-Agent': HARVEST_CONFIG.userAgent
                },
                signal: AbortSignal.timeout(10000) // 10s timeout
            }
        );

        if (!response.ok) {
            throw new Error(`Harvest API returned ${response.status}`);
        }

        const data = await response.json();
        harvestProjects = data.projects || [];
        console.log(`✓ Loaded ${harvestProjects.length} Harvest projects successfully`);

        populateProjectDropdown(harvestProjects);

        // Hide loading and error, show dropdown
        projectLoading.style.display = 'none';
        projectError.style.display = 'none';
        projectDropdown.style.display = 'block';
        console.log('Project dropdown displayed, error hidden');

    } catch (error) {
        console.error('Failed to load Harvest projects:', error);
        projectLoading.style.display = 'none';
        projectDropdown.style.display = 'none';
        projectError.style.display = 'block';
        // Don't re-throw - error UI already shown to user
    }
}

function populateProjectDropdown(projects) {
    const selectElement = document.getElementById('project-select');

    selectElement.innerHTML = '<option value="">-- Select Project --</option>';

    const sortedProjects = [...projects].sort((a, b) =>
        a.name.localeCompare(b.name)
    );

    sortedProjects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        option.dataset.projectData = JSON.stringify({
            id: project.id,
            name: project.name,
            code: project.code || '',
            client: {
                id: project.client?.id || null,
                name: project.client?.name || ''
            }
        });
        selectElement.appendChild(option);
    });
}

function autoMatchProject(cardName) {
    try {
        console.log('Attempting to auto-match project for card:', cardName);

        const selectElement = document.getElementById('project-select');
        const matchInfo = document.getElementById('project-match-info');
        const matchedProjectName = document.getElementById('matched-project-name');

        const matchedProject = harvestProjects.find(project =>
            project.name.toLowerCase() === cardName.toLowerCase()
        );

        if (matchedProject) {
            console.log('✓ Found matching project:', matchedProject.name);
            selectElement.value = matchedProject.id;

            const option = selectElement.options[selectElement.selectedIndex];
            selectedProject = JSON.parse(option.dataset.projectData);

            matchedProjectName.textContent = matchedProject.name;
            matchInfo.style.display = 'block';

            // Validate form (enables Start Timer button if category also selected)
            validateForm();
        } else {
            console.log('No matching Harvest project found for card name:', cardName);
        }
    } catch (error) {
        console.error('Error in autoMatchProject:', error);
        // Don't let auto-match errors break the popup
    }
}

// Show project error
function showProjectError() {
    const projectLoading = document.getElementById('project-loading');
    const projectError = document.getElementById('project-error');

    projectLoading.style.display = 'none';
    projectError.style.display = 'block';

    // Disable start button
    const startButton = document.getElementById('start-timer-btn');
    startButton.disabled = true;
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

    // Project dropdown change
    const projectSelect = document.getElementById('project-select');
    projectSelect.addEventListener('change', function() {
        const option = projectSelect.options[projectSelect.selectedIndex];
        if (projectSelect.value && option.dataset.projectData) {
            selectedProject = JSON.parse(option.dataset.projectData);

            // Hide auto-match indicator if manually changed
            const matchInfo = document.getElementById('project-match-info');
            matchInfo.style.display = 'none';
        } else {
            selectedProject = null;
        }
        validateForm();
    });

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
    const projectSelect = document.getElementById('project-select');
    const startButton = document.getElementById('start-timer-btn');
    const infoMessage = document.getElementById('info-message');
    const projectInfoMessage = document.getElementById('project-info-message');
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

    // Check both category and project are selected
    const hasCategory = !!categoryValue;
    const hasProject = !!projectSelect.value;
    const isValid = hasCategory && hasProject;

    if (isValid) {
        // Enable button
        startButton.disabled = false;

        // Hide info messages
        infoMessage.style.display = 'none';
        projectInfoMessage.style.display = 'none';

        // Update progress bar to 100%
        progressBar.classList.add('complete');

        return true;
    } else {
        // Disable button
        startButton.disabled = true;

        // Show appropriate info messages
        if (!hasCategory) {
            infoMessage.style.display = 'flex';
        } else {
            infoMessage.style.display = 'none';
        }

        if (!hasProject) {
            projectInfoMessage.style.display = 'flex';
        } else {
            projectInfoMessage.style.display = 'none';
        }

        // Update progress bar to 50%
        progressBar.classList.remove('complete');

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
            project: selectedProject,
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
    const timeoutId = setTimeout(() => {
        console.warn('Request timeout triggered');
        controller.abort();
    }, API_CONFIG.timeout);

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
            throw new Error('API call timed out after ' + API_CONFIG.timeout + 'ms');
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
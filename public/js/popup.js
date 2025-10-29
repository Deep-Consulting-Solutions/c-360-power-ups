// Check if configuration is loaded, provide defaults if not
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

// Harvest users cache (for user ID resolution - same as client.js)
let harvestUsersCache = null;

// Fetch Harvest users
async function fetchHarvestUsers() {
    if (harvestUsersCache) {
        return harvestUsersCache;
    }

    if (!HARVEST_CONFIG.accessToken || !HARVEST_CONFIG.accountId) {
        console.warn('Harvest API credentials not configured');
        return [];
    }

    try {
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
        return harvestUsersCache;
    } catch (error) {
        console.error('Failed to fetch Harvest users:', error);
        return [];
    }
}

// Resolve Trello user to Harvest user ID (same logic as client.js)
async function resolveHarvestUserId(trelloMember) {
    try {
        const harvestUsers = await fetchHarvestUsers();

        if (!harvestUsers || harvestUsers.length === 0) {
            console.warn('No Harvest users available for matching');
            return null;
        }

        // Strategy 1: Match by email (preferred)
        if (trelloMember.email) {
            const emailMatch = harvestUsers.find(hUser =>
                hUser.email && hUser.email.toLowerCase() === trelloMember.email.toLowerCase()
            );

            if (emailMatch) {
                console.log(`✓ Matched by email: ${trelloMember.username} → ${emailMatch.first_name} ${emailMatch.last_name} (ID: ${emailMatch.id})`);
                return emailMatch.id;
            }
        }

        // Strategy 2: Use config mapping (fallback)
        if (typeof TRELLO_HARVEST_USER_MAPPINGS !== 'undefined') {
            if (TRELLO_HARVEST_USER_MAPPINGS[trelloMember.username]) {
                const harvestUserId = TRELLO_HARVEST_USER_MAPPINGS[trelloMember.username];
                console.log(`✓ Matched by username config: ${trelloMember.username} → ${harvestUserId}`);
                return harvestUserId;
            }

            if (TRELLO_HARVEST_USER_MAPPINGS[trelloMember.id]) {
                const harvestUserId = TRELLO_HARVEST_USER_MAPPINGS[trelloMember.id];
                console.log(`✓ Matched by user ID config: ${trelloMember.id} → ${harvestUserId}`);
                return harvestUserId;
            }
        }

        console.warn(`Unable to resolve Harvest user ID for: ${trelloMember.username}`);
        return null;
    } catch (error) {
        console.error('Error resolving Harvest user ID:', error);
        return null;
    }
}

// Check if user has any running timer
async function checkUserHasAnyRunningTimer(trelloMember) {
    try {
        if (!HARVEST_CONFIG.accessToken || !HARVEST_CONFIG.accountId) {
            return null;
        }

        const harvestUserId = await resolveHarvestUserId(trelloMember);

        if (!harvestUserId) {
            return null;
        }

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
            return null;
        }

        const data = await response.json();
        const runningTimers = data.time_entries || [];

        if (runningTimers.length > 0) {
            const timer = runningTimers[0];
            return {
                project: timer.project ? timer.project.name : 'Unknown Project',
                client: timer.client ? timer.client.name : 'Unknown Client',
                task: timer.task ? timer.task.name : 'Unknown Task',
                notes: timer.notes || ''
            };
        }

        return null;
    } catch (error) {
        console.error('Error checking for running timers:', error);
        return null;
    }
}

// Helper function to detect if card is a child card (has Trello card attachment)
function getParentCardAttachment(card) {
    console.log('=== CHECKING FOR PARENT CARD ATTACHMENT ===');
    console.log('Card attachments:', card.attachments);
    console.log('Number of attachments:', card.attachments ? card.attachments.length : 0);

    if (!card.attachments || card.attachments.length === 0) {
        console.log('❌ No attachments found on card');
        return null;
    }

    // Log all attachments for debugging
    card.attachments.forEach((att, index) => {
        console.log(`Attachment ${index + 1}:`, {
            name: att.name,
            url: att.url,
            isTrelloCard: att.url && att.url.includes('trello.com/c/')
        });
    });

    // Find attachment that is a Trello card URL
    const parentAttachment = card.attachments.find(attachment => {
        return attachment.url && attachment.url.includes('trello.com/c/');
    });

    if (parentAttachment) {
        console.log('✓ Found parent card attachment:', parentAttachment);
    } else {
        console.log('❌ No Trello card attachment found');
    }

    return parentAttachment || null;
}

// Extract parent card name from Trello attachment URL
function getParentCardNameFromAttachment(parentAttachment) {
    console.log('=== EXTRACTING PARENT CARD NAME ===');
    console.log('Parent attachment URL:', parentAttachment.url);

    if (!parentAttachment || !parentAttachment.url) {
        console.log('❌ No parent attachment or URL provided');
        return null;
    }

    // Extract from URL slug
    // URL format: https://trello.com/c/CARD_ID/NUMBER-card-name-slug
    const urlParts = parentAttachment.url.split('/');
    const nameSlug = urlParts[urlParts.length - 1];
    console.log('URL slug:', nameSlug);

    if (!nameSlug) {
        console.error('❌ Could not extract slug from URL');
        return null;
    }

    // Remove card number prefix (e.g., "659-esa-campaign" -> "esa-campaign")
    const slugWithoutNumber = nameSlug.replace(/^\d+-/, '');
    console.log('Slug without number:', slugWithoutNumber);

    // Convert kebab-case to Title Case
    const extractedName = slugWithoutNumber
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

    console.log('✓ Extracted parent card name:', extractedName);
    return extractedName;
}

// Load categories from Harvest tasks + USER_CATEGORY_MAPPING
async function loadCategories() {
    try {
        console.log('Loading categories...');

        // Try to get tasks from parent window cache first (faster!)
        let tasks = [];
        try {
            if (window.parent && window.parent.fetchHarvestTasks) {
                console.log('Using cached Harvest tasks from parent window');
                tasks = await window.parent.fetchHarvestTasks();
            }
        } catch (cacheError) {
            console.warn('Could not access parent cache, fetching directly:', cacheError);
        }

        // If no cached tasks, fetch directly
        if (tasks.length === 0) {
            // Check if Harvest is configured
            if (!HARVEST_CONFIG.accessToken || !HARVEST_CONFIG.accountId) {
                console.warn('Harvest API credentials not configured, using USER_CATEGORY_MAPPING only');
                const mappedCategories = Object.values(USER_CATEGORY_MAPPING);
                return [...new Set(mappedCategories)].sort();
            }

            // Fetch tasks directly from Harvest
            console.log('Fetching Harvest tasks for categories...');
            const response = await fetch(
                `${HARVEST_CONFIG.apiBaseUrl}/tasks?is_active=true&per_page=2000`,
                {
                    headers: {
                        'Authorization': `Bearer ${HARVEST_CONFIG.accessToken}`,
                        'Harvest-Account-Id': HARVEST_CONFIG.accountId,
                        'User-Agent': HARVEST_CONFIG.userAgent
                    },
                    signal: AbortSignal.timeout(10000)
                }
            );

            if (!response.ok) {
                throw new Error(`Harvest API returned ${response.status}`);
            }

            const data = await response.json();
            tasks = data.tasks || [];
        }

        const harvestCategories = tasks.map(task => task.name);
        console.log(`✓ Loaded ${harvestCategories.length} categories from Harvest`);

        // Get unique categories from USER_CATEGORY_MAPPING values
        const mappedCategories = Object.values(USER_CATEGORY_MAPPING);

        // Merge: Harvest tasks + mapped categories (deduplicated)
        const allCategories = [...new Set([...harvestCategories, ...mappedCategories])];

        // Sort alphabetically
        return allCategories.sort();
    } catch (error) {
        console.error('Error loading categories from Harvest:', error);

        // Fall back to USER_CATEGORY_MAPPING values only
        const mappedCategories = Object.values(USER_CATEGORY_MAPPING);
        const uniqueCategories = [...new Set(mappedCategories)];

        if (uniqueCategories.length > 0) {
            console.warn(`Using ${uniqueCategories.length} categories from USER_CATEGORY_MAPPING as fallback`);
            return uniqueCategories.sort();
        }

        // If all else fails, return empty array
        console.error('No categories available');
        return [];
    }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Load categories from Harvest first
        const categories = await loadCategories();

        if (categories.length === 0) {
            console.error('No categories available - cannot initialize popup');
            alert('Unable to load task categories. Please check Harvest configuration.');
            return;
        }

        // Populate dropdown with loaded categories
        populateCategoryDropdown(categories);

        const member = await t.member('id', 'username', 'fullName');
        setDefaultCategory(member, categories);

        // Get card details (name, labels, and attachments)
        const card = await t.card('name', 'labels', 'attachments');

        // Get client name from first label
        const clientName = card.labels && card.labels.length > 0 ? card.labels[0].name : null;
        console.log('Card client label:', clientName || 'No label found');

        // Check if this is a child card (has parent card attachment)
        console.log('=== CHECKING IF CHILD CARD ===');
        console.log('Current card name:', card.name);

        const parentAttachment = getParentCardAttachment(card);
        let cardNameForMatching = card.name;
        let isChildCard = false;

        if (parentAttachment) {
            console.log('✓✓✓ CHILD CARD DETECTED ✓✓✓');
            console.log('Parent attachment:', parentAttachment);

            const parentCardName = getParentCardNameFromAttachment(parentAttachment);
            console.log('Final parent card name to use:', parentCardName);

            if (parentCardName) {
                cardNameForMatching = parentCardName;
                isChildCard = true;
                console.log(`✓✓✓ WILL USE PARENT CARD NAME: "${parentCardName}"`);
                console.log(`Original child card name was: "${card.name}"`);
            } else {
                console.error('❌❌❌ FAILED to extract parent card name from attachment');
                console.log('Will use child card name instead:', card.name);
            }
        } else {
            console.log('ℹ️ This is NOT a child card (no parent attachment found)');
            console.log('Will use card\'s own name:', card.name);
        }

        console.log('=== FINAL DECISION ===');
        console.log('Card name for matching:', cardNameForMatching);
        console.log('Is child card?', isChildCard);

        // Load Harvest projects (has its own error handling)
        try {
            await loadHarvestProjects(clientName);

            // Auto-match project if successful (using parent card name if child)
            autoMatchProject(cardNameForMatching, clientName, isChildCard);
        } catch (harvestError) {
            console.error('Harvest error:', harvestError);
            // loadHarvestProjects already shows error, don't call showProjectError again
        }

        setupEventListeners();

        // Final validation to ensure correct button state after all setup
        validateForm();

        // Resize popup to fit content
        t.sizeTo('#popup-container').done();
    } catch (error) {
        console.error('Error initializing popup:', error);
        // Don't show project error for general initialization errors
    }
});

// Populate category dropdown with categories from Harvest + Custom option
function populateCategoryDropdown(categories) {
    const selectElement = document.getElementById('category-select');

    // Clear existing options first
    selectElement.innerHTML = '<option value="">-- Select Category --</option>';

    // Add categories from Harvest
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        selectElement.appendChild(option);
    });

    // Add "Add New Category" option at the end
    const customOption = document.createElement('option');
    customOption.value = '__CUSTOM__';
    customOption.textContent = '+ Add New Category';
    // selectElement.appendChild(customOption);
}

// Set default category based on user mapping
function setDefaultCategory(member, categories) {
    const selectElement = document.getElementById('category-select');

    // Try to find mapping by user ID first, then by username
    const defaultCategory = USER_CATEGORY_MAPPING[member.id] ||
                          USER_CATEGORY_MAPPING[member.username] ||
                          '';

    if (defaultCategory && categories.includes(defaultCategory)) {
        selectElement.value = defaultCategory;
        console.log(`✓ Default category set to: ${defaultCategory}`);
        // Enable the start button if a default category is set
        validateForm();
    }
}

// Load Harvest projects filtered by client
async function loadHarvestProjects(clientName) {
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

        // Filter projects by client if client name is provided
        let filteredProjects = harvestProjects;
        if (clientName) {
            filteredProjects = harvestProjects.filter(project =>
                project.client && project.client.name === clientName
            );
            console.log(`✓ Filtered to ${filteredProjects.length} projects for client: ${clientName}`);
        } else {
            console.warn('No client label on card - showing all projects');
        }

        // Check if we have any projects to show
        if (filteredProjects.length === 0) {
            if (clientName) {
                throw new Error(`No projects found for client: ${clientName}`);
            } else {
                throw new Error('No projects available');
            }
        }

        populateProjectDropdown(filteredProjects);

        // Hide loading and error, show dropdown
        projectLoading.style.display = 'none';
        projectError.style.display = 'none';
        projectDropdown.style.display = 'block';
        console.log('Project dropdown displayed, error hidden');

        // Validate form state after projects loaded (in case category already selected)
        validateForm();

    } catch (error) {
        console.error('Failed to load Harvest projects:', error);
        projectLoading.style.display = 'none';
        projectDropdown.style.display = 'none';
        projectError.style.display = 'block';

        // Update error message to be more specific
        const errorSpan = document.querySelector('#project-error .info-message span');
        if (errorSpan) {
            errorSpan.textContent = error.message;
        }

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

function autoMatchProject(cardName, clientName, isChildCard = false) {
    try {
        console.log('=== AUTO-MATCH PROJECT FUNCTION ===');
        console.log('Parameters received:');
        console.log('  - cardName:', cardName);
        console.log('  - clientName:', clientName);
        console.log('  - isChildCard:', isChildCard);

        const selectElement = document.getElementById('project-select');
        const matchInfo = document.getElementById('project-match-info');
        const matchedProjectName = document.getElementById('matched-project-name');

        console.log('Total Harvest projects loaded:', harvestProjects.length);

        // Filter projects by client if provided
        let projectsToSearch = harvestProjects;
        if (clientName) {
            projectsToSearch = harvestProjects.filter(project =>
                project.client && project.client.name === clientName
            );
            console.log(`✓ Filtered to ${projectsToSearch.length} projects for client: ${clientName}`);
        } else {
            console.log('No client filter - searching all projects');
        }

        // Log a few project names for debugging
        console.log('Available projects to search (first 5):', projectsToSearch.slice(0, 5).map(p => p.name));

        console.log(`Searching for project name matching: "${cardName}"`);

        const matchedProject = projectsToSearch.find(project =>
            project.name.toLowerCase() === cardName.toLowerCase()
        );

        if (matchedProject) {
            console.log('✓✓✓ FOUND MATCHING PROJECT ✓✓✓');
            console.log('Matched project:', matchedProject.name);
            console.log('Project ID:', matchedProject.id);

            selectElement.value = matchedProject.id;
            console.log('Set dropdown value to:', matchedProject.id);

            const option = selectElement.options[selectElement.selectedIndex];
            console.log('Selected option:', option);

            if (option && option.dataset.projectData) {
                selectedProject = JSON.parse(option.dataset.projectData);
                console.log('Selected project data:', selectedProject);

                // Update match info text based on whether this is a child card
                if (isChildCard) {
                    matchedProjectName.textContent = `${matchedProject.name} (from parent card)`;
                    console.log('✓ Showing match with "(from parent card)" indicator');
                } else {
                    matchedProjectName.textContent = matchedProject.name;
                    console.log('✓ Showing match without indicator');
                }
                matchInfo.style.display = 'block';
            } else {
                console.error('❌ Option or dataset.projectData not found');
            }

            // Validate form (enables Start Timer button if category also selected)
            validateForm();
        } else {
            console.log('❌❌❌ NO MATCHING PROJECT FOUND ❌❌❌');
            console.log(`Searched for: "${cardName}"`);
            console.log(`In ${projectsToSearch.length} projects`);
            // Validate form state even without auto-match
            validateForm();
        }
    } catch (error) {
        console.error('❌❌❌ ERROR in autoMatchProject:', error);
        console.error('Stack trace:', error.stack);
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
        console.log('Project dropdown changed to:', projectSelect.value);

        const option = projectSelect.options[projectSelect.selectedIndex];
        if (projectSelect.value && option.dataset.projectData) {
            selectedProject = JSON.parse(option.dataset.projectData);
            console.log('Selected project data:', selectedProject.name);

            // Hide auto-match indicator if manually changed
            const matchInfo = document.getElementById('project-match-info');
            if (matchInfo) {
                matchInfo.style.display = 'none';
            }
        } else {
            selectedProject = null;
            console.log('Project selection cleared');
        }

        console.log('Calling validateForm() after project change');
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
    console.log('=== validateForm() called ===');

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

    console.log('Validation state:', {
        categoryValue: categoryValue,
        projectValue: projectSelect.value,
        hasCategory: hasCategory,
        hasProject: hasProject,
        isValid: isValid,
        buttonDisabled: startButton.disabled
    });

    if (isValid) {
        // Enable button
        startButton.disabled = false;

        // Hide info messages
        infoMessage.style.display = 'none';
        projectInfoMessage.style.display = 'none';

        // Update progress bar to 100%
        progressBar.classList.add('complete');

        console.log('✓ Form valid - Start Timer button ENABLED');
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

        console.log('✗ Form invalid - Start Timer button DISABLED');
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

        // Check if user is mapped to Harvest
        console.log('Checking user mapping to Harvest...');
        const harvestUserId = await resolveHarvestUserId(member);

        if (!harvestUserId) {
            // User not mapped to Harvest
            console.warn(`User ${member.username} not mapped to Harvest`);
            showToast(`Timer not configured for your account (${member.username}). Please contact your administrator to add your Harvest mapping.`, 'error');
            setLoadingState(false);
            return;
        }

        console.log(`User ${member.username} mapped to Harvest user ID: ${harvestUserId}`);
        console.log('Proceeding to start timer - Harvest will automatically stop any existing timer');

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
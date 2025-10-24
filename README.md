# C-360 Timer Power-Up for Trello

A Trello Power-Up that adds time tracking functionality with task category selection. This Power-Up adds two buttons to Trello cards for starting and stopping timers, with integration to N8N workflows for time tracking.

## Features

- **Start Timer Button**: Opens a popup to select a task category before starting the timer
- **Stop Timer Button**: Immediately stops the timer without requiring additional input
- **Task Categories**: Predefined categories (Copywriting, Project Management, Account Management, PR, Design)
- **User Mapping**: Automatically pre-selects categories based on user mappings
- **N8N Integration**: Sends timer data to N8N workflows via webhooks
- **Retry Logic**: Automatic retry mechanism for failed API calls
- **Responsive Design**: Works on desktop and mobile devices

## Project Structure

```
C-360-trello/
├── public/
│   ├── manifest.json      # Power-Up configuration
│   ├── index.html         # Main Power-Up file
│   ├── popup.html         # Popup window HTML
│   └── icon.svg           # Power-Up icon (optional)
├── js/
│   ├── client.js          # Main client logic
│   ├── popup.js           # Popup window logic
│   └── config.js          # Configuration file
├── css/
│   └── styles.css         # Styling
├── vercel.json            # Vercel configuration
├── package.json           # Project dependencies
├── .gitignore             # Git ignore file
├── .env.example           # Example environment variables
└── README.md              # This file
```

## Setup Instructions

### 1. Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Vercel CLI (for deployment)
- Trello account with admin access to a workspace
- N8N instance with webhook endpoints configured

### 2. Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/c-360-trello.git
cd c-360-trello
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment variables example:
```bash
cp .env.example .env
```

### 3. Configuration

#### Update N8N Webhook URLs

Edit `js/config.js` and update the N8N webhook URLs:

```javascript
const N8N_CONFIG = {
    startTimerUrl: 'https://your-n8n-instance.com/webhook/start-timer',
    stopTimerUrl: 'https://your-n8n-instance.com/webhook/stop-timer',
    apiKey: 'your-api-key-here'
};
```

#### Configure User Mappings

Add Trello user IDs and their default categories in `js/config.js`:

```javascript
const USER_CATEGORY_MAPPING = {
    'user_id_1': 'Copywriting',
    'user_id_2': 'Design',
    'user_id_3': 'Project Management',
    // Add more mappings as needed
};
```

To find Trello user IDs:
1. Open a Trello card
2. Add the user as a member
3. Open browser console and run:
```javascript
// Get all members of the current card
t.card('members').then(card => console.log(card.members));
```

#### Customize Categories

To modify the available task categories, edit the `CATEGORIES` array in `js/config.js`:

```javascript
const CATEGORIES = [
    'Copywriting',
    'Project Management',
    'Account Management',
    'PR',
    'Design',
    // Add or remove categories as needed
];
```

### 4. Local Development

To test the Power-Up locally:

1. Start the local server:
```bash
npm run dev
```

2. Open Trello and go to your board
3. Click on the board menu → Power-Ups
4. Enable "Custom" Power-Up (at the bottom)
5. Add your local URL: `http://localhost:3000`

### 5. Deploy to Vercel

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. Deploy the project:
```bash
vercel --prod
```

4. Note your deployment URL (e.g., `https://c-360-trello.vercel.app`)

### 6. Register Power-Up with Trello

1. Go to [Trello Power-Ups Admin](https://trello.com/power-ups/admin)

2. Click "Create New Power-Up"

3. Fill in the details:
   - **Name**: C-360 Timer
   - **Description**: Track time spent on tasks with category selection
   - **Author**: Your name/organization
   - **Iframe connector URL**: Your Vercel URL (e.g., `https://c-360-trello.vercel.app`)

4. Select capabilities:
   - ✅ Card Buttons
   - ✅ Callback

5. Save and note your Power-Up ID

### 7. Add Power-Up to Workspace

1. Open a Trello board
2. Click Show Menu → Power-Ups
3. Search for your Power-Up name
4. Click "Add" to enable it

## N8N Webhook Configuration

### Start Timer Webhook

The start timer webhook receives the following payload:

```json
{
  "card": {
    "id": "card_id",
    "name": "Card Title",
    "desc": "Card Description",
    "idBoard": "board_id",
    "idList": "list_id",
    "labels": [...],
    "members": [...],
    "due": "2024-01-01T00:00:00.000Z",
    "dueComplete": false,
    "attachments": [...],
    "url": "https://trello.com/c/...",
    "shortUrl": "https://trello.com/c/..."
  },
  "user": {
    "id": "user_id",
    "fullName": "John Doe",
    "username": "johndoe",
    "avatarUrl": "https://...",
    "initials": "JD"
  },
  "category": "Design",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "boardName": "Board Name",
  "listName": "List Name"
}
```

### Stop Timer Webhook

The stop timer webhook receives the following payload:

```json
{
  "card": { /* same as start timer */ },
  "user": { /* same as start timer */ },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "boardName": "Board Name",
  "listName": "List Name"
}
```

### N8N Workflow Setup

1. Create a new workflow in N8N
2. Add a Webhook node
3. Set method to POST
4. Copy the webhook URL
5. Add your processing logic (e.g., save to database, send to time tracking system)
6. Activate the workflow

## API Authentication

The Power-Up sends an API key in the header for authentication:

```
X-API-Key: your-api-key-here
```

Configure your N8N webhook to validate this API key for security.

## Troubleshooting

### Power-Up not showing on cards

- Ensure the Power-Up is enabled for the board
- Check browser console for errors
- Verify the iframe connector URL is correct

### API calls failing

- Check N8N webhook URL is correct
- Verify API key is set correctly
- Check browser console for CORS errors
- Ensure N8N workflow is activated

### Categories not showing

- Verify `CATEGORIES` array in `config.js` is properly formatted
- Check browser console for JavaScript errors

### Default category not selected

- Verify user ID mapping is correct
- Check console for user ID: `t.member('id').then(m => console.log(m.id))`

## Development Tips

### Debug Mode

Add debug logging by uncommenting console.log statements in the code:

```javascript
console.log('Card data:', card);
console.log('User data:', member);
console.log('Selected category:', selectedCategory);
```

### Testing API Calls

Test N8N webhooks using curl:

```bash
curl -X POST https://your-n8n-instance.com/webhook/start-timer \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{"card": {...}, "user": {...}, "category": "Design", "timestamp": "2024-01-01T00:00:00.000Z"}'
```

### Updating Styles

The CSS follows Trello's design system. Key colors:
- Primary: `#026aa7`
- Success: `#61bd4f`
- Error: `#eb5a46`
- Text: `#172b4d`
- Muted: `#5e6c84`

## Security Considerations

- Never commit API keys to version control
- Use environment variables for sensitive data in production
- Implement proper CORS headers in Vercel configuration
- Validate all inputs before sending to API
- Use HTTPS for all external communications
- Consider implementing rate limiting in N8N

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Support

For issues or questions:
1. Check the browser console for error messages
2. Review the N8N workflow logs
3. Verify all configuration settings
4. Create an issue in the GitHub repository

## License

MIT License - See LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Future Enhancements

- [ ] Add timer pause/resume functionality
- [ ] Display active timer status on cards
- [ ] Add timer duration tracking
- [ ] Implement bulk timer operations
- [ ] Add reporting dashboard
- [ ] Support for custom categories per board
- [ ] Integration with other time tracking systems
- [ ] Add keyboard shortcuts
- [ ] Implement timer reminders
- [ ] Add export functionality for time logs
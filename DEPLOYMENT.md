# Deployment Guide - C-360 Timer Power-Up

## Environment-Based Configuration

This Power-Up now uses **environment-based configuration** to automatically use the correct N8N webhook URLs for staging and production environments.

---

## How It Works

The build process automatically generates `public/js/config.js` based on environment variables:

### Environment Variables

Set these in your deployment environment (Vercel dashboard):

| Variable | Description | Example |
|----------|-------------|---------|
| `ENVIRONMENT` | Deployment environment | `staging` or `production` |
| `N8N_API_KEY` | N8N API authentication key | Your actual API key |

### Generated URLs

The build script automatically constructs URLs based on `ENVIRONMENT`:

**For `ENVIRONMENT=staging`:**
```
Start Timer: https://c360-staging-flows.app.n8n.cloud/webhook/staging/start-timer
Stop Timer:  https://c360-staging-flows.app.n8n.cloud/webhook/staging/stop-timer
```

**For `ENVIRONMENT=production`:**
```
Start Timer: https://c360-staging-flows.app.n8n.cloud/webhook/production/start-timer
Stop Timer:  https://c360-staging-flows.app.n8n.cloud/webhook/production/stop-timer
```

---

## Local Development Setup

### 1. Create `.env` File

```bash
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env`:
```env
ENVIRONMENT=staging
N8N_API_KEY=your-actual-api-key-here
```

### 3. Build and Run

```bash
npm run dev
```

This will:
1. Generate `public/js/config.js` from environment variables
2. Start local server on `http://localhost:3000`

---

## Vercel Deployment

### Setting Up Environment Variables

1. Go to your Vercel project dashboard
2. Navigate to **Settings → Environment Variables**
3. Add the following variables:

#### For Staging Deployment:
```
ENVIRONMENT = staging
N8N_API_KEY = your-staging-api-key
```

#### For Production Deployment:
```
ENVIRONMENT = production
N8N_API_KEY = your-production-api-key
```

### Deploy to Vercel

```bash
npm run deploy
```

Or push to your connected Git repository (auto-deployment).

---

## Build Process

The build process (`build-config.js`) automatically runs:

1. **During local development:** `npm run dev`
2. **During deployment:** Vercel runs `node build-config.js`
3. **Manual build:** `npm run build`

### What Happens During Build:

1. Reads environment variables (`ENVIRONMENT`, `N8N_API_KEY`)
2. Constructs N8N webhook URLs based on environment
3. Generates `public/js/config.js` with injected values
4. File is gitignored and regenerated on each deployment

---

## File Structure

```
├── build-config.js          # Build script (generates config.js)
├── .env                     # Local environment variables (gitignored)
├── .env.example             # Template for environment variables
├── public/
│   └── js/
│       ├── config.js        # Generated file (gitignored)
│       └── config.template.js # Template backup
├── package.json             # Contains build scripts
└── vercel.json             # Vercel deployment config
```

---

## Important Notes

### ⚠️ Never Commit Secrets

- `.env` is gitignored
- `public/js/config.js` is gitignored
- API keys are injected at build time

### 🔄 Config File Generation

The `public/js/config.js` file is **auto-generated**. Do not edit it manually.

To change categories or user mappings, edit `build-config.js` template section.

### 🌍 Multiple Environments

You can create separate Vercel projects for staging and production:

1. **c360-timer-staging** → Set `ENVIRONMENT=staging`
2. **c360-timer-production** → Set `ENVIRONMENT=production`

---

## Troubleshooting

### Config file not updating?

Run the build script manually:
```bash
npm run build
```

### API calls failing?

1. Check Vercel environment variables are set
2. Verify N8N webhooks are active
3. Check browser console for errors (F12 → Console)
4. Verify API key is correct

### Local development not working?

1. Ensure `.env` file exists in project root
2. Run `npm run build` to generate config
3. Check that `public/js/config.js` was created

---

## Testing the Configuration

After deployment, test by:

1. Opening a Trello card
2. Clicking "Start Timer" button
3. Selecting a category
4. Clicking "Start Timer"
5. Check browser Network tab for POST request to correct N8N URL

Expected Request:
```
POST https://c360-staging-flows.app.n8n.cloud/webhook/staging/start-timer
Headers: X-API-Key: your-api-key
```

---

## Updating the N8N Base URL

If your N8N instance URL changes, edit `build-config.js` line 32:

```javascript
const N8N_BASE_URL = 'https://c360-staging-flows.app.n8n.cloud/webhook';
```

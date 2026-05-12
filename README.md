# 🧀 CheezBuddy

The GasBuddy of the snack aisle. Live Cheez-It prices from major US retailers, ranked by cost per ounce.

## Deploy to Vercel (5 minutes)

### 1. Push to GitHub
Make sure your code is pushed to a GitHub repo.

### 2. Import into Vercel
- Go to [vercel.com](https://vercel.com) → **Add New Project**
- Connect your GitHub account and select your repo
- Leave all build settings as-is (Vercel auto-detects everything)
- Click **Deploy**

### 3. Add your Anthropic API key
- In Vercel: **Project Settings → Environment Variables**
- Name: `ANTHROPIC_API_KEY`
- Value: your key from [console.anthropic.com](https://console.anthropic.com)
- Click **Save** → go to **Deployments** → **Redeploy**

That's it — your site is live and shareable!

## How it works
- `index.html` — the frontend (hero, price cards, sort controls)
- `api/search.js` — Vercel serverless function that calls the Anthropic API with web search and returns a clean JSON array of prices
- Your API key stays safe on the server and is never exposed to the browser

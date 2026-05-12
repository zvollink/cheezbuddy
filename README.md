# 🧀 CheezBuddy

The GasBuddy of the snack aisle. Live Cheez-It prices from major US retailers, ranked by cost per ounce.

## Deploy to Netlify (5 minutes)

### 1. Put the files on GitHub
Create a new repo and push this folder:
```
cheezbuddy/
├── index.html
├── netlify.toml
├── README.md
└── netlify/
    └── functions/
        └── search.js
```

### 2. Connect to Netlify
- Go to [netlify.com](https://netlify.com) → **Add new site → Import an existing project**
- Connect your GitHub repo
- Build settings are auto-detected from `netlify.toml` — no changes needed
- Click **Deploy site**

### 3. Add your Anthropic API key
- In Netlify: **Site configuration → Environment variables → Add a variable**
- Key: `ANTHROPIC_API_KEY`
- Value: your key from [console.anthropic.com](https://console.anthropic.com)
- Click **Save**, then **Trigger deploy** to redeploy with the new env var

That's it — your site is live and shareable!

## How it works
- `index.html` — the frontend (hero, price cards, sort controls)
- `netlify/functions/search.js` — serverless proxy that calls the Anthropic API with web search, handles the multi-turn tool loop, and returns a clean JSON array of prices
- Your API key stays safe on the server side and is never exposed to the browser

## Notes
- Netlify free tier includes 125k function invocations/month — more than enough
- Each search takes ~5–15 seconds (web search + AI processing)
- No database or caching — every button click fetches fresh prices

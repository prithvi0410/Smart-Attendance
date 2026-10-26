# Deployment Guide

## Dashboard → Netlify

### Prerequisites
- [Netlify account](https://app.netlify.com)
- GitHub repository (push this project to GitHub)

### Method 1: Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build the dashboard
cd dashboard
npm run build

# Deploy
netlify deploy --prod --dir=dist
```

### Method 2: Netlify Web UI (Git Integration)

1. Push your repository to GitHub
2. Go to [app.netlify.com](https://app.netlify.com)
3. Click **"Add new site"** → **"Import an existing project"**
4. Connect your GitHub repository
5. Configure build settings:
   - **Base directory**: `dashboard`
   - **Build command**: `npm run build`
   - **Publish directory**: `dashboard/dist`
6. Set environment variables:
   - `VITE_SUPABASE_URL` = `https://qavnkzamsatdofdblrgv.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = your anon key
7. Click **Deploy**

### Environment Variables

Set these in Netlify → Site settings → Environment variables:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase anon/publishable key |

> ⚠️ **Never** add `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, or device tokens to Netlify.

### SPA Routing

The `netlify.toml` file in the dashboard directory handles client-side routing:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

## Supabase Edge Functions

Edge Functions are deployed via Supabase MCP or CLI. They auto-scale and don't need separate hosting.

### Setting Secrets

```bash
# Set the Gemini API key
supabase secrets set GEMINI_API_KEY=your-gemini-api-key --project-ref qavnkzamsatdofdblrgv
```

Or set via the Supabase Dashboard → Edge Functions → Secrets.

## Creating an Admin User

1. Go to Supabase Dashboard → Authentication → Users
2. Click **"Add user"** → **"Create new user"**
3. Enter email and password
4. This user can log into the dashboard

Alternatively, go to the dashboard login page and note that you'll need to enable email signup in Supabase Auth settings first.

## ESP32 Firmware

The firmware is uploaded via Arduino IDE directly to the ESP32 over USB. No cloud deployment needed.

1. Open `firmware/smart_attendance/smart_attendance.ino` in Arduino IDE
2. Edit WiFi credentials
3. Upload to ESP32

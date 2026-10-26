# Smart Attendance System

An end-to-end smart attendance system using **RFID + ESP32 + Supabase + React Dashboard + AI Analytics**.

## Architecture

```
RFID Card → RC522 → ESP32 → WiFi → Supabase Edge Function → PostgreSQL
                                                                  ↓
React Dashboard ← Supabase Auth ← Supabase Realtime ← Database
                                                                  ↓
AI Analytics ← Gemini API ← Edge Function ← Attendance Statistics
```

## Components

### 🔧 Hardware (`firmware/`)
- **ESP32-WROOM-32** microcontroller
- **RC522 MFRC522** RFID reader (13.56 MHz)
- **JHD162A** 16×2 LCD display
- See [Hardware Setup Guide](docs/HARDWARE_SETUP.md)

### ☁️ Backend (Supabase)
- **PostgreSQL** database with 6 tables
- **Row Level Security** (RLS) policies
- **Edge Functions**: `rfid-scan`, `generate-ai-insights`
- **Realtime** subscriptions for live attendance updates
- See [API Documentation](docs/API.md)

### 🖥️ Dashboard (`dashboard/`)
- **React + TypeScript + Vite**
- **Tailwind CSS** for styling
- **Supabase Auth** for authentication
- **Recharts** for data visualization
- Pages: Dashboard, Students, Subjects, Sessions, Attendance, Analytics, Settings

### 🤖 AI Analytics
- **Google Gemini API** for attendance pattern analysis
- Structured JSON input/output
- Risk assessment and trend detection
- No custom model training required

## Quick Start

### 1. Dashboard Development
```bash
cd dashboard
cp .env.example .env
# Edit .env with your Supabase credentials
npm install
npm run dev
```

### 2. ESP32 Firmware
1. Open `firmware/smart_attendance/smart_attendance.ino` in Arduino IDE
2. Edit WiFi credentials (`WIFI_SSID`, `WIFI_PASSWORD`)
3. Install required libraries (MFRC522, ArduinoJson)
4. Select board: ESP32 Dev Module
5. Upload

### 3. Supabase Setup
The database schema and Edge Functions are already deployed. See [API docs](docs/API.md) for details.

## Environment Variables

### Dashboard (`.env`)
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

### Edge Functions (Supabase Secrets)
- `GEMINI_API_KEY` — Google Gemini API key for AI insights

### ESP32 Firmware
Edit constants directly in `smart_attendance.ino`:
- `WIFI_SSID` / `WIFI_PASSWORD`
- `SUPABASE_URL` / `DEVICE_ID` / `DEVICE_TOKEN`

## Deployment

### Dashboard → Netlify
See [Deployment Guide](docs/DEPLOYMENT.md)

### Edge Functions
Already deployed via Supabase MCP. To redeploy, use the Supabase CLI or MCP.

## Test RFID Cards

| UID | Student |
|-----|---------|
| `62FC765C` | Test Student A (STU001) |
| `4BE2F505` | Test Student B (STU002) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Hardware | ESP32, RC522, JHD162A LCD |
| Firmware | Arduino C++, MFRC522, ArduinoJson |
| Backend | Supabase (PostgreSQL, Edge Functions, Auth, Realtime) |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| AI | Google Gemini API |
| Deployment | Netlify (dashboard), Supabase (backend) |

## License

College project — for educational purposes.

# API Documentation

## Base URL
```
https://qavnkzamsatdofdblrgv.supabase.co
```

## Edge Functions

### POST `/functions/v1/rfid-scan`

RFID attendance ingestion endpoint. Called by ESP32 on each card scan.

**Authentication**: Device token in `Authorization: Bearer <token>` header.  
**JWT Verification**: Disabled (custom device auth instead).

#### Request
```json
{
  "device_id": "ESP32-ROOM-101",
  "uid": "62FC765C"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `device_id` | string | Yes | Matches `devices.device_name` in database |
| `uid` | string | Yes | RFID card UID, uppercase hexadecimal |

#### Responses

**Attendance Marked** (HTTP 200)
```json
{
  "success": true,
  "status": "present",
  "student_name": "John Doe",
  "roll_no": "STU001",
  "scanned_at": "2026-09-30T11:35:00.000Z",
  "message": "Attendance Marked"
}
```

**Already Marked** (HTTP 200)
```json
{
  "success": true,
  "status": "already_marked",
  "student_name": "John Doe",
  "message": "Already Marked"
}
```

**No Active Session** (HTTP 200)
```json
{
  "success": false,
  "status": "no_active_session",
  "message": "No active attendance session"
}
```

**Unknown Card** (HTTP 200)
```json
{
  "success": false,
  "status": "unknown_card",
  "message": "Card not registered"
}
```

**Unauthorized Device** (HTTP 401)
```json
{
  "success": false,
  "status": "unauthorized",
  "message": "Device not authorized"
}
```

**Invalid Request** (HTTP 400)
```json
{
  "success": false,
  "status": "invalid_request",
  "message": "Missing required fields"
}
```

### POST `/functions/v1/generate-ai-insights`

Generates AI-powered attendance analysis for students.

**Authentication**: Supabase Auth JWT required.

#### Request
```json
{
  "student_id": "uuid-here"
}
```
Omit `student_id` to analyze all students.

#### Response
```json
{
  "success": true,
  "insights_count": 1,
  "message": "AI analysis completed"
}
```

## Database Tables

### Direct Access (via Supabase client + RLS)

All tables require `authenticated` role (Supabase Auth JWT).

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `students` | ✅ | ✅ | ✅ | ❌ |
| `subjects` | ✅ | ✅ | ✅ | ❌ |
| `devices` | ✅ | ✅ | ✅ | ❌ |
| `attendance_sessions` | ✅ | ✅ | ✅ | ❌ |
| `attendance_records` | ✅ | ❌* | ❌ | ❌ |
| `ai_insights` | ✅ | ❌* | ❌ | ❌ |

\* Insert/update only via Edge Functions (service role).

### Realtime Subscriptions

| Table | Enabled |
|-------|---------|
| `attendance_records` | ✅ |

## Environment Variables

### Frontend (Vite)
| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |

### Edge Functions (Supabase Secrets)
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Auto-injected |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected |
| `GEMINI_API_KEY` | Google Gemini API key (for AI insights) |

### ESP32 Firmware
| Constant | Description |
|----------|-------------|
| `WIFI_SSID` | WiFi network name |
| `WIFI_PASSWORD` | WiFi password |
| `SUPABASE_URL` | Edge Function endpoint URL |
| `DEVICE_ID` | Device name (matches database) |
| `DEVICE_TOKEN` | Pre-shared device authentication token |

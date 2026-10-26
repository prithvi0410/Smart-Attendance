# Hardware Setup Guide

## Components

| Component | Model | Notes |
|-----------|-------|-------|
| Microcontroller | ESP32-WROOM-32 | 30-pin, CH340, USB-C |
| RFID Reader | RC522 / MFRC522 | 13.56 MHz |
| LCD Display | JHD162A | 16×2 parallel, 4-bit mode |

## Wiring Diagram

### RFID RC522 → ESP32

| RC522 Pin | ESP32 Pin |
|-----------|-----------|
| SDA/SS | GPIO 5 (D5) |
| SCK | GPIO 18 (D18) |
| MOSI | GPIO 23 (D23) |
| MISO | GPIO 19 (D19) |
| RST | GPIO 27 (D27) |
| 3.3V | 3V3 |
| GND | GND |

### LCD JHD162A → ESP32

| LCD Pin | Connection |
|---------|------------|
| RS | GPIO 25 (D25) |
| E | GPIO 26 (D26) |
| DB4 | GPIO 13 (D13) |
| DB5 | GPIO 14 (D14) |
| DB6 | GPIO 16 (D16) |
| DB7 | GPIO 17 (D17) |
| VSS | GND |
| VCC | VIN/5V |
| VEE | GND (contrast - adjust with potentiometer if needed) |
| R/W | GND |
| LED+ | 3.3V |
| LED- | GND |
| DB0-DB3 | Not connected |

## Arduino IDE Setup

### Board Manager
1. Open Arduino IDE → **Preferences**
2. Add ESP32 board URL: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
3. Go to **Tools → Board → Boards Manager**
4. Search for "ESP32" and install **esp32 by Espressif Systems**

### Board Selection
- Board: **ESP32 Dev Module**
- Upload Speed: **115200**
- Flash Frequency: **80MHz**
- Flash Mode: **QIO**
- Flash Size: **4MB**
- Partition Scheme: **Default 4MB with spiffs**
- Port: Select your USB port (CH340 driver may be needed)

### Required Libraries
Install via **Sketch → Include Library → Manage Libraries**:

| Library | Author | Version |
|---------|--------|---------|
| MFRC522 | GithubCommunity | Latest |
| ArduinoJson | Benoit Blanchon | v7.x |
| LiquidCrystal | Arduino | Built-in |

### Configuration
Before uploading, edit these values in `smart_attendance.ino`:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
```

The Supabase URL and device credentials are pre-configured.

### TLS Certificate Validation
The firmware uses `SKIP_TLS_VERIFY = true` for prototype mode. This skips SSL certificate validation, which is acceptable for a college project but should be fixed for production.

To enable proper TLS:
1. Set `#define SKIP_TLS_VERIFY false`
2. Add the Supabase CA certificate to the firmware

## Testing

### Serial Monitor
Open at **115200 baud** to see debug output:
- WiFi connection status
- Card UID detection
- API request/response
- Error messages

### Test Cards
| UID | Student |
|-----|---------|
| 62FC765C | Test Student A (STU001) |
| 4BE2F505 | Test Student B (STU002) |

### Expected LCD Messages

| State | Line 1 | Line 2 |
|-------|--------|--------|
| Idle | Smart Attendance | Scan your card |
| WiFi connecting | Connecting WiFi | Please wait... |
| WiFi connected | WiFi Connected | (IP address) |
| Successful scan | (Student name) | Attendance Marked |
| Duplicate scan | (Student name) | Already Marked |
| Unknown card | Unknown Card | Not Registered |
| No active session | No Active Session | Ask Teacher |
| Network error | Network Error | Try Again |

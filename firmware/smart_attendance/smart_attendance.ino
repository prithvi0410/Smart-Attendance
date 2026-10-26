/*
 * Smart Attendance System - ESP32 Firmware (Phase 2: Supabase API Integration + WiFiManager)
 * 
 * Hardware:
 *   ESP32-WROOM-32 (30-pin, CH340, USB-C)
 *   RC522 MFRC522 RFID Reader
 *   JHD162A 16x2 LCD (4-bit mode)
 * 
 * GPIO Assignments (DO NOT CHANGE):
 *   RFID: SDA->D5, SCK->D18, MOSI->D23, MISO->D19, RST->D27
 *   LCD:  RS->D25, E->D26, DB4->D13, DB5->D14, DB6->D16, DB7->D17
 */

#include <SPI.h>
#include <MFRC522.h>
#include <LiquidCrystal.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Include WiFiManager for dynamic WiFi provisioning without hardcoding
#include <WiFiManager.h>

// ==========================================
// SECURITY & CONFIGURATION
// ==========================================

// API Credentials
const char* SUPABASE_FUNCTION_URL = "https://qavnkzamsatdofdblrgv.supabase.co/functions/v1/rfid-scan";
const char* DEVICE_ID             = "ESP32-ROOM-101";
// Use the exact custom device token provided (not the hash). DO NOT expose Supabase Service Keys here.
const char* DEVICE_TOKEN          = "esp32-secure-token-b101bab2";

// Security Tradeoff: 
// For this college prototype, TLS verification is temporarily bypassed.
// In production, set this to 0 and provide the proper Root CA certificate.
#define SKIP_TLS_VERIFY 1

// Timings
const unsigned long RFID_DEBOUNCE_MS = 3000;         // 3 seconds between same card scans
const unsigned long LCD_MESSAGE_MS = 2000;           // 2 seconds for feedback messages

// ==========================================
// PIN DEFINITIONS
// ==========================================

// RFID Pins
#define RST_PIN 27
#define SS_PIN  5

// LCD Pins
#define RS_PIN  25
#define EN_PIN  26
#define D4_PIN  13
#define D5_PIN  14
#define D6_PIN  16
#define D7_PIN  17

// ==========================================
// GLOBALS
// ==========================================

LiquidCrystal lcd(RS_PIN, EN_PIN, D4_PIN, D5_PIN, D6_PIN, D7_PIN);
MFRC522 rfid(SS_PIN, RST_PIN);

unsigned long lastScanTime = 0;
String lastScannedUID = "";
WiFiManager wifiManager;

// Function Prototypes
void connectToWiFi();
void runApiConnectivityTest();
void sendAttendance(String uid);
void lcdPrint(String line1, String line2);
void showIdleScreen();
String getUIDString();
String truncateForLCD(const char* name);

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n==================================");
  Serial.println("Smart Attendance System - Phase 2");
  Serial.println("==================================");

  // Initialize LCD
  lcd.begin(16, 2);
  lcdPrint("Smart Attendance", "Starting...");
  delay(1000);

  // Initialize SPI and RFID
  SPI.begin();
  rfid.PCD_Init();
  delay(100);

  // Verify RFID reader
  byte version = rfid.PCD_ReadRegister(rfid.VersionReg);
  if (version == 0x00 || version == 0xFF) {
    Serial.println("ERROR: RFID reader not detected!");
    lcdPrint("RFID Error!", "Check wiring");
    while (true) { delay(1000); }
  }
  Serial.print("MFRC522 firmware version: 0x");
  Serial.println(version, HEX);

  // Initial WiFi Connection via WiFiManager
  connectToWiFi();

  // Run initial API connectivity test if online
  if (WiFi.status() == WL_CONNECTED) {
    runApiConnectivityTest();
  }
  
  showIdleScreen();
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  // 1. Non-blocking WiFi Reconnection (WiFiManager handles background auto-reconnect natively)
  if (WiFi.status() != WL_CONNECTED) {
    lcdPrint("WiFi Lost", "Reconnecting...");
    delay(2000);
    showIdleScreen();
  }

  // 2. Check for new RFID card
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    return;
  }

  String uid = getUIDString();
  Serial.println("\n--------------------------------");
  Serial.print("Card detected: ");
  Serial.println(uid);

  // 3. Debounce
  if (uid == lastScannedUID && (millis() - lastScanTime < RFID_DEBOUNCE_MS)) {
    Serial.println("Debounce: ignoring repeated scan");
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    return;
  }
  lastScannedUID = uid;
  lastScanTime = millis();

  // 4. Handle Offline Scan
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Error: Cannot send attendance, WiFi is offline.");
    lcdPrint("Network Error", "Try Again");
    delay(LCD_MESSAGE_MS);
  } 
  else {
    // 5. Send to Supabase Edge Function
    lcdPrint("Card Detected", "Authenticating..");
    sendAttendance(uid);
  }

  // Halt PICC
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  
  showIdleScreen();
}

// ==========================================
// API CONNECTIVITY TEST
// ==========================================
void runApiConnectivityTest() {
  Serial.println("\n--- API Connectivity Test ---");
  lcdPrint("Testing API...", "Please wait");
  
  WiFiClientSecure client;
#if SKIP_TLS_VERIFY
  client.setInsecure();
#endif

  HTTPClient http;
  http.setTimeout(10000);

  if (!http.begin(client, SUPABASE_FUNCTION_URL)) {
    Serial.println("API Test: HTTP begin failed");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  String authHeader = String("Bearer ") + DEVICE_TOKEN;
  http.addHeader("Authorization", authHeader);

  // Send a dummy card ID that should return 'unknown_card' or 'no_active_session'
  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["uid"] = "00000000";

  String payload;
  serializeJson(doc, payload);
  
  Serial.println("API request started");
  int httpCode = http.POST(payload);
  Serial.print("HTTP status: ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.print("API response: ");
    Serial.println(response);
  } else {
    Serial.print("API error: ");
    Serial.println(http.errorToString(httpCode));
  }
  http.end();
  Serial.println("-----------------------------\n");
  delay(1000);
}

// ==========================================
// SEND ATTENDANCE
// ==========================================
void sendAttendance(String uid) {
  WiFiClientSecure client;
#if SKIP_TLS_VERIFY
  client.setInsecure();
#endif

  HTTPClient http;
  http.setTimeout(10000);

  if (!http.begin(client, SUPABASE_FUNCTION_URL)) {
    Serial.println("HTTP begin failed");
    lcdPrint("Network Error", "Try Again");
    delay(LCD_MESSAGE_MS);
    return;
  }

  http.addHeader("Content-Type", "application/json");
  String authHeader = String("Bearer ") + DEVICE_TOKEN;
  http.addHeader("Authorization", authHeader);

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["uid"] = uid;

  String payload;
  serializeJson(doc, payload);

  Serial.println("API request started (Attendance)");
  int httpCode = http.POST(payload);
  Serial.print("HTTP status: ");
  Serial.println(httpCode);

  if (httpCode <= 0) {
    Serial.print("API error: ");
    Serial.println(http.errorToString(httpCode));
    lcdPrint("Network Error", "Try Again");
    delay(LCD_MESSAGE_MS);
    http.end();
    return;
  }

  String response = http.getString();
  http.end();
  
  // Parse JSON response
  JsonDocument resDoc;
  DeserializationError err = deserializeJson(resDoc, response);

  if (err) {
    Serial.print("JSON parse error: ");
    Serial.println(err.c_str());
    lcdPrint("Parse Error", "Try Again");
    delay(LCD_MESSAGE_MS);
    return;
  }

  const char* status = resDoc["status"] | "error";
  const char* studentName = resDoc["student_name"] | "";
  const char* message = resDoc["message"] | "Error";
  
  Serial.print("API response status: ");
  Serial.println(status);
  
  if (strcmp(status, "present") == 0) {
    Serial.print("Student name: ");
    Serial.println(studentName);
    Serial.println("Attendance result: Successfully Marked");
    lcdPrint(truncateForLCD(studentName), "Attendance Marked");
  } 
  else if (strcmp(status, "already_marked") == 0) {
    Serial.print("Student name: ");
    Serial.println(studentName);
    Serial.println("Attendance result: Already Marked");
    lcdPrint(truncateForLCD(studentName), "Already Marked");
  } 
  else if (strcmp(status, "unknown_card") == 0) {
    Serial.println("Attendance result: Unknown Card");
    lcdPrint("Unknown Card", "Not Registered");
  } 
  else if (strcmp(status, "no_active_session") == 0) {
    Serial.println("Attendance result: No Active Session");
    lcdPrint("No Active Session", "Ask Teacher");
  } 
  else if (strcmp(status, "unauthorized") == 0) {
    Serial.println("Attendance result: Unauthorized Device");
    lcdPrint("Device Error", "Contact Admin");
  } 
  else {
    Serial.println("Attendance result: Unknown Error");
    lcdPrint("API Error", message);
  }
  
  delay(LCD_MESSAGE_MS);
}

// ==========================================
// WIFI CONNECTION (WiFiManager)
// ==========================================
void connectToWiFi() {
  Serial.println("Initializing WiFiManager...");
  
  // Show instructions on LCD
  lcdPrint("Connect Phone to", "SmartAttendance");
  
  // Timeout for portal (if user doesn't connect in 3 minutes, it will reboot or continue)
  wifiManager.setConfigPortalTimeout(180);

  // This blocks until successful connection, OR timeout.
  // It spins up an AP named "SmartAttendance_ESP32" if it fails to connect to saved WiFi.
  if (!wifiManager.autoConnect("SmartAttendance_ESP32")) {
    Serial.println("Failed to connect and hit timeout. Rebooting...");
    delay(3000);
    ESP.restart();
  }

  // If you get here you have connected to the WiFi
  Serial.println("WiFi connected");
  Serial.print("local IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("RSSI: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");
  
  lcdPrint("WiFi Connected", "System Ready");
  delay(2000);
}

// ==========================================
// LCD & RFID HELPER FUNCTIONS
// ==========================================

void lcdPrint(String line1, String line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
}

void showIdleScreen() {
  if (WiFi.status() == WL_CONNECTED) {
    lcdPrint("Smart Attendance", "Scan your card");
  } else {
    lcdPrint("Smart Attendance", "WiFi Offline");
  }
}

String getUIDString() {
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) {
      uid += "0";
    }
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

String truncateForLCD(const char* name) {
  String s = String(name);
  if (s.length() > 16) {
    s = s.substring(0, 15) + ".";
  }
  return s;
}

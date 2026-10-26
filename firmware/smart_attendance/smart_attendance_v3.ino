/*
 * Smart Attendance System - ESP32 Firmware (Phase 3: Secure Remote Provisioning)
 * 
 * Hardware: ESP32-WROOM-32 (30-pin, CH340, USB-C)
 * 
 * Dependencies (Install via Library Manager):
 * - MFRC522 by GithubCommunity
 * - ArduinoJson by Benoit Blanchon
 * - WiFiManager by tzapu
 * - ArduinoWebsockets by Gil Maimon
 */

#include <SPI.h>
#include <MFRC522.h>
#include <LiquidCrystal.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <ArduinoWebsockets.h>
#include "mbedtls/gcm.h"
#include <vector>

struct SavedNetwork {
  String ssid;
  String pass;
  int priority;
};

// ==========================================
// SECRETS & CONFIGURATION
// ==========================================
const char* SUPABASE_URL = "https://qavnkzamsatdofdblrgv.supabase.co";
const char* SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhdm5remFtc2F0ZG9mZGJscmd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NjM5MjYsImV4cCI6MjEwNjMzOTkyNn0.ffLFEhtkdGk0PVzvC99d17UsV__zpI0CKwJ-roGTrtU";
const char* DEVICE_ID = "ESP32-ROOM-101";
const char* DEVICE_UUID = "b2624fd5-3444-4a38-9702-26aaa3f40123";
const char* DEVICE_TOKEN = "esp32-secure-token-b101bab2";
const char* AES_KEY_HEX = "d49a97ccd4c392ee4bec3d402ad991567506c903ad7f4a9d0c2bdb097639c310";

#define SKIP_TLS_VERIFY 1

// GPIO Assignments
#define RST_PIN 27
#define SS_PIN  5
#define RS_PIN  25
#define EN_PIN  26
#define D4_PIN  13
#define D5_PIN  14
#define D6_PIN  16
#define D7_PIN  17

// Globals
LiquidCrystal lcd(RS_PIN, EN_PIN, D4_PIN, D5_PIN, D6_PIN, D7_PIN);
MFRC522 rfid(SS_PIN, RST_PIN);
Preferences prefs;
using namespace websockets;
WebsocketsClient wsClient;

String currentSsid = "";
String currentPass = "";
unsigned long lastScanTime = 0;
String lastScannedUID = "";
unsigned long lastHeartbeat = 0;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

void lcdPrint(String line1, String line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
}

void hex2bytes(const String& hex, uint8_t* bytes, size_t length) {
  for (size_t i = 0; i < length; i++) {
    String byteStr = hex.substring(i * 2, i * 2 + 2);
    bytes[i] = (uint8_t)strtol(byteStr.c_str(), NULL, 16);
  }
}

String decryptPayload(String ivCipherHex) {
  int sep = ivCipherHex.indexOf(':');
  if (sep == -1) return "";
  
  String ivHex = ivCipherHex.substring(0, sep);
  String cipherHex = ivCipherHex.substring(sep + 1);
  
  size_t ivLen = ivHex.length() / 2;
  size_t totalCipherLen = cipherHex.length() / 2;
  if (totalCipherLen < 16 || ivLen != 12) return "";
  
  size_t cipherLen = totalCipherLen - 16;
  uint8_t iv[12];
  hex2bytes(ivHex, iv, 12);
  
  uint8_t* cipherAndTag = new uint8_t[totalCipherLen];
  hex2bytes(cipherHex, cipherAndTag, totalCipherLen);
  
  uint8_t* cipher = cipherAndTag;
  uint8_t* tag = cipherAndTag + cipherLen;
  
  uint8_t key[32];
  hex2bytes(AES_KEY_HEX, key, 32);
  
  uint8_t* output = new uint8_t[cipherLen + 1];
  memset(output, 0, cipherLen + 1);
  
  mbedtls_gcm_context ctx;
  mbedtls_gcm_init(&ctx);
  mbedtls_gcm_setkey(&ctx, MBEDTLS_CIPHER_ID_AES, key, 256);
  int ret = mbedtls_gcm_auth_decrypt(&ctx, cipherLen, iv, 12, NULL, 0, tag, 16, cipher, output);
  mbedtls_gcm_free(&ctx);
  
  String result = "";
  if (ret == 0) result = String((char*)output);
  
  delete[] cipherAndTag;
  delete[] output;
  return result;
}

// ==========================================
// NETWORK MANAGEMENT (NVS)
// ==========================================

void saveNetworksToNVS(std::vector<SavedNetwork>& nets) {
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (auto& n : nets) {
    JsonObject obj = arr.add<JsonObject>();
    obj["ssid"] = n.ssid;
    obj["pass"] = n.pass;
    obj["priority"] = n.priority;
  }
  String out;
  serializeJson(doc, out);
  prefs.begin("wifi_store", false);
  prefs.putString("networks", out);
  prefs.end();
}

std::vector<SavedNetwork> loadNetworksFromNVS() {
  std::vector<SavedNetwork> nets;
  prefs.begin("wifi_store", true);
  String in = prefs.getString("networks", "[]");
  prefs.end();

  JsonDocument doc;
  if (!deserializeJson(doc, in)) {
    JsonArray arr = doc.as<JsonArray>();
    for (JsonObject obj : arr) {
      SavedNetwork n;
      n.ssid = obj["ssid"].as<String>();
      n.pass = obj["pass"].as<String>();
      n.priority = obj["priority"].as<int>();
      nets.push_back(n);
    }
  }
  
  // Sort by priority (lower number = higher priority)
  for (size_t i = 0; i < nets.size(); i++) {
    for (size_t j = i + 1; j < nets.size(); j++) {
      if (nets[j].priority < nets[i].priority) {
        SavedNetwork temp = nets[i];
        nets[i] = nets[j];
        nets[j] = temp;
      }
    }
  }
  return nets;
}

// ==========================================
// SUPABASE API
// ==========================================

bool testInternetConnection() {
  WiFiClientSecure client;
#if SKIP_TLS_VERIFY
  client.setInsecure();
#endif
  HTTPClient http;
  http.setTimeout(5000);
  String url = String(SUPABASE_URL) + "/functions/v1/rfid-scan"; // A known good endpoint
  if (http.begin(client, url)) {
    int code = http.GET();
    http.end();
    return (code > 0);
  }
  return false;
}

void ackCommand(String cmdId, String status, String errorCode) {
  WiFiClientSecure client;
#if SKIP_TLS_VERIFY
  client.setInsecure();
#endif
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/ack-command";
  if (http.begin(client, url)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
    
    JsonDocument doc;
    doc["device_id"] = DEVICE_ID;
    doc["command_id"] = cmdId;
    doc["status"] = status;
    doc["error_code"] = errorCode;
    doc["ssid"] = WiFi.SSID();
    doc["ip"] = WiFi.localIP().toString();
    doc["rssi"] = WiFi.RSSI();
    
    String payload;
    serializeJson(doc, payload);
    http.POST(payload);
    http.end();
  }
}

// ==========================================
// REALTIME WEBSOCKETS
// ==========================================

void connectRealtime() {
  String wsUrl = String("wss://qavnkzamsatdofdblrgv.supabase.co/realtime/v1/websocket?apikey=") + SUPABASE_ANON_KEY + "&vsn=1.0.0";
  
#if SKIP_TLS_VERIFY
  wsClient.setInsecure();
#endif

  if (wsClient.connect(wsUrl)) {
    Serial.println("WS Connected!");
    // Send join message
    String joinMsg = String("{\"topic\":\"realtime:any\",\"event\":\"phx_join\",\"payload\":{\"config\":{\"postgres_changes\":[{\"event\":\"INSERT\",\"schema\":\"public\",\"table\":\"device_commands\",\"filter\":\"device_id=eq.") + DEVICE_UUID + "\"}]}},\"ref\":\"1\"}";
    wsClient.send(joinMsg);
  }
}

void handleProvisionCommand(String cmdId, String newSsid, String encryptedPass, int priority) {
  lcdPrint("New Wi-Fi Cmd", "Decrypting...");
  String newPass = decryptPayload(encryptedPass);
  
  if (newPass == "") {
    Serial.println("Decryption failed!");
    ackCommand(cmdId, "failed", "DECRYPTION_FAILED");
    lcdPrint("Wi-Fi Error", "Decryption Fail");
    delay(2000);
    return;
  }

  lcdPrint("Testing Wi-Fi", newSsid);
  String oldSsid = currentSsid;
  String oldPass = currentPass;

  WiFi.disconnect();
  delay(1000);
  WiFi.begin(newSsid.c_str(), newPass.c_str());

  int attempts = 0;
  bool connected = false;
  while (attempts < 15) {
    if (WiFi.status() == WL_CONNECTED) {
      connected = true;
      break;
    }
    delay(1000);
    attempts++;
  }

  if (connected && testInternetConnection()) {
    lcdPrint("Wi-Fi Success", WiFi.localIP().toString());
    ackCommand(cmdId, "success", "");
    currentSsid = newSsid;
    currentPass = newPass;

    // Save to NVS
    std::vector<SavedNetwork> nets = loadNetworksFromNVS();
    bool found = false;
    for (auto& n : nets) {
      if (n.ssid == newSsid) {
        n.pass = newPass;
        n.priority = priority;
        found = true;
        break;
      }
    }
    if (!found) {
      SavedNetwork newNet = {newSsid, newPass, priority};
      nets.push_back(newNet);
    }
    saveNetworksToNVS(nets);
    
    // Reconnect WS
    connectRealtime();
  } else {
    lcdPrint("Wi-Fi Failed", "Rolling Back...");
    ackCommand(cmdId, "failed", "NETWORK_UNREACHABLE");
    
    // Rollback
    WiFi.disconnect();
    delay(1000);
    WiFi.begin(oldSsid.c_str(), oldPass.c_str());
    while (WiFi.status() != WL_CONNECTED) delay(500);
    connectRealtime();
  }
}

void onMessageCallback(WebsocketsMessage message) {
  String data = message.data();
  // Filter heartbeat acks
  if (data.indexOf("phx_reply") != -1 && data.indexOf("\"ref\":\"heartbeat\"") != -1) return;
  
  Serial.println("WS Message: " + data);
  
  JsonDocument doc;
  if (!deserializeJson(doc, data)) {
    String event = doc["event"];
    if (event == "postgres_changes") {
      JsonObject record = doc["payload"]["data"]["record"];
      String cmd = record["command"];
      String status = record["status"];
      
      if (cmd == "provision_wifi" && status == "pending") {
        String cmdId = record["id"];
        String ssid = record["payload"]["ssid"];
        String encPass = record["payload"]["encrypted_credentials"];
        int priority = record["payload"]["priority"] | 100;
        
        // Acknowledge receipt
        ackCommand(cmdId, "received", "");
        
        // Process
        handleProvisionCommand(cmdId, ssid, encPass, priority);
      }
    }
  }
}

bool connectToBestWiFi() {
  lcdPrint("Scanning WiFi...", "Please wait");
  int n = WiFi.scanNetworks();
  Serial.print(n);
  Serial.println(" networks found.");

  if (n == 0) {
    lcdPrint("No WiFi Found", "Retrying...");
    delay(2000);
    return false;
  }

  std::vector<SavedNetwork> nets = loadNetworksFromNVS();

  for (int i = 0; i < n; ++i) {
    String scannedSSID = WiFi.SSID(i);
    int encType = WiFi.encryptionType(i);
    
    // Check if it's a known network
    bool isKnown = false;
    String knownPass = "";
    for (auto& net : nets) {
      if (net.ssid == scannedSSID) {
        isKnown = true;
        knownPass = net.pass;
        break;
      }
    }

    if (isKnown || encType == WIFI_AUTH_OPEN) {
      lcdPrint("Trying:", scannedSSID);
      Serial.println("Attempting to connect to: " + scannedSSID);
      
      WiFi.disconnect();
      delay(500);
      
      if (isKnown) {
        WiFi.begin(scannedSSID.c_str(), knownPass.c_str());
      } else {
        WiFi.begin(scannedSSID.c_str()); // Connect to open network
      }

      int attempts = 0;
      while (attempts < 10) {
        if (WiFi.status() == WL_CONNECTED) {
          currentSsid = scannedSSID;
          currentPass = isKnown ? knownPass : "";
          lcdPrint("WiFi Connected", WiFi.localIP().toString());
          delay(2000);
          
          // Optionally save the open network so it shows in the dashboard
          if (!isKnown) {
            SavedNetwork openNet = {scannedSSID, "", 999};
            nets.push_back(openNet);
            saveNetworksToNVS(nets);
          }
          
          return true;
        }
        delay(1000);
        attempts++;
      }
      Serial.println("Failed to connect to " + scannedSSID);
    }
  }
  
  lcdPrint("No Match Found", "Retrying...");
  delay(2000);
  return false;
}

// ==========================================
// BOOT & MAIN LOOP
// ==========================================

void setup() {
  Serial.begin(115200);
  lcd.begin(16, 2);
  lcdPrint("Smart Attendance", "Starting...");
  
  SPI.begin();
  rfid.PCD_Init();

  // Keep scanning and trying to connect until successful
  while (!connectToBestWiFi()) {
    // Loops infinitely until a valid network is found
  }

  // Setup Realtime WS once connected
  wsClient.onMessage(onMessageCallback);
  connectRealtime();
}

void loop() {
  // If WiFi drops, block and scan/reconnect
  if (WiFi.status() != WL_CONNECTED) {
    lcdPrint("WiFi Lost", "Reconnecting...");
    while (!connectToBestWiFi()) {
      // Loop until reconnected
    }
    connectRealtime();
    lcdPrint("Smart Attendance", "Scan your card");
  }

  // WS Poll & Heartbeat
  if (wsClient.available()) {
    wsClient.poll();
    if (millis() - lastHeartbeat > 30000) {
      wsClient.send("{\"topic\":\"phoenix\",\"event\":\"heartbeat\",\"payload\":{},\"ref\":\"heartbeat\"}");
      lastHeartbeat = millis();
    }
  }

  // Attendance Logic
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String uid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      if (rfid.uid.uidByte[i] < 0x10) uid += "0";
      uid += String(rfid.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();

    if (uid != lastScannedUID || (millis() - lastScanTime > 3000)) {
      lastScannedUID = uid;
      lastScanTime = millis();
      
      lcdPrint("Card Detected", "Authenticating..");
      
      WiFiClientSecure client;
#if SKIP_TLS_VERIFY
      client.setInsecure();
#endif
      HTTPClient http;
      http.begin(client, String(SUPABASE_URL) + "/functions/v1/rfid-scan");
      http.addHeader("Content-Type", "application/json");
      http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
      
      JsonDocument doc;
      doc["device_id"] = DEVICE_ID;
      doc["uid"] = uid;
      String payload;
      serializeJson(doc, payload);
      
      int code = http.POST(payload);
      if (code > 0) {
        String res = http.getString();
        JsonDocument resDoc;
        deserializeJson(resDoc, res);
        String status = resDoc["status"];
        String name = resDoc["student_name"] | "Unknown";
        
        if (status == "present") lcdPrint(name, "Marked Present");
        else if (status == "already_marked") lcdPrint(name, "Already Marked");
        else if (status == "unknown_card") lcdPrint("Unknown Card", "Not Registered");
        else lcdPrint("Error", status);
      } else {
        lcdPrint("Network Error", "Try Again");
      }
      http.end();
      delay(2000);
      lcdPrint("Smart Attendance", "Scan your card");
    }
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }
}

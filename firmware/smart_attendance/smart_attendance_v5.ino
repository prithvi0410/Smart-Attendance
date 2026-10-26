/*
 * Smart Attendance System - ESP32 Firmware (Phase 5: Priority WiFi, Offline Portal, Registration)
 * 
 * Hardware: ESP32-WROOM-32 (30-pin, CH340, USB-C)
 * 
 * Dependencies (Install via Library Manager):
 * - MFRC522 by GithubCommunity
 * - ArduinoJson by Benoit Blanchon (v7.x)
 * - WiFiManager by tzapu
 */

#include <SPI.h>
#include <MFRC522.h>
#include <LiquidCrystal.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include "mbedtls/gcm.h"
#include <vector>
#include <algorithm>

struct SavedNetwork {
  String ssid;
  String pass;
  int priority;
};

// ==========================================
// SECRETS & CONFIGURATION
// ==========================================
const char* SUPABASE_URL = "https://qavnkzamsatdofdblrgv.supabase.co";
const char* DEVICE_ID = "ESP32-ROOM-101";
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

LiquidCrystal lcd(RS_PIN, EN_PIN, D4_PIN, D5_PIN, D6_PIN, D7_PIN);
MFRC522 rfid(SS_PIN, RST_PIN);
Preferences prefs;

String currentSsid = "";
String currentPass = "";
unsigned long lastScanTime = 0;
String lastScannedUID = "";

unsigned long lastSyncTime = 0;
String currentMode = "attendance";

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
  return nets;
}

// ==========================================
// SUPABASE API & SYNC
// ==========================================

bool testInternetConnection() {
  WiFiClientSecure client;
#if SKIP_TLS_VERIFY
  client.setInsecure();
#endif
  HTTPClient http;
  http.setTimeout(5000);
  String url = String(SUPABASE_URL) + "/functions/v1/rfid-scan";
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

void handleProvisionCommand(String cmdId, String newSsid, String encryptedPass, int priority) {
  lcdPrint("New Wi-Fi Cmd", "Decrypting...");
  String newPass = decryptPayload(encryptedPass);
  
  if (newPass == "") {
    ackCommand(cmdId, "failed", "DECRYPTION_FAILED");
    lcdPrint("Wi-Fi Error", "Decryption Fail");
    delay(2000);
    return;
  }

  lcdPrint("Testing Wi-Fi", newSsid);
  String oldSsid = currentSsid;
  String oldPass = currentPass;

  WiFi.disconnect(true, true);
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
    
    if (currentMode == "registration") lcdPrint("Add Student Mode", "Scan New Card");
    else lcdPrint("Smart Attendance", "Scan your card");
  } else {
    lcdPrint("Wi-Fi Failed", "Rolling Back...");
    ackCommand(cmdId, "failed", "NETWORK_UNREACHABLE");
    
    WiFi.disconnect(true, true);
    delay(1000);
    WiFi.begin(oldSsid.c_str(), oldPass.c_str());
    while (WiFi.status() != WL_CONNECTED) delay(500);
    
    if (currentMode == "registration") lcdPrint("Add Student Mode", "Scan New Card");
    else lcdPrint("Smart Attendance", "Scan your card");
  }
}

void pollDeviceSync() {
  if (millis() - lastSyncTime < 3000) return;
  lastSyncTime = millis();
  
  WiFiClientSecure client;
#if SKIP_TLS_VERIFY
  client.setInsecure();
#endif
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/functions/v1/device-sync";
  if (http.begin(client, url)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
    
    JsonDocument reqDoc;
    reqDoc["device_id"] = DEVICE_ID;
    String reqPayload;
    serializeJson(reqDoc, reqPayload);
    
    int code = http.POST(reqPayload);
    if (code > 0) {
      String res = http.getString();
      JsonDocument doc;
      if (!deserializeJson(doc, res)) {
        
        String newMode = "attendance";
        if (doc["mode"].is<String>()) {
           newMode = doc["mode"].as<String>();
        }

        if (newMode != currentMode) {
          currentMode = newMode;
          if (currentMode == "registration") {
            lcdPrint("Add Student Mode", "Scan New Card");
          } else {
            lcdPrint("Smart Attendance", "Scan your card");
          }
        }
        
        if (!doc["command"].isNull()) {
          String cmd = doc["command"]["command"];
          if (cmd == "provision_wifi") {
            String cmdId = doc["command"]["id"];
            String ssid = doc["command"]["payload"]["ssid"];
            String encPass = doc["command"]["payload"]["encrypted_credentials"];
            int priority = doc["command"]["payload"]["priority"] | 100;
            
            ackCommand(cmdId, "received", "");
            handleProvisionCommand(cmdId, ssid, encPass, priority);
          }
        }
      }
    }
    http.end();
  }
}

// ==========================================
// BOOT & MAIN LOOP
// ==========================================

bool connectToBestWiFi() {
  lcdPrint("Scanning WiFi...", "Please wait");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(1000);
  
  int n = WiFi.scanNetworks();
  if (n == 0) {
    lcdPrint("No WiFi Found", "Retrying...");
    delay(2000);
    return false;
  }

  std::vector<SavedNetwork> nets = loadNetworksFromNVS();
  std::vector<SavedNetwork> candidates;

  for (int i = 0; i < n; ++i) {
    String scannedSSID = WiFi.SSID(i);
    int encType = WiFi.encryptionType(i);
    
    bool found = false;
    for (auto& net : nets) {
      if (net.ssid == scannedSSID) {
        candidates.push_back(net);
        found = true;
        break;
      }
    }

    if (!found && encType == WIFI_AUTH_OPEN) {
      candidates.push_back({scannedSSID, "", 999});
    }
  }

  // Sort candidates by priority (lowest number = highest priority)
  for (size_t i = 0; i < candidates.size(); i++) {
    for (size_t j = i + 1; j < candidates.size(); j++) {
      if (candidates[j].priority < candidates[i].priority) {
        SavedNetwork temp = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = temp;
      }
    }
  }

  // Attempt to connect strictly by priority order!
  for (auto& candidate : candidates) {
    lcdPrint("Trying:", candidate.ssid);
    WiFi.disconnect(true, true);
    delay(500);
    
    WiFi.begin(candidate.ssid.c_str(), candidate.pass.c_str());

    int attempts = 0;
    while (attempts < 10) {
      if (WiFi.status() == WL_CONNECTED) {
        currentSsid = candidate.ssid;
        currentPass = candidate.pass;
        lcdPrint("WiFi Connected", WiFi.localIP().toString());
        delay(2000);
        
        bool exists = false;
        for (auto& n : nets) { if (n.ssid == candidate.ssid) exists = true; }
        if (!exists) {
          nets.push_back({candidate.ssid, "", 999});
          saveNetworksToNVS(nets);
        }
        return true;
      }
      delay(1000);
      attempts++;
    }
  }
  
  // Offline Provisioning Fallback (Captive Portal)
  // Fixes Catch-22 if PRITHVIRAJ is off and no new networks are saved yet
  lcdPrint("No WiFi Found", "Starting Hotspot");
  WiFi.mode(WIFI_AP_STA);
  WiFiManager wm;
  wm.setConfigPortalTimeout(120); // 2 minutes timeout before resuming scan
  
  if (wm.startConfigPortal("SmartAttendance-ESP32")) {
    currentSsid = WiFi.SSID();
    currentPass = WiFi.psk();
    
    // Save new network to NVS so it never forgets!
    SavedNetwork net = {currentSsid, currentPass, 1};
    nets.push_back(net);
    saveNetworksToNVS(nets);
    
    lcdPrint("WiFi Connected", WiFi.localIP().toString());
    delay(2000);
    return true;
  }
  
  lcdPrint("Hotspot Timeout", "Retrying Scan...");
  delay(2000);
  return false;
}

void setup() {
  Serial.begin(115200);
  lcd.begin(16, 2);
  lcdPrint("Smart Attendance", "Starting...");
  
  SPI.begin();
  rfid.PCD_Init();

  while (!connectToBestWiFi()) {}
  
  lcdPrint("Smart Attendance", "Scan your card");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    lcdPrint("WiFi Lost", "Reconnecting...");
    while (!connectToBestWiFi()) {}
    if (currentMode == "registration") lcdPrint("Add Student Mode", "Scan New Card");
    else lcdPrint("Smart Attendance", "Scan your card");
  }

  pollDeviceSync();

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
      
      WiFiClientSecure client;
#if SKIP_TLS_VERIFY
      client.setInsecure();
#endif
      HTTPClient http;

      if (currentMode == "registration") {
        lcdPrint("Registering...", uid);
        
        http.begin(client, String(SUPABASE_URL) + "/functions/v1/device-sync");
        http.addHeader("Content-Type", "application/json");
        http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
        
        JsonDocument doc;
        doc["device_id"] = DEVICE_ID;
        doc["action"] = "register_uid";
        doc["uid"] = uid;
        String payload;
        serializeJson(doc, payload);
        
        int code = http.POST(payload);
        if (code > 0) lcdPrint("Sent to Web", uid);
        else lcdPrint("Network Error", "Try Again");
        
        http.end();
        delay(2000);
        lcdPrint("Add Student Mode", "Scan New Card");
        
      } else {
        lcdPrint("Card Detected", "Authenticating..");
        
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
    }
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }
}

#include <ESP8266WiFi.h>
#include <WebSocketsServer.h>
#include <Updater.h>
    
// WiFi credentials
const char* ssid = "Rahul Network";
const char* password = "rahul@1992#";
    
WebSocketsServer webSocket(81);
bool isUpdating = false;

//functions to handle OTA ans setting wifi
void handleFlashOTA(uint8_t clientID, WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_BIN:{
            if (!isUpdating) {
                size_t freeSketchSpace = (ESP.getFreeSketchSpace() - 0x1000) & 0xFFFFF;
                if (!Update.begin(freeSketchSpace)) {
                    String error = "Update failed to start: " + String(Update.getError());
                    Serial.println(error);
                    String message = "{\"type\":\"error\", \"message\":\"" + error + "\"}";
                    webSocket.sendTXT(clientID, message);
                    return;
                }
                isUpdating = true;
                String info = "Update started. Available space: " + String(freeSketchSpace) + " bytes";
                Serial.println(info);
                String message = "{\"type\":\"upload info\", \"message\":\"" + info + "\"}";
                webSocket.sendTXT(clientID, message);
            }
  
            if (Update.write(payload, length) != length) {
                String error = "Update write failed: " + String(Update.getError());
                Serial.println(error);
                String message = "{\"type\":\"error\", \"message\":\"" + error + "\"}";
                webSocket.sendTXT(clientID, message);
                Update.end();
                isUpdating = false;
                return;
            }
  
            String chunkInfo = "Received chunk: " + String(length) + " bytes";
            Serial.println(chunkInfo);
            String message = "{\"type\":\"upload info\", \"message\":\"" + chunkInfo + "\"}";
            webSocket.sendTXT(clientID, message);
  
            break;
        }
  
        case WStype_TEXT:{
            if (strcmp((const char*)payload, "END") == 0 && isUpdating) {
                if (Update.end(true)) {
                    String success = "Update completed successfully. Rebooting...";
                    Serial.println(success);
                    String message = "{\"type\":\"upload info\", \"message\":\"" + success + "\"}";
                    webSocket.sendTXT(clientID, message);
                    delay(500);
                    webSocket.close();
                    ESP.restart();
                } else {
                    String error = "Update failed: " + String(Update.getError());
                    Serial.println(error);
                    String message = "{\"type\":\"error\", \"message\":\"" + error + "\"}";
                    webSocket.sendTXT(clientID, message);
                }
                isUpdating = false;
            }
            break;
        }
  
        case WStype_DISCONNECTED:{
            if (isUpdating) {
                Serial.println("Client disconnected during update. Finalizing...");
                if (Update.end(true)) {
                    String success = "Update finalized. Rebooting...";
                    Serial.println(success);
                    String message = "{\"type\":\"upload info\", \"message\":\"" + success + "\"}";
                    webSocket.sendTXT(clientID, message);
                    delay(500);
                    webSocket.close();
                    ESP.restart();
                } else {
                    String error = "Update failed to finalize: " + String(Update.getError());
                    Serial.println(error);
                    String message = "{\"type\":\"error\", \"message\":\"" + error + "\"}";
                    webSocket.sendTXT(clientID, message);
                }
                isUpdating = false;
            }
            break;
        }
        
        default:
            break;
    }
}

void setupWifi() {
    // Connect to WiFi
    Serial.print("Connecting to WiFi...");
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(1000);
        Serial.print(".");
    }
    Serial.println("\nWiFi connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
}

void setup() {
    Serial.begin(9600);
    setupWifi();
    webSocket.begin();
    webSocket.onEvent(handleFlashOTA);
}
  
void loop() {
    webSocket.loop();
}
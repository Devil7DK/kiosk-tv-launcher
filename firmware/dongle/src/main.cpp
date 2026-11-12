#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <espnow.h>

#include "remote_protocol.h"

// One JSON object per line on USB serial, read by the controller:
//   {"hello":"kiosk-tv-dongle","version":1}      on start, and in answer to "?"
//   {"key":"up","repeat":false,"battery":3950}   for each press
//   {"battery":3950}                             the remote's report before it sleeps

namespace {

// The remote sends every press a few times; copies arrive within milliseconds.
constexpr uint32_t kDuplicateWindowMs = 300;

volatile bool pending = false;
remote::Packet received;
uint16_t lastSequence = 0;
uint32_t lastSequenceAt = 0;

void hello() { Serial.printf("{\"hello\":\"kiosk-tv-dongle\",\"version\":%u}\n", remote::kVersion); }

void onReceive(uint8_t *, uint8_t *data, uint8_t length) {
  if (pending || !remote::isValid(data, length)) return;
  memcpy(&received, data, sizeof(received));
  pending = true;
}

}  // namespace

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH);

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  wifi_set_channel(remote::kChannel);
  if (esp_now_init() != 0) {
    Serial.println("{\"error\":\"ESP-NOW did not start\"}");
    return;
  }
  esp_now_set_self_role(ESP_NOW_ROLE_SLAVE);
  esp_now_register_recv_cb(onReceive);
  hello();
}

void loop() {
  while (Serial.available()) {
    if (Serial.read() == '?') hello();
  }
  if (!pending) return;
  remote::Packet packet = received;
  pending = false;

  const uint32_t now = millis();
  if (packet.sequence == lastSequence && now - lastSequenceAt < kDuplicateWindowMs) return;
  lastSequence = packet.sequence;
  lastSequenceAt = now;

  if (packet.key == remote::kBatteryReport) {
    Serial.printf("{\"battery\":%u}\n", packet.batteryMillivolts);
  } else {
    Serial.printf("{\"key\":\"%s\",\"repeat\":%s,\"battery\":%u}\n", remote::keyName(packet.key),
                  packet.repeat ? "true" : "false", packet.batteryMillivolts);
  }
  digitalWrite(LED_BUILTIN, LOW);
  delay(15);
  digitalWrite(LED_BUILTIN, HIGH);
}

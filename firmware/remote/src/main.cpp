#include <Arduino.h>
#include <WiFi.h>
#include <driver/rtc_io.h>
#include <esp_now.h>
#include <esp_sleep.h>
#include <esp_wifi.h>

#include "remote_protocol.h"

namespace {

struct Button {
  gpio_num_t pin;
  remote::Key key;
  bool repeats;
};

// Buttons connect the pin to 3.3 V. These pins can wake the chip from deep
// sleep and do not affect how it boots (unlike 0, 2, 12 and 15).
constexpr Button kButtons[] = {
    {GPIO_NUM_32, remote::kUp, true},
    {GPIO_NUM_33, remote::kDown, true},
    {GPIO_NUM_25, remote::kLeft, true},
    {GPIO_NUM_26, remote::kRight, true},
    {GPIO_NUM_27, remote::kOk, false},
    {GPIO_NUM_14, remote::kBack, false},
    {GPIO_NUM_13, remote::kVolumeUp, true},
    {GPIO_NUM_4, remote::kVolumeDown, true},
};

// Battery through two equal resistors; reads near 0 when none are fitted.
constexpr int kBatteryPin = 34;
constexpr float kBatteryDivider = 2.0f;

constexpr uint32_t kDebounceMs = 25;
constexpr uint32_t kRepeatDelayMs = 450;
constexpr uint32_t kRepeatEveryMs = 150;
constexpr uint32_t kAwakeAfterPressMs = 6000;
constexpr int kCopies = 3;

const uint8_t kBroadcast[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// Kept through deep sleep, so a new press never repeats the last number.
RTC_DATA_ATTR uint16_t sequence = 0;

struct State {
  bool down = false;
  uint32_t since = 0;
  uint32_t lastSent = 0;
};
State states[sizeof(kButtons) / sizeof(kButtons[0])];
uint32_t lastActivity = 0;

uint16_t batteryMillivolts() {
  const uint32_t pin = analogReadMilliVolts(kBatteryPin);
  return pin < 500 ? 0 : (uint16_t)(pin * kBatteryDivider);
}

void send(remote::Key key, bool repeat) {
  remote::Packet packet{remote::kMagic, remote::kVersion, key, (uint8_t)repeat, ++sequence,
                        batteryMillivolts()};
  // Broadcast frames get no acknowledgement, so each press goes out a few times.
  for (int i = 0; i < kCopies; i++) {
    esp_now_send(kBroadcast, reinterpret_cast<uint8_t *>(&packet), sizeof(packet));
    delay(4);
  }
  lastActivity = millis();
#ifdef REMOTE_BENCH
  Serial.printf("sent %s%s\n", remote::keyName(key), repeat ? " (repeat)" : "");
#endif
}

void startRadio() {
  WiFi.mode(WIFI_STA);
  esp_wifi_set_channel(remote::kChannel, WIFI_SECOND_CHAN_NONE);
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW did not start");
    return;
  }
  esp_now_peer_info_t peer{};
  memcpy(peer.peer_addr, kBroadcast, sizeof(kBroadcast));
  peer.channel = remote::kChannel;
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  esp_now_add_peer(&peer);
}

void readButtons() {
  const uint32_t now = millis();
  for (size_t i = 0; i < sizeof(kButtons) / sizeof(kButtons[0]); i++) {
    const Button &button = kButtons[i];
    State &state = states[i];
    const bool down = digitalRead(button.pin) == HIGH;
    if (down && !state.down) {
      if (now - state.since < kDebounceMs) continue;
      state.down = true;
      state.since = now;
      state.lastSent = now;
      send(button.key, false);
    } else if (down && button.repeats && now - state.since >= kRepeatDelayMs &&
               now - state.lastSent >= kRepeatEveryMs) {
      state.lastSent = now;
      send(button.key, true);
    } else if (!down && state.down) {
      state.down = false;
      state.since = now;
    }
    if (down) lastActivity = now;
  }
}

#ifdef REMOTE_BENCH
void readSerialKeys() {
  while (Serial.available()) {
    switch (Serial.read()) {
      case 'u': send(remote::kUp, false); break;
      case 'd': send(remote::kDown, false); break;
      case 'l': send(remote::kLeft, false); break;
      case 'r': send(remote::kRight, false); break;
      case 'o': send(remote::kOk, false); break;
      case 'b': send(remote::kBack, false); break;
      case '+': send(remote::kVolumeUp, false); break;
      case '-': send(remote::kVolumeDown, false); break;
      default: break;
    }
  }
}
#endif

#ifndef REMOTE_BENCH
bool anyButtonDown() {
  for (const Button &button : kButtons) {
    if (digitalRead(button.pin) == HIGH) return true;
  }
  return false;
}

void sleepUntilPressed() {
  // A button still held would wake the chip again at once.
  while (anyButtonDown()) delay(10);
  uint64_t mask = 0;
  for (const Button &button : kButtons) {
    mask |= 1ULL << button.pin;
    rtc_gpio_pulldown_en(button.pin);
    rtc_gpio_pullup_dis(button.pin);
  }
  // The pulldowns above need the RTC peripherals powered while asleep.
  esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_PERIPH, ESP_PD_OPTION_ON);
  esp_sleep_enable_ext1_wakeup(mask, ESP_EXT1_WAKEUP_ANY_HIGH);
  esp_deep_sleep_start();
}
#endif

}  // namespace

void setup() {
  Serial.begin(115200);
  for (const Button &button : kButtons) pinMode(button.pin, INPUT_PULLDOWN);
  startRadio();

  // The button that woke the chip may be released by now; the wake cause still names it.
  if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_EXT1) {
    const uint64_t woke = esp_sleep_get_ext1_wakeup_status();
    for (size_t i = 0; i < sizeof(kButtons) / sizeof(kButtons[0]); i++) {
      if (woke & (1ULL << kButtons[i].pin)) {
        send(kButtons[i].key, false);
        states[i].down = digitalRead(kButtons[i].pin) == HIGH;
        states[i].since = millis();
        states[i].lastSent = millis();
      }
    }
  }
  lastActivity = millis();
#ifdef REMOTE_BENCH
  Serial.println("remote on the bench: type u d l r o b + - to send keys");
#endif
}

void loop() {
  readButtons();
#ifdef REMOTE_BENCH
  readSerialKeys();
#else
  if (millis() - lastActivity > kAwakeAfterPressMs) sleepUntilPressed();
#endif
  delay(5);
}

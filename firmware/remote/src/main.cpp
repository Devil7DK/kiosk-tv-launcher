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

#if defined(REMOTE_BOARD_S3_ZERO)
// Buttons connect the pin to ground. GPIO 1-21 can wake the S3; 0, 3, 45 and
// 46 decide how it boots and are left alone.
constexpr bool kPressedLevel = LOW;
constexpr esp_sleep_ext1_wakeup_mode_t kWakeMode = ESP_EXT1_WAKEUP_ANY_LOW;
constexpr Button kButtons[] = {
    {GPIO_NUM_4, remote::kUp, true},
    {GPIO_NUM_5, remote::kDown, true},
    {GPIO_NUM_6, remote::kLeft, true},
    {GPIO_NUM_7, remote::kRight, true},
    {GPIO_NUM_8, remote::kOk, false},
    {GPIO_NUM_9, remote::kBack, false},
    {GPIO_NUM_11, remote::kVolumeUp, true},
    {GPIO_NUM_12, remote::kVolumeDown, true},
};
// ADC1, the converter that still works while the radio is on.
constexpr int kBatteryPin = 1;
#elif defined(REMOTE_BOARD_DEVKIT)
// Buttons connect the pin to 3.3 V: the classic ESP32 cannot wake on a pin
// pulled low among several. These pins can wake it and do not affect how it
// boots (unlike 0, 2, 12 and 15).
constexpr bool kPressedLevel = HIGH;
constexpr esp_sleep_ext1_wakeup_mode_t kWakeMode = ESP_EXT1_WAKEUP_ANY_HIGH;
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
constexpr int kBatteryPin = 34;
#elif defined(REMOTE_BOARD_XIAO_S3)
// Buttons connect the pin to ground. D0-D5 and D8-D10 are GPIO 1-9, all able
// to wake the S3; D6 and D7 are its serial port and are left free.
constexpr bool kPressedLevel = LOW;
constexpr esp_sleep_ext1_wakeup_mode_t kWakeMode = ESP_EXT1_WAKEUP_ANY_LOW;
constexpr Button kButtons[] = {
    {GPIO_NUM_1, remote::kUp, true},          // D0
    {GPIO_NUM_2, remote::kDown, true},        // D1
    {GPIO_NUM_4, remote::kLeft, true},        // D3
    {GPIO_NUM_5, remote::kOk, false},         // D4
    {GPIO_NUM_6, remote::kRight, true},       // D5
    {GPIO_NUM_7, remote::kVolumeDown, true},  // D8
    {GPIO_NUM_8, remote::kVolumeUp, true},    // D9
    {GPIO_NUM_9, remote::kBack, false},       // D10
};
constexpr int kBatteryPin = 3;  // D2, on ADC1
#else
#error "Build for a board: REMOTE_BOARD_XIAO_S3, REMOTE_BOARD_S3_ZERO or REMOTE_BOARD_DEVKIT"
#endif

constexpr size_t kButtonCount = sizeof(kButtons) / sizeof(kButtons[0]);

// The battery reaches its pin through two equal resistors.
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
State states[kButtonCount];
uint32_t lastActivity = 0;

// Measured before each sleep and sent with the presses after it; 0 when the
// divider is not fitted.
RTC_DATA_ATTR uint16_t batteryMillivolts = 0;

/** Whether the two divider resistors are fitted. */
bool batteryDividerFitted() {
#if defined(REMOTE_BOARD_DEVKIT)
  // GPIO 34 has no pull-down to probe with, so the build says.
#ifdef REMOTE_BATTERY_SENSE
  return true;
#else
  return false;
#endif
#else
  // With the pin's own pull-down on, a bare pin reads near 0 V while the
  // divider still holds it at a few hundred millivolts.
  pinMode(kBatteryPin, INPUT_PULLDOWN);
  delay(5);
  const uint32_t probe = analogReadMilliVolts(kBatteryPin);
  pinMode(kBatteryPin, INPUT);
  return probe > 100;
#endif
}

/** Slow (the probe drains the capacitor), so it runs only where nobody waits. */
void measureBattery() {
  if (!batteryDividerFitted()) {
    batteryMillivolts = 0;
    return;
  }
  // The 100 nF capacitor recharges through the divider in about 0.1 s.
  delay(150);
  uint32_t total = 0;
  for (int i = 0; i < 8; i++) total += analogReadMilliVolts(kBatteryPin);
  batteryMillivolts = (uint16_t)(total / 8 * kBatteryDivider);
}

void send(remote::Key key, bool repeat) {
  remote::Packet packet{remote::kMagic, remote::kVersion, key, (uint8_t)repeat, ++sequence,
                        batteryMillivolts};
  // Broadcast frames get no acknowledgement, so each press goes out a few times.
  for (int i = 0; i < kCopies; i++) {
    esp_now_send(kBroadcast, reinterpret_cast<uint8_t *>(&packet), sizeof(packet));
    delay(4);
  }
  lastActivity = millis();
#ifdef REMOTE_BENCH
  Serial.printf("sent %s%s\n",
                key == remote::kBatteryReport ? "battery report" : remote::keyName(key),
                repeat ? " (repeat)" : "");
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

/** Sends the presses that ended a sleep, as if readButtons had seen them. */
void sendWakingPresses(const bool (&pressed)[kButtonCount]) {
  for (size_t i = 0; i < kButtonCount; i++) {
    if (!pressed[i]) continue;
    send(kButtons[i].key, false);
    states[i].down = digitalRead(kButtons[i].pin) == kPressedLevel;
    states[i].since = millis();
    states[i].lastSent = millis();
  }
}

void readButtons() {
  const uint32_t now = millis();
  for (size_t i = 0; i < kButtonCount; i++) {
    const Button &button = kButtons[i];
    State &state = states[i];
    const bool down = digitalRead(button.pin) == kPressedLevel;
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
      // Pretends the battery is nearly empty, to check the TV's notice.
      case '!':
        batteryMillivolts = 3550;
        send(remote::kBatteryReport, false);
        break;
      default: break;
    }
  }
}
#endif

#ifndef REMOTE_BENCH
bool anyButtonDown() {
  for (const Button &button : kButtons) {
    if (digitalRead(button.pin) == kPressedLevel) return true;
  }
  return false;
}

void sleepUntilPressed() {
  // A button still held would wake the chip again at once.
  while (anyButtonDown()) delay(10);
  measureBattery();
  // Sent now, so the TV knows the level without waiting for the next press.
  if (batteryMillivolts > 0) send(remote::kBatteryReport, false);
  uint64_t mask = 0;
  for (const Button &button : kButtons) {
    mask |= 1ULL << button.pin;
    // The chip's own resistors hold idle buttons at the released level.
    if (kPressedLevel == HIGH) {
      rtc_gpio_pulldown_en(button.pin);
      rtc_gpio_pullup_dis(button.pin);
    } else {
      rtc_gpio_pullup_en(button.pin);
      rtc_gpio_pulldown_dis(button.pin);
    }
  }
  // The resistors above need the RTC peripherals powered while asleep.
  esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_PERIPH, ESP_PD_OPTION_ON);
  esp_sleep_enable_ext1_wakeup(mask, kWakeMode);
  esp_deep_sleep_start();
}
#endif

}  // namespace

void setup() {
  Serial.begin(115200);
  for (const Button &button : kButtons) {
    pinMode(button.pin, kPressedLevel == HIGH ? INPUT_PULLDOWN : INPUT_PULLUP);
  }
  startRadio();

  // The button that woke the chip may be released by now; the wake cause still names it.
  if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_EXT1) {
    const uint64_t woke = esp_sleep_get_ext1_wakeup_status();
    bool pressed[kButtonCount];
    for (size_t i = 0; i < kButtonCount; i++) {
      pressed[i] = woke & (1ULL << kButtons[i].pin);
    }
    sendWakingPresses(pressed);
  }
  lastActivity = millis();
#ifdef REMOTE_BENCH
  measureBattery();
  Serial.printf("battery %u mV (0: no divider fitted)\n", batteryMillivolts);
  if (batteryMillivolts > 0) send(remote::kBatteryReport, false);
  Serial.println("remote on the bench: type u d l r o b + - to send keys, ! for a low battery");
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

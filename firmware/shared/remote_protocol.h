// The radio packet between the remote and the dongle. Both firmwares include
// this file, so a change here needs both boards flashed again.
#pragma once

#include <stdint.h>
#include <string.h>

namespace remote {

constexpr uint32_t kMagic = 0x4B545652;  // "KTVR"
constexpr uint8_t kVersion = 1;
// Neither board joins a Wi-Fi network, so both stay on this channel.
constexpr uint8_t kChannel = 1;

enum Key : uint8_t {
  /** No button: a battery report, sent just before the remote sleeps. */
  kBatteryReport = 0,
  kUp = 1,
  kDown,
  kLeft,
  kRight,
  kOk,
  kBack,
  kVolumeUp,
  kVolumeDown,
};

struct __attribute__((packed)) Packet {
  uint32_t magic;
  uint8_t version;
  uint8_t key;
  /** 1 while a held button repeats. */
  uint8_t repeat;
  /** Same for the copies of one press, so the dongle can drop duplicates. */
  uint16_t sequence;
  /** 0 when the remote has no battery divider fitted. */
  uint16_t batteryMillivolts;
};

inline const char *keyName(uint8_t key) {
  switch (key) {
    case kUp: return "up";
    case kDown: return "down";
    case kLeft: return "left";
    case kRight: return "right";
    case kOk: return "ok";
    case kBack: return "back";
    case kVolumeUp: return "volumeUp";
    case kVolumeDown: return "volumeDown";
    default: return nullptr;
  }
}

inline bool isValid(const uint8_t *data, int length) {
  if (length != (int)sizeof(Packet)) return false;
  Packet packet;
  memcpy(&packet, data, sizeof(packet));
  return packet.magic == kMagic && packet.version == kVersion &&
         (packet.key == kBatteryReport || keyName(packet.key));
}

}  // namespace remote

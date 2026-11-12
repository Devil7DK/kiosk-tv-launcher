# The remote

A handheld ESP32 sends each button press by ESP-NOW to a NodeMCU (ESP8266)
plugged into the TV laptop's USB. The NodeMCU prints each press as a line of
JSON, and the controller sends it on:

- to the video while one plays: OK pauses or resumes, left and right skip ten
  seconds, Back stops;
- to the launcher otherwise, as the arrow, Enter and Escape keys;
- Volume + and − change the laptop's sound (`wpctl`), on any screen.

The firmware is in `firmware/`, one PlatformIO project per board, sharing the
radio packet in `firmware/shared/remote_protocol.h`.

## Flashing

```bash
~/.platformio/penv/bin/pio run -d firmware/dongle -t upload            # NodeMCU
~/.platformio/penv/bin/pio run -d firmware/remote -e bench -t upload   # ESP32, on the desk
~/.platformio/penv/bin/pio run -d firmware/remote -e release -t upload # ESP32, in the case
```

With both boards on USB, the controller finds the dongle by itself (it answers
`?` with a greeting). To pin it, set `"remote": { "port": "/dev/ttyUSB0" }` in
`config/tv.json`; `"enabled": false` turns the remote off.

## Trying it without buttons

Flash the remote with `-e bench`, then open its serial monitor:

```bash
~/.platformio/penv/bin/pio device monitor -d firmware/remote -p /dev/ttyUSB1
```

Typing `u d l r o b + -` sends up, down, left, right, OK, Back, Volume + and
Volume − as if pressed. The bench build never sleeps.

## Wiring the remote (ESP32 DevKit, 30 pins)

Each button connects its pin to **3.3 V**. No resistors are needed: the chip's
own pull-down resistors hold the pins low, also while it sleeps.

| Button | GPIO |
| ------ | ---- |
| Up     | 32   |
| Down   | 33   |
| Left   | 25   |
| Right  | 26   |
| OK     | 27   |
| Back   | 14   |
| Vol +  | 13   |
| Vol −  | 4    |

GPIO 0, 2, 12 and 15 decide how the chip starts; a button on them can stop it
booting.

**Battery level (optional):** two equal resistors (about 200 kΩ each) from the
battery's + to ground, with the middle point on GPIO 34. Without them the remote
reports no level.

**Power:** battery → charging module with protection (B+/B−) → its OUT+/OUT− →
a low-drain 3.3 V regulator (MCP1700-3302 or HT7333) → the DevKit's **3V3** pin.
Feeding 3V3 directly bypasses the DevKit's own regulator, which wastes milliamps
while the chip sleeps. Remove the DevKit's power LED for the same reason. Never
connect USB and the battery at the same time when powering through 3V3.

After a press the remote stays awake for six seconds, so moving around feels
instant, then sleeps until the next press.

## Still to measure

The sleep current with the changes above, which decides how often the remote
needs charging. Measure it with a multimeter in series with the battery, in its
mA or µA range, a few seconds after the last press.

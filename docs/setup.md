# Setting up the TV

The TV is a laptop with a desktop session that logs in by itself. The
controller starts Brave in kiosk mode with its own profile, so the viewer sees
nothing but the launcher and the video.

## 1. Install

```bash
sudo dnf install brave-browser nodejs   # any recent Node, 24 or later
git clone <this repository> ~/Projects/kiosk-tv-launcher
cd ~/Projects/kiosk-tv-launcher
corepack enable
yarn install
yarn build
cp config/tv.example.json config/tv.json
```

## 2. Sign in to the services

In `config/tv.json`, set `"kiosk": false` for now and list the services to use.
JioHotstar, Sun NXT and ZEE5 each take the name of the viewer profile to watch
as; YouTube takes nothing.

```bash
yarn start
```

Brave opens with the TV's own profile (`~/.local/share/kiosk-tv/brave-profile`).
In that window, sign in to each service and to YouTube with the account the TV
should use. Then stop the controller with Ctrl+C and set `"kiosk": true`.

Everything the controller keeps (follows, playlists, settings, what was
watched) lives in `~/.local/share/kiosk-tv/data`.

## 3. Start with the session

```bash
mkdir -p ~/.config/systemd/user
cp config/systemd/kiosk-tv.service ~/.config/systemd/user/
systemctl --user enable --now kiosk-tv.service
journalctl --user -u kiosk-tv -f      # one JSON line per event
```

Turn on automatic login for the TV's user, and turn off screen blanking and
suspend, or the screen goes dark in the middle of an episode.

## 4. Set it up from a phone

Open `http://<the laptop's address>:8765/admin` on a phone or computer on the
same Wi-Fi. From there:

- add shows to **My shows** (shows on each service's own watchlist or favourites
  appear without that),
- make **playlists**, from any service, or show a YouTube playlist as one,
- choose the **languages** of the service tabs,
- set the **size** of everything on the TV, from 60% to 160%,
- choose whether **Continue watching** shows only what was started on the TV,
  or also what the services report from other devices.

The page answers only addresses on the home network.

## Debian package

A TV running Debian without a desktop gets the controller and launcher as one
package, built on a development machine:

```bash
yarn package:deb    # tools/package-deb/dist/kiosk-tv_<version>_amd64.deb
```

The controller and providers are bundled; only `serialport` (native code) and
`playwright-core` are shipped as installed. The package also turns off Brave's
telemetry and prompts through a policy in `/etc/brave/policies/managed`.

### Preparing the TV

Install Debian from the netinst image with no desktop, only "SSH server" and
"standard system utilities". Then, as root:

```bash
# Node 24 or later from NodeSource, Brave from its own apt repository, then:
apt install nodejs brave-browser cage xwayland pipewire pipewire-pulse \
  wireplumber firmware-amd-graphics mesa-va-drivers fonts-noto-core
apt install ./kiosk-tv_<version>_amd64.deb
useradd --create-home tv
usermod -aG video,render,audio,input,dialout tv
```

`dialout` lets the controller open the remote's dongle. The `tv` user needs no
other rights.

The power button beside the settings shuts the TV down or restarts it. It shows
when `/etc/kiosk-tv/tv.json` has `"power": { "enabled": true }`, and works
because the package lets the `tv` user do both through a polkit rule.

The `tv` user logs in on the first console by itself, once the network is up,
through a drop-in at `/etc/systemd/system/getty@tty1.service.d/`:

```ini
[Unit]
Wants=network-online.target
After=network-online.target

[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin tv --noclear %I $TERM
```

and its `~/.profile` ends with:

```sh
if [ "$(tty)" = /dev/tty1 ]; then exec cage -- kiosk-tv-session; fi
```

`kiosk-tv-session` starts the `kiosk-tv` user service with cage's display, and
cage shows Brave full screen. A Wi-Fi interface in `/etc/network/interfaces`
must be `auto`, not `allow-hotplug`: with the latter, boot goes on before the
connection is up, and the controller finds every service unreachable.

### Signing in

Set `"kiosk": false` in `/etc/kiosk-tv/tv.json` and restart the service. The
services can then be signed in to from another computer, through Brave's
DevTools port, which listens only on the TV itself:

```bash
ssh -N -L 9333:127.0.0.1:9222 <the TV>
```

In Chrome or Brave on that computer, `chrome://inspect/#devices`, **Configure**,
add `localhost:9333`; each of the TV's tabs then has an **inspect** link that
shows the page and takes clicks and typing. Sign in in each service's own tab,
set the viewer profiles in `/etc/kiosk-tv/tv.json`, set `"kiosk": true`, and
restart:

```bash
sudo -u tv XDG_RUNTIME_DIR=/run/user/$(id -u tv) systemctl --user restart kiosk-tv
```

The configuration in `/etc/kiosk-tv` survives upgrades.

### Updates

With the package come automatic updates, through `unattended-upgrades`: what
Debian chooses by default (its security fixes and point releases) and Brave's
releases. Node and this package are updated by hand. Nothing reboots by itself.

A browser left running on replaced files can fail to open new tabs, so at 03:30
a timer restarts the controller, and Brave with it, if Brave, Node or this
package was installed since it started. A TV that is off at night gets the new
version as it boots.

## The remote

Arrow keys, OK (Enter) and Back (Escape, Backspace or the browser Back key). A
Bluetooth remote that acts as a keyboard needs no setup. While a video plays,
OK pauses and resumes, left and right skip ten seconds, and Back stops and
returns to the launcher.

The gear at the right end of the tabs opens **Settings**, where Smaller and
Bigger change the size of everything on the TV, one step per press of OK. Back
or Done closes it; the choice is kept.

## Known limits

- ZEE5's sign-in token is valid for four days. Whether the site renews it on its
  own is not known yet; the admin page shows ZEE5 as expiring a day before the
  token runs out. If it does run out, sign in again in the TV's Brave window.
- Sun NXT does not remember where an episode stopped; the TV does, and resumes
  it there.

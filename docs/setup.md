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

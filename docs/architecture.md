# Architecture

The TV is an old laptop running one Brave window in kiosk mode. Everything the
viewer sees happens inside that window: the launcher in one tab, the streaming
site playing in another.

```
┌─────────────────────── Brave (kiosk, dedicated profile) ───────────────────────┐
│  launcher tab (apps/launcher)          player tab (hotstar, zee5, youtube, …)  │
└──────────▲─────────────────────────────────────────▲───────────────────────────┘
           │ HTTP / WebSocket                        │ Chrome DevTools Protocol
┌──────────┴─────────────────────────────────────────┴───────────────────────────┐
│ controller (apps/controller)                                                   │
│   provider registry ── loads @kiosk-tv/provider-<id> listed in config/tv.json  │
│   catalog cache ────── titles and playables, refreshed in the background       │
│   library store ────── follows, playlists, settings, recorded progress         │
│   browser (packages/browser) ── starts Brave, hands providers their pages      │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Why a real browser

The streaming services protect their video with Widevine DRM, and the sites are
the only clients they offer for a Linux laptop. Driving the sites in a real,
logged-in browser keeps playback working without reverse-engineering anything.
Brave has Widevine and blocks ads; Playwright's own Chromium has no Widevine.

Brave is started by the controller with `--remote-debugging-port` and a
dedicated `--user-data-dir`. Playwright attaches to it with `connectOverCDP`
rather than launching it, so the sites see an ordinary browser, not an
automated one. Remote debugging is refused on the default profile, and the
dedicated one keeps the TV's logins apart from anyone's personal browsing.

## Providers

Each streaming service is a package exporting a `ProviderModule` (see
`packages/provider-kit`). The controller reads `config/tv.json` at startup,
imports each enabled provider by package name, validates its section of the
configuration against the provider's schema and calls `create`. A provider that
fails, or finds itself logged out, is reported to the launcher and skipped.

A provider reads its catalog from a background tab, preferring the JSON the
site's own pages fetch over scraping the markup, and plays an episode by
navigating the player tab, clearing whatever stands in the way (profile picker,
play button) and going full screen.

Each provider is configured with the viewer profile it watches as. The sites
change the selected profile on their own (a "Who's watching?" screen, an account
change resetting it), so a provider checks the profile before every play and
switches back when it has to.

## The catalog

Everything on screen is either a `Title`, which the viewer opens (a series, a
YouTube channel or playlist), or a `Playable`, which plays (an episode, a film,
a video). Both carry a `Ref`, the provider's id plus its own id for the item,
and a `Playable` carries the watch URL, so a stored one plays without asking
the provider again.

A provider's tab shows the provider's own rows (`Shelf`), filtered to the
languages in the settings. None of the services offers an A–Z list worth
keeping, and their rows are how the sites themselves are arranged.

Episode lists come newest first in pages, with optional jump points (a month, a
season), because each site pages its episodes differently.

## Home and the library

Home is assembled by the controller across providers: Continue watching, "My
shows" with a mark when a new episode is out, and one row per playlist.

The library is the controller's own store, edited from an admin page the
controller serves on the home network, opened from a phone or another computer.
It holds:

- **Follows**, either added by hand or mirrored from an account's own list
  (watchlist, favourites, YouTube subscriptions), so a show added in a phone
  app also reaches the TV.
- **Playlists**, either our own, mixing providers, or a YouTube playlist that is
  re-read on refresh.
- **Settings**: the languages for the provider tabs, and whether Continue
  watching lists only what was started from the launcher or also everything the
  services report. The default is the former; a household account's history is
  mostly other people's viewing.

## Playback

The controller records progress itself while a video plays, by reading the
`<video>` element, and keeps whichever record is newer, its own or the
service's. Sun NXT reports no progress at all and does not resume when an
episode is reopened, so for it the recorded position is the only one.

Every site autoplays something else when a video ends, after anything from
nothing to fifteen seconds. The controller therefore takes the screen back on
`ended`, or on any navigation it did not ask for, and shows its own "Up next"
when the show has a next episode, or the show's episode list when it has not.

## The remote

The launcher is driven by arrow keys, Enter and Back only. A remote that
presents itself as a Bluetooth keyboard therefore needs no software on the
laptop. Commands the keyboard cannot express (volume, next episode) go to the
controller's HTTP API.

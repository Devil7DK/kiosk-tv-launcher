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
│   catalog cache ────── shows and episodes, refreshed in the background         │
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

## The remote

The launcher is driven by arrow keys, Enter and Back only. A remote that
presents itself as a Bluetooth keyboard therefore needs no software on the
laptop. Commands the keyboard cannot express (volume, next episode) go to the
controller's HTTP API.

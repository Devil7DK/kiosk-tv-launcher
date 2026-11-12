# Kiosk TV launcher

Turns an old laptop into a TV that is easy to use with a remote. One launcher
lists the shows from YouTube, JioHotstar, Sun NXT and ZEE5; choosing an episode
plays it full screen in Brave, where each service is already logged in.

See [docs/setup.md](docs/setup.md) to set up a TV,
[docs/architecture.md](docs/architecture.md) for how it fits together and
[CONVENTIONS.md](CONVENTIONS.md) for how the code is organised.

## Development

```bash
corepack enable
yarn install
yarn dev            # controller on :8765, launcher with hot reload on Vite
yarn typecheck && yarn lint && yarn test
```

`yarn dev` needs `config/tv.json` (copy `config/tv.example.json`) and drives a
real Brave window.

## Adding a streaming service

1. Create `packages/provider-<id>` exporting a `ProviderModule` with
   `defineProvider` from `@kiosk-tv/provider-kit`.
2. Add it to the controller's dependencies and enable it in `config/tv.json`.

## License

[MIT](LICENSE)

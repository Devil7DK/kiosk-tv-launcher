# Kiosk TV launcher

Turns an old laptop into a TV that is easy to use with a remote. One launcher
lists the shows from YouTube, JioHotstar, Sun NXT and ZEE5; choosing an episode
plays it full screen in Brave, where each service is already logged in.

See [docs/architecture.md](docs/architecture.md) for how it fits together and
[CONVENTIONS.md](CONVENTIONS.md) for how the code is organised.

## Development

```bash
corepack enable
yarn install
yarn dev
yarn typecheck && yarn lint && yarn test
```

## Adding a streaming service

1. Create `packages/provider-<id>` exporting a `ProviderModule` with
   `defineProvider` from `@kiosk-tv/provider-kit`.
2. Enable it in `config/tv.json`.

## License

[MIT](LICENSE)

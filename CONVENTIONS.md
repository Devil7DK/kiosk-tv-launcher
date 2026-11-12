# Project conventions

## 1. Repository layout

```
apps/        what runs on the TV: controller (Node service), launcher (the TV UI)
packages/    libraries: shared, browser, provider-kit, provider-<id>
tools/       development-only helpers
docs/        notes worth keeping
config/      the example TV configuration; the real one stays local
```

Package names are scoped: `@kiosk-tv/controller`, `@kiosk-tv/shared`.
Cross-package dependencies are pinned as `"@kiosk-tv/shared": "workspace:*"`.

The code is MIT licensed. Every `package.json` is `"private": true` with
`"license": "MIT"`. A dependency whose licence would bind the code (AGPL, GPL,
non-commercial terms) needs agreement before it is added.

**The shared package is the contract.** The provider interface, the domain types
(show, episode, playback state), the controller ↔ launcher API schemas and the
remote's key names live in `packages/shared` and are imported by everyone.
Nothing duplicates a shape the shared package already describes.

Inside a package, group by feature, not by kind:

```
src/<feature>/       everything one feature needs
src/components/      one folder per component (launcher only)
tests/               mirrors the source tree
```

A component folder holds its own parts: `ShowRow.tsx`, `ShowRow.css`,
`index.ts`. The `index.ts` re-exports, so imports stay at the folder.

### Providers

A provider is one streaming service (YouTube, Hotstar, SunNXT, Zee5). Providers
are the main swappable part, and adding one must never mean editing a caller.

- **One interface**, `Provider` in `packages/shared`, is all the controller and
  launcher know about. Optional capabilities (search, skip intro) are declared
  in the provider's manifest, and the UI hides what a provider does not offer.
- **One package per provider**, `packages/provider-<id>`, named
  `@kiosk-tv/provider-<id>`. Its entry exports a `ProviderModule`: a manifest and
  a `create(context)` factory. A provider talks to the browser only through the
  context it is given, never by starting or finding a browser itself.
- **Chosen once, at startup, from configuration.** `config/tv.json` lists the
  enabled providers and their settings. The controller loads each one by package
  name; the choice is never re-made inside feature code.
- A provider checks its configuration when it is created and refuses to start
  when something is missing. A provider that fails to start, or is logged out,
  is reported and skipped; it never takes the others down with it.
- Helpers more than one provider needs (capturing a site's JSON responses,
  waiting for the `<video>`, dismissing overlays) go in `packages/provider-kit`,
  not copied between providers.

### Reading a site

Sites change their markup often. Prefer, in order:

1. the JSON the site's own pages fetch, captured from the network or requested
   from inside the page so its logged-in cookies apply;
2. stable attributes (`data-*`, ARIA roles, URLs);
3. CSS selectors, kept in one place per provider so a site redesign is one edit.

Every response read off a site is parsed with a schema at the boundary. A
provider that cannot parse what it got says so in the log and returns nothing,
rather than handing the launcher half a show.

---

## 2. Tooling

There is exactly one of each, at the root, and every package answers to the same
script names.

| Concern         | Tool                                         | Config at the root                       |
| --------------- | -------------------------------------------- | ---------------------------------------- |
| Package manager | **Yarn 4** via corepack                      | `packageManager` field, `.yarnrc.yml`    |
| Task runner     | **Turborepo**                                | `turbo.json`                             |
| Language        | **TypeScript**, `strict: true`               | `tsconfig.base.json`, extended by all    |
| UI              | **Preact** + **Vite**                        | `apps/launcher/vite.config.ts`           |
| Browser control | **playwright-core** over CDP, driving Brave  | `packages/browser`                       |
| Lint            | **ESLint** flat config                       | `eslint.config.js`                       |
| Format          | **Prettier**                                 | `.prettierrc.json`, no per-package files |
| Tests           | **Vitest**                                   | `vitest.shared.ts`, re-exported by each  |
| Hooks           | **husky** + **lint-staged** + **commitlint** | `.husky/`, `.lintstagedrc.json`          |

Every check is one word from the repository root: `yarn dev`, `yarn build`,
`yarn typecheck`, `yarn test`, `yarn lint`, `yarn lint:fix`, `yarn format`,
`yarn format:check`.

Every package exposes the same script names (`dev`, `build`, `typecheck`, `test`,
`lint`, `lint:fix`, `format`) so the task runner can fan out and nobody has to
remember which package is different.

**A package declares every tool its own scripts run**, at the version the root
pins. Yarn makes a binary available only to the package that depends on it, so
a script naming an undeclared tool fails with `command not found`, and once
cached it keeps reporting success.

**The shared config files are global dependencies of the task runner.** A new
root config file goes into `globalDependencies` in `turbo.json` in the same
commit, or edits to it leave every package reporting a cached pass.

ESLint rules on top of the recommended sets:

- `simple-import-sort/imports` and `/exports`: **error**
- `import-x/first`, `import-x/newline-after-import`, `import-x/no-duplicates`
- `@typescript-eslint/no-unused-vars` with `^_` ignored for args and vars
- a rule turned off only with a comment saying which real case needs it

---

## 3. Commit guidelines

**Conventional Commits**, scoped, enforced by commitlint:

```
feat(provider-hotstar): List the episodes of a season
fix(launcher): Keep focus on the row the viewer came back to
chore(root): Add the shared Vitest config
```

- **Scope is the workspace** (`controller`, `launcher`, `shared`,
  `provider-zee5`), or `root` for repository-wide tooling.
- **Subject is sentence case** (commitlint rejects lower-case subjects), written
  as what the change does for a reader, not what files moved.
- **One change per commit**, as small as stands on its own. A feature that
  touches shared, the controller and the launcher is three commits, in
  dependency order. Every commit builds.
- **A single line.** Add a body only when the reasoning is not obvious from the
  diff.
- No `Co-Authored-By` or other trailers.

---

## 4. Coding style

Prettier and ESLint settle formatting and import order. What they cannot settle:

**General**

- 2-space indent, single quotes, semicolons, trailing commas.
- Named exports. A default export only where a framework or the provider loader
  demands one: a config file, a provider package's entry.
- Node packages use Node's ESM resolution, so relative imports carry the `.js`
  extension in TypeScript sources. The launcher uses the bundler's, and does
  not.
- Names say what a thing is for, not what type it holds: `latestEpisodes`, not
  `getArray`.

**Naming**

| Thing         | Style                          | Example                                     |
| ------------- | ------------------------------ | ------------------------------------------- |
| Node module   | kebab-case, role suffix        | `catalog.service.ts`, `hotstar.provider.ts` |
| Component     | PascalCase folder and file     | `ShowRow/ShowRow.tsx`                       |
| Shared module | PascalCase for a domain module | `schemas/EpisodeSchemas.ts`                 |
| Test          | mirrors its subject            | `catalog.service.test.ts`                   |

**Controller**

- The browser, the provider registry and the catalog cache are passed in, never
  imported as singletons, so a test can substitute them.
- All configuration goes through one validated config object, parsed at startup.
  Nothing else reads `process.env` or `config/tv.json`.
- Never send a provider's raw response to the launcher. Map it to the shared
  types first.

**Launcher**

- Function components and hooks. No class components.
- Everything is reachable with arrow keys, Enter and Back. There is no mouse on
  the TV; a feature that needs one is not finished.
- One component per file. Extract a subcomponent as soon as a `return` needs
  scrolling to read.

**Types and validation**

- Schemas are the single definition. Infer the TypeScript type from the schema
  rather than declaring it twice.
- Parse at the boundary (API requests, configuration, anything read off a site)
  and trust the value afterwards.

---

## 5. Accounts and personal data

- Logins live only in the dedicated Brave profile on the TV. The code never
  stores, logs or asks for a password, and never reads cookies except through
  the page it is driving.
- Never log tokens, cookies or full API responses. Log ids and titles.
- Test fixtures are trimmed copies of a site's responses with account and
  device details removed.

---

## 6. Tests

- Tests mirror the source tree.
- Test names read as sentences about behaviour, not about functions:
  `it('skips an episode with no playable URL instead of showing a dead tile')`.
- A provider's parsing is tested against saved fixtures, so a site change shows
  up as one failing test rather than an empty screen.
- Hand-written stubs beat a mocking framework. Every swappable part gets an
  in-memory version that tests use; providers get a fake one the launcher can
  be developed against without a browser.
- When a bug is fixed, the test written with it describes the bug's shape.

---

## 7. Workflow

```bash
corepack enable
yarn install
yarn dev            # every app, one command
yarn typecheck && yarn lint && yarn test
yarn format
```

Before anything is considered done:

1. `yarn typecheck`
2. `yarn lint`
3. `yarn test`
4. `yarn format:check`
5. **For UI, look at it.** Run the launcher and use it with the keyboard only.
6. **For a provider, play something.** Parsing tests passing does not mean the
   video starts.

Local-only files (scratch notes, dumps, one-off scripts) go in
`.git/info/exclude`, never in `.gitignore`.

Secrets live in `.env`, are never printed, never pasted into a commit, and never
read to "check" them. `.env.example` documents the names with empty values.

---

## 8. Working agreement with an AI agent

- **Never run `git commit` or `git push`.** Stage the change, show what is in it,
  print a suggested Conventional Commits message, and stop. Committing is the
  human's decision.
- Split work into the smallest commits that stand on their own, and say which
  files belong to which commit.
- Verify before reporting: typecheck, lint, tests, and, for anything visible,
  actually look at it. Report what was _not_ verified just as plainly.
- Say when something is a guess. A claim about a site's API, a library's
  behaviour or a browser flag is checked against the source, not recalled.
- Ask before anything destructive or outward-facing: deleting data, rewriting
  history, force-pushing, posting anywhere public.
- Prefer the boring change that fits the existing pattern over a clever one that
  introduces a second way of doing the same thing.

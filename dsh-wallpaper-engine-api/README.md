# dsh-wallpaper-engine-api

> v0.1.1 · MIT License · Windows
> English · [简体中文](https://github.com/nishuoyang/dsh-wallpaper-bg/blob/main/dsh-wallpaper-engine-api/README.zh.md)

Turns the standalone `wallpaper-engine-api/` service (clone repo → `npm install` → double-click a `.bat` → register autostart) into a DSH plugin for [dsh-wallpaper-bg](https://github.com/nishuoyang/dsh-wallpaper-bg)'s **WE library** source.

One command:

```bash
dsh plugin --profile web add dsh-wallpaper-engine-api
```

On the desktop app, just open **Settings → Plugins** and enter `dsh-wallpaper-engine-api`.

No Node.js on PATH, no separate process, no start script, no autostart entry — and it never changes your desktop wallpaper.

## Contents

- [Overview](#overview)
- [Features](#features)
- [Why install this instead of the old service](#why-install-this-instead-of-the-old-service)
- [Install](#install)
- [Verify](#verify)
- [API reference](#api-reference)
- [Usage examples](#usage-examples)
- [Configuration](#configuration)
- [Ports and lifecycle](#ports-and-lifecycle)
- [Read-only and security](#read-only-and-security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Publishing to npm](#publishing-to-npm)
- [License](#license)

## Overview

Wallpaper Engine stores subscribed wallpapers under the Steam workshop directory `steamapps\workshop\content\431960`, one subdirectory per wallpaper, each with a `project.json`. The current desktop selection lives in WE's own `config.json`.

This plugin does one thing: **expose those two locations over a read-only HTTP API**, so `dsh-wallpaper-bg` can list wallpapers, read the current desktop wallpaper, and render web wallpapers as backgrounds. It does not drive WE, replace its renderer, or write any file.

- Package: `dsh-wallpaper-engine-api` (a DSH profile bundle — one row on the host plane)
- API contract: aligned with the old `wallpaper-engine-api` **0.5.1** (`webShim: 1`, `monitorSelect: 1`)
- Port: `127.0.0.1:8088` by default; when taken, it moves and the main plugin follows
- Dependencies: zero runtime dependencies, zero build — it parses WE's `project.json` / `config.json` directly

## Features

- **One-command install** — `dsh plugin … add`, or type the package name on the plugin page; upgrades are another `add`.
- **Runs inside DSH** — the listener starts and stops with DSH. No background process, no autostart entry.
- **Zero runtime dependencies** — no `wallpaper-engine-api` npm package; one corrupt `project.json` is skipped instead of failing the whole list.
- **Steam library auto-discovery** — registry → `steamapps/libraryfolders.vdf` → common install paths, so WE in a second Steam library is found too.
- **Polite about ports** — reuses an existing WE API on the port, otherwise moves to the next port and then to an ephemeral one.
- **Same-origin status route** — `GET <DSH>/dsh-wallpaper-engine-api/status` publishes the real port, so a fallback needs no manual base-address change.
- **Filtered by real subscriptions** — reads Steam's `431960_subscriptions.vdf` and hides unsubscribed / `disabled_locally 1` entries, matching the WE UI.
- **Multi-monitor** — `/api/current` follows the monitor that changed most recently or is playing, and accepts an explicit monitor.
- **Web wallpapers work** — `/files` serves correct MIME types, `ETag` / 304, `Range` / 206, and injects the WE private-API shim into HTML.
- **Fails without taking DSH down** — a missing WE, unreadable `config.json`, or listen error only shows up in `/health` and the status route.

## Why install this instead of the old service

| | Old `wallpaper-engine-api/` | This plugin |
| --- | --- | --- |
| Install | clone + `npm install` + `.bat` + autostart | one command / plugin page |
| Process | separate Node process, outside DSH | inside the DSH host, stops with DSH |
| Node.js | must be on PATH | not needed (desktop bundles its runtime) |
| Upgrade | `git pull` + `npm install` + restart | `dsh plugin … add dsh-wallpaper-engine-api@<version>` |
| WE discovery | registry + common dirs | registry + `libraryfolders.vdf` (second Steam library) + common dirs |
| Port conflicts | fails to start | reuses an existing WE API, or moves to another port and is auto-discovered |
| Missing WE | exits with code 1 | plugin stays active and reports an actionable error |

The old folder remains in the repository for users who prefer the standalone service. New users should use this plugin.

## Install

### Desktop

1. **Settings → Plugins**, enter `dsh-wallpaper-engine-api` in the install box;
2. Restart the desktop app (or reload the window) as prompted;
3. Open **Settings → Wallpaper → WE library**.

### CLI

```bash
dsh plugin --profile web add dsh-wallpaper-engine-api       # web
dsh plugin --profile desktop add dsh-wallpaper-engine-api   # desktop profile
```

### Requirements

**Windows**, Wallpaper Engine installed locally through Steam, and `dsh-wallpaper-bg` installed (this package only supplies data; the UI lives there).

### Upgrade

Upgrades need an explicit version:

```bash
dsh plugin --profile web add dsh-wallpaper-engine-api@latest
dsh plugin --profile web add dsh-wallpaper-engine-api@0.1.1   # pinned
```

pnpm keeps the existing range on a plain `add`, so a bare `add` will not upgrade. pnpm 11 also waits ~24 hours before installing a fresh release unless the version is pinned.

## Verify

- The plugin page lists **Wallpaper Engine Library API** as enabled.
- `<DSH>/dsh-wallpaper-engine-api/status` returns JSON; `base` is the real API origin (for example `http://127.0.0.1:8088`).
- Open that origin's `/health`: `"mode": "readonly"`, non-empty `weInstallPath` / `workshopPath`, `error` empty.
- In `dsh-wallpaper-bg`, the WE tab lists wallpapers and desktop sync works.

`status.external: true` means an existing WE API service was found on the port and reused; this plugin does not bind a second listener.

## API reference

The service binds `127.0.0.1` only, accepts `GET` / `HEAD` (anything else is `405`), and every JSON response is `Cache-Control: no-store`.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Service state, WE paths, actual port, error reason |
| `GET /api/wallpapers` | Installed wallpapers, filtered by the real Steam subscription list |
| `GET /api/current[?monitor=]` | Current desktop wallpaper, with multi-monitor follow/select |
| `GET /files/<id>/<rel>` | Web-wallpaper files, HTML gets the WE private-API shim |
| `GET <DSH>/dsh-wallpaper-engine-api/status` | Same-origin discovery route for the main plugin |

### GET /health

Aliases: `/`, `/api/health`. Always `200` — failures are described in `error`.

```json
{
  "ok": true,
  "service": "dsh-wallpaper-engine-api",
  "plugin": "dsh-wallpaper-engine-api",
  "version": "0.1.1",
  "api": "0.5.1",
  "status": "running",
  "running": true,
  "external": false,
  "externalService": "",
  "base": "http://127.0.0.1:8088",
  "port": 8088,
  "requestedPort": 8088,
  "fallbackFrom": null,
  "mode": "readonly",
  "webShim": 1,
  "monitorSelect": 1,
  "weInstallPath": "E:\\SteamLibrary\\steamapps\\common\\wallpaper_engine",
  "workshopPath": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960",
  "subscriptionsFile": "C:\\Program Files (x86)\\Steam\\userdata\\123456789\\ugc\\431960_subscriptions.vdf",
  "pathsSource": "auto",
  "weRunning": true,
  "error": "",
  "startedAt": "2026-10-27T00:10:00.000Z",
  "time": "2026-10-27T00:10:30.000Z"
}
```

| Field | Meaning |
| --- | --- |
| `ok` | Service usable (same as `running`) |
| `status` | `idle` / `starting` / `running` (this plugin listening) / `external` (reusing another service) / `error` / `unsupported` (non-Windows) / `stopped` |
| `version` | Plugin version |
| `api` | Compatible old-service contract (`0.5.1`) |
| `base` / `port` / `requestedPort` | Real origin, real port, configured port |
| `fallbackFrom` | Port that failed before the fallback; `null` if none |
| `external` / `externalService` | Whether an existing WE API was reused, and its `service` id |
| `mode` / `webShim` / `monitorSelect` | Capability flags: read-only, web shim, monitor selection |
| `weInstallPath` / `workshopPath` | WE install directory, workshop library |
| `subscriptionsFile` | Subscription file(s) actually used, joined by `; ` |
| `pathsSource` | `auto` detected / `config` from config / `none` |
| `weRunning` | `wallpaper32/64.exe` or `wallpaperservice32.exe` detected |
| `error` | Actionable failure text; the panel reads this field |

### GET /api/wallpapers

Aliases: `/wallpapers`, `/api/wallpapers/list`, `/api/list`, `/list`.

| Query | Meaning |
| --- | --- |
| `refresh=1` | Bypass the 60 s list cache and re-read the disk (subscription cache is 30 s) |

```json
{
  "ok": true,
  "wallpapers": [
    {
      "id": "1234567890",
      "title": "Neon City",
      "type": "video",
      "filepath": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\1234567890\\scene.pkg",
      "entry": "scene.pkg",
      "thumbnail": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\1234567890\\preview.gif",
      "previewUrl": "",
      "previewFile": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\1234567890\\preview.gif",
      "previewSize": { "w": 1920, "h": 1080 },
      "tags": ["Abstract"],
      "description": "",
      "rating": "everyone"
    }
  ],
  "count": 1,
  "hiddenUnsubscribed": 3,
  "skippedNoProject": 1
}
```

- `count` is what is actually returned after filtering;
- `hiddenUnsubscribed` counts entries hidden because they are unsubscribed (or `disabled_locally 1`);
- `skippedNoProject` counts directories without a readable `project.json`;
- `type` comes from `project.json`; when missing it is inferred from the extension (`.pkg` → `scene`, `.html` → `web`, video / image likewise);
- `previewSize` is parsed from the `preview.gif` / PNG / JPEG header, `null` when unreadable;
- a missing workshop library yields `503` with an `error` naming the path.

### GET /api/current

Aliases: `/current`, `/api/wallpapers/current`, `/wallpapers/current`, `/api/state`.

| Query | Meaning |
| --- | --- |
| `monitor` (or `m`) | `Monitor1` / `1` picks a monitor (the key used by WE's `config.json`: `Monitor0`, `Monitor1`, …); `auto` or omitted follows automatically |

The follow order is **explicit parameter → monitor changed most recently → monitor currently playing (newest media file atime) → first monitor**.

```json
{
  "ok": true,
  "current": {
    "id": "1234567890",
    "title": "Neon City",
    "type": "video",
    "filepath": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\1234567890\\scene.pkg",
    "entry": "scene.pkg",
    "thumbnail": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\1234567890\\preview.gif",
    "previewUrl": "",
    "previewFile": "E:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\1234567890\\preview.gif",
    "previewSize": { "w": 1920, "h": 1080 },
    "tags": [],
    "description": "",
    "rating": "everyone"
  },
  "monitor": "Monitor1",
  "monitorSource": "changed",
  "monitors": [
    { "key": "Monitor0", "title": "Aurora", "type": "scene", "live": false, "selected": false },
    { "key": "Monitor1", "title": "Neon City", "type": "video", "live": true, "selected": true }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `current` | Item for the selected monitor, same shape as a `/api/wallpapers` element; `null` when unavailable |
| `monitor` | Chosen monitor key |
| `monitorSource` | `manual` parameter / `changed` most recently changed / `live` playing / `first` fallback / `none` |
| `monitors[]` | Key, title, type per monitor, plus `live` and `selected` |
| `error` | Present when WE's `config.json` is unreadable — still `200` with `current: null` |

An unusable WE install directory yields `503`.

### GET /files/&lt;id&gt;/&lt;rel&gt;

Serves files inside one workshop wallpaper directory; `rel` defaults to `index.html`.

| Behaviour | Detail |
| --- | --- |
| Path rules | `id` must be numeric and subscribed (the check is skipped when no subscription file is found); the resolved absolute path must stay inside `workshopPath\<id>`, otherwise `403` |
| MIME | Mapped by extension (HTML / CSS / JS / images / audio / fonts / `mp4` / `webm` / `wasm`…), unknown types `application/octet-stream` |
| Caching | HTML is `no-cache`, other files `public, max-age=300`; responses carry `ETag` and `Last-Modified`, so `If-None-Match` gives `304` |
| Ranges | Single-range `Range` returns `206` with `Content-Range`; an invalid range returns `416` |
| Shim | Injected only into **document** responses (opened directly or in an `iframe`; `fetch` gets the raw HTML) |
| Relative paths | A hard-coded `../assets/…` collapses to `/files/assets/…` in the browser; the wallpaper id from `Referer` is used as a fallback, still confined to that directory |

The shim exposes `window.__wbgWeShim`, feeds `project.json`'s `general.properties` defaults into `wallpaperPropertyListener.applyUserProperties`, stubs the media/audio APIs (silent spectrum, so wallpapers do not throw on `undefined`), and reports painting to the parent:

```js
{ __wbg: 1, type: 'painted' | 'error', id: '<wallpaper id>', payload: null | { message } }
```

### GET &lt;DSH&gt;/dsh-wallpaper-engine-api/status

Same-origin discovery route registered on the host's `webServer`; `/dsh-wallpaper-engine-api` and `/dsh-wallpaper-engine-api/health` resolve to it too. The body is every `/health` field plus:

```json
{
  "discover": true,
  "plugin": "dsh-wallpaper-engine-api",
  "pluginVersion": "0.1.1",
  "apiBase": "http://127.0.0.1:8088"
}
```

Other paths return `404` with `{ "ok": false, "error": "未知路由: …" }`. When the main plugin has no base address configured, it calls this route first and forwards to `apiBase`.

### Status codes

| Code | When |
| --- | --- |
| `200` | Normal; `/health` also uses it on failure, with the reason in `error` |
| `206` / `304` / `416` | Range slice, ETag hit, invalid range |
| `400` | Bad URL, bad wallpaper id, bad path encoding |
| `403` | Unsubscribed / locally disabled wallpaper, path traversal |
| `404` | Missing file or wallpaper directory, unknown endpoint |
| `405` | Method other than `GET` / `HEAD` |
| `503` | Workshop library or WE install directory unusable |

## Usage examples

Examples assume `base` is `http://127.0.0.1:8088`; the real port is `apiBase` from `/status`. In Windows PowerShell, `curl` is an alias for `Invoke-WebRequest` — use `curl.exe`.

**1. Check the service**

```bash
curl.exe -s http://127.0.0.1:8088/health
```

**2. List wallpapers, titles and types only**

```bash
curl.exe -s "http://127.0.0.1:8088/api/wallpapers?refresh=1"
```

```bash
node -e "fetch('http://127.0.0.1:8088/api/wallpapers').then(r=>r.json()).then(d=>console.log(d.count+' wallpapers: '+d.wallpapers.map(w=>w.title+'('+w.type+')').join(', ')))"
```

**3. Read the current wallpaper on the second monitor**

```bash
curl.exe -s "http://127.0.0.1:8088/api/current?monitor=1"
```

**4. Embed a web wallpaper in a page**

```html
<iframe
  src="http://127.0.0.1:8088/files/1234567890/index.html"
  style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>

<script>
  addEventListener('message', (event) => {
    // the shim posts with targetOrigin='*', so the parent validates the origin
    if (event.origin !== 'http://127.0.0.1:8088') return
    const msg = event.data
    if (!msg || msg.__wbg !== 1) return
    if (msg.type === 'painted') console.log('wallpaper painted: ' + msg.id)
    if (msg.type === 'error') console.warn('wallpaper script error:', msg.payload)
  })
</script>
```

**5. Use it from `dsh-wallpaper-bg`**

Open **Settings → Wallpaper → WE library**; both the list and desktop sync go through this service. The main plugin calls the same-origin `/dsh-wallpaper-engine-api/status` route for `base`, so **no manual base address is needed** — only a hand-edited base address has to match it.

## Configuration

Zero-config by default: Steam / WE / workshop paths are auto-detected and the port is `8088`. Override the row in the profile's `cordis.patch.yml` only when auto-detection fails or the port conflicts (desktop: `%DSH_HOME%\profiles\desktop\cordis.patch.yml`):

```yaml
- id: wallpaper-engine-api
  name: dsh-wallpaper-engine-api
  config:
    port: 8088
    # optional: when WE lives outside the auto-detected paths
    weInstallPath: D:\Steam\steamapps\common\wallpaper_engine
    workshopPath: D:\Steam\steamapps\workshop\content\431960
    # optional: pin the subscription file
    subscriptionsFile: D:\Steam\userdata\1588688173\ugc\431960_subscriptions.vdf
    # move to another port when a non-WE app owns it (default true)
    autoPort: true
    # write diagnostics to the host log (default false)
    verbose: false
```

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `port` | number | `8088` | Listen port on `127.0.0.1`; `0` lets the OS pick |
| `weInstallPath` | string | auto | WE install directory (containing `wallpaper64.exe`); desktop sync needs its `config.json` |
| `workshopPath` | string | auto | Workshop library, usually `…\steamapps\workshop\content\431960` |
| `subscriptionsFile` | string | auto | Explicit `431960_subscriptions.vdf`; otherwise each Steam library's `userdata\*\ugc\` is scanned |
| `autoPort` | boolean | `true` | Fall back to another port when a non-WE app owns the port |
| `verbose` | boolean | `false` | Log startup / fallback / detection failures to the host log |

Environment equivalents (lower priority than the row config):

| Variable | Equivalent |
| --- | --- |
| `WEAPI_PORT` (or `WE_API_PORT`) | `port` |
| `WE_INSTALL_PATH` | `weInstallPath` |
| `WE_WORKSHOP_PATH` | `workshopPath` |
| `WE_SUBSCRIPTIONS_FILE` | `subscriptionsFile` |
| `DSH_WE_API_DEBUG=1` | `verbose` |

Path resolution is **row config > environment > auto-detection**; auto-detection walks the registry (`HKCU\Software\Valve\Steam`, `HKLM\…\Valve\Steam`), each Steam library's `libraryfolders.vdf`, then the common install directories on `C:`–`H:`. When only `workshopPath` is given, the WE install directory is derived from that Steam library first, which is more accurate than a full scan.

Restart DSH after changing host-side config (it is a Node module and does not hot-reload).

## Ports and lifecycle

- Binds `127.0.0.1` only.
- Default `8088`; if it already hosts a WE API (identifiable by `/health`'s `service`), the plugin reuses it and reports `external`; if another app owns it and `autoPort` is on, the plugin tries the next port and then an ephemeral one.
- The actual origin is published through the same-origin status route; `dsh-wallpaper-bg` follows it. You only need to keep the base address in sync if you override it manually in the main plugin.
- The listener belongs to the DSH process: no background process, no autostart entry.
- On non-Windows the plugin still loads, but `/health` reports `status: "unsupported"` with the reason.

## Read-only and security

- Only "list installed wallpapers" and "read current wallpaper config" are used; `load` / `stop` / `openProfile` are never called.
- No `scene.pkg` parsing, screen capture, frame/video caching, or file writes (the list and subscription set are cached in memory only).
- Web wallpapers render on a **separate origin** (a different port), so third-party workshop HTML cannot reach DSH's origin, cookies, or localStorage.
- `/files` is restricted to subscribed wallpaper directories with path-traversal checks; the shim is injected only into document responses.
- The list is filtered by Steam's real subscription file, matching Wallpaper Engine's UI.
- Known boundary: the service is reachable only on the loopback interface, but responses carry `Access-Control-Allow-Origin: *`, so any **local** page can read the wallpaper list and file names — treat it as a local service for a trusted machine.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/status` 404 | Plugin not in this profile, or DSH not restarted; check `dsh.profile.bundles` |
| `error` says Wallpaper Engine not found | Set `weInstallPath` (folder containing `wallpaper64.exe`) and restart DSH; for a second Steam library make sure `libraryfolders.vdf` is readable |
| Empty list while WE shows wallpapers | Subscribe in WE; check `workshopPath` / `subscriptionsFile`; `hiddenUnsubscribed` shows filtered entries |
| Fewer wallpapers than WE | Check `hiddenUnsubscribed` (unsubscribed / `disabled_locally 1`) and `skippedNoProject` (missing `project.json`) |
| Desktop sync unavailable | `config.json` unreadable: point `weInstallPath` at the WE install folder and make sure the current Windows user can read it |
| `monitor` has no effect | The key must exist (`Monitor0`, `Monitor1`, …, or `1`); an unknown key falls back to auto |
| Web wallpaper is blank / black | Open it via an `iframe` or `/files/<id>/index.html`; HTML fetched with `fetch` gets no shim, so the WE APIs it expects are missing |
| "Cannot reach WE API" in the main plugin | Check `/status` `base`/`error`; clear a manually overridden base address |
| 8088 still serves the old service | `status.external: true` is expected reuse; to switch, run the old folder's `取消开机自启.bat`, stop that process, then restart DSH |
| Config changes do nothing | Host-side config does not hot-reload; restart DSH |

A few frequent ones:

**Will it change my desktop wallpaper?** No. The service is read-only; `dsh-wallpaper-bg`'s desktop sync only reads your current WE wallpaper and uses it as the DSH background — it never writes back to WE or to Windows.

**Do I need to start it separately or add autostart?** No. It runs with DSH; disable the plugin on the plugin page to stop it.

**Which wallpaper types are supported?** All installed wallpapers are listed (`scene` / `video` / `web` / `application`); the `/files` service and shim only matter for `web` ones.

**Does it work outside Windows?** No. Wallpaper Engine is Windows-only; other platforms report `unsupported`.

## Development

Zero dependencies, zero build:

```bash
node --check index.js
npm test            # same as npm run verify
npm run pack:check  # npm pack --dry-run, checks the files list
```

`npm test` builds a temporary fixture that mimics a WE install and covers `/health` capability flags, list and subscription filtering, current wallpaper and monitor arguments, the `/files` shim / ETag / Range / path traversal / unsubscribed cases, external-service reuse, port fallback, and a missing WE. It never reads the real WE library and never takes 8088 (it uses an ephemeral port).

## Publishing to npm

Maintainers run this inside the package directory:

```bash
cd dsh-wallpaper-engine-api
npm test
npm pack --dry-run
npm publish --access public
```

The repository's `scripts/release.ps1` releases only `dsh-wallpaper-bg` and does **not** handle this package; it is versioned independently in its own `package.json`, with a matching `CHANGELOG.md` entry added before publishing. `package.json`'s `files` must include `index.js`, `lib/`, `cordis.patch.yml`, `locale/*.json`, `icon.svg`, both READMEs, `LICENSE`, and `CHANGELOG.md`. The main plugin discovers it through the same-origin status route, so the two can be upgraded independently; only a contract change (the `base` field on `/dsh-wallpaper-engine-api/status`) requires upgrading both.

## License

MIT. See [LICENSE](LICENSE).

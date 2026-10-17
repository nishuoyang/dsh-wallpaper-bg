# dsh-wallpaper-engine-api

> v0.1.0 · MIT License · Windows

Turns the standalone `wallpaper-engine-api/` service (clone repo → `npm install` → double-click a `.bat` → register autostart) into a DSH plugin for [dsh-wallpaper-bg](https://github.com/nishuoyang/dsh-wallpaper-bg)'s **WE library** source.

One command:

```bash
dsh plugin --profile web add dsh-wallpaper-engine-api
```

On the desktop app, just open **Settings → Plugins** and enter `dsh-wallpaper-engine-api`.

## What it does

The plugin starts a **read-only** HTTP API inside the DSH host process:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Service state, WE paths, actual port, error reason |
| `GET /api/wallpapers` | Installed wallpapers, filtered by the real Steam subscription list |
| `GET /api/current[?monitor=]` | Current desktop wallpaper, with multi-monitor follow/select |
| `GET /files/<id>/<rel>` | Web-wallpaper files, HTML gets the WE private-API shim |

A same-origin route, `GET <DSH>/dsh-wallpaper-engine-api/status`, lets `dsh-wallpaper-bg` discover the **actual** port automatically, including when 8088 is occupied and the server falls back to another port.

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

Desktop: **Settings → Plugins → `dsh-wallpaper-engine-api` → install → restart**.

CLI:

```bash
dsh plugin --profile web add dsh-wallpaper-engine-api
dsh plugin --profile desktop add dsh-wallpaper-engine-api   # desktop profile
```

Requirements: **Windows**, Wallpaper Engine installed locally, and `dsh-wallpaper-bg` installed (this package only supplies data; the UI lives there).

Upgrades need an explicit version — `dsh plugin … add dsh-wallpaper-engine-api@latest` (or a pinned version). pnpm keeps the existing range on a plain `add`, and pnpm 11 also waits ~24 hours before installing a fresh release unless the version is pinned.

## Verify

- The plugin page lists **Wallpaper Engine Library API** as enabled.
- `<DSH>/dsh-wallpaper-engine-api/status` returns JSON; `base` is the real API origin (for example `http://127.0.0.1:8088`).
- Open that origin's `/health`: `"mode": "readonly"`, non-empty `weInstallPath` / `workshopPath`, `error` empty.
- In `dsh-wallpaper-bg`, the WE tab lists wallpapers and desktop sync works.

`status.external: true` means an existing WE API service was found on the port and reused; this plugin does not bind a second listener.

## Configuration (optional)

Zero-config by default. Override the row in the profile's `cordis.patch.yml` only when auto-detection fails or the port conflicts:

```yaml
- id: wallpaper-engine-api
  name: dsh-wallpaper-engine-api
  config:
    port: 8088
    weInstallPath: D:\Steam\steamapps\common\wallpaper_engine
    workshopPath: D:\Steam\steamapps\workshop\content\431960
    subscriptionsFile: D:\Steam\userdata\1588688173\ugc\431960_subscriptions.vdf
    autoPort: true
    verbose: false
```

Environment equivalents (lower priority than the row config): `WEAPI_PORT`, `WE_INSTALL_PATH`, `WE_WORKSHOP_PATH`, `WE_SUBSCRIPTIONS_FILE`. Restart DSH after changing host-side config.

## Ports and lifecycle

- Binds `127.0.0.1` only.
- Default `8088`; if it already hosts a WE API, the plugin reuses it; if another app owns it, the plugin tries `8089` and then an ephemeral port (`autoPort`).
- The actual origin is published through the same-origin status route; `dsh-wallpaper-bg` follows it. You only need to keep the base address in sync if you override it manually in the main plugin.
- The listener belongs to the DSH process: no background process, no autostart entry.

## Read-only and security

- Only "list installed wallpapers" and "read current wallpaper config" are used; `load` / `stop` / `openProfile` are never called.
- No `scene.pkg` parsing, screen capture, frame/video caching, or file writes.
- Web wallpapers render on a **separate origin** (a different port), so third-party workshop HTML cannot reach DSH's origin, cookies, or localStorage.
- `/files` is restricted to subscribed wallpaper directories with path-traversal checks; the shim is injected only into document responses.
- The list is filtered by Steam's real subscription file, matching Wallpaper Engine's UI.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/status` 404 | Plugin not in this profile, or DSH not restarted; check `dsh.profile.bundles` |
| `error` says Wallpaper Engine not found | Set `weInstallPath` (folder containing `wallpaper64.exe`) and restart DSH |
| Empty list while WE shows wallpapers | Subscribe in WE; check `workshopPath` / `subscriptionsFile`; `hiddenUnsubscribed` shows filtered entries |
| Desktop sync unavailable | `config.json` unreadable: point `weInstallPath` at the WE install folder |
| "Cannot reach WE API" in the main plugin | Check `/status` `base`/`error`; clear a manually overridden base address |
| 8088 still serves the old service | `status.external: true` is expected reuse; to switch, run the old folder's `取消开机自启.bat`, stop that process, then restart DSH |

## Development

Zero dependencies, zero build:

```bash
node --check index.js
npm test   # fixture-based: list / current / files / shim / ETag / Range / port reuse
```

## License

MIT. See [LICENSE](LICENSE).

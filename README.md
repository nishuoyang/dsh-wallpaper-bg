# dsh-wallpaper-bg

> v0.5.10 · MIT License

[![npm version](https://img.shields.io/npm/v/dsh-wallpaper-bg?label=npm&color=cb3837)](https://www.npmjs.com/package/dsh-wallpaper-bg)
[![npm downloads](https://img.shields.io/npm/dm/dsh-wallpaper-bg?label=downloads)](https://www.npmjs.com/package/dsh-wallpaper-bg)
[![GitHub release](https://img.shields.io/github/v/release/nishuoyang/dsh-wallpaper-bg?label=release)](https://github.com/nishuoyang/dsh-wallpaper-bg/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

English | [中文](README.zh.md)

A static two-half plugin that puts an **independent animated wallpaper layer** under the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) interface — the browser UI (`dsh web`) and the 0.2 **desktop app** alike: install it (one command on the CLI, or just a package name in the desktop app's plugin page), and the whole interface sits on a moving wallpaper. Ships with 10 high-res Unsplash images, supports uploading local images / videos, and can read-only connect to your local Wallpaper Engine library — video and web wallpapers render natively in the browser, while **「同步桌面壁纸」 read-only follows the desktop wallpaper** (whatever the desktop switches to shows up on the page: scenes as their workshop preview `preview.gif`, videos / images / web pages rendered natively — no screen sampling, zero local rendering and zero cache files). In light theme a translucent white fog is layered in automatically, in dark theme a dimming overlay is applied, so fine text stays readable. A **Native background** switch on the main conversation page clears that fog / overlay and the plugin's translucent page surfaces in one click, so the wallpaper shows through completely, while the composer and dialogs keep their readable surfaces. The background layer is fully independent from the desktop Wallpaper Engine: changing wallpapers inside DSH never touches your desktop wallpaper, and vice versa.

![DSH interface in dark theme](docs/screenshots/overview-dark.jpg)

![Native background mode in light theme](docs/screenshots/overview-native-light.jpg)

![More UI previews (1)](docs/screenshots/screenshot-01.jpg)

![Settings panel · Wallpaper tab](docs/screenshots/settings-panel.jpg)

![More UI previews (2)](docs/screenshots/screenshot-02.jpg)

![More UI previews (3)](docs/screenshots/screenshot-03.jpg)

## Features

- **Three wallpaper sources**
  - **Built-in wallpapers**: 10 high-res Unsplash images, ready to use with zero local services;
  - **Custom uploads**: local images / videos, stored in IndexedDB and kept across refreshes. Videos get auto-generated first-frame thumbnails, and extension-based detection covers files whose MIME type the browser leaves empty (e.g. `.mkv` / `.mov`) — they now render as video instead of a black screen;
  - **WE library**: read-only access to locally installed Wallpaper Engine wallpapers (default `http://127.0.0.1:8088`), filtered by the real Steam subscription list — unsubscribed wallpapers never linger.
- **Playback queue (custom uploads + WE library)**: drag wallpapers from either source's grid into its queue and loop-play them, 1–10 minutes per item (both queues share one duration slider). Queue items support drag-to-reorder (with an insertion indicator), click-to-jump, per-item remove, and clear-all; queue contents, toggles and playback positions persist to localStorage. The custom queue accepts images / videos; the WE queue accepts video / scene / web / image wallpapers. Each queue is **sticky at the top of its tab**, so even with hundreds of wallpapers any tile is a short drag away.
- **Three render modes**
  - Static images (cover-fit);
  - Videos (`<video object-fit: cover>`, GPU compositing, no letterboxing or distortion);
  - Scene wallpapers (always show WE's own workshop preview `preview.gif` / `preview.jpg` — the same image for manual selection, queues and desktop sync, and `preview.gif` animates on its own; for full-fidelity motion, record the scene with WE's screen recorder or OBS and import the MP4 through custom uploads);
  - Web wallpapers (native iframe rendering of `index.html` in the browser).
- **Zero local rendering, zero cache files**: the plugin never parses `scene.pkg`, never renders scene frames, never bakes videos and never samples the desktop — no `~/.dsh-wallpaper-bg`, no frame files, no MP4s. The local scene renderer and the animation-baking stack were **removed in 0.4.0** together with the `WE_SCENE_RENDER` switch; the desktop-frame capture (`/capture`) that 0.4.x used for mirroring was **removed in 0.5.0**.
- **Four adjustments**: light fog / dark overlay (auto-switching with the DSH theme), background blur (0–20px), background brightness (50–150%), safe zoom (0–10% to crop edge letterboxing).
- **Native background switch on the main page**: clears the light fog, the dark overlay and the translucent page surfaces in one click, so the wallpaper is fully visible; the composer and dialogs keep their readable surfaces. Turning it off restores the saved fog / overlay values, and the switch state persists.
- **Black-flash-free switching**: every wallpaper change (including queue rotation) cross-fades two stacked layers — the incoming wallpaper preloads and finishes decoding / first-frame playback in its own layer, then blends with the outgoing one over ~0.42s, and the old layer is only removed after it has faded out. Applies to all render modes (image, video, scene preview, web), so no frame of the transition is ever empty. The video path also waits for `requestVideoFrameCallback` to report a presented frame before entering: a 4K video can take hundreds of milliseconds between attach and first paint, and what shows through meanwhile is the still-playing outgoing wallpaper rather than a flat backdrop.
- **Next-item warm-up**: while a queue item is on screen, the next one is fetched ahead of time (network images downloaded and decoded, WE videos buffered in a real `<video>` element, custom uploads read from IndexedDB with an objectURL ready), so the cross-fade starts almost immediately instead of waiting on the network.
- **White-intro skipping**: some wallpaper videos literally open with a pure-white intro (e.g. the Arknights "喧闹法则" video is entirely white for its first 2 seconds). The warm-up phase probes for the first non-white frame and playback starts there, so switching to such a wallpaper no longer shows a blank white screen.
- **No leftover background decoding**: when an outgoing layer fades out it is paused first (keeping its last frame in the cross-fade while decoding stops), and the video is only fully released (`pause()` plus detaching `src`) once the layer is removed, so rotating the queue keeps exactly one decoder alive no matter how many times it switches. Measured over 6 consecutive switches: a steady 58–60 fps (before the fix it decayed from 59.7 to 12.2 fps).
- **4K videos no longer cost performance**: the video layer uses `<video object-fit: cover>` and lets the compositor (GPU) do the scaling, instead of re-drawing every frame onto a viewport-sized canvas (a single 4K frame grab costs 20–40 ms); the 30 fps frame-pump timer is gone too, and an identity filter (`blur(0px) brightness(100%)`) — which silently disables GPU compositing — is no longer applied. Measured on a 4K wallpaper: **22–27 fps → 57–60 fps**, long frames per second from 68–72 down to 3–9.
- **View-only source tabs**: switching between 内置壁纸 / 自定义上传 / WE 壁纸库 only changes what the panel shows — the background stays untouched until you explicitly click a wallpaper, operate a queue, or enable 同步桌面壁纸 (which mutually excludes the WE queue).
- **Sync desktop wallpaper** toggle: **read-only follow of the current desktop wallpaper** — whatever wallpaper the desktop switches to shows up on the page (30 s polling, and immediately when the DSH tab regains focus), then renders by type: scenes show their workshop preview (`preview.gif` / `preview.jpg`), videos play as video, images show as images, web wallpapers render in a native iframe. A sync status line in the panel shows the followed wallpaper (title / type), **which monitor is followed and why**, and the last-sync time, with a 立即刷新 button. **Multi-monitor setups are resolved automatically** (the monitor whose wallpaper changed most recently → the one currently being read / played → `Monitor0` as a last resort), and the status line also lets you **pin a specific monitor**. It never changes your desktop wallpaper, never samples the screen and never writes a cache file.
- WE library filters: type (all / video / scene / web) + rating (all / safe / 18+; 18+ cards carry a red badge with live counts). The rating filter resets to **safe** every time the WE tab is opened.
- Settings persist to localStorage; the UI surface auto-turns semi-transparent to reveal the background, with a main-page switch to temporarily reveal it fully.

## Installation

### Prerequisites

- **DeepSeek Harness desktop app (0.2 preview or later)** — nothing else to install for the plugin itself: the app bundles its own Node.js / pnpm runtime, so no system Node is needed;
- **or a CLI install** (`dsh web`) with Node.js ≥ 20 (`node -v`) and a working DeepSeek Harness;
- the optional WE library source adds its own requirements: Windows, a local Wallpaper Engine install and **Node.js on PATH** — the service is a standalone Node process, so the desktop app's bundled runtime does not cover it (see [Optional: WE library service](#optional-we-library-service-windows)).

### Install in the desktop app (no command line)

The 0.2 desktop app ships a plugin page, so installing this plugin never needs a terminal:

1. Open **Settings → Plugins** (设置 → 插件) and type the package name `dsh-wallpaper-bg` into the install box;
2. Confirm, and restart the app (or reload the window) when it asks — the plugin set is applied when DSH starts;
3. Open **Settings → Wallpaper** (设置 → 壁纸) and pick a wallpaper.

The app installs into its own `desktop` profile and lists the plugin on the same page, where you can also disable it, uninstall it, and read its description and source. The desktop app serves that profile on a fixed port (19387), so the page origin never changes — custom uploads (IndexedDB) and settings (localStorage) survive an app restart.

If the app's optional `dsh` command is on your PATH (the app offers to install it), the equivalent command is:

```bash
dsh plugin --profile desktop add dsh-wallpaper-bg
```

> The `desktop` profile belongs to the Electron app: booting it from a terminal is refused with `profile "desktop" is managed exclusively by the Electron application`. That is expected — install / uninstall through the plugin page (or `dsh plugin --profile desktop …`, which does work), and the app applies the plugin itself on startup. This package's own installer skips the `desktop` profile for exactly that reason (see `dsh-wallpaper-bg install` below).

### Install for the CLI / browser install (`dsh web`)

```bash
dsh plugin --profile web add dsh-wallpaper-bg
```

> For local development from a checkout, link the repo instead — both profiles accept a link spec:
> `dsh plugin --profile web add link:<absolute-path-to-repo>` (or `--profile desktop` for the desktop app) — subsequent `lib/client.js` / `lib/host.js` edits apply after a plain page refresh (no server restart).
>
> On Windows the repo path must not contain spaces: `dsh plugin` forwards its arguments to pnpm through a shell, so a spaced spec is split into two bogus dependencies (`link:E:/My` plus `link:Dir/plugin`) and the profile then fails to load. Clone to a space-free path, or run `install-local.ps1` / `dsh-wallpaper-bg install`, which links the repo into `%DSH_HOME%\node_modules` (no spaces involved) and writes the profile patch layer.

### Upgrading (and why `add` alone does not upgrade)

`dsh plugin … add` forwards to `pnpm add`, which keeps the range already recorded in the profile manifest: re-running the install command on an existing install changes nothing, so a profile sitting on `^0.4.1` never reaches 0.5.x by itself. Ask for a version explicitly:

```bash
dsh plugin --profile web add dsh-wallpaper-bg@latest    # move to the newest release
dsh plugin --profile web add dsh-wallpaper-bg@0.5.10     # or pin an exact version
```

> **pnpm 11 installs a release only after it is a day old.** pnpm 11 enables a 24 h `minimumReleaseAge` by default as supply-chain protection, so for roughly a day after a publish `dsh plugin … add dsh-wallpaper-bg` resolves to the *previous* version and prints `(0.5.10 is available)`; `@latest` is gated the same way. To take a fresh release immediately, name the exact version (`dsh-wallpaper-bg@0.5.10`), pass `--config.minimumReleaseAge=0`, or exclude the package in the profile's `pnpm-workspace.yaml`:
>
> ```yaml
> minimumReleaseAgeExclude:
>   - dsh-wallpaper-bg
> ```
>
> The desktop app's plugin page goes through the same pnpm, so a just-published version shows up there within about a day.

### Optional: WE library service (Windows)

The WE library source needs the `wallpaper-engine-api/` service, which exposes the installed Wallpaper Engine list as a read-only HTTP API on `127.0.0.1:8088`:

> The service ships with the **repository**, not with the npm package (the tarball carries only the plugin — `wallpaper-engine-api/` is not in it). Installed from npm and want the WE library source? Clone it with `git clone https://github.com/nishuoyang/dsh-wallpaper-bg`; everything else (built-in wallpapers, custom uploads) works without it. The plugin's WE tab says the same thing whenever it cannot reach the service.

Set it up in this order — the service is a separate Node process, so **DSH's bundled Node.js runtime does not cover it**:

1. **Windows + a local Wallpaper Engine install.** The service only reads WE's own files, so WE has to be installed already; without a usable install it exits with code 1. It looks at the registry's Steam path and the usual Steam folders, so a WE install in a **secondary Steam library** (e.g. `D:\SteamLibrary\steamapps\common\wallpaper_engine`) is **not** auto-detected — step 5 lets you paste it.
2. **Node.js on PATH** (`node -v`) — a normal system install, separate from the desktop app's bundled runtime. Without it `启动服务.bat` stops with `[ERROR] Node.js not found in PATH.`
3. **Clone the repository** (the service is not in the npm package):

   ```bash
   git clone https://github.com/nishuoyang/dsh-wallpaper-bg
   ```

4. **Install the service's dependencies**, in `wallpaper-engine-api/`:

   ```bash
   cd wallpaper-engine-api
   npm install
   ```

   If it fails (e.g. `EALLOWREMOTE`, or a registry your network cannot reach), step 5's launcher applies the same fallbacks — see the FAQ entry below.
5. **Double-click `启动服务.bat`** — the first-run entry point. It checks the port and Node.js, installs missing dependencies, and, while `we-api.config` does not exist, asks for the Wallpaper Engine install path (offering the auto-detected one for confirmation; you can also paste `wallpaper64.exe`, its folder, or your Steam folder) and then for the subscribed-wallpaper library folder (Enter accepts the derived default `...\steamapps\workshop\content\431960`). It writes `we-api.config` and leaves the window running the service; `Ctrl+C` or closing the window stops it. Redo the setup at any time with `启动服务.bat /setup`.
6. **Recommended: double-click `设置开机自启.bat`** to register the silent starter in the registry (`HKCU\...\Run`) so the service comes up at login. Without it the service only lives as long as the window you started it from: after a reboot — or as soon as you close that window — it is gone, and the WE tab shows a "cannot reach the service" notice (with the cached list marked as possibly stale) until you start it again. `取消开机自启.bat` removes the entry (both scripts reference `启动服务-静默.vbs` in this directory — re-run them after moving the folder). **Both scripts also read/write the startup state record** in `HKCU\...\Explorer\StartupApproved\Run`: *Disable* in Task Manager / Settings leaves the `Run` value in place and only flips that state, so `设置开机自启.bat` normalises it back to *enabled* (otherwise the script would report success while logon still skips the entry), and `取消开机自启.bat` clears it together with the `Run` value (leaving it behind makes the registry look as if autostart were still on).

**Service lifetime vs. the DSH client.** The WE API service is a standalone Node process and **does not exit with the DSH client**: quitting / re-entering the client or reloading the window leaves it running — it only ends at Windows logoff / shutdown, and the autostart entry brings it back at the next logon. The one way to get "it vanishes the moment I quit the client" is to start it **from inside the client**: running `启动服务.bat`, `启动服务-静默.vbs` or `node server.js` in a DSH terminal / tool call puts the process inside the client's process tree (DSH manages those with a Job Object carrying `KILL_ON_JOB_CLOSE`), so it is killed together with the client — and `we-api.log` shows **no error at all**; the only symptom is "cannot reach the service" in the panel. So start it by **double-clicking the script in Explorer** (its parent is then `explorer.exe`), or let the autostart entry do it; when in doubt, check whether `http://127.0.0.1:8088/health` still answers.

**First run vs. background start.** Once `we-api.config` exists, `启动服务-静默.vbs` runs the same service with no window (the autostart entry runs that same script) and appends its output to `we-api.log`. Always do the first run through `启动服务.bat`: the silent launcher has no wizard and fails **completely silently** — no window at all — when `node_modules` or `we-api.config` is missing, leaving only a stack trace at the end of `we-api.log`. A start that seems to do nothing is exactly that: run `启动服务.bat` instead.

**Logs** (both in `wallpaper-engine-api/`, both gitignored): `we-api.log` holds the service output written by the silent / autostart path, and `restart-debug.log` records what `重启服务(管理员).bat` did (stop attempts, elevation, port wait). They are the first place to look when the service is not answering.

> **Restarting is not upgrading.** `重启服务(管理员).bat` only stops whatever listens on 8088 and relaunches `node server.js` through the silent starter (asking for admin rights when the kill needs them, then waiting for the port). It does **no** `git pull` and **no** `npm install`, so it can never bring new code in — upgrading means `git pull` in the repository, `npm install` in `wallpaper-engine-api/`, then a restart.

**Non-interactive setup (no wizard).** `we-api.config` is a plain `KEY=value` file generated next to `server.js`; the wizard writes exactly two keys, so writing it yourself skips every prompt:

```ini
WE_INSTALL_PATH=D:\Steam\steamapps\common\wallpaper_engine
WE_WORKSHOP_PATH=D:\Steam\steamapps\workshop\content\431960
```

`node server.js` can also be run directly from `wallpaper-engine-api/` — the wizard is only a convenience wrapped around it. The same settings are accepted as environment variables, which take priority over `we-api.config`: `WE_INSTALL_PATH`, `WE_WORKSHOP_PATH`, `WE_SUBSCRIPTIONS_FILE` (an explicit `431960_subscriptions.vdf`) and `WEAPI_PORT`.

> `WEAPI_PORT` changes the port of the **service only**: the launchers hardcode 8088 (`启动服务.bat` refuses to start while 8088 is listening, `重启服务(管理员).bat` kills and waits on 8088), so a different port also means editing those two scripts — and updating the base URL in the plugin settings.

The service is **read-only**: it only queries the list / current wallpaper, never touches settings or playback, and never launches WE when the runtime is absent. The list is filtered by the real Steam subscription manifest (`431960_subscriptions.vdf`) — unsubscribed or locally disabled wallpapers disappear even if their folders linger, matching the WE UI.

Service **0.5.1** is a plain read-only list / file service: `/health`, `/api/wallpapers`, `/api/current`, `/files/<id>/...`. The desktop-frame capture of 0.4.x (`GET /capture?w=&q=`, `PrintWindow(Progman, …)` plus `koffi` / `jpeg-js`) was **removed** in 0.5.0, exactly like the 0.3.x local scene renderer (`/scene-frame`, `/scene-anim`, `lib/we-renderer/`) before it — those endpoints all return `404`, and `/health` no longer reports `desktopCapture` — it now answers `"version": "0.5.1"` plus the capability markers `"webShim": 1` and (since 0.5.1) `"monitorSelect": 1`, alongside `weInstallPath` / `workshopPath` / `subscriptionsFile` / `weRunning`. Nothing is rendered locally and nothing is written to disk: no `scene.pkg` parsing, no frames, no MP4s, no screen sampling, no `~/.dsh-wallpaper-bg` folder. Scene wallpapers are shown by the plugin as WE's workshop preview (`preview.gif` / `preview.jpg`), and `/api/current` resolves *which monitor* to follow instead of blindly taking `Monitor0`.

> Verify: `http://127.0.0.1:8088/health` is the WE service — a JSON response means it is up. The plugin's own host half reports its version at `<DSH address>/dsh-wallpaper-bg/health`: `http://127.0.0.1:3080/dsh-wallpaper-bg/health` with `dsh web` (default port 3080), or `http://127.0.0.1:19387/dsh-wallpaper-bg/health` in the desktop app — the 0.2 app boots the `desktop` profile with a fixed `--port 19387`. The same check through the UI: **Settings → Plugins** lists `dsh-wallpaper-bg` and **Settings → Wallpaper** opens the panel. Port 8088 is a historical choice (8080 was once taken by Jenkins).

## Settings panel

| Item | Description |
| --- | --- |
| Built-in / Custom upload / WE library | Source tabs: switching tabs only changes the panel view; the background applies only on explicit selection (click a wallpaper, queue actions, or sync desktop) |
| Upload custom wallpapers | Images / videos, stored in IndexedDB; videos get auto-generated first-frame thumbnails |
| Playback queue | Independent queue per source, sticky at the top of its tab: drag wallpapers in, loop-play at 1–10 min per item (shared duration slider), drag-to-reorder, click-to-jump, × to remove, clear to reset |
| WE base URL + refresh | WE API address (default `http://127.0.0.1:8088`) |
| Type filter | all / video / scene / web, by the wallpaper's real type |
| Rating filter | all / safe / 18+ (from `contentrating` in project.json: 18+ = Mature + Questionable), 18+ cards carry a red badge with live counts; resets to **safe** every time the WE tab is entered |
| Sync desktop wallpaper | Read-only follow of the current desktop wallpaper (30 s polling, immediate on tab focus), rendered by type: scene → workshop preview, video → video, image → image, web → iframe; the status line shows the followed wallpaper / **monitor (plus how it was chosen)** / last-sync time with a refresh-now button; with multiple monitors a **monitor picker** appears (auto / pin one); mutually exclusive with the WE queue |
| Native background switch | On the main conversation header: clears the wallpaper fog / overlay and the translucent page surfaces while keeping the composer and dialogs readable; turning it off restores the saved fog / overlay values |
| Light fog / dark overlay | 0–100%, auto-switching with the DSH theme: translucent white fog in light theme to lift fine text, dark overlay in dark theme |
| Background blur / brightness | 0–20px / 50–150% |
| Safe zoom | 0–10% scale-up to crop edge letterboxing |
| Scene wallpaper note | Scene wallpapers always show WE's workshop preview (`preview.gif` / `preview.jpg`); no local rendering, no screen sampling, no cache files. For 100% faithful motion, record the scene (WE screen recorder / OBS) and import the MP4 via custom uploads |
| Reset to defaults | One-click restore of all settings |

## How it works

This package is a DSH **static two-half plugin**, composed into the DSH host plane as a **profile bundle layer**:

| Half | File | Responsibility |
| --- | --- | --- |
| Host half (Node) | `lib/host.js` | Registers same-origin routes: `/dsh-wallpaper-bg/asset` (streaming local-file proxy with Range support), `/dsh-wallpaper-bg/we` (read-only WE API proxy with caching, passes `previewFile` / `previewSize` through; forwards the `monitor` param on `action=current` and includes it in the cache key), `/dsh-wallpaper-bg/health` (reports the `monitorForward` capability) |
| Browser half | `lib/client.js` | Single-file client bundle (`window.__ModuleLoader__` factory form): injects the background layer and overlay, registers the 壁纸 settings tab; 同步桌面壁纸 read-only follows the desktop wallpaper and then renders it by type (scenes → workshop preview) |
| Composition | `cordis.patch.yml` | `dsh.bundle` patch: inserts the plugin row into the profile composition's host plane — active on DSH startup (`dsh web` **or the desktop app**), the first page load already carries the background |

Zero build on both ends: `lib/client.js` is a hand-written single-file bundle, no bundler required; a `dsh-wallpaper-bg` CLI (`install` / `status` / `uninstall`) provides one-command setup for a CLI install (it skips the `desktop` profile, which the Electron app owns — install there through **Settings → Plugins**, or with `dsh plugin --profile desktop add dsh-wallpaper-bg`).

## FAQ

> Hit a problem? Start with the **[troubleshooting guide](docs/troubleshooting.md)** (Chinese): it walks through symptom → cause → fix for installation, rendering, the optional WE library service and local development, plus a "looks broken, is by design" cheat sheet. The entries below are the most common cases.

- **How do I install this in the DSH desktop app?** No command line needed: **Settings → Plugins** (设置 → 插件) → type `dsh-wallpaper-bg` → install → restart the app when it asks. The app keeps it in its own `desktop` profile and the same page lets you disable / uninstall it and see its description and source. The terminal equivalent (with the app's `dsh` command on PATH) is `dsh plugin --profile desktop add dsh-wallpaper-bg`.
- **Why does `dsh --profile desktop …` fail on the command line?** The desktop app owns that profile: DSH answers `profile "desktop" is managed exclusively by the Electron application`. That is by design — the app composes and boots the profile itself. `dsh plugin --profile desktop <pnpm args>` (install / list / remove) still works, because that path only manages the profile's package manifest. This package's `dsh-wallpaper-bg install` therefore skips `desktop` and points you at the plugin page.
- **Does the desktop app need Node.js, or the `wallpaper-engine-api` service?** Node.js, no — the desktop app bundles its own Node/pnpm runtime, so only a CLI install (`dsh web`) needs Node ≥ 20. The optional WE library source is the exception: its service is a Node process running outside DSH, so it needs **Node.js on PATH** even with the desktop app. It still needs Windows + a local Wallpaper Engine install + the service on port 8088, exactly as for `dsh web` — see [Optional: WE library service](#optional-we-library-service-windows).
- **I installed it and got an older version than the one on npm.** pnpm 11's default 24 h `minimumReleaseAge` — see [Upgrading](#upgrading-and-why-add-alone-does-not-upgrade). Name the version (`dsh plugin --profile web add dsh-wallpaper-bg@0.5.10`) to take it immediately.
- **Installed it, but Settings → Wallpaper shows no panel?** Check that the profile really loads it as a layer: `profiles/<name>/package.json` must list `dsh-wallpaper-bg` under `dsh.profile.bundles` — `dsh-wallpaper-bg status` reports this too (it prints `installed（bundle 层…）` when the entry is there, and tells you to re-run `add` when only the dependency is present). DSH writes that list itself during install; while a brand-new release is still propagating through the registry the entry is occasionally missed, and re-running `dsh plugin --profile web add dsh-wallpaper-bg@<version>` fixes it. The other half of the check is `<DSH URL>/dsh-wallpaper-bg/health` answering JSON.
- **Can I install it into a `headless` / `tui` / custom profile?** Yes, and it is harmless: the plugin registers its routes only while the host's `webServer` service exists, so a profile with no web UI boots normally with the plugin simply inert (before this fix such a profile failed to boot with `1 entry did not activate`). It is still pointless there — the wallpaper UI lives in the browser page — so install into `web`, or the desktop app's `desktop` profile.
- **How do I verify it loaded on the desktop app?** Open `http://127.0.0.1:19387/dsh-wallpaper-bg/health` — `{"ok":true,"plugin":"dsh-wallpaper-bg","version":"…"}` means the host half is mounted (the 0.2 desktop app serves the `desktop` profile on the fixed port 19387). The rest is visible in the UI: **Settings → Plugins** lists `dsh-wallpaper-bg` as installed/enabled, and **Settings → Wallpaper** opens the panel.
- **The wallpaper shown by "Sync desktop wallpaper" is not the one on my desktop.** Check the **monitor** entry in the status line first: WE's `config.json` stores the current wallpaper per monitor as `selectedwallpapers.Monitor0 / Monitor1 / …`, and WE maintains those indices itself — after plugging / unplugging a display, changing the primary screen, or turning the laptop panel off, `Monitor0` is often **not the monitor you are looking at** (older builds took `Monitor0` blindly, so the page kept showing "the one from before" — easily mistaken for a stale cache). Since 0.5.1 the service chooses by: the monitor whose wallpaper changed most recently → the one currently being read / played → `Monitor0` as a last resort, and the status line states which rule applied (`auto: the monitor whose wallpaper changed most recently` etc.). With multiple monitors you can also **pin a monitor** in the 跟随显示器 dropdown. This needs service **0.5.1+** (`http://127.0.0.1:8088/health` should include `"monitorSelect": 1`) — restart it with `wallpaper-engine-api/重启服务(管理员).bat`; the **dropdown additionally needs a DSH restart** (the host half that forwards `monitor` loads with the DSH process, and the plugin says so right next to the dropdown).
- **How do scene wallpapers show on the page?** They always show WE's own workshop preview (`preview.gif` / `preview.jpg`, the preview WE generates for every wallpaper) — **no local rendering, no screen sampling**:
  - *Manual selection / queue / desktop sync*: all show that same workshop preview; `preview.gif` animates on its own and no file is ever produced.
  - *The preview looks tiny and blurry when scaled up*: WE's workshop previews are commonly only **192×192** pixels (the status line reports the measured size, e.g. "measured 192×192 pixels, so it must look soft full-screen") — that is the preview's own resolution, **not a stale cached image and not a failure to apply**.
  - *Want 100% faithful motion?* Record the scene for ~30 s with WE's tray-menu screen recorder (or OBS), export an MP4, and import it through custom uploads — it then plays natively in a `<video>` element, fully smooth and with zero extra overhead.
- **Is there any local scene rendering / baking, or desktop capture, left?** No. The pure-JS scene renderer (`lib/we-renderer/`, `scene.pkg` parsing, shader effects) and the animation-baking stack (`/scene-anim`, `~/.dsh-wallpaper-bg` frame/MP4 caches) were **removed in 0.4.0** along with the `WE_SCENE_RENDER` switch, and the desktop-frame capture (`/capture`, `koffi` + `jpeg-js`) that 0.4.x used for mirroring was **removed in 0.5.0**. The old endpoints return `404`; nothing writes to `~/.dsh-wallpaper-bg` anymore (an existing folder can be deleted freely).
- **Do web-type wallpapers render?** Yes — web wallpapers are plain HTML/JS pages, rendered natively in a full-screen iframe (`index.html` plus relative assets, served read-only by the WE API's `/files/<id>/...` route, restricted to subscribed wallpaper directories). The current service (0.5.1) also injects a **WE private-API shim** into the served document: it feeds the default user properties from `project.json` into `applyUserProperties` (without it, wallpapers that set their background inside that callback leave only a character floating on pure black — which reads as a portrait wallpaper), stubs the audio / media interfaces, and reports when the page has actually painted, so the plugin only cross-fades once there is a real picture instead of a black screen. Note the background layer never intercepts the mouse, so the wallpaper's own interactions (click / drag) don't work — visual only; audio visualizers run on silence (the browser has no WE audio capture).
- **Web wallpaper shows a black screen or takes forever?** First make sure the WE API service is current (0.5.1) and restarted (`http://127.0.0.1:8088/health` should include `"webShim": 1`) — an outdated service has no shim and also rejects `../assets/...` style paths that wallpapers write for a `file://` origin.
- **Web wallpaper assets re-download on every switch?** Fixed in 0.3.8: the service's `/files` route used to read whole files synchronously and answer `no-store`. It now streams with `ETag` / `Last-Modified` conditional requests (HTML `no-cache`, static assets cached 300 s) and supports `Range`.
- **Videos have black bars?** Pull 安全放大 (safe zoom) to 2–3% to crop the video's own letterboxing (the cover-crop render already guarantees no self-made bars).
- **My uploaded video shows a black screen / black tile?** Videos whose MIME type the browser leaves empty (common for `.mkv` / `.mov`) are now detected by extension and rendered as video; every video upload also gets an auto-generated first-frame thumbnail. If a specific file is still black, its codec is likely unsupported by the browser.
- **Code changes don't take effect?** Split it by half: for `lib/client.js` (browser half) a plain page refresh (F5) is enough — client bundles are read fresh from disk per request (`cache-control: no-cache`). For `lib/host.js` (host half) or anything under `bin/` you **must restart DSH** — the host half is a Node-side ESM module loaded once with the process and never re-imported in place (restart the `dsh web` process, or quit and reopen the desktop app). Restarting is also needed when the plugin set changes (adding / removing plugin rows or editing `dsh.client` declarations). To see which host half is running: open `<DSH URL>/dsh-wallpaper-bg/health` and read `version` (the desktop app is always on port 19387).
- **WE library errors?** Confirm the `wallpaper-engine-api` service is running on port 8088 (`http://127.0.0.1:8088/health` in a browser) and the base URL in plugin settings matches.
- **I quit the DSH client and the service is gone?** A properly started service is not affected: it is a standalone Node process that survives quitting / re-entering the client and only ends at Windows logoff / shutdown. The one case that does die with the client is a service started **from inside it** (running the launcher in a DSH terminal / tool call) — it lives in the client's process tree, is killed together with the client, and leaves **no error** in `we-api.log`. Start it by double-clicking the script in Explorer, or let the autostart entry do it — see "Service lifetime vs. the DSH client" above.
- **`npm install` in `wallpaper-engine-api` fails with `EALLOWREMOTE`, or stalls?** The repository ships a lock file whose `resolved` URLs pin a mirror (`registry.npmmirror.com`). npm 12+ defaults to `allow-remote=none`, so it refuses a tarball from a host other than your configured registry (`EALLOWREMOTE: Fetching packages of type "remote" have been disabled`); a mirror your network cannot reach stalls the same fetch. `启动服务.bat` walks a bounded three-step bootstrap instead of stopping: `npm install` → `npm install --allow-remote=all` (allow the mirror the lock file points at) → `npm install --no-package-lock` (ignore the lock file and resolve through your own registry). Installing by hand, run those same commands in `wallpaper-engine-api/`.
- **I started the service and nothing happened at all?** That is the silent launcher (`启动服务-静默.vbs`, or the autostart entry) running without a usable `we-api.config` / `node_modules`: it has no wizard, opens no window and fails silently — the only trace is a stack trace at the end of `wallpaper-engine-api/we-api.log`. Run `启动服务.bat` once (it walks the wizard and writes `we-api.config`); the silent variant works from then on.
- **Wallpapers removed in WE still show up?** The service filters by the Steam subscription list, so unsubscribed wallpapers disappear — click 刷新 in the plugin. If the list itself looks wrong because the service is **outdated** (today's service reports `"version": "0.5.1"`, `"webShim": 1` and `"monitorSelect": 1` at `http://127.0.0.1:8088/health`), note that `重启服务(管理员).bat` only restarts it and cannot upgrade: run `git pull` in the repository, `npm install` in `wallpaper-engine-api/`, then restart.

## License

MIT License, see [LICENSE](LICENSE). Issues / PRs welcome.

### Releasing

The repo ships a one-shot release script, `scripts/release.ps1`, which fixes the whole flow: version check → pack preflight → commit → tag → push → npm publish → GitHub Release (with the tarball attached).

```powershell
.\scripts\release.ps1 -DryRun              # rehearse: checks only, no changes
.\scripts\release.ps1 -Version x.y.z       # bump version and release
.\scripts\release.ps1                      # release the version in package.json
.\scripts\release.ps1 -Resume              # finish a run that was interrupted mid-way
```

Preflight refuses duplicate releases (tag already present locally or on the remote, version already on npm) and requires a matching `CHANGELOG.md` entry — the Release notes are taken from that entry. Optional flags: `-SkipNpm` / `-SkipGitHub` / `-SkipPush` / `-Yes`.

npm needs a few minutes after `npm publish` before the new version is visible in the registry, so the script polls for it (`-NpmWaitSeconds`, default 300) instead of checking once and aborting; if it still cannot see the version it only warns and continues to the GitHub Release, which itself is idempotent (creates, or attaches the tarball to an existing release). If a run is interrupted anyway, `-Resume` finishes it: it requires a clean worktree, verifies the existing tag points at HEAD, then skips the steps that already succeeded (commit / tag / push / publish) and runs the rest.

### CI workflows (npm provenance / GitHub Packages mirror)

`.github/workflows/` ships two workflows, both triggered manually or on demand, that make the npm ↔ GitHub link concrete:

| Workflow | File | Trigger | What it does |
| --- | --- | --- | --- |
| Publish to npm | `publish-npm.yml` | manual (`workflow_dispatch`) | Publishes to npmjs with the repository's OIDC identity, so npm attaches a **provenance** attestation: the package page gets a "Built and signed on GitHub Actions" badge that links straight back to this repo / commit |
| Mirror to GitHub Packages | `publish-github-packages.yml` | after a GitHub Release is published, or manual | Mirrors the package to `npm.pkg.github.com` as `@nishuoyang/dsh-wallpaper-bg`, so the repository's **Packages** sidebar actually lists it |

Before using `publish-npm.yml`, configure a trusted publisher once on npmjs.com (package page → Settings → Trusted Publisher → GitHub Actions: `nishuoyang` / `dsh-wallpaper-bg` / `publish-npm.yml`). After that no token is needed — no `NPM_TOKEN` secret, no rotation (a repository secret named `NPM_TOKEN` is the token-based alternative; see the comments in the workflow file). It is manual-only by default so that it can never race `release.ps1`'s local `npm publish` for the same version; to move publishing entirely to CI, run `.\scripts\release.ps1 -SkipNpm` and enable the `push.tags` trigger inside the workflow.

The mirror publishes with the workflow's `GITHUB_TOKEN`; the first publish defaults to private visibility, which you can flip to public in the package's settings. Note that GitHub Packages' npm registry requires authentication to install **even for public packages**, so installing always goes through npmjs (`dsh plugin add dsh-wallpaper-bg`, or the package name in the desktop app's plugin page) — the mirror exists purely for GitHub-side display.

`legacy/` holds the pre-v0.1.0 dynamic-plugin (Cordis dynamic package) source, archived for reference only.

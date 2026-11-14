# Developing Run Escape

How the code is laid out, the tools that come with it, how to host a build, and the desktop app.
The [README](../README.md) covers getting it running.

**A checkout that was installed with npm** needs `node_modules` deleted before `bun install`.
Bun leaves npm's nested package folders where they are, so Babel finds an old `lru-cache` without
its `yallist`, and the dev server fails with `Yallist is not a constructor`.

## Hosting

```
bun run build
bun run slim-cache
```

writes the game to `dist/`, with a slim copy of the cache in `dist/caches/`: only what the game
reads, about 22 MB instead of 227 MB. Put what's in `dist/` on a web server, at the site's root or
in a folder (asset paths are relative, so https://example.com/game/ works):

```
index.html
build.json
assets/
caches/caches.json
caches/chunks/<sha256>.bin
```

`bun run slim-cache` loads everything the game loads (every model it bakes, an icon for every
item, each map's arena and the map squares around it) with the game's own loaders and keeps the
groups they read. It writes them in chunks (`src/rs/cache/ChunkedCache.ts`), each a range of
archive ids from one index, named after the first 32 hex digits of its sha256, and lists them in
`caches.json` with the build they're for (from `dist/build.json`, which the build writes). Then
it loads it all again from the chunks and fails if anything is missing. **Run it after every
build**: `bun run build` empties `dist/`. `bun run preview` serves the build with its slim cache,
to try it before uploading. The full cache works too, if you'd rather host that, and the map viewer
(`?viewer=1`) needs it.

Most of the full cache is one big file (`main_file_cache.dat2`), which `src/rs/cache/CacheFiles.ts`
downloads in parts kept in the Cache API. A download that's cut off resumes with
`Range: bytes=<offset>-<MAX_SAFE_INTEGER>`, and the `Last-Modified` its parts came with as
`If-Range`. A server that ignores Range sends the whole file, and the download starts again from
0%, which a phone on a slow or cut-off connection may never get past. `bun run serve`, the
desktop app and the dev and preview server's `/caches` (`vite.config.ts`) all answer Range with
206, with the end clamped; only the last checks `If-Range`. A part only counts if it starts where
the one before it ended and is from the same copy of the file, and the last bytes are kept as a
part too. Once the whole file's in hand it's kept, and only then are the parts dropped, so a page
reloaded while a phone's still writing it (or out of room) is put together from the parts: its
resume asks past the end, and a 416 with the parts' length means every part was there.

`scripts/cache/slim-plan.ts` resolves the content into plain units: each map's region, batches of
bakes and of item icons, and the textures, sounds and sprites. Worker threads, each holding the
full cache, load them with `slim-load.ts`. Each unit gets loaders of its own, and its reads include
what making them read, so what it reads doesn't depend on what ran before it in that worker: a warm
model cache would hide a group an earlier unit read, and a map would keep an earlier map's
ScapeRune squares. The one exception is the config type loaders made from an archive, which take
a while to make and read nothing after: a worker makes those once, and every unit gets the reads
that made them. Before anything's published, the chunks in the out dir are read back, and every
group has to come out of them as it went in; the check then loads it all from those same chunks.

A checked run is kept in `caches/slim/`, and the next one reuses it if nothing it's made from has
changed. esbuild traces the runtime imports of `slim-cache.ts`, `slim-cache-worker.ts` and
`slim-cache-boot.mjs` without running them: their files and what esbuild makes of them count, with
`tsconfig.json`, `bun.lock` (all of it, so any change to the packages counts), the dependency and
runtime settings in `package.json`, `DEV_MAPS`, and the full cache's `info.json`, `keys.json` and
file sizes. UI, CSS, tests and tools the pipeline doesn't import don't count, nor the package's
version or scripts. A new worker entry point, or a file it reads other than by importing it, has to
be added to `hashSlimInputs`. If tracing fails, it warns and loads it all, keeping nothing. A
reused cache still has its chunks' hashes checked and gets the current build. `caches/slim/` isn't
kept between CI jobs. Chunks are written under a temporary name and renamed into place (tried again
for a few seconds while Windows holds the new file), so one that stopped partway leaves no broken
chunk behind. tsx's loader doesn't reach worker threads by itself, so each starts from
`slim-cache-boot.mjs`, which registers it.

When something it's made from has changed, `caches/slim/units.json` still has what each unit read
last time, fingerprinted with the unit's inputs and the workers' code, configuration and full
cache. Only units without a match are loaded from the full cache, so a content change loads again
only the units whose inputs it changes. Bakes and icons are batched by a hash of their keys, not
their places in the content, so adding a weapon or an enemy changes only the batch or two it lands
in. The workers import ScapeRune's recipes by address, so esbuild doesn't trace them into every
unit: instead each map with a recipe carries the recipes' own fingerprint, and changing a recipe,
or the waves and bosses one imports, loads only those maps again. A change to a shared loader, a
package or the full cache loads every unit again.

**Every unit still loads again from the finished slim cache**, so reuse saves loading from the full
cache, not the check. What each unit read in the check is what's kept for the next run: with
nothing missing it's the same as from the full one, and it's checked unit by unit, so a read list
that came up short last time (from a change the fingerprints don't cover) isn't kept. If the check
finds something missing, or a unit fails on it, and units were reused, it loads those units again
from the full cache and checks once more, rather than stop. `units.json` is one file, written whole, with a checksum for
each read list, and has only the current plan's units. A damaged entry, or file, is reported and
loaded again.

- `SLIM_WORKERS=n`: how many worker threads, each with its own copy of the full cache. The cores
  less one, up to 4, unless it's set.
- `SLIM_CHECK=0`: skips loading it all again from the slim cache, for trying things locally. The
  chunks are still read back and compared group by group. Leave the check on for anything players
  get. An unchecked run keeps nothing for reuse.
- `SLIM_REUSE=0`: loads it all, reusing neither the last run nor its units.

- **The same cache and content give the same chunks**, byte for byte, on any machine, and the
  same name in `caches.json`. A chunk's range is fixed by `CHUNK_SPANS`, not by what's in it, so
  a change to a group renames only its own chunk, and a player who's played before downloads only
  that one. Changing a span renames that index's chunks.
- **The browser** keeps the chunks in the Cache API, in `cache-chunks`, under their addresses. It
  checks each one it downloads against its name, and after loading drops the ones `caches.json`
  doesn't list.
- **A cache made for another build** would stop partway through loading, on a group it hasn't
  got, so the game checks `caches.json`'s build against its own before it starts. On a mismatch it
  reloads the page once, as the page may be an old copy, and then says what's wrong rather than
  loading. That's what a server with an old `caches.json` and a new build shows: run
  `bun run slim-cache` again.

The chunks and `assets/` are named after what's in them, so they can be kept for good. Everything
else changes under the same name, so it has to be checked with the server each time:

| Path                                      | `Cache-Control`                       |
| ----------------------------------------- | ------------------------------------- |
| `assets/*`, `caches/chunks/*.bin`         | `public, max-age=31536000, immutable` |
| Everything else, `caches/caches.json` too | `no-cache`                            |

`bun run serve` sends these. The game asks for `caches.json` with `no-cache` and its build in the
query, so a browser or CDN that keeps it anyway can't give a new page an old one. Upload the
chunks before `caches.json` and `index.html`, and if you can, leave the old chunks there for a
while, so a page that started loading before the upload can finish. `slim-cache` takes the ones
the new `caches.json` doesn't list out of `dist/`, so that means uploading without deleting what
isn't in `dist/` (no `rsync --delete`), and clearing them out later.

The server has to send two more headers with the page. The game shares the cache with its workers
in a SharedArrayBuffer, which browsers only allow on a cross-origin isolated page; without them
the game says so instead of loading:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

With nginx, for a game at the site's root (`add_header` in a `location` replaces the ones outside
it, so each has all three):

```
location / {
    add_header Cross-Origin-Opener-Policy same-origin always;
    add_header Cross-Origin-Embedder-Policy require-corp always;
    add_header Cache-Control no-cache always;
}
location ~ ^/(assets|caches/chunks)/ {
    add_header Cross-Origin-Opener-Policy same-origin always;
    add_header Cross-Origin-Embedder-Policy require-corp always;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}
```

With Apache, in an `.htaccess` beside `index.html` (needs mod_headers):

```
Header set Cross-Origin-Opener-Policy "same-origin"
Header set Cross-Origin-Embedder-Policy "require-corp"
Header set Cache-Control "no-cache"
<If "%{REQUEST_URI} =~ m#/(assets|caches/chunks)/#">
    Header set Cache-Control "public, max-age=31536000, immutable"
</If>
```

It needs HTTPS (or localhost) for the browser's cache storage, and a folder's address with its
trailing slash (`/game/`, not `/game`), or the relative paths point at the parent folder.

### Co-op relay

The simplest way to host everything: `bun run serve` (`node server/serve.mjs`, no packages) serves
`dist/` with the headers above on `PORT` (8080), and runs the co-op relay in the same process.
Multiplayer is on unless it's turned off (`bun run serve:singleplayer`, `MULTIPLAYER=off` or
`--no-multiplayer`), and either way the game only offers it when a relay answers: it asks once,
in the background, as it starts, and hides Multiplayer if nothing says yes within 4 seconds.
Run `bun run build` first. If `dist/caches` is missing, the server uses the full cache in `caches/`
so you can try the build locally (http://localhost:8080). For HTTPS, use a proxy like Caddy
(`caddy reverse-proxy --from game.example.com --to localhost:8080`).

The relay is light. In a load test at the game's own rates (host frames 25 times a second, guests'
moves about 4), a room of four was about 5.3 KB/s of messages and 109 of them a second, around
12 KB/s on the wire with TCP's own overhead, or about 40 MB an hour. 100 rooms (400 players, and 50
more browsing the room list) took at most 13% of one core and 64 MB. A small VPS runs it easily;
serving the game itself (about 26 MB for each new player) is the bigger cost.

Co-op needs the relay in [server/coop-relay.mjs](../server/coop-relay.mjs): plain Node 20 with no
packages, so copy it with `server/name-gen.mjs` (where players' and rooms' names come from) and
`server/client-ip.mjs` to the server and run it.

```
PORT=8787 node server/coop-relay.mjs
```

The game looks for it at `coop` beside the page (`wss://example.com/game/coop` for a game at
`/game/`), so proxy that path to it. With nginx:

```
location /game/coop {
    proxy_pass http://127.0.0.1:8787/coop;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
}
```

With Apache 2.4.47 or newer (`a2enmod proxy proxy_http`), which adds `X-Forwarded-For` itself:

```
ProxyPass "/game/coop" "http://127.0.0.1:8787/coop" upgrade=websocket
```

The relay limits each address (see below), so behind a proxy, where every player looks like the
proxy, tell it what's in front with `PROXY` (or `--proxy=` after `bun run serve`). It's off
(`none`) unless it's set:

| `PROXY`        | For                                                                            | Whose word it takes for a player's address                                                                                       |
| -------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| unset (`none`) | nothing in front, or a LAN                                                     | nobody's: the connection's own                                                                                                   |
| `local`        | Caddy, nginx or a container in front, on the same machine or a private network | that proxy's: the last address in its `X-Forwarded-For`, which it adds itself (Caddy does by default, nginx with the line above) |
| `cloudflare`   | Cloudflare in front, with or without a local proxy behind it                   | Cloudflare's `CF-Connecting-IP`, only from Cloudflare's own addresses (and a local proxy's, as `local`)                          |

**Only your proxy should be able to reach the relay.** `local` (and `cloudflare`, for the proxy
behind it) believes `X-Forwarded-For` from any address on the machine or a private network, so
anyone else who can connect from one could say they're anyone and get round the limits. Set
`HOST=127.0.0.1` on the standalone relay or `serve.mjs`, with the proxy on the same machine. In
Docker, leave `HOST` alone inside the container and publish the port on the host's loopback
(`-p 127.0.0.1:8080:8080`): Docker's own proxy hands on connections from anywhere as if they came
from its private network.

The relay takes 800 connections in all, so give it room with `LimitNOFILE` if you raise that. A
connection in no room that's done nothing but ping, or ask for the same page of rooms again, for
10 minutes is closed: a tab left open on the list. The game closes its own after 9 minutes out of
a room with nothing done (`LOBBY_IDLE_MS`, a minute early so its own message is the one shown), and a room left alone for half an hour is closed too.

Headers from anyone else are ignored, so they can't be made up to get round the limits. Behind a
proxy with `PROXY` unset, the relay says so once. `TRUSTED_PROXIES` (`"10.1.2.3,10.9.0.0/16"`)
adds proxies elsewhere. With `cloudflare`, the relay fetches Cloudflare's addresses from
`https://api.cloudflare.com/client/v4/ips` when it starts and again each day, so there's no list
in the code to go out of date. Until the first fetch comes back (or if it fails, which it says and
then tries again a minute later), players look like Cloudflare to the limits; a failed refresh
keeps the last list. `CLOUDFLARE_IPS` gives the list instead, and then nothing's fetched.

Players' flags (see Co-op below) come from Cloudflare too: with `cloudflare`, the relay takes its
`CF-IPCountry` header, from Cloudflare's addresses only, as with `CF-Connecting-IP`. Cloudflare
adds it while IP Geolocation is on (Network, in the dashboard). Behind anything else the relay
can't tell where anyone is, and nobody gets a flag.

Its limits, at the top of `server/coop-relay.mjs`:

| What                          | Limit                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Rooms on the relay            | 500, or `MULTIPLAYER_MAX_ROOMS`; past that, making one says they're all taken (and the menu shows it) |
| Connections from one address  | 16 (a household or LAN party behind one address), and 128 from one IPv6 /48                           |
| Rooms hosted from one address | 4, and 16 from one IPv6 /48                                                                           |
| Rooms made from one address   | 10 a minute                                                                                           |
| Rooms joined from one address | 12 a minute (joining and leaving are each a room update for everyone in it)                           |
| Wrong room codes              | 20 a minute from one address, and 80 from its IPv6 /48, then it has to wait                           |
| A room with nothing happening | closed after 30 minutes (pings, looking at the list, and players' own updates and names don't count)  |
| A room hearing how it is      | at most once each 250 ms, with the latest, however often it changes                                   |
| What a host sends its room    | 64 KB/s (a run's start and frames), saving up to 256 KB; a host past it is dropped                    |
| A guest's input for the host  | 1 KB each and 60 a second; past that it goes no further                                               |
| A player's own update         | 40 KB, or it's ignored                                                                                |
| A player's loadout            | 16 KB, or it's dropped                                                                                |
| A message                     | 256 KB, in 16 pieces at most, and UTF-8; nested 16 deep at most, apart from the host's frames         |
| One connection                | 400 frames a second (empty ones and pings included) and 512 KB a second, or it's dropped              |
| Waiting to go out to one      | 1 MB: a connection that stops reading is dropped                                                      |

An IPv6 address counts by its /64, which is what one home or server gets, and its /48 has looser
limits of its own: one person can easily have all of a /48's /64s, but a mobile provider can put
many homes in one, so nothing is refused for a /48 that one of its homes alone would get. A kicked
player can't rejoin that room from the same address (their /64). A room update carries
everyone's loadout to everyone, so the relay encodes it once and sends it at most each 250 ms
however fast the room changes. The host's frames, nearly all of what comes through, go on as they
came without the depth check: the relay never encodes them again, which is what a deep message
would break. A message that isn't a JSON object is ignored. One that isn't UTF-8, is too deep or
makes the relay throw drops that connection, never the relay, and a request whose path isn't a URL
is a 400. `serve.mjs` turns away WebSocket upgrades to any other path rather than leaving them
open, and answers `Range` with 206, as the cache's download resumes with one.

A room of four is about 12 KB/s through the relay, both ways, and about 0.15% of a core: 500 rooms
is around 50 Mbit/s and three quarters of one core. Set `MULTIPLAYER_MAX_ROOMS` (or
`--max-rooms=`) to what the server's bandwidth and CPU can take. The relay passes the game's own
messages on as they came rather than decoding and encoding them again, so what's left of its CPU is
mostly Node writing to sockets.

Or build with `VITE_COOP_URL=wss://relay.example.com/coop bun run build` to point it anywhere
else. `bun run start` and `bun run preview` run a relay of their own at `/coop`
(`bun run start:singleplayer`, or `MULTIPLAYER=off`, without).

**On Cloudflare instead.** [server/cloudflare/](../server/cloudflare/README.md) is the same relay
as a Cloudflare Worker with Durable Objects: a lobby for the rooms list and names, and each room its
own object, started near its host, so a run's traffic doesn't cross the world to one server. There's
no server to run, and it's at a `workers.dev` address with no domain needed. Its README has the
setup, from `wrangler login` to the build, and what it costs. The game works with either relay.

#### Optional multiplayer metrics

A server that hosts the game (`bun run serve`, or the standalone relay) serves multiplayer metrics
by default, on a separate listener bound only to `127.0.0.1`, port 8788. The endpoint serves
Prometheus text format 0.0.4 with `HELP` and `TYPE` metadata. Read it from the server itself:

```sh
bun run serve
curl http://127.0.0.1:8788/coop/metrics
```

In PowerShell:

```powershell
bun run serve
# From another terminal:
(Invoke-WebRequest http://127.0.0.1:8788/coop/metrics).Content
```

Set `MULTIPLAYER_METRICS=off` (or `false`, `0`, `no`) and restart to turn the metrics listener off
(`$env:MULTIPLAYER_METRICS = "off"` in PowerShell); `on`, `true`, `1` or `yes` turn it on. Any other
value, an empty one included, is the same as none, like `MULTIPLAYER`. The dev server and
`bun run preview` only run the listener when it's set to `on`: nobody scrapes a dev server, and two
checkouts would fight over the port. If the standalone relay uses `MULTIPLAYER_PATH`, the metrics
path is that path plus `/metrics`. Multiplayer must be running for metrics to be available. Set
`MULTIPLAYER_METRICS_PORT` to another port (1–65535) if needed, for example when running several
relays on one machine. If that port is occupied, the server logs an error and co-op keeps running
without metrics; they are never moved to the public listener. The metrics listener closes with the
relay.

The metrics are:

- Player gauges: `coop_players_connected`, split into `coop_players_browsing` (no room),
  `coop_players_lobby` and `coop_players_in_run`. These count WebSocket connections, so multiple tabs
  count separately; single-player games aren't counted.
- Room gauges: `coop_rooms`, split into `coop_rooms_lobby` and `coop_rooms_in_run`, and separately
  into `coop_rooms_public` and `coop_rooms_private`. Public rooms include full and started rooms.
- Counters since startup: `coop_connections_total` (accepted connections), `coop_rooms_created_total`
  and `coop_runs_started_total`.
- Peak gauges since startup: `coop_players_connected_peak` and `coop_rooms_peak`.
- Uptime gauge: `coop_uptime_seconds`.
- Configured limit gauges: `coop_connections_limit` and `coop_rooms_limit`.

For example, part of the response looks like this:

```text
# HELP coop_players_connected Currently connected player sockets.
# TYPE coop_players_connected gauge
coop_players_connected 4
```

For Prometheus running on the same machine (and in the same network namespace if using containers),
add this job to its `scrape_configs`:

```yaml
scrape_configs:
    - job_name: run_escape
      scrape_interval: 15s
      metrics_path: /coop/metrics
      static_configs:
          - targets: ["127.0.0.1:8788"]
```

Adjust the target port or metrics path if you changed the settings above. Samples have no labels
or explicit timestamps; Prometheus supplies scrape timestamps.

Counts are in memory and reset on restart. Each GET reads the existing rooms once; totals and peaks
update only on connections, room creation and run starts. There is no background sampling, extra
package, disk write or per-message tracking. Responses aren't cached. Refresh the URL for a live snapshot;
if using a monitor, polling every 15–30 seconds is plenty for these counts.

The public game/relay port always returns 404 for `/coop/metrics`, even for requests coming through
a local reverse proxy. Keep port 8788 out of public proxy routes and container port publishing;
run the request on the server (inside its container if applicable), or use an SSH tunnel. `HOST`
only controls the game/relay listener and cannot make metrics listen publicly.
Metrics contain aggregate numbers only, with no player names, addresses or room codes. The public
`/coop` availability response contains only `{"coop":true}`, so it doesn't expose aggregate counts.

**Run analytics** are separate from relay health metrics. Solo and co-op hosts can submit anonymous
end-of-run stats to a Cloudflare D1 collector, regardless of relay, when the build has
`VITE_RUN_ANALYTICS_URL`. Players can turn it off with Share run stats in Settings, which only
shows in a build that has a collector. A co-op relay set up for it also sends a row of its own for
a run its checks flag, whatever that setting says (and the setting's text says so). See the
[collector setup, daily analytics and leaderboard](../server/analytics/README.md). To look
through an export of its database offline, run `node server/analytics/viewer/serve.mjs` and drop
the file on the page.

## Android

The Android app (`android/`) is a WebView around the same web build and slim cache as the desktop
app, packed into the APK. It never needs the website to start, so solo play works in airplane mode,
first launch included, and co-op uses the relay when there's a connection. Building it needs Java
21, Android SDK Platform 36 and Build-Tools 36.0.0; playing it needs a current Android System
WebView. Before it opens the game it checks cross-origin isolation, WebGL 2, shared memory with a
worker and the worker's access to the bundled cache, and a WebView that fails shows an update link
rather than a blank game.

### Building an APK

A playable debug build, from a build and its slim cache:

```sh
bun install --frozen-lockfile
bun run download-caches
VITE_COOP_URL=wss://relay.example.com/coop bun run build
bun run slim-cache
bun run tsx scripts/android/prepare-game.ts --dist dist
cd android
./gradlew test assembleDebug -PcoopUrl=wss://relay.example.com/coop
```

The APK is in `android/app/build/outputs/apk/debug/`. Without `prepare-game.ts` the app still
compiles, as it does in pull requests' checks, but says its game files are missing. They go in
`android/app/src/main/assets/game/`, which Git ignores; the script puts them together in
`android/app/build/` first, so a run that's stopped partway leaves nothing Gradle would pack.

`prepare-game.ts <release directory>` instead takes a release's `game-manifest.json`, checks its
version and the sha256 of `game-<version>.zip`, and unpacks that. Both forms check the slim cache
as `desktop/release-files.ts` does: one cache, made for this build (`build.json`), with every
chunk it lists.

### Online and offline play

The web build and the app each need the relay, the run collector and the cloud-save Worker, and
they must match: the build as `VITE_COOP_URL`, `VITE_RUN_ANALYTICS_URL` and `VITE_CLOUD_SAVE_URL`,
the app as `-PcoopUrl`, `-PrunAnalyticsUrl` and `-PcloudSaveUrl` (the `COOP_URL`,
`RUN_ANALYTICS_URL` and `CLOUD_SAVE_URL` repository variables in the workflows). Empty means solo
only, no run stats, or no cloud save, as on desktop. Android, desktop and the website share rooms
only on the same game build.

The game runs at `https://appassets.androidplatform.net/assets/game/index.html`, answered inside
the app. **Never change that address or the application ID, `io.jere.run_escape`**: Android
players' saves belong to them. `RelayPolicy.java` lets out what the desktop app does, and nothing
else: the relay's https address (GET only), the collector's one URL by POST and its preflight, and
the cloud-save Worker's `/v1/` (GET, PUT, POST, DELETE and preflights, no query).
Its `connect-src` says the same, as WebSockets skip the app's request handling; workers get it too.

Shared memory needs cross-origin isolation, which COOP and COEP headers alone don't give a WebView:
the app adds AndroidX WebKit's profile allowlist and `Document-Isolation-Policy`, so it needs a
WebView with `CROSS_ORIGIN_ISOLATED_ALLOWLIST`.

The activity takes every configuration change itself (split screen, a fold, dark mode, a keyboard),
since starting it over reloads the page and would end a run.

**Saves.** A WebView can't download a file, so the app puts `NativeDownloads` in the page, and
`saveFile.ts` hands it the file's name and text instead. The app asks the player where to keep it,
and keeps the text in its cache folder until then, in case Android stops the app while the picker's
open. Once it's written, the app answers the page with `saved` (its reply proxy), which is how the
title's export reminder knows the file was kept and not cancelled; a page Android started over
meanwhile isn't told. Import is the game's own file input, with Android's picker. Neither goes
round the game's checks. Saves in the app and in a browser are separate, and Export and Import
carry one across. Uninstalling the app or clearing its storage loses its save.

### GitHub builds and releases

`.github/workflows/android.yml` compiles the app and runs its tests on pull requests, without the
cache or any secrets. Run it by hand with **playable** for a debug APK with the game in it, as an
Actions artifact; its **coop_url** overrides `COOP_URL`. Each run's debug APK has the runner's own
debug key, so installing a later one may mean uninstalling the earlier: export the save first.

Releases build the APK too once it's set up, from the same game zip as the Windows app, signed with
a key kept as repository secrets. Make the key once, and keep it safe: a release signed with another
key can't update an installed app, so players would have to uninstall it, losing their save.

```sh
keytool -genkeypair -v -keystore run-escape-release.jks -alias run-escape -keyalg RSA \
    -keysize 4096 -validity 10000
base64 -w0 run-escape-release.jks | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD   # asks for it
gh secret set ANDROID_KEY_ALIAS --body run-escape
gh secret set ANDROID_KEY_PASSWORD        # the same password: a .jks from keytool has one
gh variable set ANDROID_RELEASE_ENABLED --body true
```

Keep the `.jks` and its password somewhere other than this computer, and out of the repository
(`.gitignore` has `*.jks`). With `ANDROID_RELEASE_ENABLED` set, the release's `android` job checks
and unpacks the desktop game zip, builds the APK, and signs and checks it with
`scripts/android/sign-apk.py`; the draft then carries `Run-Escape-<version>-android.apk`. If that
job fails, there's no draft at all, rather than one without the APK. Without the variable, releases
are as they were. To sign a local build, set `ANDROID_KEYSTORE_PATH` and the other three as
environment variables.

**Updates from GitHub.** The APK is only published on this repository's releases, never in an app
store. `AppUpdater.java` checks the public GitHub releases API once when the app opens, off the UI
thread, without delaying the game. `UpdateRelease.java` selects the exact Android APK of a newer
stable release; a draft, prerelease, missing APK, offline connection or failed check leaves the
installed game running without an error dialog. There is no token or extra update menu.

The player chooses Download update. Android's DownloadManager handles progress and cancellation
in its notification and keeps downloading if the app closes. The app remembers the download ID
and checks it on returning, validates the APK's size, package, version and minimum Android version,
then asks whether to install it now or later: installing closes the game, and a download often
ends mid-run, so the installer is never opened without asking. It hands the APK to Android's
installer through a FileProvider limited to the app's download folder. Android verifies the
signature and asks for install consent; the first update may need Allow from this source in
settings. Declining or a failed download leaves the current version installed. These native
requests don't change the bundled game's `RelayPolicy` or Content-Security-Policy.

What it remembers between launches, and what that leads to, is `UpdatePlan.java`'s, tested
without a device. Later on the offer, or cancelling the download, puts that version off for a
while (`SNOOZE_MS`). A downloaded APK whose install was put off is offered again on the next
launch, not downloaded again. A newer release replaces a download that's waiting, and one whose
version is installed is removed. An APK that can't be installed (its minimum Android version, or
the wrong package or version) is never offered again, so a phone doesn't download it on every
launch, though a newer release is offered. The activity made again by Try again or Reopen is the
same visit: it doesn't check again.

The About menu still links to releases for manual downloads. Older copies need a manual install
of an APK with the updater first. Install over the old app: uninstalling deletes its save.
Android players need the current game build to join its co-op rooms.

For releases this changes nothing, but a few things matter more now. Every release has to be
signed with the same key, or every in-app update fails at Android's installer. The app only reads
GitHub's latest release, so a release without the APK offers nothing, and an older patch marked as
latest hides the newer one. The first update anyone gets in the app is from the release after the
one that brought the updater, so try the whole flow on a phone before that: build this code signed
with the release key, with a lower version in `package.json`, on a phone without the app, and it's
offered the current release. A debug build can't finish: its key differs, so the installer refuses.

The version name is `package.json`'s, and the version code is made from it (0.27.0 is 270000), plus
`-PandroidRevision=1` to `9` to rebuild one game version. A version code can never go down: Android
won't install an older APK over a newer one.
The startup check compares game versions; an Android-only rebuild of the same game version still
needs a manual install from releases.

**Google's developer verification** applies outside app stores too. Certified Android phones are
starting to refuse new installs and updates of apps whose developer hasn't registered with Google:
from 30 September 2026 in Brazil, Indonesia, Singapore and Thailand, and everywhere in 2027, as
reported in 2026 (check Google's own page for where it stands). Players can still install an
unregistered APK with ADB, or a slow opt-in in developer options. Registering, in the Android
Developer Console, takes the application ID and the release key's certificate, so make the key
first.

## Desktop

**Co-op on desktop.** The app answers every https request itself, so it only reaches a relay built
into it. Set the `COOP_URL` repository variable (Settings, Secrets and variables, Actions) to
`wss://example.com/coop`, and the release workflow builds it into the game and the launcher. It
has to be `wss://`. The app lets out only that relay, POSTs to that one collector URL if the
`RUN_ANALYTICS_URL` variable is set, and requests to the cloud-save Worker's `/v1/` if
`CLOUD_SAVE_URL` is (an https origin, `isCloudSaveRequest` in `src/util/cloudSaveUrl.ts`):
`protocol.handle` in `main.ts` answers every other https
request itself, and WebSockets are kept to the relay by the `Content-Security-Policy` header
`gameServer.ts` sends (`connect-src`). Without `COOP_URL` there's no Multiplayer.

The launcher only gets it in a new download, so players on an older one keep playing without
Multiplayer until they fetch the new zip. Don't raise `minLauncher` for this: the game still runs.
Desktop and web players share rooms only on the same build, so publish a release and deploy the
website from the same commit.

The Windows app is a zip: `Run Escape.exe`, the Electron runtime and the game, so it plays offline
the first time it's opened. There's no installer. Unzip it anywhere and run it. It lives in
`desktop/`, apart from the game, which doesn't know it's in an app.

```
bun run build && bun run slim-cache
bun run desktop         # the app, on this build, with no update check
bun run desktop:dist    # everything a release carries, in release/
```

`desktop:dist` stops if `dist/caches` isn't the slim cache made for this build. It needs Node
22.12 or later (Electron does), and Electron's binary downloads the first time it's run. Dev runs
keep their saves in a `Run Escape Dev` folder, so they can't touch a real one.

| File                   | What it does                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| `main.ts`              | Windows, security settings, the order things happen at launch     |
| `gameServer.ts`        | Serves a game folder at `GAME_ORIGIN`, with the headers and Range |
| `gameUpdate.ts`        | Checks for, downloads, verifies and installs game updates         |
| `gameFiles.ts`         | The plain logic: versions, picking a folder, zip paths, manifests |
| `releaseSource.ts`     | The only place that says where updates come from                  |
| `version.ts`           | `LAUNCHER_VERSION`                                                |
| `release-files.ts`     | Makes the game zips, chunks, manifest and the changelog's notes   |
| `electron-builder.yml` | What goes in the launcher's zip                                   |

### Where things are kept

Saves and updates are under the user data folder, `%APPDATA%\Run Escape`, never beside the exe, so
they outlast the zip's folder being moved or deleted, and a new launcher zip finds them.

**Three things decide where saves are, and changing any of them loses every player's save:**
`GAME_ORIGIN` in `gameServer.ts`, the user data folder's name, and `GAME_PARTITION`, all but the
first in `main.ts`. They don't depend on the game's version, or on which folder the game's served
from.

The saves on a website and in the app are separate, as they're different origins. The Settings
screen's export and import carry one across.

### How the game's served

Nothing listens on a port. `gameServer.ts` answers the game's requests inside the app, at
`https://run-escape.invalid`, by intercepting `https` in the game's session. That looks odd, and
it's on purpose:

- **It can't be a custom scheme.** `app://` gets cross-origin isolation and `fetch`, but the Cache
  API's `put()` refuses anything but http(s) with `Request scheme 'app' is unsupported`, and the
  game keeps its cache with `put()`.
- `.invalid` can never resolve, so a request that somehow got out wouldn't reach anyone.
- Every answer needs the COOP and COEP headers, workers included, and a `.wasm` or `.js` needs the
  right type.
- `CacheFiles.ts` (a full cache, not the slim one's chunks) resumes with
  `Range: bytes=<offset>-<MAX_SAFE_INTEGER>` (see Hosting). `gameServer.ts` clamps the end and
  answers 206, with a `Content-Length` of what's left.

Interception only works reliably for one session per process, so don't add a second.

### Game updates

The launcher updates the game's files by itself, not the launcher. At launch:

1. It asks GitHub's API for the latest published release of Dynrothe/Run-Escape, with no token and
   a 5 second limit. Drafts aren't returned, so publishing is what lets players have it.
2. If the release's `game-manifest.json` has a newer version than the game it has, it shows a small
   window, downloads `game-<version>.zip`, checks its sha256, extracts it to a temporary folder and
   renames that to `game/<version>` in the user data folder. Then it removes older ones. When it
   can, it downloads less (below).
3. It plays the newest game folder it can run: an update, or the bundled files if those are newer,
   as they are after unzipping a newer launcher.

Offline, rate limited (GitHub allows 60 requests an hour per address), a bad download, a skipped
update: the game starts anyway with what it has, and `launcher.log` in the user data folder says
why. The old game stays until the rename, so nothing partway through can break it. A folder only
counts if it has the `verified.json` that's written just before that rename. The sha256 catches a
damaged download, not a bad release: the manifest comes from the same place as the zip, so anyone
who can publish a release can ship code to players.

Downloads start only from this repository's release URLs, over https. GitHub then redirects to
`release-assets.githubusercontent.com`, so redirects are checked one by one, which is why this uses
Node's `fetch`: Electron's `net.fetch` fails on `redirect: "manual"`. That means it doesn't use
Windows' proxy settings, so behind a proxy a player just gets no updates. A zip's entries are all
checked before any is written, by `unsafeOriginalName`, as JSZip tidies `../` out of `name`.

A release also carries the game in two parts: `game-<version>-lite.zip`, the game zip without
`caches/chunks/`, and each of the slim cache's chunks as `cache-<chunk>.bin`. The manifest lists
them (`lite`, with its sha256 and size, and `chunks`). A launcher that knows them copies the chunks
the game it's playing already has, each checked against its name, and downloads the lite zip and
only the chunks that changed, a few at a time, each checked too. When those are more than half of
the chunks' bytes (a game from before chunks has none to copy), it downloads the whole zip instead,
as one download is quicker than many. If any part of a split update fails, short of the player
cancelling, it downloads the whole zip after all, and the launcher's log says why. Launchers from
before this ignore both and download the whole zip, so it didn't need a new `LAUNCHER_VERSION`.
Either way, a game whose `caches.json` lists a chunk it hasn't got isn't installed.

The game's Cache API copy of the chunks is under `GAME_ORIGIN`, which never changes, so after an
update the game reads the chunks it had from there, and drops the ones it no longer needs.

### When the launcher has to change

`LAUNCHER_VERSION` in `desktop/version.ts` isn't the game's version. A release's manifest gives it
as `minLauncher`. **Raise it only when the game can't run on launchers already out there**, like
when it needs a newer Electron, or a change to how the game's served. Then old launchers keep the
game they have, and show a message with a button to the release page, so every player has to
download the new zip by hand. Changing `desktop/` without raising it is fine: new downloads get the
new launcher, and existing players keep working.

### Releases

`.github/workflows/release.yml` runs on every push to `main`, and stops straight away unless
`package.json`'s version has no release yet, drafts included. So a merge that doesn't change the
version does nothing, and neither does one while a draft for this version is waiting. The Actions
tab's Run workflow button (`workflow_dispatch`) does the same but rebuilds a waiting draft, and it
only appears once the workflow's on `main`.

The actions it uses are pinned to commits, with the version in a comment beside each. Dependabot
(`.github/dependabot.yml`) opens a pull request when one has a new release, so don't move them by
hand.

It builds on Windows, with the OSRS cache kept between runs by `actions/cache` under
`GAME_CACHE_NAME`. The draft is tagged `v<version>`, with notes from that version's section of
`CHANGELOG.md`, and carries `Run-Escape-<version>-win-x64.zip`, `game-<version>.zip`,
`game-<version>-lite.zip`, a `cache-<chunk>.bin` for each chunk and `game-manifest.json`, and
`Run-Escape-<version>-android.apk` once Android releases are set up (see
[GitHub builds and releases](#github-builds-and-releases)). The chunks bury the Windows zip and
the APK in the asset list, and GitHub can't group or reorder assets, so the notes start with a link
to the zip, and to the APK when it's built. The links only work once the draft is published, so the
`publish` job links the names it uploads: a renamed file fails the upload rather than leaving a
dead link.
**Publishing the draft by hand is what releases it to players**, and the tag only exists from then
on. A version needs its own section in `CHANGELOG.md`, or the build fails.

The app isn't signed, so Windows shows a SmartScreen warning the first time it's run (More info,
then Run anyway). Unzip it first: running it from inside the zip fails.

## Code

```
src/game/
  content/  enemies, weapons, passives, items (gear, utility, caskets), armoury (what each piece
            of gear upgrades into), power-ups and thralls, random events, characters, shop, maps
            (arena, spawn, difficulty) and their waves: plain data with cache ids; unlocks
            (what each map's tasks bring in); quests (what each asks for and pays); hard (hard
            mode's numbers); raids (a raid's rooms, points, supply chest, teleporters) and theatre
            (the Theatre of Blood's bosses)
    fun/    the fun maps (endless, random bosses) and their players: outfits, chat, shots
  core/     the game in plain TypeScript (no DOM), tested with vitest
    Sim.ts            fixed 20ms tick: movement, enemies, spawning, weapons, pickups, power-ups,
                      levels
    BulletPool.ts     a boss's bullets, in flat arrays: hundreds at once, no allocation in the tick
    world/            ArenaGrid (collision + heights), Collision (circle vs tiles and walls),
                      FlowField (Dijkstra from the player, how hundreds of enemies find a way),
                      FlightGrid (the terrain walls that stop what flies: blocked floor that
                      isn't liquid, and solid clumps too big to be a tree). A grid works out
                      once, as it's made, which steps out of each tile are allowed (`Steps`,
                      for flow fields and straight walks). Sim makes the FlightGrid with the
                      map when anything on it flies (`hasFliers` in content/maps.ts), since
                      making it takes a while
    SpatialHash.ts    enemies (and piles of bones) by cell, for what's near: flat arrays over
                      the arena, kept from tick to tick. It goes by middles, so an attack
                      that hits what it touches uses Sim's queryTouching, which also looks
                      at the few big enemies (radius over 1) out of the cells it searched
    lockstep.ts       co-op's frame events, applying them, and the check that copies agree
    fmath.ts          trigonometry that every browser works out the same, for co-op
    Upgrades.ts       level up choices
    Loot.ts           what's in a casket, the inventory
    save.ts           versioned save with migrations, shop, unlocks (maps, and the adventurers
                      and items earned by tasks), the gear found and the Armoury's upgrades,
                      quests (and the kills and caskets they count), and LocalSaveStore (the
                      save in localStorage: see Saves)
  scaperune/ maps that aren't in OSRS: a seeded generator, recipes, prefabs cut from the real world.
            Dev-only but for the recipes in maps/shippedMaps.ts, with a temporary Map generator
            button on the dev server's title screen. Its CLAUDE.md is the guide to making one
  client/   GameClient (run flow, camera, input), GameView (3D actors + 2D overlay),
            BossFightView (a phased boss's ground marks, bullets and entrance),
            GameAssets (what gets baked), GameStore (state for the React UI, and the HUD's
            numbers apart from it), SaveLock (one tab saves at a time), DamageMeter (each
            weapon's damage a second for the HUD's damage panel), Minimap
    coop/     CoopLobby (the relay connection and the room), CoopRun (a run's lockstep, host or
              guest), protocol (the messages)
  render/   GameWebGLRenderer (the map viewer's renderer with the game's passes), CameraRig
  ui/       React screens and HUD, ChestModal (the casket opening), EventModal (a random event's
            offer), ItemIcon (an item's model, an interface sprite, or a loc's model from
            above), DescriptionButton (hover, focus and hold descriptions), CountryFlag (a
            co-op player's flag), CoopScreen (the rooms, the lobby, the party in a run),
            formatCompact (short numbers like 9.5K and 1.2B, for the damage panel)
  client/GameTouch.ts, ui/TouchControls.tsx, ui/Mobile.css   touch screens (see Touch screens)
  client/GamePad.ts, ui/PadHint.tsx                          controllers (see Controllers)
server/     coop-relay.mjs: co-op's rooms, and passes each run's frames between its players
  coop-checks.mjs  both relays' checks on a run's frames
  cloudflare/  the same relay on Cloudflare Durable Objects, each room near its host (README.md)
src/mapviewer/webgl/actor/   actor renderer: baked animation frames drawn anywhere in the world,
                             any number of them, one multi-draw per segment and pass (without
                             multi draw, one instanced draw per frame of an animation)
src/mapviewer/worker/        RegionDataLoader (collision and heights for the whole arena in one
                             scene build), ItemIconLoader (inventory icons drawn like the client)
                             SoundLoader (sound effects synthesized off the main thread),
                             SpriteDataLoader (interface sprites, like hitsplats)
src/rs/audio/               the client's sound effect synth: instruments, envelopes, filters
src/rs/model/player/         player models from identity kits and worn items
```

A loc blocks only the ground its model stands on (below about waist height, from
`RegionDataLoader`), where that opens no way that couldn't be walked before. `ArenaGrid` shrinks a
loc that stands on its own to it, a signpost to its post. Locs that share a tile, like the God
Wars entrance rock and its base, are a stack, and shrink together to the ground they all stand on,
on the sides of their tiles that face open ground. Either way the open ground round them has to be
one piece, walls counted, so nobody gets round the end of a fence. A loc with no model to go by
keeps its tiles, as does a stack with one, or with one that draws nothing; so do a stack's tiles
with walls or blocked floor on them, or another blocker beside them.

Empty worn-equipment slots use the cache's equipment silhouettes (`GEAR_SLOTS.iconSpriteId` in
`content/items.ts`), drawn by `ItemIcon` given a `spriteId` and no item. They are in
`client/GameAssets.ts`'s `getGameSpriteIds`, so `scripts/cache/sprites.ts check` and the
deployment's slim cache cover them too. Equipped slots still show their item's model; small phones
still hide the gear row.

Changes to the map viewer itself are small: the game subclasses its WebGL renderer, a few decoders
learned the rev 241 and 242 opcodes, the map loader can take extra map squares as plain data
(`src/rs/map/CustomMapFileLoader.ts`, from ScapeRune), `src/rs/config/loctype/LocOverrides.ts`
gives a ScapeRune map a loc a different model or size, and two bugs were fixed (floor collision missing on the edge of every
map square, and a resize during loading leaving the 3D view in a corner). `?viewer=1` still loads
map squares its own way (see below).

Karamja's blocking Jungle plants (the ids in `JUNGLE_PLANTS`) have low wooden bases, made from the
cache's Tree stump (loc 1354, model 1635), because loc 1398's model also stands there as a "Plant"
(loc 1390) you can walk through. `src/mapviewer/webgl/loc/PlantBarriers.ts` adds them to the static
render list in `SdMapDataLoader`, not to the scene or cache definitions: collision, pathfinding and
the minimap stay unchanged. It copies the model, scales it to sit under the plant's leaves, keeps
one copy for each size in a map square, and fits each to the terrain. A plant still blocks out to
its leaves, past the base. Plants with `clipType` 0 get none, and animated or
transforming plants never reach the list (`getSceneLocs` keeps them as entities). Without the
stump model it logs an error and draws no bases, rather than failing the map square. Keep this
decoration separate from `RegionDataLoader`'s footprints and `LocOverrides`. The slim cache's map
pass runs the same loader, so it collects the stump model by itself.

The main thread and every worker decode the cache's tables for themselves, so they're kept small:
an index's reference table is decoded the first time something reads the index, into flat arrays
(`ReferenceTable`); a group's files stay in one array (`Archive`), so a file's data can be part of
a bigger buffer (mind its `byteOffset`); and `MapViewer`'s loaders are made the first time they're
used. The game's main thread only needs the textures, the seqs of animated scenery and the map
index, plus the locs when a ScapeRune recipe runs.

### Boss fights as data

A boss's fight is in its `BossDef` and `BossAttackDef`, with no boss named in `Sim.ts`. The Nightmare
(`content/nightmare.ts`) is built from these, and any boss can use them:

- `BossDef.intro`: the player's safe, the screen goes dark, what's left runs for the map's edge and
  is gone, and the boss rises. `alone` stops the waves until it's dead. `atMiddle` rises it at the
  middle of the map's `bossArena` with the players stood `distance` south of it (Phosani's), and
  `holds` roots them until it's over: `Sim.introHolds`, which the movement rules and co-op's
  prediction take like a hold. A boss's cooldown doesn't run while it rises, so the grace after an
  entrance is set as it rises: a second, or none after `holds`.
- `BossDef.phases`: a shield, then totems in the corners, then a blast for a share of its hitpoints.
  Only the shield takes hits, in `damageEnemy`. Totems are enemies that can't die: their hitpoints
  are the charge they still need, and `shieldEnd` is `Infinity` while they can't be hit, which keeps
  weapons off them. With the shield down the boss is off them the same way, and a projectile flies
  on through it with no blocked splat (`stepProjectiles`), so nothing of the player's registers
  on it until the totems have blasted.
- Attack kinds `pattern` (rings, spirals, aimed spreads), `ground` (marks that land, or stay armed;
  a `ring` of marks is round the boss unless `around: "player"`, as Phosani's claw on the player
  has), `quarters`, `surge` and `mark`, and `phases` on an attack for when it's used.
- The bullet hell's own tools (Phosani's Nightmare): `chain` uses an attack again straight after,
  with its own windup, a lane or spots picked afresh each time; `toMiddle` leaps the boss to the
  arena's middle as it begins (a `quarters` attack's lines cross there, placed where it will
  stand), with its `leash.jump` if it has one, the windup then running from when it's up
  (`leapToMiddle` returns the spot and the jump's ticks, and `stepLeap` goes on to the windup's
  animation), and the view flashes the quarters that will hurt red for a second as the flowers
  first appear (`flashQuarters`, a colour overlay); `QuartersDef.during` has
  it stand among its flowers using only those attacks at its own interval; a `pattern`'s `gap`
  leaves a way through a ring that turns with it, and `track` re-aims a spread's every volley.
- More of them, from the bullet hells she's modelled on: `gapAt` puts a ring's gap on the player or
  away from them (Hush's ring with the gap at Isaac); `mirror` fires each volley again mirrored
  about the aim, so the two turn opposite ways (a sweep's arms open like scissors, a spiral winds
  against itself, as Doremy's do); `speedUp` quickens each volley so rings catch each other up
  (Sparen's stacks); `around` fires a ring in from a circle round the player (Doremy's Ochre
  Confusion); and `follow` on an attack names the one that comes delay seconds after it's fired,
  through whatever's in the air (Rumia's slow rings and then an aimed volley). `summon.distance`
  puts summons in a ring that far out, and with `summon.thrown` they fly out of the boss to spots
  that far off in random directions (`Enemy.flung`, drawn in an arc by the view), shielded until
  they land. An enemy with `hatches` is gone after its seconds with its `into` out where it stood
  unless it's killed first (counted from landing, when thrown), `objId` draws it as an item's
  model with nothing to animate (Phosani's eggs are the Parasitic egg, baked as an `obj` under the
  enemy's key), `healthBar` keeps its bar over it from the start, and `solid` has the player give
  way instead of pushing it (as what can't move already did). A boss faces down its lane from the
  moment a `surge` is picked until the charge is done, and totems face the arena's middle plus
  `totems.yawOffset`, since The Nightmare's totem model has its scroll three-quarters of the way
  round from its yaw (the crowd code leaves their yaw alone). A ground attack's `grab` plays its
  `middleSpotAnim` out in full where each mark lands (an `Effect` with `fitRadius`, which the view
  scales to), instead of the faint warning just vanishing: the warning is a frame of the hands up
  (`GRAB_WARNING_TICK`) held still at `GRAB_WARNING_ALPHA`, as wide as the mark (`fit` 1), kept
  until the real hands have risen into sight (`grab.up.from`), and the mark only hurts from then
  until they sink (`up.to`), so what's drawn is what's hit; Phosani's marks are 0.75 tiles, near the
  real fight's one-tile hands, with more to a ring. The mark stays up for the grab's seconds (`GroundHazard.grabEnd`)
  and hurts each hero once who steps in meanwhile (`hit`), and the boss's `channelEnd` runs to
  the end of the animation, so a chain's next round waits for the hands. `leash.jump` has a leashing boss play a down
  animation where it is and an up one where it lands (`BossState.leap`), doing nothing else
  meanwhile, and never between a `chain`'s links or before a `follow` (a charge ends at the far
  edge and its next lane is picked from there; a leash then had her sink, come up by the player
  and snap back to the lane). A bullet is drawn no smaller than its hit radius, whatever its
  `scale`, so a miss that looks like one is one. The view shows a surge's lane for its first second only, and a grab mark is its hands
  alone (no outer model), faint until it lands. The Nightmare's NPC ids are
  several models on two skeletons: her real absorb (8604) and pit rising (8610) are on the other
  one (npc 9431's) and tear her usual model apart, so `nightmare.ts` uses her summon for the
  absorb and 8594 for a charge's wind-up, with 8607 and 8609 (npc 9432's) as her sink and rise.
  `scripts/cache/find-npc-seqs.ts` lists what each id's skeleton can play. `hintArrow` on an enemy has `BossFightView` draw the cache's
  hint arrow sprite (`HINT_ARROW_SPRITE`, `headicons_hint`) bobbing over it, or an arrow at the
  screen's edge when it's off the screen, as the totems get.
- `Sim.bossArena` is the square all this goes by: `MapDef.bossArena`, or the whole map. Nothing's
  sized by hand, so she fights on any square.
- **Arena fights** (Justiciar Zachariah, `content/zachariah.ts`): a boss whose room is the weapon.
  `MapDef.features` (`ArenaFeatures`, world tiles) is what its attacks read off the map: a
  `checker` of cells, `pillars`, bolt `rows` with their statues, `knights`, `fires`, a `dais`,
  `rise` (where an `atMiddle` boss rises instead of the square's middle) and statue groups. A
  recipe exports them map-local, and `moveFeatures` (`core/arena.ts`, plain arithmetic the sim
  and the view share) takes them to the world. Each piece is a field with nothing changing
  without it:
    - `BossPhasesDef` without `totems` goes by hitpoints: `phases[i].until` (an even split
      unset), a `threshold` pause (`stage: "hp"`, `passThreshold`, `stepThreshold`) and death at
      none; `status` and `message` per phase, `ambients` (more timers, ground marks or cycles too),
      `confine: false` to let the player off the `bossArena` (and `Sim.confinedToArena`, which
      co-op's prediction reads).
    - Swings: `line` (a strip the way it faced; `line.track` turns it after the player for the
      start of its windup, `Sim.trackLine`, and the view draws it from `BossWindup.dirX` each
      frame, so it follows), `cover` (spares whoever's in a pillar's
      shadow from where it's cast, `inShadow`; the view lights the arena and draws the shadows'
      soft outlines, `shadowOutline`, the same shapes). Blasts: `square`. Projectiles: `wave` (through everyone, once
      each), `boomerang` (out and back, once each way), `from: "knights"`, `onHit` (drag, bind with
      `player.frozen`, and the boss's next attack; `Hero.drag`), `lookId` (drawn as an NPC).
      Patterns: shape `rows`, `delay`, and `pillars`, which cuts a straight bullet's life where it
      meets one as it's fired, so a bullet in the air costs nothing more. Ground: the `checker`
      spot shape (square hazards, `GroundHazard.half`) and `alpha`. `cycle`: a rhythm of the
      map's fires (`cycleStage`), as an ambient.
    - A map can't play a placed loc's animation on demand (a map square bakes each loc with its
      own animation), so the statues an attack animates are drawn by the fight and left out of
      the map (`Placer.standIn`, which `owlsCourt.ts` uses): `statues` names the loc and its animations, the
      sim's `statueSeq` events say when each starts, and `BossFightView.drawStatues` draws them
      still until then. A loc bake takes `seqs` for that (`getStatueModelKey`).
    - `BossDef.look` gives the shared fight screen its own colours (`edge` and `vignette` can be
      `null`), and `lean` has the camera lean towards the boss. A raid's boss rooms don't lean
      that way: the camera moves north only as far as keeps the boss and its overhead prayer below
      the boss bar, and not at all for a boss more than `RAID_LEAN_MAX` tiles' lean off
      (`GameClient.getRaidRoomLean`). `MapDef.fight.strikeReach` keeps a
      strike to its targets within that reach, and the boss bar says when it's out of it.
    - Fighting back: `BossDef.guard` drops the boss's guard for an attack's `opens` seconds when
      it misses everyone (a swing, a wave or boomerang, a surge that crossed, `stepSurge`)
      (`dropGuard`: `BossState.exposedEnd`, every hit doubled in `damageEnemy`, a reach-limited
      strike fired at once), and stuns it (`stunEnd`: `stepBoss` does nothing, the stars over
      it) when its arena's attack with `turns` catches it (`boltsOnBosses`, `landHazard`,
      `stepThrough`) or a `line.dash` lunge ends in a pillar (`BossState.dash`, `stepDash`), with
      its sounds as it drops; after a stun, `stunGrace` seconds when nothing stuns it
      (`BossState.stunGraceEnd`). The view tints a boss whose guard's down gold. A phased boss
      with `barPerPhase` shows each phase as a full bar (`getPhaseBarFraction` in `GameClient`).
    - A boss attack's `strikeAt` times its animation to land with it: held on its first frame
      (the blow drawn back) until it's that far from landing (`BossWindup.seqTick`,
      `Sim.playWindup`). Players held for an entrance with `BossIntroDef.faces` face the boss
      (`Sim.introFacing`, the movement rules' `faces`).
    - A checker's cells can hurt only within the circle drawn on them (`GroundPatternDef.round`),
      and a `boomerang` with `toEdge` flies to where its line leaves the `bossArena`
      (`Sim.throwReach`, `boxExit`), which the view's line uses too. A boss fight's HUD and
      touch screen have no item bar, and its results a Retry (`GameClient.retry`).
    - `MapDef.fight.ability` (`FightAbilityDef`) is the fight's own button, and `TombsDef.ability`
      the raid's (`Sim.ability` reads either; in the Tombs it lands on the path's boss, or the
      Wardens' second- and third-phase Warden, and `damageShare` hits for a share of its
      hitpoints with no bonuses, so it scales with the raid level and the party): `Sim.useAbility`,
      through co-op's actions (`CoopAction` `ability`), on Space, a pad's bottom face button in a
      run (`RUN_KEYS`), and `ui/AbilityButton.tsx` on the HUD and the touch screen. A press that
      can't go off yet is held a moment (`Hero.abilityHeldUntil`, `stepHeldAbilities`), and
      `openReach` is its reach while the boss's guard is down. Its damage
      is `ability:<id>` for the run's stats; what the arena did to its boss is `court`. It
      lands on the boss on the bar, or with two final bosses up (the Scarab Mages) on either
      (`abilityBosses`): one with its guard down first, then the nearer (`abilityTarget`).
      `guide` has the button coach (the Tombs' and their quest's): a hint early in a fight, until
      it's first used, and a pulsing ring with a tag while the guard's down.
    - A spell a boss channels (`BossAttackDef.channel`) drops its guard from its windup's start
      till it's cast (`dropGuard` in `startBossAttack`), and for a summon with `walkTo` while
      its walkers walk in (`stepWalkers` holds `exposedEnd` up). The fight's button landing on
      it meanwhile breaks it (`breakChannel`, from `fireAbility`): the windup, chain and follow
      are dropped, or the walkers vanish with no blast, and its guard's down `stagger` seconds
      from then, with a `bossGuard` event whose `cause` ends in ` (broken)` (the sim counts
      those) and `broken` on screen. A swing with `outside` hits only beyond that many tiles
      from the boss: `GameView` draws the shelter green and the storm's edge closing in red
      (`STORM_EDGE`), and the bot heads for the shelter first (`shelter` in `bossReads.ts`).
    - `ImpactDef` (`BossAttackDef.impact`, `guard.stuck`, `leash.jump.land`, `intro.land`,
      `FightAbilityDef.impact`) puts spot animations where a blow lands, scaled to `fit` and
      each played out once (`Effect.once`; a trail's laid along its way, turned with
      `Effect.yaw`), and a `bossImpact` event that `GameClient` shakes the camera by (off with
      the Screen shake setting, `DisplaySettings.screenShake`, and by default for reduced
      motion) and `GameView` flashes the screen by, faintly.
    - Two bosses fought together (the Scarab Mages, `content/cursedSands.ts`): both are
      `finalBoss` events, so the run's won when both are down, and the second's event can be
      later with `inArena` (`RunEventDef`: it turns up inside the `bossArena`, 4 to 9 tiles
      from the player, `spawnBosses`). The first's intro mustn't have `alone`: `aloneWith`
      stops every event till it's dead. `BossDef.enrage.partner` enrages a boss when one of its
      partners dies (`enragePartners`, from `killEnemy`), at its own `tempo`
      (`BossState.furyTempo`, in place of `ENRAGED_INTERVAL`); an attack with `enraged` and
      `phases: [1]` is how a phased boss gets its later attacks early that way. A
      `BossAttackDef.tether` (kind `tether`, used as it lands or as an ambient) is a beam from the
      boss to the nearest living partner for `seconds`: `Sim.tethers` (`BossTether`, cleared with
      the rest of a boss's attacks), read each tick between where the two are (`tetherEnds`), it
      hurts each hero within `width / 2` of it once an `interval` after `warn` (`stepTethers`,
      `segmentDistanceSq` in `core/arena.ts`, `Hero.tetherHitTick`), and `GameView.drawTether`
      lays its `spotAnim` along it a tile apart, faint until it's armed. A pattern ambient with
      `origin: "target"` bursts from where the nearest player stood as it began, so a ground
      ambient on the player and that pattern on the same timer make marks that burst outwards.
      One can echo the other's lunge (`EnemyDef.echoes` on a boss, below): the elder copies
      the first's Crossfire, so two strips come from two ways at once.
    - A ground attack's `trail` spots (the Champion of Scabaras) land on where the player it's
      after stood `ago` seconds back: each hero keeps the last `TRAIL_SECONDS` of where they stood
      (`Hero.trail`, a ring by tick written in `stepPlayer`), read in `markGround`; where
      nothing's kept for that tick (they weren't stepped, or it's further back), it's on them.
      It's sim state like any other, so co-op's copies agree, and nothing reads it without the
      attack. An ordeal's `opener` (`BossOrdealDef`, `BossState.ordeal.opener`) is used once
      as it begins, before its `attacks`: the Champion's nests, laid all at once rather than
      coming among them as Xarpus's do. As an exhumes ends, each still up shows its
      `healSpotAnim` going to the boss.
    - An enemy that copies a boss's lunges (`EnemyDef.echoes`, an `EchoDef`: the Menaphite
      Akh's shadow): as that boss starts one of the named line swings (`startBossAttack`), each
      living enemy with `echoes` that isn't busy (nor, for a boss echoing its partner, winding
      up, channelling, kneeling, stunned or in the air: `isBusyBoss`) starts its own copy
      (`startEchoes`): the
      boss's attack under the echo's `name`, `damage`, `seq` and `impact`, with no `opens`,
      `chain` or `follow`, from where it stands at the hero nearest it, over the boss's windup
      plus `later`, the nearest a hero first up to `most`. It's a `BossWindup` on the enemy
      (`Enemy.echo`), stepped in place of its walking and shooting (`stepEcho`: `trackLine` as
      the boss's, then the strip through `forEachHeroInReach` and `inStrip`, the trail, and a
      dash down `line.dash` as `Enemy.echoDash`, with the rest of its impact where it stops).
      The view draws it as the boss's strip (`drawBossWindups` reads `Enemy.echo` too), and the
      echo's `seq` is baked with the enemy's model (`GameAssets.getEnemyBakes`), so it must be
      one its rig can play. Name only a phase's attacks to keep it to that phase. The bot reads
      every strip winding up (`lungeStrips`), and with two or more steps to the nearest spot
      none reaches (`sharedPocket`); with one it steps across it as before.
- A map's `music` names an OSRS track, and its recording (from the OSRS Wiki) goes in
  `src/media/music` as the name in lower case with underscores: `the_bane_of_ashihama.ogg` for
  Phosani's Nightmare. `GameClient` finds the files with a glob, so a track can be named before
  its recording is in: the map is silent until it is, and nothing breaks.
- `MapDef.fight` makes a map one fight (Phosani's Nightmare, `content/phosani.ts`): no waves, its
  final boss event at 0, and the adventurer's starting weapon at `weaponLevel` from the first tick,
  with nothing in the fight dropping anything (`dropLoot` keeps only the collection log's
  trophies there). Phosani's is built from her data alone: her sweep
  is a one-bullet `spread` that `turn`s each volley, and her husks are a `scatter` summon of
  enemies with `holds`, which pin the player once they arrive (`holdPlayer`).
- What makes a bullet hell hard, all defaulting to how The Nightmare plays: `BossDef.bulletGrace`
  is the seconds after one of its bullets hits before another can (`stepBullets`; a second unless
  set, Phosani's 0.3). A pattern's `channel` is how long the boss stands still for it instead of
  until its last volley, so the next attack comes through it (`startPattern` keeps the later
  `channelEnd`; Phosani's rings and spirals get 0.5 from the loop at the end of `phosani.ts`, her
  aimed spreads none). A pattern's `burst` fires `count` volleys and then pauses `pause` seconds
  (`stepEmitters`), so a fast sweep's arm is short solid pieces with holes between them that a
  player can run through; `patternSeconds` counts the pauses in how long the boss stands for it. `BossPhasesDef.phases[i].ambient` names a pattern attack of its (weight 0,
  `phases: []`, like an opener) begun again every `interval` seconds on the phase's own timer
  (`BossPhase.ambientNext`) in `stepPhase`, under whatever else it does, through holds and
  cooldowns, with no channel, and not while it's under the ground (`leap`) or its sleepwalkers
  walk (`BossState.walkers`, outside a finale: the ambient's emitters are dropped and it begins
  again the moment they're done, so a player up by it shooting them has nothing to step
  through). `BossDef.fallSeconds` on a final boss keeps the run going that long after it falls
  (`Sim.victoryAt`), with nothing landing on the players, so its death animation plays before
  the victory screen, all of it (the view cuts other deaths at `MAX_DEATH_ANIM_TICKS`, and
  `corpseTicks` keeps the body that long); the run's time is to the fall (`endRun`'s `at`).
  Phosani's is her death's 5.4 seconds. `tempo` multiplies
  the boss's interval and its pattern attacks' windups (only those: the big hits keep their
  warnings) in `startBossAttack`, and `speed` its walk, applied as each phase begins. `finale`
  keeps the boss up for `seconds` after the last blast as a stage of its own (`stage: "finale"`,
  untouchable like the totems stage, the HUD's bar the time left): it opens with `opener`, keeps
  to `attacks` at `interval` like the flowers' `during` (`keepsTo`), doesn't wait for its
  sleepwalkers (`stepWalkers` doesn't stop it), runs the finale's own `ambient` (one pattern, its
  `delay` not read), and `stepPhase` kills it when the time's up. A boss fought by its hitpoints
  (no totems) gets one too: at none it's held at 1 behind `shieldEnd` instead of dying
  (`lastStand`, from `damageEnemy`; both go through `startFinale`), with `shout` over it, and its
  guard can't drop meanwhile (the Menaphite Akh's last stand). `Hero.damageByAttack` is what each
  boss attack did to that player, by name: `sim.damageByAttack` in the console, and the balance
  bot's `boss attacks that hit` line, for tuning a fight.
- The Theatre of Blood's bosses (`content/theatre.ts`) add: patterns `wall` (a row with a gap
  somewhere new each volley) and `closing` (a ring round the player, coming in), ground marks that
  `lingers` and hurt while you stand in them, and `safe` marks a projectile spares you in;
  `EnemyDef.protects` (a share of ranged or magic weapons' damage); `BossDef.naps` (the Bloat: up
  and guarded, then down and open, then a stomp); and for a raid's expert mode `EnemyDef.onlyStyle`,
  `BossDef.colours`, `BossDef.stare`, `EnemyDef.expertAs`, `BossAttackDef.expert` and
  `EnemyShotDef.expertKeep` (how close a shooter comes: the blue Nylocas, into a magic aura) and
  `EnemyDef.expertOwnStyle` (a wave Nylocas's own style does more, as the other two do nothing).

The curse is applied to the input in `stepPlayer`, so keys and the touch stick go the same way.

Her animations are picked by eye, as `classify-npc-seqs.ts` can't tell them apart: she floats in all
of them, so none ends lying down. `find-npc-seqs.ts` scans every sequence and now runs out of the
2.4 GB a heavy job gets; `classify-npc-seqs.ts` with a band of ids is what got them.

### Props and opening cinematics

- **`MapDef.props`** (`MapPropDef`): NPCs posed on a map as scenery, playing their own animation
  on the sim's clock, drawn by `GameView.drawProp` and never in the sim. For what a loc can't be,
  such as a person standing guard (Vardhelm's two knights at the keep's door). They're baked as
  the map's travelled to (`GameAssets.loadProps`), each NPC once, with what every map plays on
  it, as the slim cache keeps them (with the pets): a model has one key, whichever map baked it.
- **`MapDef.cinematic`** (`CinematicDef`): an opening cinematic, played as a run starts on the
  map (`GameClient.enterRun`), not on a retry (`startRun(mapId, false)`). It's data: a `cast` of
  NPCs posed like props (`CinematicActorDef`; `prop` stands one in for a map prop while it plays,
  so a prop can act and go back to standing), `cues` at seconds in (a seq played once or looped,
  overhead chat, a spot animation on someone, a sound, gone), and the camera's `shots`, the last
  of which is `{ player: true }`, the run's own camera. `client/Cinematic.ts` works out
  everything from the def and a clock: the camera's a monotone cubic through the shots per
  channel (target, height, pitch, yaw, distance), so it never overshoots one, with `hold` easing
  to a stop, and turns the short way round from one shot's yaw to the next; `CinematicPlayer` is
  the clock, which `GameClient.updateCinematic` moves on (100 ms
  a frame at most) and plays the cues' sounds from. `client/CinematicView.ts` draws the cast,
  their spot animations, overhead chat and the bars, and `GameView` hides the props it stands in
  for. The cast is baked with the props (`getPropRequests`, so the slim cache keeps them), its
  spot animations and sounds with the game's.
    - It's view only, on each player's own clock, and never in the sim or its hashes, so co-op
      can't fall out of step over it. Input's held while it plays: any key or controller button
      (`GameClient.pressKey`) or a click or tap on the run screen (`.ui-cinematic`) skips it, and
      does nothing else; the HUD and touch controls are hidden. A solo run doesn't step until the
      last shot begins (`CinematicPlayer.holdsRun`); in co-op the run goes on with the player
      standing still (`updateCoop` sends no movement).
    - Nothing pops in as it flies: `getCinematicSquares` follows the camera's path (every
      quarter second, rays through the screen's middle, corners and edges, wide enough for a
      phone, to the ground or the render distance, with a margin) for the map squares it will
      see, and `GameClient.preloadCinematic` pins them (`MapManager.setPinned`: loaded wherever
      the camera is, never unloaded) and keeps the loading screen up until they're in
      (`getPinnedProgress`, 45 s at most). A key, button, click or tap there skips the wait and
      the cinematic both. In co-op a guest tells the host it's loaded only then
      (`cinematicLoaded`), and the host doesn't step until its own are in, so the run starts with
      everyone watching (the host waits 20 s at most for a guest, as for its map). They're
      unpinned as it ends or is skipped, and stream as usual from there.
    - `CinematicActorDef.head` is where an actor's overhead chat sits, when the top of its model
      isn't its head. `MapDef.spawnFacing` turns the player as the run starts (south if it's left
      out), to face the way the cinematic's camera ends looking.
    - **A phone has to draw every shot.** A camera low and level sees much further than the play
      camera, and a city costs far more than a phone's 69k triangles. Vardhelm's close shots look
      down at a pitch of 240 to 320, so the city beyond stays out of the picture, and its flight
      starts 14 tiles out over the city and pulls back to the play camera's 18 once past it. With
      those, its shots come to 19k to 65k at 844 by 390, but one at 93k, over ground the play
      camera sees at 94k. With its close shots near level, they were up to 309k.
    - To watch one on the dev server: `game.selectMap("scaperune_vardhelm"); game.startRun()`. To
      hold a frame, from the console: `game.cinematic.held = true; game.cinematic.seconds = 12`,
      then `await frameProbe.sample(5)` for its triangles. The page reloads if a source file
      changes, which ends it.
    - **Not only openings.** A fight in parts gives each part its own (`MapDef.stages`'
      `cinematic`), played in place of the map's as that part's run starts, and not on a retry
      (`getRunCinematic`; `getMapCinematics` lists every one a map has, for what bakes and loads
      them). Beneath Cursed Sands' four bosses each have an entrance
      (`scaperune/maps/cursedSandsEntrances.ts`): the boss stands where it rises and says its
      piece, and its stand-in goes as the run starts (the last shot's start), with the boss's own
      intro rising there, so it's never there twice.
    - **In the dark.** On a map with `lighting`, a cast member's `light` (`CinematicActorDef`) is
      on them while they're drawn, and a spot animation in `SPOT_LIGHTS` lights them while it
      plays (`CinematicView.getLights`, offered to `SceneLights` as `KIND_CINEMATIC`).

### Raids

The Tombs of Amascut (on the Raids tab, behind its quest, Beneath Cursed Sands): its plan, and how
it was built, are in `docs/design/tombs-of-amascut.md`. Its map is `MapDef.tombs` (a Nexus with a
door to each path), and its invocations (`content/invocations.ts`) take hard mode's place there:
the sim's `hardScale` is their raid level's (`getRaidLevelScale`, `RAID_LEVEL_SCALE`), and `hard`
stays off.

`MapDef.raid` makes a map a raid: rooms in `content/raids.ts`, each with its waves, its boss and
where things are. `Sim.stepRaid` runs them: a room's waves until its boss is due, then the party's
moved into its boss room (`startRaidBoss`, `moveParty`), and once the boss is down the room's scored
(`scoreRaidRoom`), each player gets the supply chest (`openNextRaidShop`, an event offer paid in
raid points) and the next room starts. The last room's boss is the final boss, and its chest
(`openRaidChest`) goes on the result. Raid wins are kept by the save like a campaign map's; hard
opens after one, endless never does, and expert mode (`SimOptions.expert`, solo only for now) after
a hard one. Expert's chest gives one of Lil' Zik's looks every time (`isEveryTimeTrophy`), one the
player hasn't found while there's one left, so it goes by the looks in their save
(`SimOptions.trophiesFound`, from `getEveryTimeTrophiesFound`). A co-op player's already go in
their `Loadout` as `trophies`, which the relays pass as they are, ready for when rooms carry expert.
A hall's teleporter (`stepTeleporter`) asks before skipping to its boss,
`SimOptions.raidTeleports` times a raid, in the halls `SimOptions.raidPortals` says
(`getRaidPortals`: rooms whose boss the save has a kill of, in any form). The game draws the portal
(`raidTeleporter`), as it isn't in the map. A room runs on a clock of its own, from
`raidRoomStartTick` (what its waves and events go by), and its boss comes at `raidBossDueTick`: the
gap between its `RaidRoomDef.at` and the last room's later, or at once when the portal's taken. So a
quick kill or a portal never lengthens the next room, and a slow boss never shortens it. Enemies'
hitpoints and damage, and caskets, go by `paceSeconds`: where the room would be in the run with no
boss time before it, so a long fight doesn't make later rooms tougher either. A room's waves
(`roomWaves`) keep Lumbridge's pace for where it is in the raid; the Nylocas hall's are scaled by
`NYLOCAS_HALL_CROWD` (spawn rate, the numbers alive and its ring), as most of its Nylocas shoot and
at the full pace it cost a player far more than the halls either side. The hall gives fewer kills
for it, and so less experience before Sotetseg's. Raid bosses' hits are
lightened to match a faster `attackInterval` (`oftener` in `theatre.ts`), and their bullets can hit
again after `BULLET_GRACE` rather than a second. The Maiden, the first boss, is the exception: her
hits are scaled down by `MAIDEN_HIT_SCALE`, and her `bulletGrace` is a full second. Every one has an
attack for whoever's within `CLOSE_REACH` (a swing round it, or a `slam`: a ground mark under it),
and `oftener` gives those `CLOSE_WEIGHT`. Their patterns don't set `BulletPatternDef.from`, so
there's no safe spot on them. `CLOSE_REACH` is past the longest melee reach (the scythe's), and the
slams are as wide, so there's no ring round a still boss to hit it from untouched. Each has
something for a player keeping away too: a closing ring, a leap (`minRange`) or ground marks on
them. A closing ring stands where it formed for `RING_HOLD` (`BulletPatternDef.hold`, a bullet's
`wait` in `BulletPool`) before it comes in, hurting whoever walks into it meanwhile, and as long
on hard and expert. Only a closing ring can take a `hold` (a test checks). Each boss has
a mechanic of its own that makes the fight longer by making it harder, not by more hitpoints: the
Maiden's healers (`summonsAt` with `nylocas_matomenos_healer`), the Bloat's
naps, Nylocas Vasilias's colours on normal (`colours.offStyle`: the other styles do that share, with
the prayer on top for missiles and magic; its own gets through the prayer for `ownStyle`),
Sotetseg's `shadowRealm`, Xarpus's `exhumes` and Verzik's `yellows` (all run by `stepOrdeal`, an
exhumed by `stepExhumed`). The raid's six Nylocas are copies (`RAID_NYLOCAS`, `tob_` ids), slower
by `RAID_NYLOCAS_SPEED`, the green and blue ones shooting, so Morytania's play as they did;
`raidVersion` swaps them in for whatever a raid boss calls. A summon that doesn't fit `distance`
out (a wall) comes on nearer the boss, so the Maiden's healers all come. A room's speed points go
by its `par`, the seconds its fight's tuned to take (all of them within it, none by `SLOW_PAR`
times it). On expert, a weapon's targeting skips an enemy of
another style (`nearestEnemies` takes the weapon's style: thralls, the cannon and power-ups pass
none and go for any), and `wrongStyle` stops its hits and venom, a venom tick included once Vasilias
turns (needing all three styles is the design, as in OSRS); a ground spot with `awayFrom` falls back
to the walkable try furthest from the boss, never off the map; an ordeal waits while its boss's
expert projectile is in the air, the boss shielded meanwhile so the wait can't take it past a phase,
and throwing no more of expert's own; and a stare is shown `BossDef.stare.warning` before it turns
(`STARE_WARNING_SECONDS` unless set): the boss faces where it'll stare, and the notice names the
side. Armour takes at most `ARMOR_CAP` of their hits (`BossDef.armorCap`, looked up in
`damagePlayer`, so it holds for a stomp, a pool or a stare too; a ground mark keeps its boss's id
for once it's gone). On hard and expert, patterns fire `MapDef.hard.bullets` times their bullets
(`Sim.bulletScale`) with the space between them as wide: a ring's gap is an angle and keeps its
width, a wall's or closing ring's gap grows with the count, a spread fans out wider, and a ring or
spiral with no gap keeps its count. Their hitpoints (each room's `bossHp`) are tuned to players'
clears, not the bot's: it often dies to the Maiden. It makes for a closing ring's way out only
with `DODGE=1` (`cageGap`), so sim a change to the rings with that.

`?raidtest` (dev server only) gives each of a raid's rooms two minutes of waves and every level
up's pick at its max; `?raidtest=short` does only the first.

### A floor that fights back (prototype)

`MapDef.floor` (`FloorDef`) makes a rectangle of the floor move: slabs rise under the player in
waves, and tiles fall away. It's a prototype of the Wardens' third phase in the Tombs of Amascut, on
one dev map, `scaperune_wardens_floor` (Dev maps on the dev server: the real room, cut from the
cache by `scaperune/maps/wardensFloor.ts`, its script in `content/wardensFloor.ts`).

- `core/ArenaFloor.ts` runs the script: each pattern works out every tile's warning and rise (or
  fall) when it starts, into per-tile arrays the client draws from. `Sim.stepFloor` hurts whoever's
  middle is on a tile while its slab's up, and a tile that's fallen puts whoever was on it on the
  nearest tile that isn't going (`Hero.drag`, frozen meanwhile), hurt.
- A fallen tile is blocked floor on the grid (`ArenaGrid.dropTile`): `Steps` is worked out again
  round it and `ArenaGrid.version` goes up, so each hero's flow field is worked out again too.
  Flying enemies cross holes. Grids are kept between runs, so `ArenaFloor` puts every tile back as
  a run starts.
- `client/FloorView.ts` draws every tile as the rising slab's model (spotanim 2220) at rest, over the
  hidden floor, so each can move on its own and a fallen one opens onto the pit under it. The
  warnings are the tiles' own movement and the light under them: a tremor (rattling up off its
  bed and twisting) before a rise, the same tremor with a sag and a darkening before a fall, and
  under each such tile the floor's gold light (`FloorDef.glow`), which shows only through the
  seams the tremor opens and grows as the moment nears. It's the slab again just under the tile,
  drawn with a negative `flash`, which `actor.vert.glsl` takes as a glow in the tint's colour.
  The cache's rising slabs (2220 to 2223, seqs 9697 to 9700) are the rise itself, tipped three
  ways (2223 moves as 2221 does), and there's no tremor among them, so it's in code. Hits are a share of the player's hitpoints, so any
  adventurer can try it.
- What it throws up (`FloorDef.effects`) is drawn from the floor's arrays and the clock alone, with
  no state: dust as slabs rise, grit falling off a tile about to go, and chips and dust with a
  falling tile. Each is on a share of the tiles, to keep a phone's triangles down. A tile beside a
  hole has its thickness drawn under it (the slab again, lower and darker each time), so every
  hole, one tile or most of the floor, has the same cut edge going down into the dark. Under the
  floor (`FloorDef.under`) is one structure on a grid symmetric about the floor's middle: the
  Tombs' gold-banded pillars every six tiles both ways, beams between them, the engraved wall
  going down round the floor's edge, and a dim amber glow far below. Only what's within a few
  tiles of a hole is drawn.
  `FloorDef.shake` has the sim shake the camera (`bossImpact`) for a slab beside a player or a
  tile going near one, which Settings can turn off.
- The pit is terrain, so it moves under the floor as the camera does: the floor's tiles are a
  bridge (`TILE_BRIDGE` on level 1) nine tiles over a pit with no floor and nothing of the map's in it, and the
  player walks the deck (`ArenaGrid.getHeight`'s bridge heights).
- What else a floor can do is all optional on `FloorDef` (the map-making guide, "Floors that fight
  back"): tile effects (`Sim.stepFloorEffects`, and `PlayerMovement`'s `floor` rule for haste, slow
  and ice), tiles that rebuild, pressure plates and actions (`ArenaFloor.act`, `Sim.floorAct`,
  `BossAttackDef.floor`), phases, raised tiles and ramps (`ArenaGrid.addLedge`, `ArenaFloor.liftAt`,
  which `GameView` stands actors on), and pillars that stop shots and sight (`ArenaFloor.blocksSight`).
- Two renderer pieces are the floor's. `ActorDrawOptions.early` draws an actor before the
  silhouettes (`ActorRenderer.renderEarly`), so the player shows through a floor's pillars and
  raised tiles as through walls. `ModelBakeRequest.topOnly` bakes a model's upward faces near its top
  alone: a tile at rest among others is drawn as that. `window.floorWholeTiles = true` (dev) draws
  them whole, to compare.
- The floor preview, `?floorpreview` on the dev server (`ui/FloorPreview.tsx`, checks in
  `core/floorLint.ts`), draws a floor flat and plays its script on a timeline.

### Pets

A pet (`content/pets.ts`) is a trophy with a follower NPC, taken along as `SaveData.pet`. The sim
never sees one: `client/PetFollowers.ts` walks each player's pet on the sim's ticks, from
`GameClient.update`, and `GameView` only draws it (on the menus, `GameClient.submitActors` stands
it beside the character). So a pet can't change a run, and co-op's copies agree without it.

- **Where it goes:** just behind its player as they're drawn, which for a co-op guest's own hero
  is the predicted pose (`view.localPlayerPose`), ahead of the sim. It keeps clear of thralls, walks
  with the map's collision, and stands still when a wall keeps it from its spot, rather than
  walking on the spot. Past `PET_LEASH` it's put back beside its player, moved out from where they
  stand so it's never put in a wall.
- **Its speed** is its player's (`walkSpeed` in `core/PlayerMovement.ts`, sled and boots and all)
  and a bit more. `walkToward` there is the step it shares with thralls.
- **Co-op:** a player's pet goes in their `Loadout` as `pet`, which the relays pass on whole, so it
  needed no relay change. A pet id a game doesn't know is left out.
- **Baking:** most players haven't found one, so pets aren't in `getBaseRequests`.
  `GameAssets.getPet` bakes one the first time it's drawn, and `travelTo` bakes the party's with
  the map. `slim-cache.ts` keeps every one (`getPetRequests`).
- **The Pet row** (`PetRow`, under the adventurers) is one line on a phone held sideways, its name
  hidden and its tiles swiped, so the adventurers above it keep their room.
- **A new pet** needs a trophy that drops it and an entry in `PETS` with the follower NPC's id and
  animations. The cache has two NPCs for each pet: `scripts/cache/find-npcs.ts` marks the one
  that's the follower (it's the one with the Metamorphosis option). The other one looks different
  for some pets.

### What gets drawn

A map square is 64 tiles a side and the camera sees a small part of one, so the game's squares are
baked into cells of 8 tiles (32 without `WEBGL_multi_draw`, where each one is a real draw call).
`CullGrid` gives each cell a bounding box of what's really in it: terrain goes in by tile, merged
models by triangle, and instanced models and animated locs by where they stand. Anything wider
than a cell gets a box of its own, so it can't stretch its cell's box over the rest. A frame tests
the boxes against the camera's frustum and leaves the rest out of the multi draw with a count of
0: `gl_DrawID` picks a draw's data, so the list has to stay in order. This holds at any camera
angle, because a box holds everything in it, whatever's looking at it. `SdMapLoaderInput.cullCellSize`
turns it on; those squares have no LOD or interact draws, which the viewer needs and the game
doesn't. The boxes follow what `main.vert.glsl` does to a vertex (`CullGrid.addInstance`), so a change
to where the shader puts things needs one there too. `render-stats.ts --cull=8` checks it.

Actors are culled as spheres in `ActorRenderer.draw`, by `ActorModel.reach`: the furthest any vertex
gets from the model's origin in any frame of any animation, so bosses' big swings count. Without
`WEBGL_multi_draw` (Safari, Firefox) every draw is a real draw call, so `InstanceList.sortByFrame`
puts the actors on the same frame of the same animation together and each run of them is one
instanced draw: a crowd of one enemy is a few draws, not hundreds. The shader finds an actor's data
by `DRAW_ID + gl_InstanceID`.

Map squares keep only the world that can be seen. Past the play area the world fades into the sky
over 6 tiles (`PLAY_AREA_FADE` in `fog.glsl`), and a ray from the camera only gets further from the
play area once it's left it, so what's past the fade and further out than the camera can get is
never in front of anything but the sky. `GameWebGLRenderer.setPlayArea` works that keep area out
from `CAMERA_REACH` in `GameClient` (a run's camera can be 15 tiles south of the player, zoomed all
the way out; the title screen's circles closer in). The worker leaves out terrain, scenery and
animated scenery wholly outside it (`SdMapLoaderInput.keepArea`), and `MapManager` doesn't load a
square that's all outside. Collision doesn't come from these squares (it's `RegionDataLoader`'s),
so it isn't touched. If the camera's
pitch or zoom changes, `CAMERA_REACH` has to follow it, or the hole where something was left out
can show.

The game has no hover menus, multisampling or FXAA, so its frames are drawn straight to the canvas
(`drawsToCanvas`), with no framebuffer of their own and no screen quad to copy them across. The
canvas has `alpha: false`: the page behind it is black, so there's nothing to blend it with. The
map viewer keeps its framebuffer, for its hover menus. A script that reads a frame back reads the
canvas, in the same task as the frame (there's no `preserveDrawingBuffer`).

Enemies are baked when a run starts, for that map (`getMapEnemies`, `GameAssets.loadEnemies`), in
place of the last map's: they're most of the actors' memory, and a map uses few of them. It goes by
the enemy ids it finds in the map's waves, events and bosses, and in those enemies, so a new way for
an enemy to bring on another needs nothing added. An enemy that isn't baked anyway (the console's
`spawnBoss`) gets baked when it's first drawn, and shows up a moment later. The last map's enemies
stay on the menus, so playing it again starts at once; a run on another map drops them before
its own bake starts, so the two lots are never in memory together.

Enemies that would bake the same model are baked once (`GameAssets.mergeRequests`): the same NPC
with the same first animation (Nex's four phases), the same outfit, the same scenery. The merged
model has all of their animations, and the other enemies' keys point to it. A request's body is
everything its bake reads (`getRequestBody`), so a new field on a bake request goes in there too.

A bake is cut into small tasks (`getBakeTasks`: an NPC or player model each, the spot animations,
items and scenery a batch at a time), and each goes on the GPU as it lands, as a page of its own.
Baking a map's worth in one go per worker held all of it in the main thread at once, a spike of
hundreds of MB at the start of a run on the big maps, the likeliest moment for a phone to lose the
tab. The worker sends buffers cut to their length, not the doubled ones it grew.

A player is baked with the swings of the weapons they hold (`getRunAttackSeqs`) rather than every
weapon's, so a new weapon re-bakes them (it changes their `appearanceVersion`). Until it lands
the old model draws, and a swing it hasn't got shows the stance's animation instead. So that a
weapon picked swings at once, a level-up that offers a weapon re-bakes the look with its swings
as soon as it's offered (`getOfferedAttackSeqs`), and a look that has the swings asked for and
more isn't baked again: the ones not picked go at the next re-bake. The menus' look has the
starting weapon's swings (`setCharacterLook`), so a solo run starts with it baked.
`getPlayerAttackSeqs` is every weapon's, for the slim cache.

A weapon with a `runPose` (the Armadyl crossbow) shows each shot on the move too: the upper body
takes that one frame of its swing, its aim, for a moment (`RUN_POSE_TICKS`) after each shot, while
the legs go on with the run. It's baked over each of the stance's run frames
(`PlayerBakeRequest.runPoses`, from `getHeldRunPoses`) and played on the run's timing
(`getRunPoseFrame`), so the legs never jump however often it fires (faster with Tome of fire, and a
swing starts again at every attack). One frame over the run is the run's few frames more per
player. The whole swing over the run cost its frames times the run's, about three times a player's
look for the armadyl ranger, and baking it as one timeline instead, the run from the swing's
start, made the legs jump back to the start of a stride at every shot. Only the weapon in hand
gets it. While the player moves, the sim records a swing (`player.attackSeq`, `attackStart`) only
from the weapon in hand, and only if it has a run pose, so another weapon can't cut it short and
nothing else changes: any other swing on the move still goes unrecorded, as one would otherwise
play its end when the player stops. Standing still, every weapon's shows. It's display only, and
in no hash. The look's weapon (`getHeldRunPoses`) and the sim's (`Sim.getHeldWeapon`) agree as
long as nothing else is worn in the weapon slot, which a test in `GameAssets.test.ts` checks. The
cache's attacks have no interleave order of their own (it's what the client uses to play an action
over a walk), so they borrow eating's (`PLAYER_INTERLEAVE_SEQ`), which lists the groups the walk
keeps: the legs and the body's root. A skeletal swing or stance, or any run frame that can't be put
together that way, means no pose is baked and the run shows, and so does an interleave order gone
from the cache (the swing would take the legs too).

A baked animation is a posed copy of the model per frame, so what an enemy costs is its triangles
times its frames. A skeletal animation (the Colosseum's bosses, the gryphon, the naguas) has a pose
for every client tick, and baking each one made Varlamore's enemies several times any other map's,
too much for a phone. `ActorBakeLoader` samples those every `SKELETAL_TICK_STEP` ticks instead.

Indices are 16-bit, which halves the index buffer, about a quarter of a bake. WebGL2 has no base
vertex for a draw, so `ActorBakeSegments` cuts a bake's vertices into segments of up to 65,536,
never splits a frame between two (and an animation only if it doesn't fit in one), and counts each
frame's indices from its segment's first vertex. Each segment is drawn with a vertex array that
starts there (`ActorSegment`), so a page is a draw per segment that has something on screen. A
model with more vertices in one frame than that has its whole bake fall back to 32-bit.
`render-stats.ts --bake` shows each map's total and the heaviest actors, so a new boss can be
checked against the other maps before a phone finds it.

The overlay draws each hitsplat (its kind, number and size) once and copies it after, and the
projectile glows likewise: text and gradients are the slowest things on a 2D canvas, and a big
fight has a hundred splats. The effects it prunes each frame are pruned in place, and the enemies
reuse one options object, to keep a phone's garbage collector quiet.

Power-ups on the ground have a countdown pie over them, like RuneLite's
(`GameView.drawPickupTimers`): it drains clockwise, from green to orange at half the power-up's
time and red at a quarter. It goes by the sim's ticks, so it stops with the run, and it's gone
once a drop is attracted (those never expire) or the run's over. From the play camera's height a
flat item reaches further up the screen than its height does, so the pie sits over the furthest
the item reaches as it turns, not over its top. The Power-up timers setting
(`DisplaySettings.pickupTimers`, in Settings and the pause menu, on by default) turns it off;
`GameClient` hands it to the view each frame.

`window.frameProbe` (dev only) counts what a frame sends to the GPU, at the GL calls:
`await frameProbe.sample(60)` gives triangles, draws and CPU time, split into world and actors.

### Lights

Any map can have lights (`MapDef.lighting`, a `LightingDef`), and a map without them pays nothing:
its programs are built without them (`LIGHTS` in the shaders) and its sim never makes one. Three
things are separate, each optional:

- **Lights**: anything can give off light, each a `LightLook` (radius in tiles, colour as
  `0xRRGGBB`, intensity, and drawn-only `flicker` and `pulse`).
- **How bright the rest is**: `ambient` (1, as the map always is, when unset; about 0.2 is the
  dark) and `ambientColor`. It can change over a run: `sim.dimTo(level, seconds)` from anything in
  the sim, or a boss phase's `light` (`BossPhasesDef`), which goes back to the map's own as the boss
  falls.
- **The rule**: `litTargetsOnly` (the Scar's). Weapons only pick targets within half a tile of a sim
  light's edge (`nearestEnemies`, which every weapon, thrall, cannon and power-up aims with), and
  the minimap only shows what's lit. Shots carry on and hit whatever they meet, and a chain's
  hops go to what's near, lit or not. Each enemy's lit or not is worked out once a tick, in
  `stepLights` (`Enemy.lit`, read through `isEnemyLit`). The balance bot
  only walks at what's lit, and faint arrows show what's coming out of the dark. A dark map without
  it is only dark; a lit one with glowing lights is cheap.

**Sim lights and drawn lights.** Lights that can matter to play are made by the sim each tick
(`Sim.stepLights`, after the enemies move, before the weapons fire) from squared distances only, so
every co-op copy has the same ones: each player's, the map's own, what enemies carry and what they
leave. Everything else is only drawn (`client/SceneLights.ts`), and never touches the sim or its
hashes: glowing scenery, spells and effects, a floor's tiles, bosses' windups and marks, and
flicker and pulse on any light.

**Drawing them.** Every frame `SceneLights` offers every light there is to `LightBudget`, which
keeps the `MAX_SHOWN_LIGHTS` that tell most: the shown player's own, then the brightest and
biggest for how near the middle of the view each is. A light coming in fades in and one leaving fades
out (a quarter of a second), so a map can have any number and none pops. Those are added into a
light map on the CPU (`render/LightMap.ts`: two texels a tile, 64 tiles round the view, its corner
moving a whole texel at a time so the light doesn't swim), and the shaders read it once a pixel
(`lights.glsl`): its colour times the ambient plus the light there, with a faint haze of the light's
colour added. So a pixel costs the same however many lights there are. `GameWebGLRenderer.setLighting`
changes the programs over as a run starts (the first time, it builds the lit set and the light
map's texture; changing over loads the map squares again and remakes the actors' draw calls).

**Drawn at full brightness** (`ActorDrawOptions.unlit`): projectiles, spot animations, power-ups and
caskets on the ground, power-ups' effects, bosses' hazards and everything the boss fight's view draws
(`ActorRenderer.unlitAtLeast`). A hit's flash shows too. The overlay (hitsplats, health bars,
windups, loot beams) was never lit.

**How to add a light**, by what gives it off:

- **A map's own, that stays put** (a sim light):
  `lighting: { lights: [{ x: 2003.5, y: 6370.5, radius: 3, color: 0xff9a4a, flicker: 0.15 }] }`
- **Scenery that glows** (drawn only), every loc of these ids on the map, found as the map's
  collision is built (`RegionDataInput.glowLocs`):
  `lighting: { locs: { 43475: { radius: 3.5, color: 0xff9a4a, intensity: 0.9, flicker: 0.3 } } }`.
  A fire that weapons should aim by goes in `lights` too.
- **Each player's**: `lighting: { player: { radius: 5, color: WARM_LIGHT, intensity: 0.95 } }`.
- **A power-up**: `effect: { kind: "light", bonus: 4, seconds: 30, fade: 5 }` adds to the player's
  light, or is a light of its own that big where players have none (the Abyssal lantern,
  `LANTERN_ID`, drops at a map's `lanternWeight`, and lies at its `lanterns` from the start).
- **An enemy or boss** (a sim light): `light: { radius: 2.5, color: 0xc8ffb0, left: { radius: 4, seconds: 20 } }`
  on its `EnemyDef`; `left` stays where it died.
- **A spell, projectile or effect** (drawn only), by spot animation id in `SPOT_LIGHTS`
  (`content/lights.ts`): `[100, { radius: 2.5, color: 0xff8a3a, intensity: 0.9, flicker: 0.25 }]`.
- **A floor's tiles** (drawn only), by their effect in `FLOOR_LIGHTS`:
  `burn: { radius: 2, color: 0xff6a1a, intensity: 0.7 }`.
- **A boss's attack**: `light: { radius: 2, color: 0xff3030 }` on the `BossAttackDef` glows on
  each spot as it winds up, growing as the hit comes; on a `GroundPatternDef`, on each mark while
  it's down. `look: { exposedLight: { radius: 3, color: 0xffe08a, pulse: { amount: 0.3, seconds: 1 } } }`
  on a boss lights it while its guard's down (a core exposed).
- **The scene getting darker**: `phases: [{ ... }, { ..., light: 0.1 }]` on a boss, or
  `sim.dimTo(0.1, 2)` and back with `sim.dimTo(sim.baseAmbient, 2)`.

`scaperune_dark` is a dark map with the rule, fires and lanterns; `scaperune_glow` is a map at its
usual brightness with glowing scenery, a blue light of its own and the wizard's fire spells.

**Cost**: only a map with `lighting` pays, and it pays about the same however many lights it has:
one texture read a pixel, and the light map's few thousand texels on the CPU. In the headless
renderer, a lit map's programs took about a tenth longer a frame than the same view without them,
with no lights or the most it draws, and Lumbridge itself, without lighting, took as long as
before there were lights. A real phone hasn't been measured.
Nothing past the lights is culled: the dark has to read as shapes, so a dark map draws as
many triangles as a lit one.

Combat sounds are picked by the server, not the cache, so the ids in `content/` come from the OSRS
Wiki's [list of in-game sound IDs](https://oldschool.runescape.wiki/w/List_of_in-game_sound_IDs).
A sound's samples are let go once it's first played and its `AudioBuffer` holds them
(`GameAudio.getBuffer`), so each sound is only in memory once.

### Keeping it light on a phone

- **Frame cap**: `GameClient.update` sets `Renderer.fpsLimit` every frame from the Frame rate
  setting (`DisplaySettings.frameRate`, in Settings and the pause menu), through `frameCap`. Auto,
  the default and what older saved settings get, is 60 on a touch screen (90 and 120 Hz phones
  would draw twice as often for a sim that ticks 50 times a second) and no cap on a desktop; 30,
  60 and Unlimited are what they say. On the title screen and behind a solo run's menus (level up,
  casket, random event, pause, results), where only the scenery moves, it's 30 at most whatever
  the setting. Co-op isn't capped behind its menus, as its run goes on. The limiter keeps to a
  schedule rather than a gap since the last frame, so a 90 Hz screen capped at 60 draws two frames
  in three (`Renderer.test.ts`).
- **Lost graphics**: a phone can take the WebGL context away (short of memory, or the game in the
  background). `GameApp` calls `preventDefault`, pauses a solo run (`GameClient.onGraphicsLost`),
  stops drawing (`GameWebGLRenderer.contextLost`; a co-op run still steps for the others) and
  shows a Reload button, which ends the run as the pause menu's quit does, so its coins and quests
  are kept. There's no restore: everything on the GPU (programs, the texture array, map squares,
  the actor bakes, which aren't kept in JS) would have to be made again on the new context, which
  means `WebGLMapViewerRenderer.init` again, `clearMaps`, and baking every actor again. To try it,
  `game.renderer.app.gl.getExtension("WEBGL_lose_context").loseContext()`.
- **The HUD** is updated 10 times a second, in two parts. `UiSnapshot.hud` (`HudView`) is what the
  hero has (slots, gear, inventory), which changes with a level up or a casket. `HudNumbers` is
  what changes as the run's played (hitpoints, xp, the clock, damage, buffs, the boss bar, quest
  progress), in a store of its own (`GameStore.subscribeNumbers`): the UI's root doesn't see it,
  and each part reads only its own number with `useHudNumber`. `shareUnchanged` keeps whatever
  hasn't changed the same object, so the `memo`'d parts skip drawing, and nothing is told at all
  when nothing's changed. Something new that changes often goes in `HudNumbers`, and its numbers
  are rounded as they're shown (whole seconds), so they don't change when nothing on screen does.
  The bars fill with `transform: scaleX`, not `width`, which would lay the page out again.
  `BuffView` leaves out both timer fields for an effect with no timer: the focused hero's revives
  left. The sim counts revives as one number (`revivesLeft`), so `getRevivesLeft` in
  `ItemViews.ts` splits it for showing: an adventurer's own (`CharacterDef.reviveLook`, the
  Pyromancer's phoenix) is used first, then the shop's Ring of life (its `objId`). The "saves you"
  toast names the one used (`getUsedRevive`).
- **The minimap** redraws 30 times a second at most, leaves out enemies off it, and draws its
  dots a colour at a time.
- **The casket's rays** have their fade drawn into them (an SVG gradient), not a `mask-image`, which
  makes the browser draw the turning rays again offscreen every frame. They slow to a stop, and the
  glow, float and shimmer stop after a few goes. A phone gets one set of rays and no shimmer.
- **The bundle**: `WebGLMapViewerRenderer` is the game's renderer's base class, so anything it
  imports is in the game's bundle. leva comes in only through the viewer's controls
  (`getControls(folder)`), and the render worker loads jszip only for the viewer's exports.

### Scripts

Run `bun run cards 2415 --preview` to render a cache item as a collectible card with a looping
gold foil preview. The [card generator guide](../scripts/cards/README.md) covers the TypeScript
API, matte and foil finishes, the vampire back and numbered decks.

All run from the repository root with `bun run tsx`:

```
scripts/cache/validate-decoders.ts       decode every type the game uses; fails on new opcodes
scripts/cache/find-npcs.ts goblin        NPC ids, levels and idle/walk animations by name
scripts/cache/find-objs.ts "rune .*"     item ids, wear slots and worn models
scripts/cache/check-items.ts             every casket item's id is the item it's named after
scripts/cache/check-fun-outfits.ts       every item the fun maps' players wear is the one named, in its slot
scripts/cache/find-locs.ts multicannon   scenery ids
scripts/cache/find-npc-seqs.ts 655 1173  animations built on an NPC's skeleton
scripts/cache/classify-npc-seqs.ts 655 6182 6183 6184   tell attack and death animations apart
scripts/cache/dump-idk.ts                player body kits
scripts/cache/dump-config.ts 13 92       raw bytes of a config entry, for working out new opcodes
scripts/cache/compare-caches.ts osrs-241_2026-09-30   what changed since an older cache, in what the
                                         game reads (see A newer cache)
scripts/cache/sounds.ts wav out 2266     write sound effects to .wav (also validate, seqs, info)
scripts/cache/sprites.ts png out 940-950   interface sprites to .png, to find one (and check, for the game's)
scripts/cache/sprite-sheet.ts out.png 5000 5199   a range of sprites on one sheet, each over its id
scripts/cache/spotanims.ts 2242 2236-2240   spot animations: model, animation, length and size
scripts/cache/slim-cache.ts [out dir]    the slim cache for hosting (bun run slim-cache;
                                         SLIM_WORKERS, SLIM_CHECK, SLIM_REUSE: see Hosting)
scripts/scaperune/find-prefabs.ts 50 50  a map square as text, to pick prefabs and survey ground
scripts/scaperune/preview.ts out.png seed=7 biome=snow    a ScapeRune map from above, and its reachability
scripts/scaperune/relief.ts out.png preset=Alpine        a generated map's height, in seconds, without the cache
scripts/scaperune/check-maps.ts          generated maps: every open tile reaches the spawn, roads off bridges, slopes,
                                         road grades, plots, what the camera can see, banned locs, clashes with a
                                         town's walls, gates, roads and fences, and how a map looks against the real
                                         world's numbers (ONLY=regex for some of them)
scripts/scaperune/grid-hash.ts halloween a hash of what a recipe writes, to prove a shipped map hasn't moved
                                         (CHECK=1 holds every shipped map to its pinned hash)
scripts/scaperune/research/              measures real places and made maps the same way
scripts/scaperune/check-prefabs.ts       every prefab, in every rotation: its whole floor, a way out
scripts/scaperune/check-palette.ts       the palette map reads all that generated maps read
scripts/game/simulate-run.ts [character] [seeds]        a bot plays full runs, for balancing
                                                        (MAP=barrows for another map,
                                                        META=max ARMOURY=max for everything
                                                        bought; uses a collision snapshot per
                                                        map in caches/collision, built on the
                                                        first run; FINAL_BOSS=the_nightmare
                                                        BOSS_ARENA=48 tries a phased boss on any
                                                        map, FRESH=1 straight at it, SAFE_WAVES=1
                                                        with what a run earned, FLAT=1 with no
                                                        walls, DODGE=1 dodging a boss's attacks,
                                                        PARTY=4 a co-op party of that adventurer;
                                                        GOD=1 untouchable and FUNNEL=1 all into
                                                        its best weapon, with ENDLESS=1, to see
                                                        how damage keeps up with the rounds)
scripts/game/simulate-tombs.ts [character] [seeds]      the Tombs of Amascut's bot (tombsBot.ts)
                                                        on one room, boss or the whole raid
                                                        (ROOM=apmeken, het, scabaras,
                                                        crondis, baba, akkha, kephri, zebak,
                                                        wardens or raid; LEVEL=2 the path level;
                                                        INVOCATIONS=a,b, all or level:300;
                                                        PARTY=2; KIT=max the dev kit; PATHS=het,
                                                        apmeken the order; LEADIN=0 straight
                                                        there at level one; MINUTES; VERBOSE=1),
                                                        with each puzzle room's own account
scripts/game/sweep-tombs.sh                             simulate-tombs over rooms, raid levels and
                                                        kits (ROOMS, LEVELS, KITS=zero shop all
                                                        dev, CHARACTERS, SEEDS, JOBS), a line each
scripts/dev/icon-test.ts 1321            draw an item icon as ASCII
scripts/dev/render-stats.ts lumbridge    what a map costs to draw, without a browser: triangles,
                                         draw ranges, bytes (--cull=8 checks the culling boxes and
                                         counts what spots draw, --bake is memory per map's actors)
```

Tests: `bun run test`. `.github/workflows/check.yml` runs them with the type check on every pull
request (without the game's cache, so `generator.test.ts` skips its long map check there).

The dev server's file watcher leaves out `.claude/`, where Claude Code keeps its worktrees. Each is
a whole checkout, and watching them all held up the first load after every start by tens of
seconds. Add anything else big that sits inside the checkout to `server.watch.ignored` in
`vite.config.ts` (`node_modules` and `dist` are left out already). A package that only a worker
imports goes in `optimizeDeps.include`, as `threads/worker` and `jszip` do: Vite's startup scan
doesn't follow workers, so it would find the package mid-load and reload the page.

URL flags: `?room=ABCDE` joins a co-op room (the invite link), `?autostart=wizard` starts a run right away, `?stress=300` adds 300 goblins, `?viewer=1`
opens the original map viewer (loaded only then), `?bgtick` (dev only) keeps the game running in a
browser tab that isn't being painted, `?notice` shows the notice even after it's been closed,
`?movementDiagnostics` enables local co-op prediction measurements (see below),
`?raidtest` (dev only) speeds up a raid (see Raids), `?devtools` (dev only) shows the Tombs of
Amascut's testing buttons (god mode, skip to boss, straight to any boss or the Wardens). F3
shows collision and stats.

### A newer cache

The game runs on the one cache `GAME_CACHE_NAME` names (README, Cache version). Moving it on:

1. With no `caches/slim/` (a checked slim-cache run, which step 4 reads), run
   `bun run build && bun run slim-cache` first, on the old cache. A build leaves the dev maps out,
   so for theirs run this on the old cache too:
   `DEV_MAPS=1 SLIM_CHECK=0 bun run tsx scripts/cache/slim-cache.ts caches/slim-dev/`. Then point
   `GAME_CACHE_NAME` at the new cache's folder name (`osrs-<revision>_<date>`, from the archive's
   timestamp) and run `bun run download-caches`, which fetches just that one. Keep the old one in
   `caches/`.
2. `validate-decoders.ts`. A new revision can move or add opcodes: one type failing on opcodes
   that don't make sense (255, 253, 63) means an opcode it knows now carries data. Rev 242 moved
   multilocs from 77 and 92 to 97 and 98, with 3 byte ids. `dump-config.ts` shows the bytes;
   compare an entry with the same one in the old cache. Gate the fix on the revision.
3. `check-items.ts`, `check-fun-outfits.ts` and `sprites.ts check`, and that again with
   `DEV_MAPS=1`: rev 242 renumbered the Tombs of Amascut's invocation sprites, which only a dev
   map used then.
4. `compare-caches.ts <old cache>`. It goes over the groups the slim-cache run in `caches/slim/`
   kept, the ones the game reads: the map squares, models and so on that changed or went, and each
   npc, item, animation, spot animation and loc that changed, decoded, with the fields that differ.
   A type only written a new way doesn't count. Look up the ids that changed in the content; a map
   square that changed in an arena can move its collision. Then for the dev maps:
   `compare-caches.ts <old cache> caches/slim-dev/`.
5. The tests with the cache there. `grid-hash.ts` pins what the ScapeRune maps write, and a map
   that copies the real world's squares can change with them: re-pin it on purpose.
6. A sim sweep of every map on both caches, the same code. The maps whose collision didn't change
   play exactly as before, run for run, so any difference there is a bug; the ones that changed
   reshuffle their seeds, so give those 6.
7. Update the README's table, the changelog, and say in the pull request what changed. A deploy's
   `slim-cache` makes new chunks only where the groups changed, so returning players download
   just those.

The browser's copy of the old full cache goes when the game next loads (`deleteOtherGameCaches`).
So does any other full cache the original map viewer (`?viewer=1`) loaded: the viewer downloads
it again when it's next opened on it.

### Co-op

Co-op runs in lockstep. Every player's browser runs the same `Sim`, built from the same seed and
everyone's loadout (`GameStart`), and only what the players do goes over the network. The host
numbers the ticks (frames) and sends, every frame or two, what happened at each: who changed what
they're pressing (as whole numbers, so every copy moves the same) and who chose what. Guests step
only as far as the host has sent, sending their own input to the host to go in a frame: a change
of move about 15 times a second, sooner for a stop or a key pressed or let go (`CoopRun.setMove`,
below). The host checks what a guest sends (`cleanMove`,
`cleanAction` in `core/lockstep.ts`) before it goes in, since every copy applies it. That only
checks its shape, so whether a player can do it now is the sim's to check: a modified game can
send anything (a downed player can't choose, reroll or skip, as `isChoosing` says). Nothing
waits on a slow guest; they see the run a little behind, and catch up at 8 ms a frame at most.
A decision (a level up, a casket, a random event) is answered once: `CoopRun.act` drops a second
answer to the same one until the host's frame moves it on, or 10 seconds pass, so a double click
can't land on the next decision unseen. Some stay open once answered (a banished reward, a rerolled
casket item, something bought with the rest still for sale), so `CoopRun.decision` gives each a
step that changes with those, and the next answer goes out. Anything else that changes a menu
without closing it needs a step too, or its buttons do nothing for those 10 seconds. An action the
host turns away counts as an answer too, so the client checks what the sim would refuse before
sending it (a reroll with none left, during a hilt choice, or an event's option that's sold or too
dear), or a refused action would hold up the real one.

Auto alch and Auto equip are local `DisplaySettings`, off by default, so never apply them in `Sim`:
`GameClient.autoAnswerChest` sends the casket's usual action through `act`, as a click would, and
Auto alch comes first. Auto equip goes by `Loot.shouldAutoEquip` (the stats as upgraded, none lower
and at least one higher, give or take float rounding), not the rarity-based `shouldWear`, and never
replaces a worn set piece. Only an automatic answer gets a line saying what it did (`autoChest`
remembers which casket it was). In co-op the casket stays hidden, though the menu still opens,
until the host's frame brings the answer back. One that's lost or turned away would leave nothing
to click, so `resendAutoChest` offers it to `CoopRun.act` each update that brought frames, which
sends it again once `DECISION_RESEND_MS` is up. Not while no frames come: a reconnecting
`CoopLobby` holds what's sent, and every answer it held would go to a casket, the next ones too.

Guests predict their own **displayed** movement in `client/coop/MovementPrediction.ts`. The
`movePrediction` display setting (Settings and the pause menu) is on by default, and
`CoopRun.setPrediction` applies it, mid-run too. Settings saved while it was a trial all say off,
the default then, so an off only counts from a save marked `movePredictionDefaultOn` (every save
since). Off, a guest has no prediction,
sends no `moveSeq` and shows only what the host confirms; turned back on, it starts afresh. A local
input sequence (`moveSeq`) rides on movement messages and is echoed in the host's frame event,
including when queued moves are coalesced. The guest acknowledges it only after stepping that
frame, then replays a bounded local input history from the confirmed position. A change that
returns to the last sent direction inside the throttle still sends its new sequence, so a brief
predicted tap can't remain unacknowledged forever.

`CoopRun.setMove` sends a stop immediately after a sent movement, even inside the throttle
(`MOVE_INTERVAL_MS`). A change that starts, stops or reverses either sent axis (a key pressed,
let go or turned back, east to northeast as much as north to east) can spend a spare send
credit to go early: waiting for the throttle would leave the host walking the old line, and
the picture would reconcile sideways once the echo came. A stick's smaller changes in between
still wait for the throttle. Two credits refill at one per `MOVE_INTERVAL_MS`, and stops spend
none, which keeps even rapid tapping well under the relays' `MAX_UPS_PER_SECOND`, with room
left for actions. A reconnect restores the credits and forces the current input out. The
policy applies with prediction off too, and doesn't change frame rate, protocol, simulation
rules or hash checks.

Prediction covers the character's position, facing and movement animation, camera, minimap,
health bar, attached text, slashes and auras. `PlayerPose` is presentation state: never write it
into `Sim`. Combat, pickups, world-space attack effects and all hashes still use confirmed
positions. `core/PlayerMovement.ts` shares terrain collision, speed, sleds, curses, facing and
boss arena limits with `Sim.stepPlayer`. Errors ease toward the confirmed path over about 80 ms
(glides up to `GLIDE_DISTANCE`, a jump past it); a wall blocking correction snaps the picture to
its valid target instead of trapping it. Confirmed jumps of over `SNAP_DISTANCE` in one frame
(teleports) reset prediction. Death, known freezes and decisions ease back to confirmed
presentation, including the camera.

The camera follows the predicted pose, so the picture is kept steady:

- The host echoes a held move every `MOVE_REFRESH_MS`, a tick early or late with jitter. An echo
  of the move already applied only re-times the prediction's clock past `DRIFT_MS`; otherwise
  every refresh nudged the camera by a tick. Only a pending _change_ of move holds the clock back.
- Standing still, an error under `DEAD_ZONE` (a stop that reached the host a tick late) is left
  alone; walking takes it out. While the host's frames haven't got the stop yet, there's no
  ordinary correction: with a lead past the budget, the target falls short of where the stop lands.
  Check the latest input sequence against the acknowledged one, not just whether the last
  echoed direction is zero: the start of a short tap may not have been echoed yet either.
  Errors beyond the snap limit still snap. It waits `STOP_HOLD_MS` at most: frames still coming
  with no echo that long means the stop was lost (a relay drops what's past its rate limit).
- Inputs sent before the first host frame stay pending until their echoes arrive. Presentation
  falling back during that initial wait mustn't reset the timeline and acknowledge them itself,
  but the clock keeps up meanwhile: otherwise the first frame's lead is the whole load, and the
  picture holds at every late frame until an echo re-times it.
- When frames stop coming (`QUIET_MS`) with the lead at its budget, the picture holds where it
  is, and from `STALE_MS` it stands still with no walk animation. Easing back to the last
  confirmed spot would walk the hero backwards, then rush forward when a reconnect's resend
  arrives; instead it glides to the resent position.

`PREDICTION_MS` and `MAX_INPUT_HISTORY` bound replay work for one player. When the lead exceeds
that window, replay uses the newest inputs so a stop or turn still takes effect. Long render
frames retain their elapsed animation time and replay movement up to the same safety limit.
Held movement refreshes its sequence at `MOVE_REFRESH_MS` (still subject to the network send
throttle), bounding accumulated timing drift when the host loses simulation time. Prediction
never steps a second full simulation or rolls back combat. Extreme latency remains visible,
and a hit can still arrive after the local picture appears to have moved clear. To measure
it, see Measuring prediction at the end of this section.

- **Loading**: the host waits up to 20 seconds for everyone's map (and an opening cinematic's
  squares: see Props and opening cinematics). Anything that comes for the run
  while a player's map is still loading is kept and handed over once their copy's made
  (`toCoopRun` in `GameClient`), so a guest who loads first, slowly, or leaves meanwhile isn't
  lost.
- **Versions**: each player's game says its build (`__BUILD_ID__`, the version and commit), and a
  room only takes players on the host's, as different builds fall out of step. The slim cache
  checks the same id (Hosting).
- **Out of step**: every 50 frames the host sends a hash of its run (positions, hitpoints, the
  RNG, buffs, inventory, caskets and level ups). A guest whose run differs leaves and ends its own
  run, rather than everyone waiting on a copy that can't recover. It tells the relay first
  (`outOfStep`), for the relay's log; the host ignores it.
- **Waiting**: anyone the run waits on for 20 seconds (`DECIDE_AFTER_MS` in `CoopRun.ts`) has
  it decided for them by the host: the first reward, taking the casket, or walking away from the
  offer. The host can kick a player from the menu mid-run.
  Everyone sees the time until the next automatic choice at the top center, even while choosing
  or after answering. It replaces the run clock until the party finishes, and shows the time
  alone on a phone or a window under 860 pixels wide, so it fits where the clock was. Panels
  under it make room and scroll if they must: a `.ui-panel` is content-box on a desktop, so its
  padding and border sit outside a `max-height`, but border-box on a phone.
  `DownMessage.decisionMs` carries the host's remaining wall-clock time (also on resends);
  `CoopRun.decisionSeconds` feeds the HUD's numbers store. It never enters the sim or its hash.
  A guest's deadline only moves later by more than `DEADLINE_SLACK_MS` (for the next wait), so
  frames arriving unevenly can't make it count back up. A run that ends early drops it.
- **Background co-op**: `CoopTicker` starts its worker with the run and takes over when rendering
  stops, including when a covered window still reports itself as visible. Rendering and worker
  callbacks share one clock, so returning to the tab cannot count elapsed time twice. A page timer
  backs it up if the worker is blocked. A page the browser freezes (Memory Saver, Edge's sleeping
  tabs, a phone in the background) stops the worker too, and nothing in the page can help that.

For that every copy has to agree to the bit. The sim only uses its seeded `Rng`, and its
trigonometry goes through `fm` in `core/fmath.ts`: the browser's own `Math` on your own (so solo
runs are as they were), and in co-op versions built from `+ - * /` and `sqrt`, which every engine
rounds the same. Use `fm.sin`, `fm.cos`, `fm.atan2`, `fm.hypot`, `fm.acos` and `fm.pow` in
`core/`, never `Math`'s (`Math.sqrt`, `floor`, `round` and the like are fine).

The sim's player state is split into `Hero`s, one a player. `sim.player`, `sim.weapons`,
`sim.stats` and the rest are the current hero's: whichever one the sim is working on (an enemy's
target, a projectile's owner, whoever's picking something up), and between ticks the one this
browser plays (`focus`). Something that belongs to a hero (a projectile, a thrall, burning ground,
venom) remembers whose with `hero`, and the sim works as them when it acts. Whatever replaces,
merges with or caps those (an orbit weapon's orbs, burning ground, a power-up's timer) matches on
`hero` too, so one player's never takes the place of another's. Co-op actions go
through `sim.as(hero, ...)`. Events that are a hero's own (a hit taken, a pickup, a casket) carry
`hero` in co-op, so the client shows its own and leaves the rest. A solo run has one hero and
plays exactly as before.

Anything that lands where players stand (a boss's swing, bullets, ground marks, pools, a stomp)
checks each hero still up with `forEachHeroInReach`, not just the current one, and what a boss
does to a player (a curse, a parasite, being held) is kept on that `Hero`. Who a boss aims at is
the hero nearest it, as the current one when it acts. Outside a loop over the heroes,
`this.player` is whichever hero the sim last worked on, so don't lean on it there.

When adding to the sim:

- State that's a player's own goes on `Hero`, with a getter on `Sim` like the rest.
- Something that lingers (a projectile, a pool, a turret) carries `hero`, and acts with
  `useHeroAt(thing.hero)`.
- A new event that's about one player goes in `PERSONAL_EVENTS`, so it's tagged with who.
- Trigonometry goes through `fm`. `core/fmath.test.ts` fails on `Math.sin` and the like in
  `core/`.
- `core/runHash.test.ts` pins three seeded runs (solo, hard mode, a party of four) to a hash of
  everything in them, tick by tick. A change that's meant to leave play alone, like a speed-up,
  has to leave them as they are; one meant to change play changes them, so check it's only the
  runs it should, then update the numbers.
- `sim.enemies`, `projectiles`, `enemyProjectiles`, `effects` and `pickups` are the same arrays
  from tick to tick, tidied in place, so don't keep one and expect it to stay as it was. Enemies
  and pickups stay in uid order, which finding one by uid relies on: add them only through
  `spawnEnemy` and `dropPickup`, at the end.

Weapon damage tuning lives in `content/balance.ts`; see [Weapon damage tuning](BALANCE.md) for
class, evolution and normal/hard mode examples. Weapon damage rules use the starting party size
throughout the run.

How much bigger the crowd gets for each player is in `content/coop.ts`, worked out again whenever
one goes down, is revived or leaves, with each of those down or gone still counting as half a player
(`PLAYER_GONE`).

Caskets are scaled there too. `Sim.openCasket` pays a casket's coins (the party's) once and counts
it once towards the run's `casketsOpened` and the picker's `Hero.casketsOpened` (the results
screen's, which add up to the run's), then `offerCasketItem` gives every hero who's up an item of
their own, rolled on that hero's luck, gear and banishes. A hero who's down misses out, unlike a
level up, which waits for their revive. The run waits on each of them, so an idle player who's up holds every casket until
`DECIDE_AFTER_MS`, as they do a level up. With every casket giving the whole party an item, an
ordinary kill's casket chance is times `PartyScale.caskets` (`CASKETS_PER_PLAYER`), so the bigger
crowd's extra kills leave each player about as many items as solo, and the party about as many
casket coins as a player on their own. Elites' and bosses' caskets aren't scaled: they already drop
one a kill, as solo.

Revives are in `content/coop.ts` too (how many a player gets, the hitpoints each brings back,
how long a teammate stands over them, how long the immunity lasts, and the extra revive's item,
price and how often the Mysterious Old Man has one) and `Sim.stepRevives`: a downed hero keeps
who's standing over them and for how long in `Hero.revive`, `reviveHero` brings them back, and
`Hero.immuneEndTick` is how long nothing can hurt them. An extra revive is a utility item whose
use is `revive` (the Prayer cape): `rollCasketItem` only gives it a weight in a party, a casket's
"take" grants it at once through `gainRevive` rather than stashing it, and the old man's offer
carries it as an `EventOption` of kind `revive`. Each adds to `Hero.extraRevives`. The immunity holds
`player.invulnerable` every tick, the way the sled does, and `nearestHero` and `useSpawnHero`
skip an immune hero while anyone else is up (pickups go by `nearestUpHero`, which doesn't: a
revived player can still eat). The reviver's emote (`REVIVE_SEQ`) is baked with
every player look in co-op through `getRunAttackSeqs`, and its graphic (`REVIVE_SPOTANIM`) with
the base bake.
Bosses come as copies (`bossCopies` there), spawned together by `Sim.spawnBosses`: each by a
different player, clear of the others, sharing one boss's hitpoints, experience and loot through
their `Encounter`, so the first says so and the last to fall drops the loot. A boss with its own
spots (`spawnAt`) gets no more copies than it has free spots, which keeps Pest Control's portals
single, and a scripted entrance (`startIntro`) stays one boss.

The boss bar in co-op is each player's own: `GameClient.getCoopBarBoss` shows the living boss
nearest that player, so it's the copy in front of them. Unlike solo, the final boss comes first
no more than any other: a nearer boss (an ambush's copy, or one left from earlier) takes the bar
from it. The bar keeps its boss until another is `BOSS_BAR_SWITCH` tiles nearer, so two copies
about as far away don't take turns on it. Once every final boss has fallen, the last one's empty
bar stays to the victory screen, as in solo. Only the bar works this way: what else follows the
boss on screen (the camera's lean, a gaze's light, `BossFightView`'s arena edge and totem arrows)
goes by `Sim.shownBoss`, so in co-op it can be another copy than the bar's.

Rooms only take players who've unlocked their map (and its endless or hard mode, for a room on
them), and the host can only pick what everyone in the room has, so nobody skips ahead: someone
without it is told "You need Barrows unlocked to join this room", and the open list shows that room
as locked to them. Each player's game sends the maps it has (`unlocks`), checked by the relay on
joining, on the host changing the map, endless or hard mode, and at the start. Whether the run's on
hard mode goes out in `GameStart`, like endless, so every player's copy plays the same.
The Tombs of Amascut go by the host's invocations instead: the lobby shows them as a raid level
(the host's `Loadout.invocations`, which the relays pass as they are, so they needed no change),
the host sets them from the lobby, and `GameStart.invocations` carries them to every copy.
`MULTIPLAYER_ANY_MAP=on` (or `--any-map`) lets anyone into any room instead, and a win then opens
that map for a player who hadn't got there. With no accounts, a player's maps are their game's word:
this keeps fair players fair rather than stopping a cheat.

Both relays check a run's frames as they pass (`server/coop-checks.mjs`) and log what they find,
each entry an object with `event: "coop_run_check"` (the Node relay prints each as a line of JSON).
A Cloudflare room keeps what's been found with the room, so a restart or a sleep mid-run doesn't
lose it.
`MULTIPLAYER_RUN_CHECKS=end` ends a run whose host they catch, as the host leaving does. Set up
for it, a relay also sends the run analytics collector a row for each run they find anything in
(`server/analytics/README.md`, Run checks).

A room's map, endless and hard mode are the relay's: the host's game sends `settings` and shows
what comes back in the room update, never a pick of its own, so a refused one changes nothing. A
host picking a map keeps endless and hard mode on only where everyone has them for it
(`GameClient.roomHas`), which is what the relay would refuse otherwise. The title screen's own
pick (`mapId`, `endless`, `hard` in the store) is only for solo runs and for making a room.

A game that's given a map or adventurer it hasn't got (from a newer or made-up game)
leaves the room rather than playing a run it can't, and other players' shop bonuses are kept within
what the shop sells.

Nobody types a name. The relay gives each player one as they connect (in `welcome`), and each room
one as it's made, from `server/name-gen.mjs`: two words, like "Plucky Chinchompa" or "Moonlit
Crossing", from short lists picked so any pair reads fine. That's why there's no list of banned
words to keep. A name's only one player's (or room's) at a time, and a number goes on the end once
the pairs it tries are all taken. **New name** (`rename`) asks for another, except during a run,
when everyone's copy of it has the old one. A name a game sends is ignored, and there are no
accounts, so a reconnect gets a new name. When adding words, keep them ones that can't make
something unfortunate next to any word in the other list.

`server/coop-relay.mjs` holds the rooms (code, name, open or invite only, host, map, members and their
ready state and loadout) and forwards `up` messages from guests to the host and `down` messages
from the host to everyone else. The host leaving a run ends it for everyone; in the lobby the
room goes to the next player. The balance bot plays a party with `PARTY=4`, each player on their
own, so it can't show teamwork.

The Cloudflare relay (`server/cloudflare/`) speaks the same protocol, with one more message: it
answers `create` and `join` with a `goto` (a room code and a one-time ticket), and `CoopLobby`
then makes or joins the room on that room's own connection, at `coop/room/<code>`. What's said in
a room goes over that connection (`ROOM_MESSAGES` in `CoopLobby.ts`); pings, the list and
making or joining go to the lobby's. The Node relay never sends `goto`, so with it there's only
the one connection. Change the protocol in both relays.

Cloudflare restarts its objects now and then, dropping their connections, so the Cloudflare relay's
`room` message carries a `token`. `CoopLobby` reconnects to `coop/room/<code>?resume=<token>` for
`RESUME_WINDOW_MS` when the room's connection drops, holding what's said meanwhile. Each handshake
is limited by `RESUME_ATTEMPT_MS`, so a hanging attempt leaves time for another (the trade: one
that always takes longer, on a weak mobile signal, never gets through). The room
(kept in storage) holds the player's place a little longer. A guest that misses some of the host's
frames asks for them immediately on reconnect, or from `from` on the next `down`, with a `resend`
up message; the host keeps 20 seconds of what it's sent (longer than the room holds a dropped
player) and answers
once a second at most, from the earliest frame asked for, to every guest; each takes only frames
after the ones it has, in messages of `RESEND_EVENTS` at most. That part works on either relay.
A guest numbers its actions that aren't decisions (`actionSeq`, so using an item), and the host's
frames echo the number; after reconnecting it sends again those not echoed yet, and the host takes
each number once. Decisions have their own resend (`DECISION_RESEND_MS`). The room saves someone
joining or leaving, and the run starting or ending, at once and before telling anyone, and a
change of pick or ready it confirms (below); other changes at most once a second. The Node relay sends no token, so with it a dropped connection
still ends a guest's run.

A room's connection can also die without closing (a laptop asleep, a network that went away). During
a run `GameClient` calls `CoopLobby.keepAlive()` on each step, which pings a room that's been quiet
for `RUN_QUIET_MS` and takes one that hasn't answered within `PONG_WAIT_MS` as dropped, coming back
as above while the host still has the frames (about 7 seconds are left for that: past them the
guests' runs end, as below). It doesn't judge after a gap in its own calls (a frozen page), whose
replies may be unread. It also pings a room it's sent nothing to for `PING_INTERVAL_MS` (a guest
standing still), since `CoopTicker`'s worker keeps it going once drawing stops, and the regular
ping is slowed in a hidden tab. The ping
every `PING_INTERVAL_MS` checks the connection outside a run; a local timer (`ROOM_CHECK_MS`)
checks for its reply without sending more frequent pings. After a gap in its own runs that timer
only waits for the next one: in a hidden tab slowed to a run a minute, it would otherwise forget
the regular ping every time, and that ping's own check (`tick`) judges it instead.
The Cloudflare room lets go of a player it's heard nothing
from, not even a ping, for `SILENT_MS`, as if their connection had closed
(the Node relay finds those with its own pings). A guest whose missing frames haven't come for
`GIVE_UP_GAP_MS` while the host's others do ends its run (the host no longer has them); a break of
`GAP_LATE_MS` between sightings (a frozen page) starts that wait over. A frame that fails to step
`MAX_FAILED_STEPS` times in a row ends the run too (an error in the game; the host leaving ends it
for everyone). A failed step has already changed the sim, so trying it again only keeps the copies
together when every copy failed alike; the hash check finds one that didn't. The host's frames go
out even when something after a step throws, and no time is banked for the steps it stopped. Only
the Cloudflare relay gives a room its own connection to check; the rest is the game's, so it holds
on either relay.

Cloudflare rooms advertise `memberAcks` and acknowledge a player's numbered `me` changes with
`meSeq` in the existing room update. `CoopLobby` keeps the latest unconfirmed changes (merged, so
a retry carries all of them) and sends them again once per connection after `MEMBER_RETRY_MS`,
with a ping: Cloudflare answers pings without waking the room, so only the confirmation shows
the room itself got it. An unanswered ping makes the connection again as above, and the changes
go again on the new one. A room that answers but hasn't confirmed within `MEMBER_WAIT_MS` of the
retry gets no more tries, and the player's told to choose again; that message stays through
others' room updates until a confirmation or a new choice. Leaving or starting clears what's
waiting. A new pick leaves out a Ready still waiting for its confirmation: the relays un-ready
a player whose pick changes (below), and a Ready carried along would ready them on a pick the
host may not have yet. The room keeps each player's sequence through sleep and ignores older
retries. It saves a change of pick or ready before the update that confirms it, throttle or not,
since the game won't send a confirmed pick again after a restart. Once a message is handled the
room runs any alarm jobs that are overdue, so a late alarm can't hold back the members' update;
after it, so the heartbeat counts its sender as just heard from.
Relays without `memberAcks` keep the old messages; if support disappears on reconnect,
what's waiting is sent once without waiting for a confirmation.

What starts the run is the host's view of everyone's picks (`startCoopRun`), which can be behind
the relay's. So both relays un-ready a player whose adventurer or loadout changes while they're
ready (`setMember`, `pickOf`: sending the same pick again, as on a map change, doesn't), and
refuse the host's start while anyone's been un-readied that way and hasn't readied again
(`repicked`, kept through the Cloudflare room's sleep). The change reaches the relay before the
host's start, so a start made from a view that still says ready is turned away with a message.
A map with its own adventurer (Durial321's) sets everyone's skill page to its adventurer's, so
switching to or from one changes their loadouts and un-readies them too: the message says their
pick changed, not that they changed it.
`CoopLobby.setReady(true)` sends the player's adventurer and loadout in the same message, so a
pick that never arrived can't leave them ready with an older one.

The open rooms list comes a page at a time (8 rooms, the fullest first, then the ones waiting
longest), worked out once after each change rather than for every request. Both relays send it
again to everyone looking at it when it changes (within a second, and only if their page did), and
say so with `listUpdates` in their welcome; the menu then asks only for another page, when joining
fails, and whenever it's back on the list, out of a room or turned away from one (`outOfRoom` in
`CoopLobby.ts`): the Cloudflare lobby stops sending it on a create or join until it's asked again.
It asks every 5 seconds of a relay without `listUpdates`, so either can be deployed first. On
Cloudflare every request costs, so think twice before adding a timer that sends something: incoming
messages and calls between objects are billed (see Cost in `server/cloudflare/README.md`), and what
the relay sends out is free.

**Flags.** A relay that knows where a player is sends it as `country` (ISO 3166's two letters): in
`welcome` for their own and on each room member. The Cloudflare relay's Worker gets it from
`request.cf.country` and hands it on as `x-country`, replacing whatever a player sent; the Node
relay gets it only behind Cloudflare (`PROXY`, above). A member keeps the country they joined from
when they resume. A player who turns off **Co-op flag** in Settings sends `hideCountry` with what
they say about themselves, and the relay leaves their country out, except while they host an open
room: then it shows in the party anyway (`shownCountry` in each relay), and the game says so on
Open to all. The game draws a flag with `CountryFlag` (`ui/CountryFlag.tsx`): the login screen's
world list flags (sprite 815, a frame for each country it has, in `content/flags.ts`), or the
country's letters where there's no flag, with its name from `Intl.DisplayNames` as the tooltip.
Emoji flags won't do: Windows has none, so they show as two letters there anyway.

A room in the list has a flag too. On Cloudflare it's where the room's Durable Object runs, which
needn't be near its host, nor where the request came in (`cf.colo`). The room measures it once and
saves it (`server/cloudflare/src/location.mjs`, explained in that relay's README), and its listing
says `countrySource: "server"`, which the game shows as "Server in". The lobby lists it by its
current code (`currentCountry`), as rooms measured with an older colo table saved `UK` and `FX`
for `GB` and `FR`. A room that couldn't measure
it has no flag, never its host's. The Node relay lists the host's country instead, as "Host
playing from".

To try it locally, `bun run start` and open the game in two windows (one private, for a
save of its own), make a room in one and join it from the other. A second ordinary window says the
game's open in another tab, and Play without saving lets it play (see Saves).

#### Measuring prediction

Open the game with `?movementDiagnostics` (or append `&movementDiagnostics` to an existing
query), join as a guest with movement prediction on, and reproduce the slide. In the browser
console, `movementDiagnostics.snapshot()` returns the current capture;
`copy(JSON.stringify(movementDiagnostics.stop()))` copies it and disables capture in browsers
with the DevTools `copy` helper. `movementDiagnostics.start()` resets and enables it again.
Capture before leaving the run; a new run or recreating prediction starts fresh. The flag works
on release builds too, exposing only these three diagnostic methods, but only in a browser tab:
the Windows and Android apps can't take the flag, and turn DevTools off in their release builds.
In dev, the equivalent methods are `game.setMovementDiagnostics(true)` and
`game.getMovementDiagnostics()`.

The snapshot includes the build, applied frame and queued-frame count, plus these measurements:

- `inputToSendMs`: Time from sampling an input to sending it; a high value points to local
  throttling or a long local frame. Only inputs sampled during the capture count, each on its
  first send (a reconnect sends the latest again).
- `sendToConfirmMs`, `inputToConfirmMs`: Time until its echo is **applied**. Includes relay travel,
  host scheduling and the guest buffer; it is not a ping measurement. Coalesced inputs without their
  own echo don't contribute a confirmation sample.
- `errorTiles`: Distance between the predicted pose after local movement and the replayed
  authoritative target, before correction. Measured while prediction is active.
- `correctionTiles`, `idleCorrectionTiles`: Total distance actually moved by reconciliation, with
  the stationary portion separate from intended movement. Small idle errors can remain inside the
  dead zone.
- `fallbackCorrectionTiles`: Correction when returning to confirmed presentation, such as on a
  freeze or death.
- `renderGapMs`, `longRenderFrames`: Elapsed time between prediction renders and the number over
  `LONG_RENDER_MS`; useful for spotting local hitches. These aren't CPU execution times.
- `leadMs`, `confirmedAgeMs`: Uncapped prediction lead and time since a host frame was applied. A
  large age can mean network or host delay, or that the guest stopped processing frames.
- `pendingStopFrames`, `haltedFrames`, `stalledFrames`: Frames waiting for a stop echo or holding
  the picture at the replay/staleness limits.
- `distanceSnaps`, `wallSnaps`, `teleports`: Counts of the distinct hard-correction paths.

Measures contain count, mean and maximum. Counters cover every prediction render from the run's
first host frame while enabled (the wait before it is the run loading, not the link); `samples`
keeps only the latest `SAMPLES` details, `SAMPLE_MS` apart at least (both in
`client/coop/PredictionDiagnostics.ts`), so it can miss a short
spike whose maximum still appears in the counters. Capture is off by default and stays local:
no automatic upload, storage, timers, console logging or per-frame allocations for diagnostics.
The sample slots and input timings are allocated once and reused; snapshot copying happens only
when requested. Use the existing `frameProbe.sample(60)` in dev for CPU/render costs with
capture off and on. These observations narrow the cause but cannot by themselves separate host
CPU delay from network delay; that needs a matching host capture or external network
measurements.

### Touch screens

Everything touch only hangs off `pointer: coarse`, so a mouse and keyboard never see it:
`isCoarsePointer` in code, a media query in `Mobile.css`.

- `client/GameTouch.ts` is the stick, with no DOM. `GameInput.getMoveVector` reads it when no key
  is down, so the sim gets the same input a keyboard gives: length 0 or 1.
- `ui/TouchControls.tsx` feeds it pointer events. The whole screen is the stick, with the buttons
  on top. Pause acts on `pointerdown`; items act on `pointerup`, because a browser won't fire
  `click` for a second finger while the thumb's down. `ui/DescriptionButton.tsx` shares hover,
  keyboard or controller focus and 500 ms holds across bag items, weapons, passives, worn gear and
  Armoury tiles and upgrade steps, and `ItemDescription` draws an `ItemView` in one.
  `ui/InventoryItem.tsx` uses it for both bag layouts, with the same `ItemView.lines` as the
  casket. Descriptions are portalled outside scrolling panels and the phone HUD's extra zoom,
  clamped to the viewport while keeping the UI's text scale. Whether the browser's rectangles
  include CSS zoom is measured once (`zoomedRects`): Chrome's didn't before 128, and standard
  zoom's do.
  The HUD renders after the touch movement zone so its slots receive holds; a run overlay
  disables those slots and dismisses their descriptions. Empty bag slots are dimmed by
  `.ui-inv-slot-empty`, not `:disabled`, so the bag doesn't dim under every overlay.
  Being after the zone keeps the HUD above it, so nothing in the HUD needs a z-index for that,
  and one would put it over the run's panels too.
  Releasing a hold never uses the item, and a held finger can drift. Before the hold, moving
  further than `TAP_SLOP` (shared with `SharedTaps`), cancellation or losing focus cancels the tap.
  The click a touch press makes after its `pointerup` is ignored for a moment, but keys and later
  clicks still use the item. The focus a tap gives (after its `pointerup`) doesn't open a
  description either, or it would stay up. Holding an Armoury tile never selects or buys it; a
  quick tap still selects it. A scroll ends holds and hovers, but a focused tile's description
  follows it, since a controller scrolls its list to what it highlights. Escape dismisses them all.
  Buttons only listen on the window while described or pressed. Small phones keep worn gear and
  its descriptions in the pause menu.
- `ui/Mobile.css` lays the screens out again for a phone held sideways (`max-height: 520px`). The
  UI's zoom never goes below 1, as the pixel fonts don't survive it, so a new screen needs rules
  there too. Check it at 844x390 and 667x375. It's imported last, so it wins over the other CSS.
  A panel whose contents can grow (an error line, a row of pages) has to fit or scroll there: the
  desktop's `90vh` cap leaves its buttons below the screen. Give it the screen's height less the
  safe area. The full-height panels (the shop, pause and the like) then hide their overflow and
  scroll a part inside, so their buttons stay in view. The co-op room browser scrolls as a whole
  (`overflow-y: auto`), since only its worst case doesn't fit. The HUD's right column comes down
  into the item buttons' column there, where the Tombs' fight button sits. Its lines let taps
  through to the button, but the DPS doesn't, so with a fight button over the items it keeps left
  of that column (`.ui-damage-beside-ability`). Anything new to tap in that column needs the same.
- A touch screen also gets a pixel ratio capped at 1.5 (2 elsewhere, `DeviceUtil.pixelRatio`), 2
  workers instead of 4, textures at half size (64 a side, a quarter of the memory), 60 frames a
  second at most unless the Frame rate setting says otherwise (see Keeping it light on a phone),
  and a closer camera on a phone.
- `public/manifest.webmanifest` lets a browser install the game to the home screen (HTTPS only,
  apart from localhost), opening full screen and sideways. `enterFullscreen` leaves an installed
  game alone. iOS ignores `orientation`, so an iPhone still gets the rotate notice, and it can give
  an installed game its own storage, without the saves or cache from Safari. There's no service
  worker, so it still needs a connection. The icons in `public/icons/` are whole multiples of
  `favicon.png`, to keep its pixels square.
- `client/saveFile.ts` exports a save. Installed on iOS it uses the share sheet, since a download
  there opens a sheet too small to use when held sideways. Everywhere else it's a plain download,
  of a file typed `application/octet-stream` (still named `.json`): typed as JSON, a player's
  older iPhone opened it as a page in Safari, with no way to save it (which iOS, nobody knows; the
  game needs WebGL2, so it's at least 15, where download links work). The link lasts a minute,
  since iOS asks before it downloads.

To test it, Playwright's `isMobile` and `hasTouch` turn on `pointer: coarse`, and CDP's
`Input.dispatchTouchEvent` sends real multi-touch. Mouse clicks don't test any of this.
Keep the CDP session open for the whole gesture; `touchEnd` lists the fingers being lifted,
not the ones still touching the screen.

### Controllers

`client/GamePad.ts` reads the browser's Gamepad API once a frame (`GameInput.pollPads`, from
`GameClient.update`). It's a web standard, so the desktop app (Electron) gets it too, with nothing
of its own.

- **Which pad.** One at a time: whichever was pressed last, once the one in use has been let go for
  `HAND_OVER_MS`. A pad's only noticed once something on it is pressed (browsers hide pads until
  then), so "connected" shows on the first press, and that press counts; the press that takes a
  second pad over doesn't. One controller can show as two: DS4Windows adds an Xbox pad beside the
  PlayStation one, unless it's set to hide it. The two change a frame or so apart, either one
  first, so taking up the one ahead at once would lose the press and swap them back and forth. A
  pad held the same way for `RESTING_MS` (a stuck button, a throttle resting at its end, something
  on the stick) neither keeps another from taking over nor takes over itself.
- **Its buttons** are only trusted when the browser reports `mapping: "standard"`, where button 0 is
  the bottom face button whoever made it. Any other pad gets the left stick and nothing else, rather
  than buttons that might be anything. `identifyPad` reads the maker from the id (Chrome's
  `Vendor: 054c`, Firefox's `054c-0ce6-` prefix, or a name like `Xbox`) for the labels only: Xbox,
  PlayStation, Switch, and Xbox's for anything else. A Switch pad confirms with the button in A's
  place on an Xbox pad, which it calls B.
- **Buttons are keys.** Each is sent to the window as the `KeyboardEvent` the game already answers
  (`RUN_KEYS` during play, `MENU_KEYS` otherwise), so every screen's own keys work with no changes and
  a pad can't do anything the keyboard can't. Synthetic events have `isTrusted` false, which is how a
  real key or click tells it the player's off the pad.
- **Menus** use the focus: the d-pad or stick moves it to the nearest button that way in the top
  `.ui-modal` (or the screen), and the bottom button clicks it. With nothing focused it sends Enter
  and focuses the `.ui-button-go` or first button, so a press as a level up appears can't pick one. Start
  clicks the `.ui-button-go` (Enter the map, Resume, a casket's best choice) wherever the focus is,
  so starting a run doesn't mean walking the highlight across the screen.
- **Hints.** `ui/PadHint.tsx`'s `KeyHint` shows a key, or the pad's button while one's in use. The
  numbered choices have none (the d-pad picks them). `:root[data-input="pad"]` shows the highlight.
  The icons are Kenney's [Input Prompts](https://kenney.nl/assets/input-prompts) (CC0, its licence
  alongside), in `ui/input-prompts/<make>/<button>.svg`, named by `PadButton`. Only the buttons
  for the three makes are copied in, not the whole pack. They're in the bundle as data URLs
  (`PAD_ICONS`, from Vite's `?inline`), not files served beside it: the desktop app's launcher 1.0.0
  serves `.svg` with no image type, which an `<img>` won't draw, and players keep the launcher they
  have.
- **What each button does** is listed by `PadControls` (`ui/PadHint.tsx`) in the pause menu and
  Settings while a pad's in use, and the title's hint shows its buttons. Change it with `RUN_KEYS`
  or `MENU_KEYS`.

The tests fake `navigator.getGamepads`. In a browser, an init script that replaces it does the same.

### Saves

The save is in localStorage under `rune-survivors-save` (`LocalSaveStore` in `core/save.ts`). A
tab loads it once and writes the whole of it back after each run or purchase, so these keep one
from being lost:

- **One tab at a time.** `client/SaveLock.ts` holds the Web Lock `run-escape-save` for as long as
  the tab's open. Another tab doesn't save, and says the game's open elsewhere: Play here takes the
  lock, and the tab that had it stops saving. When the tab with it closes, the next one gets it.
  A tab reads the save again whenever it gets the lock, so it carries on from where the other left
  off. Never rename the lock, or an old tab and a new one won't see each other. Without Web Locks
  (Safari before 15.4, or plain http other than localhost) every tab saves, as before.
- **A newer game's save isn't written over.** Every write marks the save with `gameVersion`
  (`package.json`'s). One from a newer version, or with a `version` above `SAVE_VERSION`, is played
  but not written, and the player's told to reload. `migrateSave` keeps only the ids it knows, so
  an older game would otherwise drop new maps, upgrades and items. `SAVE_VERSION` alone can't
  tell, as new ids don't raise it. This catches a tab left open over a deploy, and an older branch
  on the dev server. Import turns one away too. Export gives the stored text as it is, not this
  game's pruned copy. Save anyway (`saveOverNewer`) writes over it after all, losing only what was
  new: the way out when a release is rolled back, so every player isn't stuck not saving. It isn't
  offered for a newer `version`, whose format this game can't read. The check comes before
  `migrateSave`, so a newer save that won't migrate still counts as newer, not unreadable.
- **One that won't load is kept.** A save that won't parse goes to
  `rune-survivors-save-unreadable-<Date.now()>` (the last two are kept) before a fresh one takes
  its place. The title screen says so, with Export, and Settings lists them to export or delete.
  With no room in localStorage for the copy, it stays where it is and nothing's written over it;
  the panel says so (`noRoom`), with Export.

**Exports are the only backup** unless cloud save has a copy. Clearing the browser's data (or
uninstalling the Android app)
loses the save for good, so once a run's been played (`runs > 0`) the title screen shows a slim
reminder under its menu on any day it hasn't been exported (`ui/exportReminder.ts`,
`ExportReminder` in `ui/SavePanels.tsx`), except while the game isn't saving or cloud save has a
copy (`cloudKeepsCopy`: on, synced, and nothing wrong or waiting). It comes after the
menu so a controller's highlight still starts on Singleplayer. The file Export gives has
`SaveData.lastExported` (`Date.now()`) in it, so it says when it was made; a newer game's save goes
as it's stored, without one. The save itself takes the date, and the reminder goes until tomorrow,
once `saveFile` says the file's kept. The Android app says so when it's written the file, and iOS's
share sheet when it isn't cancelled, but a browser's download can't tell: there, and in the desktop
app, whose Save As dialog can be cancelled too, it counts as soon as the download starts. Days are
the player's local ones, and an export dated ahead of the clock doesn't count. Not today keeps the
day in localStorage (`rune-survivors-export-reminder-dismissed`), not the save: it's this browser's
reminder, it shouldn't travel in an exported file, and it can be put off while another tab holds
the save.

**Cloud save** (`client/CloudSave.ts`, `ui/CloudSave.tsx`) keeps a copy with the cloud-save
Worker (`server/cloud-saves/`), in a build with `VITE_CLOUD_SAVE_URL` whose Worker answers
`/v1/health`. An app that doesn't let requests out to it (an older desktop launcher or APK)
answers something else, so Settings doesn't offer it there. There's no account: Turn on makes a
sync code, and typing it on another device links that one. The local save stays the main copy,
and none of this changes `SaveData`. Its button sits beside Settings on the title screen
(`CloudSaveButton`): the client's storage chest with an up arrow (`CLOUD_SAVE_SPRITES` in
`content/titleIcons.ts`), faded while it's off, with a "!" in its corner while a choice is
waiting and a "no" sign while it can't sync. It opens the choice, or cloud save's own panel
(`CloudSavePanel`): Settings' rows, on their own.

- **What's kept here.** `rune-survivors-cloud` holds the code, the cloud's revision this save came
  from or went up as, and the save's `fingerprint` then (a hash of its progress that leaves out
  `gameVersion`, `lastExported` and key order). A save with a different one has changed. It's
  apart from the save, so it never goes out in an export. Never rename it.
- **Uploads happen at save points only** (`CloudSync.savePoint`): a run's results, leaving
  Skills or the Armoury, an import, and leaving the tab. Not on every write: buying ranks one
  after another goes up once, on leaving Skills. A save point uploads only if the fingerprint's
  changed, and only where the save's written at all (`GameClient.canPersist`: the lock, not a
  newer game's, room to keep it). Uploads are `UPLOAD_COOLDOWN_MS` (2 minutes) apart at least: a
  save point within it waits for it to pass, and whatever's changed by then goes up once. Leaving
  the tab doesn't wait: the page may not come back (an app closed, a phone's browser put away),
  so it sends at once, with `keepalive`. A save that didn't get up is still changed, so the next
  save point or check sends it. Sync now in Settings sends it at once. A download is in step as
  it goes in, so it doesn't come back up. A request with no answer after `REQUEST_TIMEOUT_MS`
  has failed, so one that hangs can't hold up the rest.
- **A save with no runs never goes up over the cloud's.** One that's changed since it was in
  step is a save that couldn't be read and was made fresh, so the cloud's goes in instead, as
  for the player who cleared their browser.
- **Checks** happen when the tab gets the save lock, and on coming back to the tab (every
  minute at most). They only read. The cloud's revision being this device's means only local
  changes are news. A different one is taken silently when nothing changed here and it has at
  least this save's runs, or when this save has none (the player who cleared their browser).
  Otherwise, and when an upload's refused as stale, the title screen asks which to keep, over
  Settings or cloud save's panel if one's open, showing both summaries, unless the two hold the
  same progress (the same fingerprint). Fewer runs is asked about so that a device that lost
  its progress can't pass it on silently. Nothing syncs until the player picks: Later puts it in
  Settings, and it stays put off, though checks go on (one about a newer cloud save updates the
  choice). Keeping this device's uploads with `force`.
- **A code that stops working** (New code used elsewhere, or the Worker's `INACTIVE_DAYS` without
  use) is a 401: Settings says so and offers only Turn off, after which the new code can be
  typed in or cloud save turned on again.
- **A newer game's cloud save** isn't loaded: `importSave` turns it away, as it does a file. The
  Worker refuses an older game's upload over it, so the choice says why, and only Keep this
  device's (losing what's new) or Later.
- **Deleting is undoable for a week**, so a leaked code can't wipe every version. The Worker only
  marks the code, and answers it with a 410 and `restorableUntil` until its saves are removed.
  The game shows that as the `deleted` problem, with the date and a Restore button
  (`CloudSync.restore`), on the device that deleted it and on any the code's typed into.
- **New code** (`CloudSync.newCode`) is what shuts out a leaked code: the same saves get a new
  one, and the old one stops working everywhere. Deleting can't, as whoever has a code can
  restore it.
- **The Worker's answers are untrusted too.** Anything can answer these requests (a captive
  portal, a proxy), so `readMeta` checks each field before the game shows or acts on it, a 200
  that isn't JSON is a problem, and a downloaded save goes through `importSave` like a file.

Play without saving closes the panel, and a Not saving button on the title screen and in the pause
menu opens it again. What's bought or earned meanwhile lasts until the tab gets the save back or
reloads: getting the lock reads the stored save, which replaces what this tab had in memory. When
the lock goes mid-run, a solo run pauses under the panel (co-op's goes on for the others).

The desktop app has one window and plays the newest game it has, so neither tabs nor an older
game come up there; an export from a newer version is turned away on import, as anywhere.

`SaveData.skillPages` holds independent `melee`, `ranged` and `magic` allocations, each with
`upgrades` and `upgradesSpent`, what was paid for them. Each page can allocate the full budget:
`coins + max(upgradesSpent)`. `coins` is the unreserved bank available outside Skills, while
`getSkillCoins(save, style)` subtracts that page's spending from the budget.
Purchases and refunds adjust the bank only by the change in the largest page's spending; they never
change another class's ranks or remaining budget. Armoury purchases still spend unreserved coins.
Save format 11 converts the former sum of page investments into a maximum reservation, restoring
the difference to `coins` once. Export/import retains this budget.
Save format 10 moves the old shared allocation and its investment into Melee without duplicating either;
Ranged and Magic start empty. Export and import preserve all three pages.
Solo and co-op loadouts use the actual adventurer's style, including maps with a forced adventurer;
changing a co-op adventurer or room map refreshes the transmitted loadout.
Prices come from `getPageCost` in `content/shop.ts`: what a page's ranks cost in all. It goes only
by the ranks, never the order they were bought in, so buying the same ranks in any order costs the
same. A rank's price is what it adds to the page (`getUpgradeCost`): each rank of a skill costs more
than the last, and every rank on the page adds a little to the price of the whole page. That part
falls on whatever's bought next, so a cheap skill costs several times its own price once dear ones
are on the page. Any price that ignores the order works that way, as long as ranks make each other
dearer.
The arrow button on bought cards (the client's back-arrow sprite,
`REFUND_SPRITE`) takes one rank of that skill off the page, through `GameClient.persist()`. It gives
back that rank's share of the page's `upgradesSpent`: what it adds to the page at today's prices,
times `upgradesSpent` over `getPageCost`. The two are the same unless prices have changed since the
page was bought. Then each rank gives back its part of the difference, rather than one rank giving
back all of it, or nothing and leaving the rest free. The page's last rank gives back the rest, so
a page returns exactly what it cost, and changing a skill's cost needs no migration. The
button is separate from the purchase button and has a larger hit area on coarse pointers. Desktop
right-clicking does the same; coarse-pointer context menus never refund. Unavailable purchases use
`aria-disabled` and keep their disabled appearance on hover, without blocking the desktop
right-click shortcut or the refund button.
Older games kept each page's purchase order (`upgradeOrder`) or the price paid for each rank
(`upgradeRefunds`), because their prices depended on it. Loading drops both: every page can refund
single ranks, whatever game bought them.
Refund all clears only the selected class's ranks and spending. It's there whenever
the page has ranks, even with no spending recorded.
The Skills panel is as wide as the window allows, so every skill fits in a few rows of cards
and the page needs no scrolling on a window at least about 1000x720 in the UI's own pixels (a
bigger window draws the UI bigger, so it fits the same way) and on tablets. A narrower window
(960x720 has five columns) or a shorter one, such as a phone held sideways, scrolls only the
cards, so the tabs and buttons stay in view; the whole panel scrolls only when even those don't
fit. The cards' grid scrolls, so it clips what's outside it: its 6px padding (and `scroll-padding`)
is room for a controller's highlight around the cards at its edges. On a touch screen the refund
button's tap area reaches up beside the pips rather than making the cost's row taller. Adding a
skill adds a card, so check the page still fits at 1024x768 and 1280x720. On a phone the
one-line help under the title stays, though other panels drop their subtitle there: it says which
preset an adventurer uses. Keep it to one line at 667 wide.

### Languages

The game is in English and Português (BR). Only English is checked: the other languages are
their translators', set in `LANGS` (`i18n/types.ts`) and credited under the language's name
wherever it's picked (`LanguageName` in `ui/LanguageSetting.tsx`: Settings' and the pause menu's
dropdown, and the title's globe). The first time the game is in another language, picked or the
browser's, `ui/LanguageNotice.tsx` says so,
once (its own `rune-survivors-language-notice` key, not the save). **Agents never translate**:
text is written in English only unless the developer asks for a translation (CLAUDE.md,
Conventions), and a language without a key shows the English.

Text lives in flat `{"key": "text"}` files at `src/game/i18n/locales/<lang>/<namespace>.json`. A
new language is a folder of them, an entry in `LANGS` and `Lang`, and its browser-language match
in `i18n/store.ts`.

- `t(key, params)` looks the key up in the active language, then English, then gives the key.
  `tp(key, n)` picks a plural form (`key.one`, `key.other`, `key.zero`). `tr(key, english)` ends
  on the English in the code: content's accessors (`weaponName`, `mapName` and the rest in
  `src/game/content/`) read names and descriptions with it, so call those rather than building
  keys.
- The sim works in English. It reads definitions' own names, and its events carry English text,
  so co-op players in different languages run the same sim. The views turn that text into the
  active language with `tl(text)`, which finds the key whose English it is. Sentences the sim
  builds round names and numbers ("Teleported to the Maiden of Sugadinti. 2 teleports left.") are
  patterns in `SENTENCES` (`i18n/store.ts`), each filling a `notice.*` key in `ui-misc.json`. A
  language without that key keeps the whole sentence in English, and a new sentence of the kind
  needs a pattern and its English key. In `core/`, only `Upgrades.ts`'s choice descriptions read
  the accessors, for the level-up cards.
- `items.json`, `world.json` and `gen.json` are generated from the content by
  `scripts/i18n/extractors/`: run `bun run tsx scripts/i18n/extract.ts` after changing content, or
  `i18n.test.ts` fails. A line in a list (an enemy's chat, a raid's rooms, a floor's script) is
  keyed by its text, not its place, so a changed line is a new key and the test fails on the old
  one's translations until they're removed. `ui.json` and `ui-misc.json` are written by hand.
- Numbers go through `fmtNum`, lists through `list` (in English as the game always wrote them, "a,
  b and c") and dates through `dateLocale()` (in English, the browser's own format). Their `Intl`
  formatters are kept, as numbers are formatted every frame.
- Under tsx, where `import.meta.glob` doesn't exist, the files aren't read: `t()` and `tp()` give
  keys there, and `tr()` and `tl()` English.
- The choice is saved under `rune-survivors-language` in localStorage. Tests start in English
  whatever the machine's language (`src/setupTests.ts`).

### Notice

Whatever's written in [public/notice.md](../public/notice.md) pops up on the title screen until the
player closes it, once: a `# Title`, then paragraphs and `- ` lists, with `**bold**`. Changing it
shows it to everyone again; with nothing but its comment there's no notice. It's fetched when the
game loads rather than built in, so on a hosted game `notice.md` can be edited on the server.

### Versions

The version is `package.json`'s, shown in the title screen's corner, and [CHANGELOG.md](../CHANGELOG.md)
says what changed in each one; the title screen shows it too. Note changes under Unreleased as
they're made. For a release, run `bun pm version minor --no-git-tag-version` (use `patch` for fixes
alone), then turn Unreleased into the new version's heading with the date. A test checks the two
agree.

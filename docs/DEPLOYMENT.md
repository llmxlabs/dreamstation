# Deployment and operations

DreamStation Frame runs on a computer on your trusted LAN. Other devices use their browsers to reach it. The application has no login: network access grants control of the gallery and access to its media. Keep it off the public internet; do not enable router port forwarding for it.

## Requirements

- Node.js 24 LTS recommended (minimum 22.12), npm, and Git to clone the project.
- A writable local project directory, with disk space for originals and previews.
- A supported platform for the native `better-sqlite3`, Sharp, and bundled FFmpeg packages. If a native prebuilt package is unavailable, installation may require platform build tools.
- Internet access during dependency installation and the initial build. The build fetches its Google fonts; media and database operations run locally after setup.

Run commands from the repository root. Use a single server process and persistent local storage. Static hosting and ephemeral serverless deployment are not supported.

## Install

```sh
git clone https://github.com/llmxlabs/dreamstation.git
cd dreamstation
npm ci
```

`npm ci` installs the lockfile versions and generates the Prisma client. Keep development dependencies installed: the documented build, database setup, and maintenance commands use them.

Copy the environment template once. Do not overwrite an existing configured `.env` when upgrading.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux or macOS:

```sh
cp .env.example .env
```

The default configuration is:

```dotenv
DATABASE_URL="file:./prisma/dev.db"
```

Keep this default for a first installation. Database paths and media storage depend on the working directory; launch the app from the repository root.

Create the schema and local profile, then build. The setup command ensures the database directory and file exist without overwriting an existing database before applying the schema:

```sh
npm run db:setup
npm run build
```

Start for use on this computer only:

```sh
npm start -- --hostname 127.0.0.1 --port 3000
```

Open [http://localhost:3000](http://localhost:3000). Keep the terminal open while the application is running. Stop it with `Ctrl+C`.

## Use displays on your LAN

Start with an explicit LAN binding instead:

```sh
npm start -- --hostname 0.0.0.0 --port 3000
```

Use `ipconfig` in Windows PowerShell or `hostname -I` on Linux to find the server's LAN address. On macOS, use System Settings → Network or `ipconfig getifaddr en0`. Choose the address for the network shared with your display, not a loopback, VPN, or container address.

For example, if the server is `192.168.1.100`, open `http://192.168.1.100:3000` on both the dashboard computer and the display. Allow incoming TCP port 3000 only from your trusted local network in the host firewall. Guest Wi-Fi and access-point client isolation can prevent devices from connecting even when both have internet access.

Open the dashboard using this LAN address **before generating a pairing QR code**. By default, QR codes use the dashboard's current origin. A QR code containing `localhost` points to the scanning device itself, not your server.

Alternatively, set the public pairing base URL in `.env` before building:

```dotenv
NEXT_PUBLIC_APP_URL="http://192.168.1.100:3000"
```

Run `npm run build` again after changing this variable. It is embedded in the browser bundle. Reserve the server's address in your router if you want bookmarks and QR links to remain stable. To change the listening port, pass `--port 3001` (or another free port) and update the pairing URL accordingly; setting `PORT` inside `.env` is not the documented startup mechanism.

Pair a display from the dashboard, enter the six-digit code at `/pair`, and assign a collection. Codes expire after ten minutes. Bookmark the resulting `/player/<display-id>` URL on the display. Playlist/configuration polling takes up to roughly 30 seconds; a disconnected display becomes offline after 90 seconds without a heartbeat, plus the dashboard's refresh delay.

## Persistent data and backups

| Location | Preserve |
| --- | --- |
| `prisma/dev.db` | Assets, collections, display assignments, and configuration |
| `public/uploads/` | Original media and generated previews |
| `.env` | Local database location and optional pairing URL |

If you configure another database path, back up that database instead. Source code alone cannot reconstruct your uploaded gallery.

For a consistent backup:

1. Stop every DreamStation server process and close tools using the database, such as Prisma Studio.
2. Copy the database, any adjacent `-wal` and `-shm` files that remain, the entire `public/uploads` directory, and `.env` to a private backup location.
3. Record the application version or Git commit alongside the backup.
4. Restart the server.

To restore, stop the destination server, install the same application version and dependencies, and restore the database, matching media directory, and environment file together. Ensure the configured database path exists and is writable, then build and start. Preserve a backup of existing destination data before replacing it. Do not rerun schema setup against restored data unless the version's upgrade instructions require it.

For an always-on installation, use your operating system's service manager to start the production command from this repository directory under an account that can write the database and media directory. Configure automatic restart and preserve logs. Keep a single instance; do not run multiple replicas against the same files.

## Updates and checks

Back up first, stop the server, review the new version's release notes, update the source, then run `npm ci` and `npm run build`. Database changes require version-specific review; do not accept a schema command's data-loss prompt without inspecting the change and your backup.

Development checks:

```sh
npm run lint
npm run typecheck
npm test
```

For development, `npm run dev -- --hostname 127.0.0.1 --port 3000` runs the development server. Use the production build for regular display operation.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Database/setup error | Run from the repository root; confirm `.env` exists, its default SQLite path is correct, and the directory is writable. Run `npm run db:setup` for a fresh installation. Never delete an existing database to troubleshoot without backing it up. |
| Prisma client missing | Run `npm ci` with installation scripts enabled; its `postinstall` generates the client. |
| Build cannot fetch fonts | Allow build-time internet access, then rebuild. |
| Display cannot connect | Verify the LAN address, explicit `--hostname 0.0.0.0`, firewall scope, matching network, and lack of guest-network isolation. |
| QR opens the wrong device/address | Open the dashboard through its LAN URL, or set `NEXT_PUBLIC_APP_URL` and rebuild; generate a new code. |
| Video uploads but does not play on a TV | The app does not transcode video. Export an H.264 MP4 or a WebM codec supported by that TV browser. Muted autoplay and fullscreen support also depend on the device browser. |
| Video processing fails | Confirm the bundled FFmpeg binary was installed and may execute; try a short H.264 MP4. Thumbnail decoding times out after 30 seconds. |
| Upload rejected | Use JPG/PNG/WebP/MP4/WebM; at most 20 files, 50 MiB each, and 100 MiB per batch. Images must be under 40 million pixels and contents must match the declared format. |
| High memory use during uploads | Upload smaller batches and lower-resolution images. Processing expands compressed images and buffers uploaded files; the file-size limit is not a memory-use guarantee. |
| Slow or stale display | Allow the next 30-second poll, check collection assignment and connectivity, then reload the player. Existing playback is not a guaranteed offline cache. |
| Missing media after a move | Restore `public/uploads` together with the database and launch from the correct repository root. |

See [architecture](ARCHITECTURE.md) for the data flow and deployment boundaries.

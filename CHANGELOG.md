# Changelog

## 0.7.1

- New home page with quickstart, connect endpoints, stats and recent activity.
- Global search across users, media and notes. Available from the navbar and via Ctrl+K / Ctrl+F / `/`.
- New popup modals to preview images, videos, STL files and Nostr notes.
- Documentation page rewritten with endpoint specs, supported NIPs / BUDs and wiki chapter links.
- Smaller header for more content space.
- Hardened NIP-98 and Blossom upload authentication with anti-replay.
- Moved Blossom auth module from BUD-01 to BUD-11.
- Fixed authentication event tags in the built-in uploader.
- Improved register flow and decoupled OTC from user activation.
- Prevented DM spam during registration.
- Fixed periodic IP cleanup job.
- Added curl to install script.
- Updated dependencies.
- New experimental updates engine for notifying users of new versions.
- Fixed error when uploading STL files.
- Added Blossom blob reports (BUD-09) with admin moderation queue.
- Improved Blossom spec compliance: PUT /media, HEAD pre-flight, /mirror auth, server tag matching, CORS and plain 404 on unknown blobs.
- Lenient NIP-98 payload binding to interoperate with more Nostr clients.
- Advertised NIP-45 (COUNT), NIP-56 (reports) and NIP-65 (relay list).
- Several security hardening fixes around uploads, plugins and admin file handling.
- Chunked IP cleanup to avoid prepared-statement limits on busy servers.
- Reduced log noise from unknown-host probes.
- Gallery rewritten Instagram-style: uniform CSS grid, virtual scroll, blurhash placeholders and cursor pagination — designed for 100k+ items.
- New file-details modal with metadata panel (hash, pubkey, type, size, dimensions, uploaded, blurhash) reused across gallery, profile and admin.
- Admin triage modal: keyboard navigation through the whole files dataset (↑/↓), instant checked / visibility toggles (Space / V) that respect the table's active filters.
- New Tools page (`/tools`): key converter, keypair generator, event verifier and blob hash, all in the browser. `/converter` redirects to it.
- Frontend refactor, phase 1: Tools, Terms, Privacy and Legal run on the new layout with no third-party requests. 72 legacy templates left.
- The frontend now has a build step. `npm run build` does everything; after a plain `git pull` run it again, the server will not start without `dist/client`.
- Installer hardened: run as root it creates a `nostrcheck` system user and installs into `/opt/nostrcheck-server`, the app listens on `127.0.0.1` (new `server.listenHost`), and nginx no longer passes on a client's `CF-Connecting-IP` (`--cloudflare` when the server is behind Cloudflare). Existing installs are kept as they are; the readme says how to bring them over.
- Updater: checks that the update can be applied before stopping the server, keeps the previous commit as `refs/nostrcheck/pre-update-<date>`, `--backup-db`. Installer and updater logs moved to `/var/log`.
- Docker: multi-stage image that runs as `node` with a healthcheck; `compose.yml` publishes the app on `127.0.0.1:3000` and waits for MariaDB.

## 0.7.0

- The Nostr relay.
- Improved security engine.
- Improved database engine.
- Improved redis engine.
- New log engine.
- Legal, privacy and tos pages.
- Improved AI moderation engine.
- Improved Dashboard and settings page.
- Custom file types and extensions.
- Full multi-tenancy support.
- Improved theming engine.
- Fixed isFirstUse logic.
- Tons of new configurable options.
- General refactor and code cleanup.
- Key converter frontend page.
- Relay frontend page.
- Improved install script.

## 0.6.0

- New module for local and remote blob storage. Compatibility with S3 remote storage.
- Lightning support. The server services now can be paid with Lightning.
- Dashboard page complete refactor.
- NIP96 new implementations. Listing files and no_transform.
- User profile page. Complete file administration.
- New theming module. Custom themes can be created and applied.
- Blossom compatible.
- AI analysis module connection for image moderation.
- Register form.
- Public gallery.
- Banneable pubkeys and files.
- New file types supported.
- User profile page. Nostr profile update.
- Plugins engine
- Invites engine

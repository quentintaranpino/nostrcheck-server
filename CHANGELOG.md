# Changelog

## 0.7.1

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

# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Release workflow now runs on every push to `main` instead of requiring a
  manually-pushed `vX.Y.Z` tag: it tags the commit and publishes the release
  itself the first time it sees an unreleased `version` in
  `extension/manifest.json`, and no-ops otherwise.

## [1.0.0] - 2026-08-20

### Added

- Initial public release of TabGroupsLeash (formerly prototyped as "Tab Group
  Guard"), rebuilt into its own repository.
- Manifest V3 extension: background service worker, content script, and popup UI.
- Per-tab-group URL pattern matching, with optional page-specific rules, indexed by
  group title so settings sync across devices via `chrome.storage.sync`.
- Local-only fallback (`chrome.storage.local`) for untitled groups, which can't be
  reliably identified across devices.
- Global enable/disable toggle, synced across devices.
- GitHub Actions workflow that packages `extension/` into a zip and publishes it as
  a GitHub Release whenever a `vX.Y.Z` tag is pushed.

[Unreleased]: https://github.com/ngshya/TabGroupsLeash/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ngshya/TabGroupsLeash/releases/tag/v1.0.0

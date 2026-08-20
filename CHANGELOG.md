# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.0] - 2026-08-20

### Added

- The group switcher now also lists every **other** titled group that has saved
  rules but isn't open in this window right now (closed, or open in another window
  or device) — shown with a dashed outline. Selecting one opens its rules, still
  fully editable and deletable, even though the group itself isn't in front of you.
  Previously such groups' rules were invisible and unreachable from the popup.

### Fixed

- Removing the last rule from a group that isn't open in this window now deletes
  its now-empty `storage.sync` entry, instead of leaving an orphaned `{ rules: [] }`
  behind that would keep showing up in the switcher forever.

## [1.1.0] - 2026-08-20

### Changed

- Removed the group-wide "group pattern". A group's leash is now purely a set of
  per-page rules (match → pattern); a tab whose current page doesn't match any rule
  is left unleashed (normal browsing) instead of falling back to one pattern for
  the whole group, which never made sense for groups mixing unrelated sites.
- Popup now opens directly on the rules for **the group of the tab you're currently
  on**. When the window has more than one tab group, a row of chips above lets you
  switch to any other group's rules instead of scrolling through all of them at once.
- Release workflow now runs on every push to `main` instead of requiring a
  manually-pushed `vX.Y.Z` tag: it tags the commit and publishes the release itself
  the first time it sees an unreleased `version` in `extension/manifest.json`, and
  no-ops otherwise.

### Added

- A **Saved ✓** indicator flashes next to the group title on every successful rule
  edit; a failed save (e.g. a `storage.sync` quota error) shows the reason there
  instead of a blocking `alert()`.
- "Add a rule from an open tab" lists the tab you're currently on first, marked
  "current tab".
- "Clear this group's rules" now works for untitled (local-only) groups too, not
  just synced ones.

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

[Unreleased]: https://github.com/ngshya/TabGroupsLeash/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/ngshya/TabGroupsLeash/releases/tag/v1.2.0
[1.1.0]: https://github.com/ngshya/TabGroupsLeash/releases/tag/v1.1.0
[1.0.0]: https://github.com/ngshya/TabGroupsLeash/releases/tag/v1.0.0

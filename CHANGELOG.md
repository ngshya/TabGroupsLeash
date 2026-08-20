# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.5.0] - 2026-08-20

### Added

- **Close undeclared tabs** (Settings on the manage page, off by default): for a
  group that already has at least one rule, the startup check can now also close
  every open tab that doesn't match *any* of that group's `match` fields, instead
  of only opening missing ones and closing duplicates. Off by default because it
  can close tabs you opened yourself in that group without ever writing a rule for
  them.

## [1.4.0] - 2026-08-20

### Added

- **New icon** — replaces the plain placeholder.
- **Light/dark theme.** A cycle button in the popup (System / Light / Dark) applies
  across both the popup and the manage page, synced across devices.
- **Popup/manage page split.** The toolbar popup is now a thin dashboard: on/off,
  theme, installed version in the footer, and every group listed with its rule
  count. Actual rule editing moved to a new **manage page** (`options.html`, opens
  as its own tab, reachable via the popup's "Manage rules & settings" button or by
  clicking a group row to jump straight to it) — a popup stops being usable once
  there are more than a couple of groups with several rules each; the manage page
  has room for all of them side by side.
- The group list (popup and manage page alike) also shows every **other** titled
  group that has saved rules but isn't open in this window right now (closed, or
  open in another window or device) — shown with a dashed outline. Selecting one
  opens its rules, still fully editable and deletable, even though the group
  itself isn't in front of you. Previously such groups' rules were invisible and
  unreachable.
- Rules can now carry a **"Reopen at this URL if missing"** field. Once per actual
  browser startup (never mid-session), after a configurable delay (default 15s,
  Settings section on the manage page) for Chrome's own session restore to settle,
  the extension checks every group with at least one reopen URL configured: opens
  a background tab (recreating the group itself if it's gone entirely) for any
  page that's missing, and closes duplicate tabs beyond the first for any page
  that has more than one. Only covers titled (synced) groups. "Add a rule from an
  open tab" prefills this field with the tab's exact current URL.

### Fixed

- Removing the last rule from a group that isn't open in this window now deletes
  its now-empty `storage.sync` entry, instead of leaving an orphaned `{ rules: [] }`
  behind that would keep showing up in the group list forever.

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

[Unreleased]: https://github.com/ngshya/TabGroupsLeash/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/ngshya/TabGroupsLeash/releases/tag/v1.5.0
[1.4.0]: https://github.com/ngshya/TabGroupsLeash/releases/tag/v1.4.0
[1.1.0]: https://github.com/ngshya/TabGroupsLeash/releases/tag/v1.1.0
[1.0.0]: https://github.com/ngshya/TabGroupsLeash/releases/tag/v1.0.0

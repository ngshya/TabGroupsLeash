# CLAUDE.md

Guidance for Claude Code (and other AI coding agents) working in this repository.

## Project

TabGroupsLeash is a dependency-free Manifest V3 Chrome extension. It keeps each
Chrome tab group "on a leash": every group has a URL pattern (and, optionally,
per-page rules); links clicked inside the group that match the pattern navigate
normally, links that don't match open in a new tab outside the group instead. See
[README.md](./README.md) for full user-facing behavior and pattern syntax.

## Branching — always work on `svil`

**Every change in this repository is developed and pushed on the `svil` branch.**

- Do not commit or push directly to `main`. `main` only moves via a merge from
  `svil`, and normally only as part of cutting a release (see below).
- If `svil` doesn't exist locally yet, create it from `main`:
  `git fetch origin && git checkout -B svil origin/svil` (or, if `origin/svil`
  doesn't exist yet, `git checkout -b svil origin/main`).
- Push with `git push -u origin svil`. Don't force-push `svil` unless explicitly
  asked to — it's the shared development branch.
- Open pull requests against `svil`, not `main`, unless a human explicitly asks
  for something else (e.g. the PR that promotes `svil` into `main` for a release).

This rule is intentional and was set by the project owner — follow it even if a
generic default would suggest working on `main` or on a throwaway branch.

## Repository layout

```
extension/               The extension itself (load this folder as "unpacked")
  manifest.json            Manifest V3 config — permissions, entry points, version
  background.js             Service worker: decides where clicked links go
  content.js                 Content script: intercepts <a href> clicks on the page
  common.js                   Shared storage + pattern-matching helpers
  popup.html/css/js         Popup UI: on/off toggle, per-group pattern editor
  icons/                       Toolbar/store icons (16/48/128 px)
.github/workflows/release.yml  Builds extension/ into a zip and publishes a Release
README.md, CONTRIBUTING.md, CHANGELOG.md, LICENSE
```

There is no build step, bundler, or package.json — the extension runs straight from
the files under `extension/`. Keep it that way unless there's a concrete reason
(e.g. adding TypeScript or a test runner) and it's discussed with the project owner
first.

## Conventions

- Plain, modern JavaScript (ES2020+), 2-space indentation, semicolons, `const`/`let`,
  `async`/`await`. No transpilation, no external runtime libraries.
- User-facing strings (popup UI, alerts, README) are in English.
- `common.js` is loaded by both the service worker (`importScripts`) and the popup
  (`<script>` tag) — don't add anything to it that assumes one context or the other.
- Group settings are keyed by **group title**, not by `chrome.tabGroups` id (ids are
  local per browser session and aren't a valid cross-device key). Untitled groups
  fall back to `chrome.storage.local`, scoped to the local `groupId`, because they
  can't be identified reliably across devices.
- Respect `chrome.storage.sync` quotas (8 KB/item, ~100 KB total): don't add
  per-group data that could grow unbounded without a cap.

## Releases

Releases are built by [`.github/workflows/release.yml`](./.github/workflows/release.yml):

1. Bump `version` in `extension/manifest.json` (semver).
2. Update `CHANGELOG.md` (Keep a Changelog format) with a new dated entry.
3. Merge `svil` into `main`.
4. Tag the resulting commit on `main` as `vX.Y.Z`, matching the manifest version
   exactly, and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.

Pushing that tag triggers the workflow, which validates `extension/manifest.json`,
zips the contents of `extension/` (so `manifest.json` sits at the zip's root, ready
for Chrome Web Store upload or "Load unpacked"), and publishes it as a GitHub
Release named after the tag with the zip attached. A tag whose version doesn't
match the manifest fails the workflow on purpose — fix one or the other before
retagging. `workflow_dispatch` runs build and attach the zip as a workflow artifact
without publishing a release, for testing the packaging step.

## Testing changes locally

There's no automated test suite. To verify a change:

1. `chrome://extensions` → enable Developer mode → **Load unpacked** → select
   `extension/`.
2. After editing `extension/` files, click the reload icon on the extension's card
   (service worker and content scripts don't hot-reload).
3. Exercise the specific flow you changed (e.g. click a matching/non-matching link
   inside a tab group, toggle the enable switch, add/remove a rule in the popup) and
   check `chrome://extensions` for runtime errors on the extension's card.

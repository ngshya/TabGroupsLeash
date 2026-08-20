# CLAUDE.md

Guidance for Claude Code (and other AI coding agents) working in this repository.

## Project

TabGroupsLeash is a dependency-free Manifest V3 Chrome extension. It keeps each
Chrome tab group "on a leash": every group has a URL pattern (and, optionally,
per-page rules); links clicked inside the group that match the pattern navigate
normally, links that don't match open in a new tab outside the group instead. Rules
can also carry a URL to reopen if the page they guard goes missing, checked once on
every browser startup. See [README.md](./README.md) for full user-facing behavior
and pattern syntax.

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
  background.js             Service worker: decides where clicked links go,
                              plus the startup reconcile (background.js#reconcileGroups)
  content.js                 Content script: intercepts <a href> clicks on the page
  common.js                   Shared storage + pattern-matching helpers
  theme.css                   Shared light/dark CSS variables + base resets,
                                linked by both popup.html and options.html
  popup.html/css/js         Toolbar popup: on/off, theme cycle, version, and a
                              per-group rule-count overview — no rule editing here
  options.html/css/js      Manage page (extension's options_page, opens as a full
                              tab): the actual rule editor, every group at once
  icons/                       Toolbar/store icons (16/48/128 px)
.github/workflows/release.yml  Builds extension/ into a zip and publishes a Release
README.md, CONTRIBUTING.md, CHANGELOG.md, LICENSE
```

### Popup vs. options page — don't merge them back

The popup (`popup.html`) is deliberately a thin dashboard: enable/disable, theme,
version, and a list of groups with rule counts that deep-links into the options
page. All actual rule editing (add/edit/delete a rule, quick-add, clear a group,
the startup-delay setting) lives on `options.html`, opened via
`chrome.runtime.openOptionsPage()` or `popup.js#openManagePage()` (which also
supports a `#group=<title>` hash to land directly on one group — `options.js`
reads it on load and on `hashchange`). This split exists because a popup is capped
at a few hundred px and stops being usable once there are more than a couple of
groups with several rules each — don't move the editor back into the popup, and
don't let the popup grow its own duplicate editing UI; extend `options.js` instead.

`popup.js` and `options.js` both duplicate a few small helpers (`buildRuleRow` and
friends only exist in `options.js` now; the group-discovery logic — open-in-window
entries plus "elsewhere" titled groups with saved rules — is intentionally
similar-but-separate in both files, since the popup only needs counts while
`options.js` needs full editable state). Keep genuinely shared logic in
`common.js`, not copy-pasted between the two page scripts.

There is no build step, bundler, or package.json — the extension runs straight from
the files under `extension/`. Keep it that way unless there's a concrete reason
(e.g. adding TypeScript or a test runner) and it's discussed with the project owner
first.

## Conventions

- Plain, modern JavaScript (ES2020+), 2-space indentation, semicolons, `const`/`let`,
  `async`/`await`. No transpilation, no external runtime libraries.
- User-facing strings (popup UI, alerts, README) are in English.
- `common.js` is loaded by the service worker (`importScripts`) and by both
  `popup.html` and `options.html` (`<script>` tag) — don't add anything to it that
  assumes one of those three contexts.
- Theme: colors live as CSS custom properties in `theme.css` (`:root` = light,
  overridden under `prefers-color-scheme: dark` and under `[data-theme="dark"]`/
  `[data-theme="light"]`), applied via `common.js#applyTheme()`. Add new UI with
  `var(--token)`, never a hardcoded hex — a hardcoded color only shows up correctly
  in whichever theme you happened to test in. The theme *control* lives only in the
  popup (`getThemePreference`/`setThemePreference` in `common.js`); `options.js`
  only applies whatever's stored and listens for `storage.onChanged` to pick up a
  change live — don't add a second theme switcher there.
- Group settings are keyed by **group title**, not by `chrome.tabGroups` id (ids are
  local per browser session and aren't a valid cross-device key). Untitled groups
  fall back to `chrome.storage.local`, scoped to the local `groupId`, because they
  can't be identified reliably across devices.
- There is no group-wide default pattern — every tab is leashed individually, by
  matching its current URL against each rule's `match` field
  (`common.js#resolvePatternForTab`). A tab with no matching rule resolves to `null`
  and callers must treat that as "leave it alone", not "block everything" — don't
  reintroduce a group-level fallback pattern without re-reading why it was removed
  (a tab group routinely mixes unrelated sites, so one pattern for the whole group
  doesn't hold).
- Respect `chrome.storage.sync` quotas (8 KB/item, ~100 KB total): don't add
  per-group data that could grow unbounded without a cap.
- A rule is `{ match, pattern, openUrl }`. `match` identifies the page (used both
  for link-leashing and for "is this rule's tab still open"); `pattern` and
  `openUrl` are each independently optional — a rule only needs `match` plus at
  least one of the other two. `resolvePatternForTab` already treats a rule with an
  empty `pattern` the same as "no rule" (null), so a reopen-only rule never
  leashes links; don't special-case that in background.js's click handler.

## Startup reconcile — design constraints

`background.js#reconcileGroups` (rules with `openUrl` set) is intentionally scoped
tight. Read this before changing it:

- **Startup-only, once per launch.** It runs off `chrome.runtime.onStartup` via a
  single one-shot `chrome.alarms` alarm (delay = `getStartupDelaySeconds()`,
  default 15s, user-configurable under Settings on the options page) — never on an
  interval, never in
  response to `chrome.tabGroups.onRemoved` or `chrome.tabs.onRemoved`. Reacting to
  every close during a session would fight the user every time they deliberately
  close a tab or a whole group, which is the opposite of the point. Don't add a
  recurring alarm or a close-event listener to "catch up faster" without this
  being an explicit, discussed change.
- **Titled (synced) groups only.** An untitled group's local `groupId` isn't
  stable across a restart, so there is nothing to recreate it by. Don't try to
  extend this to `untitledGroups` in `storage.local`.
- **Two moves, both scoped to rules with `openUrl`:** open a background tab (and
  recreate the group, uncolored, if it doesn't exist anywhere) for any rule whose
  `match` has zero open tabs; close every open tab beyond the first for any rule
  whose `match` has more than one. It never touches tabs that don't match any
  `openUrl` rule's `match` — it does not attempt to enforce "only these tabs may
  exist in this group". Widening it to close unrelated tabs is a materially more
  destructive behavior change and needs explicit sign-off from the project owner,
  not just a plausible-sounding generalization.
- Respect the global enable/disable toggle (`getEnabled()`) — the reconcile is a
  no-op when the extension is switched off, same as link-leashing.

## Releases

Releases are fully automated by
[`.github/workflows/release.yml`](./.github/workflows/release.yml) — there is no
manual tagging step, on purpose: this repo is often driven from a sandboxed Claude
Code Remote session whose GitHub credentials can push branches but are blocked from
pushing tags directly. The workflow creates the tag itself, running with the Actions
job's own `GITHUB_TOKEN` (not the session's credentials), so it isn't affected by
that restriction.

To cut a release:

1. Bump `version` in `extension/manifest.json` (semver).
2. Update `CHANGELOG.md` (Keep a Changelog format) with a new dated entry.
3. Merge `svil` into `main` (or push directly to `main`).

That's it. On every push to `main`, the workflow reads `version` from
`extension/manifest.json` and checks whether a `vX.Y.Z` tag for it already exists:

- If it doesn't: the workflow validates `extension/manifest.json`, zips the
  contents of `extension/` (so `manifest.json` sits at the zip's root, ready for
  Chrome Web Store upload or "Load unpacked"), tags the pushed commit `vX.Y.Z`, and
  publishes a GitHub Release named after the tag with the zip attached.
- If it does (the push to `main` didn't bump the version): the workflow no-ops.

`workflow_dispatch` re-runs the same check/release logic on demand — useful to
retry a failed release, or to release the current `main` without waiting for
another push.

## Testing changes locally

There's no automated test suite. To verify a change:

1. `chrome://extensions` → enable Developer mode → **Load unpacked** → select
   `extension/`.
2. After editing `extension/` files, click the reload icon on the extension's card
   (service worker and content scripts don't hot-reload).
3. Exercise the specific flow you changed (e.g. click a matching/non-matching link
   inside a tab group, toggle the enable switch, add/remove a rule in the popup) and
   check `chrome://extensions` for runtime errors on the extension's card.

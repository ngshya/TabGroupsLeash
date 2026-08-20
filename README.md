# TabGroupsLeash

A Manifest V3 Chrome extension that keeps each **tab group on a leash**: define a URL
pattern per group (and, optionally, per page). Links you click that match the pattern
navigate normally; links that don't match open in a new tab **outside** the group,
leaving the original tab untouched.

No account, no backend, no build step — just Chrome's own `storage.sync`.

## Why

Tab groups are great for keeping a project, a research session, or a set of docs
together. The problem is that a single stray click on an external link drags a random
page into the group (or worse, navigates the tab you wanted to keep). TabGroupsLeash
intercepts link clicks inside a group and reroutes anything that falls outside the
group's pattern into its own, ungrouped tab — so the group stays exactly what you
built it to be.

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the [`extension/`](./extension) folder

Alternatively, download the zipped build from the [Releases](../../releases) page,
unzip it, and load the resulting folder the same way.

## Usage

- Toolbar icon → the switch at the top enables/disables the whole extension
  (default: on, synced across devices).
- For every tab group open in the current window:
  - **Group pattern**: the default rule for all tabs in the group, pre-filled with
    the group's domain.
  - **Page-specific rules**: pairs of "if the tab's URL matches X, then links must
    match Y". Add them manually (`+`) or with one click via **Add a rule from an
    open tab**.

### Pattern syntax

- `*` is a wildcard: `*://example.com/*` matches any URL on that domain;
  `https://example.com/blog/*` restricts it to a subsection.
- Prefix a pattern with `regex:` for advanced matching, e.g.
  `regex:^https://example\.com/(blog|docs)/`.

### Click behavior

- Tab **not** in a group → normal browser behavior, untouched.
- Tab in a group, link matches the pattern → a plain click navigates in the same
  tab; ctrl/cmd/shift/middle-click open a new tab that stays in the same group.
- Tab in a group, link does **not** match the pattern → it always opens in a new
  tab outside the group; the original tab's page never changes.

## Cross-device sync

Settings use `chrome.storage.sync`, Chrome's built-in synced storage (only requires
being signed into Chrome with sync enabled for "Settings/extensions", which is on by
default — no extra permission beyond `"storage"`).

**A group's identity is its title.** Tab and group IDs (`chrome.tabGroups`/
`chrome.tabs`) are local to each browser and change every session, even with
Chrome's native "tab group sync": they can't be used as a cross-device key. So
TabGroupsLeash indexes settings by **group title** (case-sensitive) instead.

**Page-specific rules are tied to a URL, not to a specific tab.** When you open or
navigate a tab inside a group, on any device, the extension:

1. reads the title of the group that tab belongs to locally,
2. downloads the rules saved for that title from `storage.sync`,
3. compares the tab's current URL against each rule's "match" field,
4. uses the pattern from whichever rule matches (the most specific one, if several
   do) to validate links clicked in that tab; if no rule matches, it falls back to
   the group's default pattern.

That means a rule created on one device automatically applies to any tab, on any
device, whose current page falls inside the saved "match" pattern — no need to
recognize "the same tab".

### Sync limitations

- **Untitled groups** can't be reliably identified cross-device: their settings stay
  in `storage.local` on the current device only (a warning is shown in the popup).
- `storage.sync` has quotas: 8 KB per item, ~100 KB total, ~120 writes/minute. A
  reasonable number of rules per group won't come close; if it does, saving fails
  with a warning in the popup.
- Renaming a group creates a new entry; the old one stays orphaned in `storage.sync`
  until you delete it manually (✕ button next to the group title).
- Sync across devices isn't instant — it depends on Chrome's sync cycle, usually a
  few seconds.

## Other limitations

- Only clicks on `<a href>` elements (left and middle button) in the page's main
  frame are intercepted; links opened via `window.open()` from JavaScript without
  direct user interaction, or from inside an iframe, are not covered.
- `javascript:`, `mailto:`, `tel:` links, and links with a `download` attribute are
  never intercepted (native browser behavior applies).

## Project layout

```
extension/         The extension itself — load this folder as "unpacked"
  manifest.json     Manifest V3 configuration
  background.js     Service worker: tab open/move logic
  content.js        Intercepts link clicks on the page
  popup.html/css/js UI to toggle the extension and edit patterns/rules
  common.js         Shared utilities (sync/local storage, pattern matching)
  icons/            Toolbar and store icons
.github/workflows/  CI: packages extension/ into a zip on every tagged release
```

## Releasing

Releases are automatic: bump `version` in `extension/manifest.json`, merge it into
`main`, and a GitHub Actions workflow zips the `extension/` folder, tags the commit
`vX.Y.Z`, and publishes it as a GitHub Release — no manual tagging step. See
[CLAUDE.md](./CLAUDE.md#releases) for the full branching and release workflow.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)

# TabGroupsLeash

A Manifest V3 Chrome extension that keeps each **tab on a leash**: you decide, tab by
tab, which URL pattern its clicked links must stay inside. Links that match navigate
normally; links that don't match open in a new tab **outside** the group, leaving the
original tab untouched.

There is no single pattern for a whole group — tab groups routinely mix completely
unrelated sites, so TabGroupsLeash leashes each tab by its own current page instead of
guessing one pattern for the whole group. A tab you haven't configured yet just
behaves normally.

No account, no backend, no build step — just Chrome's own `storage.sync`.

## Why

Tab groups are great for keeping a project, a research session, or a set of docs
together. The problem is that a single stray click on an external link drags a random
page into the group (or worse, navigates the tab you wanted to keep). TabGroupsLeash
intercepts link clicks and, for any tab you've set a rule for, reroutes anything that
falls outside that rule's pattern into its own, ungrouped tab — so the group stays
exactly what you built it to be.

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the [`extension/`](./extension) folder

Alternatively, download the zipped build from the [Releases](../../releases) page,
unzip it, and load the resulting folder the same way.

## Usage

The toolbar popup is a quick dashboard; the actual rule editing happens on a full
**manage page** (more room once you have several groups and rules than a ~300px
popup could ever offer).

### Popup

- The switch enables/disables the whole extension (default: on, synced across
  devices).
- The 🖥️/☀️/🌙 button cycles the **theme**: System (follows your browser/OS), Light,
  Dark — synced across devices.
- Below that, every group is listed with its rule count — groups open in this
  window, plus any other titled group that has saved rules but isn't open here right
  now (dashed outline). Click one to jump straight to it on the manage page.
- **Manage rules & settings** opens the manage page (reuses an already-open tab if
  there is one).
- The footer shows the installed version.

### Manage page

Opens as its own tab (`options.html`) so there's room for every group side by side
with its rules, instead of one at a time in a cramped popup.

- Left: every group (same discovery as the popup's list — open in this window, or
  elsewhere with saved rules). Click one to edit it on the right.
- Right: that group's rules — pairs of "if a tab's URL matches X, then links clicked
  in it must match Y" (see [Recovering closed tabs](#recovering-closed-tabs) for the
  third field). Add one manually (`+`) or with one click via **Add a rule from an
  open tab**, which lists every open tab in that group that doesn't have a rule yet.
- Every save (editing a rule, adding one, deleting one) flashes a **Saved ✓** next to
  the group title so you know it went through; a failed save (e.g. a `storage.sync`
  quota error) shows the reason there instead.
- A tab with no matching rule yet isn't leashed — its links behave normally until
  you add one.
- The **startup check delay** setting (see below) also lives here.

### Pattern syntax

- `*` is a wildcard: `*://example.com/*` matches any URL on that domain;
  `https://example.com/blog/*` restricts it to a subsection.
- Prefix a pattern with `regex:` for advanced matching, e.g.
  `regex:^https://example\.com/(blog|docs)/`.
- **Add a rule from an open tab** ("Use this page") always starts both the match and
  the pattern from the page's full path — every `/level` it has — with the query
  string and fragment already stripped (`https://example.com/search?q=x#top` becomes
  `*://example.com/search*`). Narrow or widen it from there.

### Click behavior

- Tab **not** in a group → normal browser behavior, untouched.
- Tab in a group, link matches the pattern → a plain click navigates in the same
  tab; ctrl/cmd/shift/middle-click open a new tab that stays in the same group.
- Tab in a group, link does **not** match the pattern → it always opens in a new
  tab outside the group; the original tab's page never changes.

## Recovering closed tabs

Any rule can also carry a **"Reopen at this URL if missing"** field — an exact URL
(not a pattern) to reopen automatically if the page it's guarding isn't open in the
group anymore. This is separate from link leashing: a rule only needs a `match` plus
either a `pattern` (leash links), a reopen URL (guarantee presence), or both.

- **Add a rule from an open tab** ("Use this page") prefills it with that tab's exact
  current URL, so protecting a tab against being closed by accident is a single
  click — clear the field afterward if you don't want that for a particular rule.
- On every actual **browser startup** (not on every popup open, and never mid-session
  — closing a tab on purpose during the day is never undone by this), the extension
  waits a configurable delay (default **15 seconds**, under Settings on the manage page)
  for Chrome's own session restore to settle, then checks every group that has at
  least one reopen URL configured:
  - a page with no open tab matching its rule's `match` → reopens it, in the
    background, in that group (recreating the group itself, with a default color, if
    it isn't open anywhere at all);
  - a page with **more than one** open tab matching its rule's `match` (e.g.
    duplicates from Chrome's own crash recovery) → closes the extras, keeping the
    leftmost tab.
- Only works for **titled (synced) groups** — an untitled group's identity doesn't
  survive a restart, so there's nothing stable to recreate it by.

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
   do) to validate links clicked in that tab; if no rule matches, that tab is left
   unleashed — links open normally, exactly like a tab outside any group.

That means a rule created on one device automatically applies to any tab, on any
device, whose current page falls inside the saved "match" pattern — no need to
recognize "the same tab".

### Sync limitations

- **Untitled groups** can't be reliably identified cross-device: their settings stay
  in `storage.local` on the current device only (a warning is shown on the manage page).
- `storage.sync` has quotas: 8 KB per item, ~100 KB total, ~120 writes/minute. A
  reasonable number of rules per group won't come close; if it does, saving fails
  with a warning on the manage page.
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
- The startup reconcile checks each rule independently: if two rules in the same
  group have overlapping `match` patterns that can both cover the same tab, the
  duplicate-closing step can behave oddly for that tab. Keep a group's `match`
  patterns non-overlapping if you're using reopen URLs.

## Project layout

```
extension/           The extension itself — load this folder as "unpacked"
  manifest.json       Manifest V3 configuration
  background.js       Service worker: tab open/move logic, startup reconcile
  content.js          Intercepts link clicks on the page
  common.js           Shared utilities (sync/local storage, pattern matching)
  theme.css           Shared light/dark design tokens for popup.html + options.html
  popup.html/css/js   Toolbar popup: on/off, theme, per-group rule counts
  options.html/css/js Manage page: the actual rule editor, one tab, all groups
  icons/              Toolbar and store icons
.github/workflows/    CI: packages extension/ into a zip on every tagged release
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

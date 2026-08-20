# Contributing to TabGroupsLeash

Thanks for taking a look! This is a small, dependency-free Manifest V3 extension —
there's no build step, no bundler, no framework.

## Branching

**All development happens on the `svil` branch.** Base your work on `svil`, not
`main`, and open pull requests against `svil`. See [CLAUDE.md](./CLAUDE.md) for the
full workflow (why `svil` exists, how `main` and releases relate to it).

```bash
git clone https://github.com/ngshya/TabGroupsLeash.git
cd TabGroupsLeash
git checkout svil
git pull origin svil
```

## Local development

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select the [`extension/`](./extension) folder.
3. After editing any file under `extension/`, click the refresh icon on the
   extension's card in `chrome://extensions` to reload it (background service
   worker and content scripts don't hot-reload).
4. Reopen or reload any page you're testing content-script changes on. The manage
   page (`options.html`) is a normal tab, so it just needs a manual reload too —
   it doesn't auto-refresh when you edit `options.js`/`options.css`.

There's nothing to install and nothing to compile — the extension runs straight
from the files in `extension/`.

### Testing the popup / manage page split

- Popup → manage page: click a group row in the popup, or **Manage rules &
  settings**, and confirm it lands on the right tab (reusing an already-open one
  if there is one) and, for a specific group, the right group selected
  (`options.html#group=<title>`).
- Theme: the cycle button lives only in the popup; changing it should update the
  popup immediately and the manage page live if it's already open in another tab
  (via the `storage.onChanged` listener in `options.js`) — no reload needed there.
- Rule counts in the popup and in the manage page's left nav should always agree;
  if they don't after a change, check that both `popup.js#renderGroupsList` and
  `options.js#loadAndRender` are reading from the same storage shape.

### Testing the startup reconcile

`background.js#reconcileGroups` only runs off `chrome.runtime.onStartup`, which
doesn't fire on a plain extension reload — restarting the whole browser for every
test is slow. To trigger it on demand instead: `chrome://extensions` → click
**service worker** under TabGroupsLeash to open its console → run
`reconcileGroups()` directly, or `chrome.alarms.create('tgl-startup-reconcile', {delayInMinutes: 0.02})`
to also exercise the alarm path. Set a short **startup check delay** (Settings
section on the manage page) while iterating so an actual browser restart doesn't
require a 15-second wait.

## Code style

- Plain, modern JavaScript (ES2020+), no transpilation, no external libraries.
- Match the existing style: 2-space indentation, semicolons, `const`/`let` (no
  `var`), `async`/`await` over raw promise chains.
- Keep `common.js` free of anything that assumes it's running in the service
  worker vs. the popup vs. the manage page — it's shared by all three.
- User-facing strings (popup UI, manage page, alerts) are in English.
- New UI colors go in `theme.css` as a `var(--token)`, not a hardcoded hex — see
  [CLAUDE.md](./CLAUDE.md) for the theming convention.

## Submitting changes

1. Create a branch off `svil` for your change.
2. Make sure the extension still loads without errors (`chrome://extensions` →
   check for the red "Errors" button on the extension's card) and manually
   exercise the paths you touched — there's no automated test suite yet.
3. Update `README.md` / `CHANGELOG.md` if behavior visible to users changes.
4. Open a pull request against `svil`, describing what changed and why.

## Releasing

Maintainers cut a release by bumping `version` in `extension/manifest.json` and
merging `svil` into `main`. That's it — a GitHub Actions workflow tags the merge
commit and publishes the release zip automatically; there's no manual tagging step.
See [CLAUDE.md](./CLAUDE.md#releases) for details.

## Reporting issues

Open a GitHub issue with: your Chrome version, the group/page pattern you
configured, the URL you clicked, and what you expected vs. what happened.

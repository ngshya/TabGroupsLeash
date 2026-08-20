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
4. Reopen or reload any page you're testing content-script changes on.

There's nothing to install and nothing to compile — the extension runs straight
from the files in `extension/`.

## Code style

- Plain, modern JavaScript (ES2020+), no transpilation, no external libraries.
- Match the existing style: 2-space indentation, semicolons, `const`/`let` (no
  `var`), `async`/`await` over raw promise chains.
- Keep `common.js` free of anything that assumes it's running in the service
  worker vs. the popup — it's shared by both.
- User-facing strings (popup UI, alerts) are in English.

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

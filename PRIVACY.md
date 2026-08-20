# Privacy Policy — TabGroupsLeash

_Last updated: 2026-08-20_

TabGroupsLeash is a Chrome extension that keeps each tab on a "leash": you
decide, tab by tab, which URL pattern its clicked links must stay inside.
Links that match navigate normally; links that don't match open in a new tab
outside the group, leaving the original tab untouched. It also offers an
optional startup check that reopens missing tabs and closes duplicate or
undeclared ones for groups you've configured.

## What the extension accesses

Everything below happens **locally, inside your browser** — nothing is sent
to the developer or to any third party:

- **The tab you click a link in** — its URL, index, and the title/ID of the
  tab group it belongs to — to look up the matching leash rule and decide
  where the link should open.
- **Link clicks on web pages** — a content script listens for left- and
  middle-clicks on `<a href>` elements so it can intercept the navigation
  before the browser follows it. It only reads the clicked link's `href`;
  it does not read page content, form data, or anything else on the page.
- **Your tab groups** — names and membership, to show them in the popup and
  manage page, and to create or rename a group during the optional startup
  reconcile.
- **The settings you configure yourself** — leash rules, the enabled/disabled
  toggle, startup-check delay, "close undeclared tabs" opt-in, and theme
  preference.

## What TabGroupsLeash does not do

- It does not transmit any browsing data, tab data, or settings to the
  developer, to an analytics service, or to any other third party.
- It has no backend server and makes no network requests of its own.
- It does not use remote or dynamically loaded code — everything that runs
  is packaged in the extension you install.
- It does not sell or share data with advertisers.
- It does not track browsing history beyond the current tab's URL, read at
  the moment needed to apply your rule.

## Storage

Your rules and settings are stored using Chrome's built-in
`chrome.storage.sync` and `chrome.storage.local` APIs — there is no
extension-operated database. `storage.sync` data syncs across your own
signed-in Chrome browsers through your Google Account, governed by Google's
own privacy policy; TabGroupsLeash never receives this data outside your
browser. Settings for untitled tab groups (which have no identity that
survives a restart) are kept in `storage.local` on that device only.

## Permissions

- `tabGroups`, `tabs` — read tab/group info and move tabs in and out of
  groups to enforce a rule; list groups for the popup and manage page.
- `storage` — save your rules and settings as described above.
- `alarms` — schedule the one-time delayed check that runs after browser
  startup (Manifest V3 service workers can't rely on `setTimeout`).
- Host permission for all sites — required so the content script can
  intercept link clicks on whatever sites your own leash rules refer to,
  since those rules can target any URL you choose to configure.

## Changes to this policy

Any changes will be posted at this same URL with an updated date above.

## Contact

Questions or issues: open a ticket at
https://github.com/ngshya/TabGroupsLeash/issues

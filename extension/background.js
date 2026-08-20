importScripts('common.js');

const TAB_GROUP_ID_NONE = -1;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LINK_CLICK' && sender.tab) {
    handleLinkClick(msg.href, sender.tab, msg.modifiers || {})
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // asynchronous response
  }
});

// Resolves the pattern clicked links must match for this tab, or null if the
// tab's current page has no rule yet (nothing configured = leave it alone).
async function resolvePatternFor(tab) {
  if (tab.groupId === undefined || tab.groupId === TAB_GROUP_ID_NONE) return null;

  const group = await chrome.tabGroups.get(tab.groupId).catch(() => null);

  if (group && group.title) {
    // Titled group: settings are synced, matched via URL rules
    const groupSettings = await getGroupSettings(group.title);
    return resolvePatternForTab(groupSettings, tab.url);
  }

  // Untitled group: not identifiable cross-device, fall back to local groupId
  const local = await getLocalFallback();
  const entry = local.untitledGroups[tab.groupId];
  return resolvePatternForTab(entry, tab.url);
}

async function handleLinkClick(href, tab, modifiers) {
  const enabled = await getEnabled();

  if (!enabled || tab.groupId === undefined || tab.groupId === TAB_GROUP_ID_NONE) {
    await fallbackOpen(href, tab, modifiers);
    return;
  }

  const pattern = await resolvePatternFor(tab);
  if (!pattern) {
    // No rule covers this tab's current page yet: leave it unleashed.
    await fallbackOpen(href, tab, modifiers);
    return;
  }

  const matches = matchesPattern(href, pattern);
  const groupId = tab.groupId;

  if (matches) {
    if (modifiers.newTab) {
      const created = await chrome.tabs.create({
        url: href,
        index: tab.index + 1,
        active: !modifiers.background,
        openerTabId: tab.id
      });
      if (created.groupId !== groupId) {
        await chrome.tabs.group({ tabIds: [created.id], groupId });
      }
    } else {
      await chrome.tabs.update(tab.id, { url: href });
    }
  } else {
    const created = await chrome.tabs.create({
      url: href,
      index: tab.index + 1,
      active: !modifiers.background,
      openerTabId: tab.id
    });
    if (created.groupId !== TAB_GROUP_ID_NONE) {
      await chrome.tabs.ungroup(created.id);
    }
  }
}

async function fallbackOpen(href, tab, modifiers) {
  if (modifiers.newTab) {
    await chrome.tabs.create({
      url: href,
      active: !modifiers.background,
      index: tab.index + 1,
      openerTabId: tab.id
    });
  } else {
    await chrome.tabs.update(tab.id, { url: href });
  }
}

// Clean up the local fallback when an untitled group is closed
chrome.tabGroups.onRemoved.addListener(async (group) => {
  if (group.title) return; // titled groups live in storage.sync, leave them alone
  const local = await getLocalFallback();
  if (local.untitledGroups[group.id]) {
    delete local.untitledGroups[group.id];
    await setLocalFallback({ untitledGroups: local.untitledGroups });
  }
});

// --- Startup reconciliation: reopen missing "openUrl" tabs, close duplicates ---
//
// Runs once per actual browser launch (chrome.runtime.onStartup), never
// mid-session — closing a tab on purpose during the day is never undone by
// this. It waits getStartupDelaySeconds() (default 15s, configurable in the
// popup) before checking, to give Chrome's own session restore time to
// finish repopulating windows/tabs/groups first.
//
// Only synced (titled) groups are covered: an untitled group's local
// groupId is meaningless after a restart, so there's nothing stable to
// recreate it by.

const RESTORE_ALARM_NAME = 'tgl-startup-reconcile';

chrome.runtime.onStartup.addListener(async () => {
  const seconds = await getStartupDelaySeconds();
  const delayInMinutes = Math.max(Number(seconds) || 0, 1) / 60;
  chrome.alarms.create(RESTORE_ALARM_NAME, { delayInMinutes });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== RESTORE_ALARM_NAME) return;
  reconcileGroups().catch((err) => console.error('TabGroupsLeash: startup reconcile failed', err));
});

async function reconcileGroups() {
  const enabled = await getEnabled();
  if (!enabled) return;

  const titles = await getAllGroupTitles();
  if (titles.length === 0) return;

  const allGroups = await chrome.tabGroups.query({});
  for (const title of titles) {
    const settings = await getGroupSettings(title);
    const essentialRules = (settings.rules || []).filter((rule) => rule.openUrl);
    if (essentialRules.length === 0) continue;
    await reconcileGroup(title, essentialRules, allGroups);
  }
}

async function reconcileGroup(title, essentialRules, allGroups) {
  const targetGroup = allGroups.find((g) => g.title === title) || null;
  const openTabs = targetGroup ? await chrome.tabs.query({ groupId: targetGroup.id }) : [];

  const missingRules = [];
  const idsToClose = [];

  for (const rule of essentialRules) {
    const matchingTabs = openTabs.filter((tab) => tab.url && matchesPattern(tab.url, rule.match));
    if (matchingTabs.length === 0) {
      missingRules.push(rule);
    } else if (matchingTabs.length > 1) {
      // More than one open tab covers the same rule (e.g. Chrome's own crash
      // recovery restored duplicates): keep the leftmost, close the rest.
      matchingTabs.sort((a, b) => a.index - b.index);
      idsToClose.push(...matchingTabs.slice(1).map((t) => t.id));
    }
  }

  if (idsToClose.length > 0) {
    await chrome.tabs.remove(idsToClose).catch((err) => console.warn('TabGroupsLeash: failed to close duplicate tab(s)', err));
  }

  if (missingRules.length === 0) return;

  let windowId = targetGroup?.windowId;
  if (windowId === undefined) {
    const lastFocused = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
    windowId = lastFocused?.id;
  }
  if (windowId === undefined) {
    const created = await chrome.windows.create({});
    windowId = created.id;
  }

  const newTabIds = [];
  for (const rule of missingRules) {
    try {
      const created = await chrome.tabs.create({ url: rule.openUrl, windowId, active: false });
      newTabIds.push(created.id);
    } catch (err) {
      console.warn(`TabGroupsLeash: couldn't open "${rule.openUrl}"`, err);
    }
  }
  if (newTabIds.length === 0) return;

  if (targetGroup) {
    await chrome.tabs.group({ tabIds: newTabIds, groupId: targetGroup.id });
  } else {
    // The group itself doesn't exist anywhere right now: recreate it from
    // the tabs we just opened. Its color isn't stored, so Chrome assigns a
    // default one.
    const newGroupId = await chrome.tabs.group({ tabIds: newTabIds, createProperties: { windowId } });
    await chrome.tabGroups.update(newGroupId, { title });
  }
}

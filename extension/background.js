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

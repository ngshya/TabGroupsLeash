const groupNav = document.getElementById('groupNav');
const navEmpty = document.getElementById('navEmpty');
const noSelectionState = document.getElementById('noSelectionState');
const groupPanel = document.getElementById('groupPanel');
const panelDot = document.getElementById('panelDot');
const panelTitle = document.getElementById('panelTitle');
const saveIndicator = document.getElementById('saveIndicator');
const clearGroupBtn = document.getElementById('clearGroupBtn');
const untitledWarning = document.getElementById('untitledWarning');
const notOpenHint = document.getElementById('notOpenHint');
const addRuleBtn = document.getElementById('addRuleBtn');
const rulesEmptyHint = document.getElementById('rulesEmptyHint');
const ruleList = document.getElementById('ruleList');
const quickAddBox = document.getElementById('quickAddBox');
const quickAddList = document.getElementById('quickAddList');
const startupDelayInput = document.getElementById('startupDelayInput');
const closeUndeclaredInput = document.getElementById('closeUndeclaredInput');
const versionLabel = document.getElementById('versionLabel');

const groupNavItemTemplate = document.getElementById('groupNavItemTemplate');
const ruleTemplate = document.getElementById('ruleTemplate');
const quickAddTemplate = document.getElementById('quickAddTemplate');

const GROUP_COLORS = {
  grey: '#8f9bb3', blue: '#4a90e2', red: '#e25c5c', yellow: '#e2c94a',
  green: '#4ae28c', pink: '#e24aa8', purple: '#a04ae2', cyan: '#4ae2e2', orange: '#e28c4a'
};

// entries: [{ key, group, tabs, isSynced, isOpen, settings? }], byId: Map<key, entry>
// key is the numeric chrome.tabGroups id for a group open in this window, or
// "elsewhere:<title>" for a synced group that has saved rules but isn't open
// here right now (closed, or open in a different window/device).
const state = { entries: [], byId: new Map(), selectedKey: null };

let saveIndicatorTimer = null;

async function init() {
  applyTheme(await getThemePreference());
  // The theme control itself lives only in the popup; if it's changed while
  // this page is open, pick it up live instead of needing a manual refresh.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.theme) applyTheme(changes.theme.newValue);
  });

  versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;

  startupDelayInput.value = await getStartupDelaySeconds();
  startupDelayInput.addEventListener('change', async () => {
    let value = Math.round(Number(startupDelayInput.value));
    if (!Number.isFinite(value) || value < 0) value = DEFAULT_STARTUP_DELAY_SECONDS;
    value = Math.min(value, 3600);
    startupDelayInput.value = value;
    await setStartupDelaySeconds(value);
  });

  closeUndeclaredInput.checked = await getCloseUndeclaredTabs();
  closeUndeclaredInput.addEventListener('change', () => {
    setCloseUndeclaredTabs(closeUndeclaredInput.checked);
  });

  window.addEventListener('hashchange', () => selectGroupFromHash());

  await loadAndRender();
}

function groupFromHash() {
  const match = /^#group=(.+)$/.exec(location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

function selectGroupFromHash() {
  const title = groupFromHash();
  if (!title) return;
  const entry = state.entries.find((e) => e.group.title === title);
  if (entry) selectGroup(entry.key);
}

// Loads every tab group open in the last-focused normal window, plus every
// OTHER titled group that has saved rules in storage.sync (closed, or open
// elsewhere) — so every configured group is reachable from this page.
async function loadAndRender() {
  const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  const groups = win ? await chrome.tabGroups.query({ windowId: win.id }) : [];
  const local = await getLocalFallback();

  // Every entry gets its rules loaded up front (not just the selected one) so
  // the nav can show an accurate rule count for all of them at once.
  const openEntries = await Promise.all(groups.map(async (group) => {
    const isSynced = !!group.title;
    const settings = isSynced
      ? await getGroupSettings(group.title)
      : local.untitledGroups[group.id] || { rules: [] };
    return {
      key: group.id,
      group,
      tabs: await chrome.tabs.query({ groupId: group.id }),
      isSynced,
      isOpen: true,
      settings
    };
  }));

  const openTitles = new Set(openEntries.filter((e) => e.isSynced).map((e) => e.group.title));
  const allTitles = await getAllGroupTitles();
  const elsewhereEntries = await Promise.all(
    allTitles
      .filter((title) => !openTitles.has(title))
      .sort((a, b) => a.localeCompare(b))
      .map(async (title) => ({
        key: `elsewhere:${title}`,
        group: { title, color: null },
        tabs: [],
        isSynced: true,
        isOpen: false,
        settings: await getGroupSettings(title)
      }))
  );

  state.entries = [...openEntries, ...elsewhereEntries];
  state.byId = new Map(state.entries.map((e) => [e.key, e]));

  if (state.entries.length === 0) {
    navEmpty.hidden = false;
    noSelectionState.hidden = false;
    groupPanel.hidden = true;
    return;
  }
  navEmpty.hidden = true;

  const hashTitle = groupFromHash();
  const hashEntry = hashTitle ? state.entries.find((e) => e.group.title === hashTitle) : null;
  const preferredKey = hashEntry ? hashEntry.key : state.entries[0].key;

  await selectGroup(preferredKey);
}

function renderNav(selectedKey) {
  groupNav.querySelectorAll('.nav-item').forEach((el) => el.remove());
  for (const entry of state.entries) {
    const node = groupNavItemTemplate.content.cloneNode(true);
    const dot = node.querySelector('.dot');
    const item = node.querySelector('.nav-item');
    node.querySelector('.nav-item-title').textContent = entry.group.title || '(untitled)';
    const count = (entry.settings?.rules || []).length;
    node.querySelector('.nav-item-count').textContent = count === 1 ? '1 rule' : `${count} rules`;
    if (entry.isOpen) {
      dot.style.background = GROUP_COLORS[entry.group.color] || '#999';
    } else {
      dot.classList.add('unknown');
      item.classList.add('not-open');
      item.title = `"${entry.group.title}" isn't open in this window right now — it still has saved rules`;
    }
    item.classList.toggle('selected', entry.key === selectedKey);
    item.addEventListener('click', () => selectGroup(entry.key));
    groupNav.appendChild(node);
  }
}

async function selectGroup(key) {
  const entry = state.byId.get(key);
  if (!entry) return;
  state.selectedKey = key;
  noSelectionState.hidden = true;
  groupPanel.hidden = false;
  await openGroup(entry);
  renderNav(key); // after openGroup, so the rule count in the nav is fresh
}

// Loads (or reloads) one group's rules from storage and paints the whole panel.
async function openGroup(entry) {
  panelDot.style.background = entry.isOpen ? (GROUP_COLORS[entry.group.color] || '#999') : 'transparent';
  panelDot.classList.toggle('unknown', !entry.isOpen);
  panelTitle.textContent = entry.group.title || '(untitled)';
  untitledWarning.hidden = entry.isSynced;
  notOpenHint.hidden = entry.isOpen;
  clearIndicator();

  entry.settings = entry.isSynced
    ? await getGroupSettings(entry.group.title)
    : (await getLocalFallback()).untitledGroups[entry.group.id] || { rules: [] };

  addRuleBtn.onclick = () => {
    ruleList.appendChild(buildRuleRow(entry, { match: '', pattern: '' }));
  };

  clearGroupBtn.onclick = async () => {
    if (entry.isSynced) {
      await deleteGroupSettings(entry.group.title);
    } else {
      const local = await getLocalFallback();
      delete local.untitledGroups[entry.group.id];
      await setLocalFallback({ untitledGroups: local.untitledGroups });
    }
    entry.settings = { rules: [] };
    showSaved();
    await afterMutation(entry);
  };

  refreshLists(entry);
}

// A group that isn't open in this window only stays in the nav while it has
// rules — once its last rule is gone, drop it by reloading the whole list
// instead of just repainting the (now pointless) empty panel.
async function afterMutation(entry) {
  if (!entry.isOpen && (entry.settings?.rules || []).length === 0) {
    await loadAndRender();
    return;
  }
  refreshLists(entry);
  renderNav(entry.key); // keep the nav's rule count in sync
}

// Rebuilds the rule list and the quick-add suggestions from entry.settings,
// without touching the save indicator (so a "Saved" flash from the mutation
// that triggered this isn't wiped out immediately after appearing).
function refreshLists(entry) {
  const rules = entry.settings?.rules || [];

  ruleList.innerHTML = '';
  for (const rule of rules) {
    ruleList.appendChild(buildRuleRow(entry, rule));
  }
  rulesEmptyHint.hidden = rules.length > 0;

  quickAddList.innerHTML = '';
  const existingMatches = new Set(rules.map((r) => r.match));
  // No single "current tab" here — this is a standalone management page, not
  // opened in the context of one particular tab — so candidates just keep
  // their natural tab order.
  const candidates = entry.tabs.filter((tab) => tab.url && !existingMatches.has(defaultMatchForUrl(tab.url)));

  for (const tab of candidates) {
    const suggestedMatch = defaultMatchForUrl(tab.url);
    const node = quickAddTemplate.content.cloneNode(true);
    node.querySelector('.quick-add-title').textContent = tab.title || tab.url;
    node.querySelector('.quick-add-btn').addEventListener('click', async () => {
      // Prefill openUrl with this tab's exact live URL (query string and all)
      // so "Use this page" also protects it against being closed by
      // accident, with no extra step.
      const nextRules = [...(entry.settings.rules || []), { match: suggestedMatch, pattern: suggestedMatch, openUrl: tab.url }];
      await persistRules(entry, nextRules);
      await afterMutation(entry);
    });
    quickAddList.appendChild(node);
  }
  quickAddBox.hidden = quickAddList.children.length === 0;
}

function buildRuleRow(entry, rule) {
  const node = ruleTemplate.content.cloneNode(true);
  const li = node.querySelector('.rule-row');
  const openUrlInput = node.querySelector('.rule-open-url');
  const matchInput = node.querySelector('.rule-match');
  const patternInput = node.querySelector('.rule-pattern');
  const deleteBtn = node.querySelector('.delete-rule');

  openUrlInput.value = rule.openUrl || '';
  matchInput.value = rule.match || '';
  patternInput.value = rule.pattern || '';

  const onEdit = () => saveRulesFromDom(entry);
  openUrlInput.addEventListener('change', onEdit);
  matchInput.addEventListener('change', onEdit);
  patternInput.addEventListener('change', onEdit);
  deleteBtn.addEventListener('click', async () => {
    li.remove();
    await saveRulesFromDom(entry);
  });

  return node;
}

function isValidOpenUrl(value) {
  if (!value) return true; // empty is fine: this rule just has no restore URL
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function collectRulesFromDom() {
  return Array.from(ruleList.querySelectorAll('.rule-row'))
    .map((row) => ({
      openUrl: row.querySelector('.rule-open-url').value.trim(),
      match: row.querySelector('.rule-match').value.trim(),
      pattern: row.querySelector('.rule-pattern').value.trim()
    }))
    // A rule needs at least a page to identify it (match), plus either
    // something to leash links to (pattern) or a URL to restore (openUrl).
    .filter((r) => r.match && (r.pattern || r.openUrl));
}

// Validates every rule currently in the DOM, then persists and refreshes —
// shared by every edit/delete handler so a typo in one row's URL blocks that
// save with a clear reason instead of silently storing junk that would only
// fail later, unattended, during a startup reconcile.
async function saveRulesFromDom(entry) {
  const rules = collectRulesFromDom();
  const invalid = rules.find((r) => r.openUrl && !isValidOpenUrl(r.openUrl));
  if (invalid) {
    showError(`"${invalid.openUrl}" isn't a valid http(s) URL`);
    return;
  }
  await persistRules(entry, rules);
  await afterMutation(entry);
}

async function persistRules(entry, rules) {
  try {
    if (entry.isSynced) {
      if (rules.length === 0 && !entry.isOpen) {
        // Not open here, and now ruleless: nothing left to identify it by,
        // so drop the storage key instead of leaving an empty orphan behind.
        await deleteGroupSettings(entry.group.title);
      } else {
        await setGroupSettings(entry.group.title, { rules });
      }
    } else {
      const local = await getLocalFallback();
      local.untitledGroups[entry.group.id] = { rules };
      await setLocalFallback({ untitledGroups: local.untitledGroups });
    }
    entry.settings = { rules };
    showSaved();
  } catch (e) {
    showError('Save failed (likely a storage.sync quota limit): ' + e.message);
  }
}

function clearIndicator() {
  clearTimeout(saveIndicatorTimer);
  saveIndicator.textContent = '';
  saveIndicator.className = 'save-indicator';
}

function showSaved() {
  clearTimeout(saveIndicatorTimer);
  saveIndicator.textContent = 'Saved ✓';
  saveIndicator.className = 'save-indicator ok show';
  saveIndicatorTimer = setTimeout(() => saveIndicator.classList.remove('show'), 1400);
}

function showError(message) {
  clearTimeout(saveIndicatorTimer);
  saveIndicator.textContent = message;
  saveIndicator.className = 'save-indicator err show';
}

// If another device changes this group's synced rules while this page is
// open, refresh just the open panel — the group/tab list itself is local to
// this browser and isn't affected by sync.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;
  const entry = state.byId.get(state.selectedKey);
  if (!entry || !entry.isSynced) return;
  entry.settings = await getGroupSettings(entry.group.title);
  refreshLists(entry);
});

init();

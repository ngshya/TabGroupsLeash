const enabledToggle = document.getElementById('enabledToggle');
const groupSwitcher = document.getElementById('groupSwitcher');
const emptyState = document.getElementById('emptyState');
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

const switcherChipTemplate = document.getElementById('switcherChipTemplate');
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
const state = { entries: [], byId: new Map(), selectedKey: null, activeTabId: null };

let saveIndicatorTimer = null;

async function init() {
  enabledToggle.checked = await getEnabled();
  enabledToggle.addEventListener('change', () => setEnabled(enabledToggle.checked));
  await loadAndRender();
}

// Loads every tab group open in this window, plus every OTHER titled group
// that has saved rules in storage.sync (closed, or open elsewhere), so you
// can always find and edit a group's rules from the popup even when that
// group isn't in front of you right now. Then opens the active tab's group.
async function loadAndRender() {
  const win = await chrome.windows.getCurrent();
  const groups = await chrome.tabGroups.query({ windowId: win.id });
  const openEntries = await Promise.all(groups.map(async (group) => ({
    key: group.id,
    group,
    tabs: await chrome.tabs.query({ groupId: group.id }),
    isSynced: !!group.title,
    isOpen: true
  })));

  const openTitles = new Set(openEntries.filter((e) => e.isSynced).map((e) => e.group.title));
  const allTitles = await getAllGroupTitles();
  const elsewhereEntries = allTitles
    .filter((title) => !openTitles.has(title))
    .sort((a, b) => a.localeCompare(b))
    .map((title) => ({
      key: `elsewhere:${title}`,
      group: { title, color: null },
      tabs: [],
      isSynced: true,
      isOpen: false
    }));

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  state.entries = [...openEntries, ...elsewhereEntries];
  state.byId = new Map(state.entries.map((e) => [e.key, e]));
  state.activeTabId = activeTab?.id ?? null;

  if (state.entries.length === 0) {
    emptyState.hidden = false;
    groupSwitcher.hidden = true;
    groupPanel.hidden = true;
    return;
  }
  emptyState.hidden = true;

  const activeOpenEntry = activeTab && activeTab.groupId !== -1
    ? openEntries.find((e) => e.group.id === activeTab.groupId)
    : null;
  const preferredKey = activeOpenEntry ? activeOpenEntry.key : state.entries[0].key;

  await selectGroup(preferredKey);
}

function renderSwitcher(selectedKey) {
  groupSwitcher.innerHTML = '';
  if (state.entries.length <= 1) {
    groupSwitcher.hidden = true;
    return;
  }
  groupSwitcher.hidden = false;
  for (const entry of state.entries) {
    const node = switcherChipTemplate.content.cloneNode(true);
    const dot = node.querySelector('.dot');
    const chip = node.querySelector('.switcher-chip');
    node.querySelector('.chip-title').textContent = entry.group.title || '(untitled)';
    if (entry.isOpen) {
      dot.style.background = GROUP_COLORS[entry.group.color] || '#999';
      chip.title = entry.group.title || '(untitled group)';
    } else {
      dot.classList.add('unknown');
      chip.classList.add('not-open');
      chip.title = `"${entry.group.title}" isn't open in this window right now — it still has saved rules`;
    }
    chip.classList.toggle('selected', entry.key === selectedKey);
    chip.addEventListener('click', () => selectGroup(entry.key));
    groupSwitcher.appendChild(node);
  }
}

async function selectGroup(key) {
  const entry = state.byId.get(key);
  if (!entry) return;
  state.selectedKey = key;
  renderSwitcher(key);
  groupPanel.hidden = false;
  await openGroup(entry);
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

// A group that isn't open in this window only stays in the switcher while it
// has rules — once its last rule is gone, drop it by reloading the whole
// list instead of just repainting the (now pointless) empty panel.
async function afterMutation(entry) {
  if (!entry.isOpen && (entry.settings?.rules || []).length === 0) {
    await loadAndRender();
    return;
  }
  refreshLists(entry);
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
  const candidates = entry.tabs
    .filter((tab) => tab.url && !existingMatches.has(defaultMatchForUrl(tab.url)))
    .sort((a, b) => (b.id === state.activeTabId ? 1 : 0) - (a.id === state.activeTabId ? 1 : 0));

  for (const tab of candidates) {
    const suggestedMatch = defaultMatchForUrl(tab.url);
    const node = quickAddTemplate.content.cloneNode(true);
    const row = node.querySelector('.quick-add-row');
    const isCurrent = tab.id === state.activeTabId;
    node.querySelector('.quick-add-title').textContent = (tab.title || tab.url) + (isCurrent ? ' — current tab' : '');
    if (isCurrent) row.classList.add('current');
    node.querySelector('.quick-add-btn').addEventListener('click', async () => {
      const nextRules = [...(entry.settings.rules || []), { match: suggestedMatch, pattern: suggestedMatch }];
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
  const matchInput = node.querySelector('.rule-match');
  const patternInput = node.querySelector('.rule-pattern');
  const deleteBtn = node.querySelector('.delete-rule');

  matchInput.value = rule.match || '';
  patternInput.value = rule.pattern || '';

  const onEdit = async () => {
    await persistRules(entry, collectRulesFromDom());
    await afterMutation(entry);
  };
  matchInput.addEventListener('change', onEdit);
  patternInput.addEventListener('change', onEdit);
  deleteBtn.addEventListener('click', async () => {
    li.remove();
    await persistRules(entry, collectRulesFromDom());
    await afterMutation(entry);
  });

  return node;
}

function collectRulesFromDom() {
  return Array.from(ruleList.querySelectorAll('.rule-row'))
    .map((row) => ({
      match: row.querySelector('.rule-match').value.trim(),
      pattern: row.querySelector('.rule-pattern').value.trim()
    }))
    .filter((r) => r.match && r.pattern);
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

// If another device changes this group's synced rules while the popup is
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

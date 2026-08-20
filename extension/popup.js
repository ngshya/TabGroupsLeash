const enabledToggle = document.getElementById('enabledToggle');
const groupSwitcher = document.getElementById('groupSwitcher');
const emptyState = document.getElementById('emptyState');
const groupPanel = document.getElementById('groupPanel');
const panelDot = document.getElementById('panelDot');
const panelTitle = document.getElementById('panelTitle');
const saveIndicator = document.getElementById('saveIndicator');
const clearGroupBtn = document.getElementById('clearGroupBtn');
const untitledWarning = document.getElementById('untitledWarning');
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

// entries: [{ group, tabs, isSynced, settings? }], byId: Map<groupId, entry>
const state = { entries: [], byId: new Map(), selectedGroupId: null, activeTabId: null };

let saveIndicatorTimer = null;

async function init() {
  enabledToggle.checked = await getEnabled();
  enabledToggle.addEventListener('change', () => setEnabled(enabledToggle.checked));
  await loadAndRender();
}

// Loads every tab group in this window (plus the currently active tab, to
// pick a sensible default and to flag it in "Add a rule from an open tab"),
// then opens the group the active tab belongs to.
async function loadAndRender() {
  const win = await chrome.windows.getCurrent();
  const groups = await chrome.tabGroups.query({ windowId: win.id });
  const entries = await Promise.all(groups.map(async (group) => ({
    group,
    tabs: await chrome.tabs.query({ groupId: group.id }),
    isSynced: !!group.title
  })));
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  state.entries = entries;
  state.byId = new Map(entries.map((e) => [e.group.id, e]));
  state.activeTabId = activeTab?.id ?? null;

  if (entries.length === 0) {
    emptyState.hidden = false;
    groupSwitcher.hidden = true;
    groupPanel.hidden = true;
    return;
  }
  emptyState.hidden = true;

  const preferredId = activeTab && activeTab.groupId !== -1 && state.byId.has(activeTab.groupId)
    ? activeTab.groupId
    : entries[0].group.id;

  await selectGroup(preferredId);
}

function renderSwitcher(selectedId) {
  groupSwitcher.innerHTML = '';
  if (state.entries.length <= 1) {
    groupSwitcher.hidden = true;
    return;
  }
  groupSwitcher.hidden = false;
  for (const entry of state.entries) {
    const node = switcherChipTemplate.content.cloneNode(true);
    node.querySelector('.dot').style.background = GROUP_COLORS[entry.group.color] || '#999';
    node.querySelector('.chip-title').textContent = entry.group.title || '(untitled)';
    const chip = node.querySelector('.switcher-chip');
    chip.classList.toggle('selected', entry.group.id === selectedId);
    chip.title = entry.group.title || '(untitled group)';
    chip.addEventListener('click', () => selectGroup(entry.group.id));
    groupSwitcher.appendChild(node);
  }
}

async function selectGroup(groupId) {
  const entry = state.byId.get(groupId);
  if (!entry) return;
  state.selectedGroupId = groupId;
  renderSwitcher(groupId);
  groupPanel.hidden = false;
  await openGroup(entry);
}

// Loads (or reloads) one group's rules from storage and paints the whole panel.
async function openGroup(entry) {
  panelDot.style.background = GROUP_COLORS[entry.group.color] || '#999';
  panelTitle.textContent = entry.group.title || '(untitled)';
  untitledWarning.hidden = entry.isSynced;
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
    refreshLists(entry);
  };

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
      refreshLists(entry);
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
    refreshLists(entry);
  };
  matchInput.addEventListener('change', onEdit);
  patternInput.addEventListener('change', onEdit);
  deleteBtn.addEventListener('click', async () => {
    li.remove();
    await persistRules(entry, collectRulesFromDom());
    refreshLists(entry);
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
      await setGroupSettings(entry.group.title, { rules });
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
  const entry = state.byId.get(state.selectedGroupId);
  if (!entry || !entry.isSynced) return;
  entry.settings = await getGroupSettings(entry.group.title);
  refreshLists(entry);
});

init();
